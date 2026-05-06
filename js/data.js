// =====================================================
// 果果家 KOKOYA · Firestore 資料存取層
// Collections:
//   items            品項主檔
//   sales            銷貨單
//   purchases        進貨單
//   shipments        出貨單
//   batches          訂單批次（多客戶聚集，可一鍵轉成銷貨+出貨）
//   settings/lookups 共用下拉資料（供應商、配送員清單等，僅 admin 可寫）
// =====================================================
import {
  db, collection, doc, addDoc, getDoc, getDocs, setDoc,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, onSnapshot, runTransaction, Timestamp, writeBatch
} from "./firebase-config.js";

const me = () => window.__currentUser || { email:"unknown", name:"unknown", uid:"unknown" };

// ============ Items (品項) ============
// 把品項展開成「銷貨用的選項列表」(item × priceTiers)
// 規則：
//   - 若品項沒有任何 tier，輸出單一選項用 item.price
//   - 若有 tiers 但沒有 qty=1 的且 item.price > 0，自動 prepend 一個「單{unit}」選項
//   - 否則直接用 tiers
// 每個選項包含：itemId, itemName, qty, unitPrice, total, label
export function buildItemTierOptions(items) {
  const out = [];
  (items || []).forEach(item => {
    const u = item.unit || "件";
    const tiers = Array.isArray(item.priceTiers) ? item.priceTiers.filter(t => Number(t.qty)>0 && Number(t.price)>=0) : [];
    const prepend = (Number(item.price) > 0 && !tiers.some(t => Number(t.qty) === 1));
    const all = [];
    if (prepend) all.push({ qty: 1, price: Number(item.price), label: `單${u}`, idx: -1 });
    tiers.forEach((t, idx) => {
      const tq = Number(t.qty);
      const tp = Number(t.price);
      const lbl = t.label?.trim() || (tq === 1 ? `單${u}` : `${tq}${u}`);
      all.push({ qty: tq, price: tp, label: lbl, idx });
    });
    if (!all.length) {
      // 沒設任何 tier 也沒 price → 仍出一個單{unit} $0 選項，方便手動改價
      all.push({ qty: 1, price: Number(item.price)||0, label: `單${u}`, idx: -1 });
    }
    all.forEach(opt => {
      const unitPrice = opt.qty > 0 ? Math.round((opt.price / opt.qty) * 100) / 100 : 0;
      out.push({
        value: `${item.id}::${opt.idx}`,
        itemId: item.id,
        itemName: item.name || "",
        unit: u,
        qty: opt.qty,
        unitPrice,
        total: opt.price,
        label: opt.label,
        stock: Number(item.stock || 0)
      });
    });
  });
  return out;
}

export async function listItems() {
  const snap = await getDocs(query(collection(db, "items"), orderBy("name")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function upsertItem(itemId, data) {
  if (itemId) {
    await updateDoc(doc(db, "items", itemId), { ...data, updatedAt: serverTimestamp(), updatedBy: me().email });
    return itemId;
  } else {
    const ref = await addDoc(collection(db, "items"), {
      ...data,
      stock: data.stock ?? 0,
      avgCost: data.avgCost ?? 0,
      createdAt: serverTimestamp(),
      createdBy: me().email
    });
    return ref.id;
  }
}
export async function deleteItem(id){ await deleteDoc(doc(db, "items", id)); }
export function watchItems(cb){
  return onSnapshot(query(collection(db, "items"), orderBy("name")), snap=>{
    cb(snap.docs.map(d=>({ id:d.id, ...d.data() })));
  });
}

// ============ Sales (銷貨) ============
// 一張單可以有多個品項；扣庫存
export async function addSale(sale) {
  // sale: { date(Date), customer, note, lines:[{itemId, name, qty, price}] }
  return await runTransaction(db, async (tx) => {
    const lines = sale.lines || [];
    // 先讀取所有品項（要在所有寫入前完成）
    const itemRefs = lines.map(l => doc(db, "items", l.itemId));
    const itemSnaps = await Promise.all(itemRefs.map(r => tx.get(r)));

    let total = 0;
    let cost  = 0;
    const enriched = lines.map((l,i) => {
      const itemSnap = itemSnaps[i];
      const itemData = itemSnap.exists() ? itemSnap.data() : { stock:0, avgCost:0 };
      const lineTotal = Number(l.qty)*Number(l.price);
      total += lineTotal;
      cost  += Number(l.qty)*Number(itemData.avgCost||0);
      return { ...l, lineTotal, unitCost: itemData.avgCost||0 };
    });

    // 寫入 sale
    const saleRef = doc(collection(db, "sales"));
    tx.set(saleRef, {
      date: sale.date instanceof Date ? Timestamp.fromDate(sale.date) : sale.date,
      customer: sale.customer || "",
      note: sale.note || "",
      lines: enriched,
      total, cost, profit: total - cost,
      handlerName: sale.handlerName || me().name,
      createdAt: serverTimestamp(),
      createdBy: me().email,
      createdByName: me().name
    });

    // 扣庫存
    for (let i = 0; i < lines.length; i++) {
      const ref = itemRefs[i];
      const cur = itemSnaps[i].exists() ? itemSnaps[i].data() : null;
      if (cur) {
        tx.update(ref, { stock: (Number(cur.stock)||0) - Number(lines[i].qty) });
      }
    }
    return saleRef.id;
  });
}
export async function listSales({ days = 30 } = {}){
  const since = new Date();
  since.setDate(since.getDate() - days);
  const snap = await getDocs(query(
    collection(db, "sales"),
    where("date", ">=", Timestamp.fromDate(since)),
    orderBy("date", "desc")
  ));
  return snap.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function deleteSale(id) {
  // 反扣庫存
  await runTransaction(db, async (tx) => {
    const sRef = doc(db, "sales", id);
    const sSnap = await tx.get(sRef);
    if (!sSnap.exists()) throw new Error("找不到銷貨單");
    const lines = sSnap.data().lines || [];
    const itemRefs = lines.map(l => doc(db, "items", l.itemId));
    const itemSnaps = await Promise.all(itemRefs.map(r => tx.get(r)));
    itemSnaps.forEach((sp, i) => {
      if (sp.exists()) {
        const cur = sp.data();
        tx.update(itemRefs[i], { stock: (Number(cur.stock)||0) + Number(lines[i].qty) });
      }
    });
    tx.delete(sRef);
  });
}

// 更新銷貨單：reset 舊 line 的庫存效應 + 套用新 line（庫存淨變化）
export async function updateSale(id, sale) {
  return await runTransaction(db, async (tx) => {
    const sRef = doc(db, "sales", id);
    const sSnap = await tx.get(sRef);
    if (!sSnap.exists()) throw new Error("找不到銷貨單");
    const oldData  = sSnap.data();
    const oldLines = oldData.lines || [];
    const newLines = sale.lines || [];

    // 涉及到的全部 itemId（舊+新去重）
    const allIds = [...new Set([...oldLines.map(l=>l.itemId), ...newLines.map(l=>l.itemId)])].filter(Boolean);
    const itemRefs  = allIds.map(id2 => doc(db, "items", id2));
    const itemSnaps = await Promise.all(itemRefs.map(r => tx.get(r)));
    const itemMap = {};
    allIds.forEach((id2, i) => itemMap[id2] = { ref: itemRefs[i], snap: itemSnaps[i] });

    // 計算每個品項的庫存淨變化（舊銷售要回補，新銷售要扣除）
    const stockDelta = {};
    oldLines.forEach(l => { if (l.itemId) stockDelta[l.itemId] = (stockDelta[l.itemId]||0) + Number(l.qty); });
    newLines.forEach(l => { if (l.itemId) stockDelta[l.itemId] = (stockDelta[l.itemId]||0) - Number(l.qty); });

    // 算新 total / cost / profit
    let total = 0, cost = 0;
    const enriched = newLines.map(l => {
      const itemData = itemMap[l.itemId]?.snap?.exists() ? itemMap[l.itemId].snap.data() : { avgCost: 0 };
      const lineTotal = Number(l.qty) * Number(l.price);
      const unitCost  = Number(itemData.avgCost || 0);
      total += lineTotal;
      cost  += Number(l.qty) * unitCost;
      return { ...l, lineTotal, unitCost };
    });

    // 套用庫存變化
    Object.entries(stockDelta).forEach(([id2, delta]) => {
      const m = itemMap[id2];
      if (m && m.snap.exists()) {
        const curStock = Number(m.snap.data().stock) || 0;
        tx.update(m.ref, { stock: curStock + delta });
      }
    });

    tx.update(sRef, {
      date: sale.date instanceof Date ? Timestamp.fromDate(sale.date) : sale.date,
      customer: sale.customer || "",
      note: sale.note || "",
      lines: enriched,
      total, cost, profit: total - cost,
      handlerName: sale.handlerName || oldData.handlerName || oldData.createdByName || me().name,
      updatedAt: serverTimestamp(),
      updatedBy: me().email
    });
  });
}

// ============ Purchases (進貨) ============
// 進貨：增加庫存，重新計算加權平均成本
export async function addPurchase(p) {
  return await runTransaction(db, async (tx) => {
    const lines = p.lines || [];
    const itemRefs = lines.map(l => doc(db, "items", l.itemId));
    const itemSnaps = await Promise.all(itemRefs.map(r => tx.get(r)));

    let total = 0;
    const enriched = lines.map((l, i) => {
      const lineTotal = Number(l.qty) * Number(l.cost);
      total += lineTotal;
      return { ...l, lineTotal };
    });

    const ref = doc(collection(db, "purchases"));
    tx.set(ref, {
      date: p.date instanceof Date ? Timestamp.fromDate(p.date) : p.date,
      supplier: p.supplier || "",
      note: p.note || "",
      lines: enriched,
      total,
      handlerName: p.handlerName || me().name,
      createdAt: serverTimestamp(),
      createdBy: me().email,
      createdByName: me().name
    });

    // 加庫存 + 加權平均
    itemSnaps.forEach((sp, i) => {
      const ref2 = itemRefs[i];
      const ln = lines[i];
      if (sp.exists()) {
        const cur = sp.data();
        const oldStock = Number(cur.stock) || 0;
        const oldAvg   = Number(cur.avgCost) || 0;
        const inQty    = Number(ln.qty);
        const inCost   = Number(ln.cost);
        const newStock = oldStock + inQty;
        const newAvg = newStock > 0
          ? ((oldStock*oldAvg) + (inQty*inCost)) / newStock
          : inCost;
        tx.update(ref2, { stock: newStock, avgCost: newAvg });
      }
    });
    return ref.id;
  });
}
export async function listPurchases({ days = 30 } = {}){
  const since = new Date(); since.setDate(since.getDate() - days);
  const snap = await getDocs(query(
    collection(db, "purchases"),
    where("date", ">=", Timestamp.fromDate(since)),
    orderBy("date", "desc")
  ));
  return snap.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function deletePurchase(id) {
  await runTransaction(db, async (tx) => {
    const pRef = doc(db, "purchases", id);
    const pSnap = await tx.get(pRef);
    if (!pSnap.exists()) throw new Error("找不到進貨單");
    const lines = pSnap.data().lines || [];
    const itemRefs = lines.map(l => doc(db, "items", l.itemId));
    const itemSnaps = await Promise.all(itemRefs.map(r => tx.get(r)));
    itemSnaps.forEach((sp, i) => {
      if (sp.exists()) {
        const cur = sp.data();
        tx.update(itemRefs[i], { stock: (Number(cur.stock)||0) - Number(lines[i].qty) });
      }
    });
    tx.delete(pRef);
  });
}

// 更新進貨單：庫存淨變化（avgCost 不重算，留小幅誤差，水果攤可接受）
export async function updatePurchase(id, p) {
  return await runTransaction(db, async (tx) => {
    const pRef = doc(db, "purchases", id);
    const pSnap = await tx.get(pRef);
    if (!pSnap.exists()) throw new Error("找不到進貨單");
    const oldData  = pSnap.data();
    const oldLines = oldData.lines || [];
    const newLines = p.lines || [];

    const allIds = [...new Set([...oldLines.map(l=>l.itemId), ...newLines.map(l=>l.itemId)])].filter(Boolean);
    const itemRefs  = allIds.map(id2 => doc(db, "items", id2));
    const itemSnaps = await Promise.all(itemRefs.map(r => tx.get(r)));
    const itemMap = {};
    allIds.forEach((id2, i) => itemMap[id2] = { ref: itemRefs[i], snap: itemSnaps[i] });

    let total = 0;
    const enriched = newLines.map(l => {
      const lineTotal = Number(l.qty) * Number(l.cost);
      total += lineTotal;
      return { ...l, lineTotal };
    });

    // 庫存淨變化：舊進貨要扣回、新進貨要加上
    const stockDelta = {};
    oldLines.forEach(l => { if (l.itemId) stockDelta[l.itemId] = (stockDelta[l.itemId]||0) - Number(l.qty); });
    newLines.forEach(l => { if (l.itemId) stockDelta[l.itemId] = (stockDelta[l.itemId]||0) + Number(l.qty); });

    Object.entries(stockDelta).forEach(([id2, delta]) => {
      const m = itemMap[id2];
      if (m && m.snap.exists()) {
        const curStock = Number(m.snap.data().stock) || 0;
        tx.update(m.ref, { stock: curStock + delta });
      }
    });

    tx.update(pRef, {
      date: p.date instanceof Date ? Timestamp.fromDate(p.date) : p.date,
      supplier: p.supplier || "",
      note: p.note || "",
      lines: enriched,
      total,
      handlerName: p.handlerName || oldData.handlerName || oldData.createdByName || me().name,
      updatedAt: serverTimestamp(),
      updatedBy: me().email
    });
  });
}

// ============ Shipments (出貨單) ============
// 出貨單：建立可列印的紙本，編號自動 SH-YYYYMMDD-### 形式
export async function nextShipmentNo() {
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,"0")}${String(today.getDate()).padStart(2,"0")}`;
  // 只用 where(==) 單欄查（不需要 composite index），客戶端找最大 seq
  const snap = await getDocs(query(
    collection(db, "shipments"),
    where("docDateKey", "==", ymd)
  ));
  let maxSeq = 0;
  snap.docs.forEach(d => {
    const s = Number(d.data().seq) || 0;
    if (s > maxSeq) maxSeq = s;
  });
  const seq = maxSeq + 1;
  return { docNo: `SH-${ymd}-${String(seq).padStart(3,"0")}`, ymd, seq };
}
export async function addShipment(ship){
  const { docNo, ymd, seq } = await nextShipmentNo();
  const total = (ship.lines||[]).reduce((s,l)=>s + Number(l.qty)*Number(l.price), 0);
  const ref = await addDoc(collection(db, "shipments"), {
    ...ship,
    docNo, docDateKey: ymd, seq,
    date: ship.date instanceof Date ? Timestamp.fromDate(ship.date) : ship.date,
    total,
    createdAt: serverTimestamp(),
    createdBy: me().email,
    createdByName: me().name,
    handlerName: ship.handlerName || me().name,
  });
  return { id: ref.id, docNo };
}
export async function listShipments({ days = 60 } = {}){
  const since = new Date(); since.setDate(since.getDate() - days);
  const snap = await getDocs(query(
    collection(db, "shipments"),
    where("date", ">=", Timestamp.fromDate(since)),
    orderBy("date", "desc")
  ));
  return snap.docs.map(d=>({ id:d.id, ...d.data() }));
}
export async function getShipment(id){
  const s = await getDoc(doc(db, "shipments", id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export async function deleteShipment(id){ await deleteDoc(doc(db, "shipments", id)); }

// 更新出貨單（不影響庫存，純修文字/數量/客戶資訊）
export async function updateShipment(id, ship) {
  const ref = doc(db, "shipments", id);
  const sSnap = await getDoc(ref);
  if (!sSnap.exists()) throw new Error("找不到出貨單");
  const old = sSnap.data();
  const total = (ship.lines||[]).reduce((s,l)=>s + Number(l.qty)*Number(l.price), 0);
  await updateDoc(ref, {
    date: ship.date instanceof Date ? Timestamp.fromDate(ship.date) : ship.date,
    recipient: ship.recipient || "",
    phone: ship.phone || "",
    address: ship.address || "",
    handlerName: ship.handlerName || old.handlerName || me().name,
    note: ship.note || "",
    lines: ship.lines || [],
    total,
    updatedAt: serverTimestamp(),
    updatedBy: me().email
    // docNo / docDateKey / seq 維持原值，不重新編號
  });
}

// ============ Batches (訂單批次) ============
// 一個批次 = 同一天/同一車要送的多個客戶訂單
// 流程：建批次 → 加入客戶訂單 → 看 SKU 匯總 → 一鍵確認出貨（自動建 sales + shipments、扣庫存）

function _genOrderId() {
  return "ord_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function _orderTotal(lines) {
  return (lines || []).reduce((s, l) => s + Number(l.qty || 0) * Number(l.price || 0), 0);
}

function _normalizeOrder(o) {
  const lines = (o.lines || []).map(l => ({
    itemId: l.itemId || "",
    name:   l.name || "",
    unit:   l.unit || "",
    qty:    Number(l.qty) || 0,
    price:  Number(l.price) || 0,
    lineTotal: (Number(l.qty) || 0) * (Number(l.price) || 0)
  }));
  return {
    orderId: o.orderId || _genOrderId(),
    customer: o.customer || "",
    phone: o.phone || "",
    address: o.address || "",
    paymentMethod: o.paymentMethod || "",
    isPaid: !!o.isPaid,
    notes: o.notes || "",
    lines,
    total: _orderTotal(lines),
    saleId: o.saleId || null,
    shipmentId: o.shipmentId || null,
    shipmentNo: o.shipmentNo || null
  };
}

function _batchTotal(orders) {
  return (orders || []).reduce((s, o) => s + Number(o.total || 0), 0);
}

// 給 UI 用：把批次裡所有 order 的 lines 按品項合併出總需求
export function aggregateBatch(batch) {
  const map = {};
  (batch?.orders || []).forEach(o => {
    (o.lines || []).forEach(l => {
      if (!l.itemId) return;
      if (!map[l.itemId]) {
        map[l.itemId] = { itemId: l.itemId, name: l.name || "", unit: l.unit || "", totalQty: 0 };
      }
      map[l.itemId].totalQty += Number(l.qty) || 0;
    });
  });
  return {
    orderCount: (batch?.orders || []).length,
    totalAmount: _batchTotal(batch?.orders),
    sku: Object.values(map).sort((a,b) => (a.name||"").localeCompare(b.name||"", "zh-Hant"))
  };
}

export async function listBatches({ days = 90 } = {}) {
  const since = new Date(); since.setDate(since.getDate() - days);
  const snap = await getDocs(query(
    collection(db, "batches"),
    where("deliveryDate", ">=", Timestamp.fromDate(since)),
    orderBy("deliveryDate", "desc")
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getBatch(id) {
  const s = await getDoc(doc(db, "batches", id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export async function addBatch(batch) {
  const orders = (batch.orders || []).map(_normalizeOrder);
  const ref = await addDoc(collection(db, "batches"), {
    name: batch.name || "",
    deliveryDate: batch.deliveryDate instanceof Date ? Timestamp.fromDate(batch.deliveryDate) : batch.deliveryDate,
    deliveryStaff: batch.deliveryStaff || "",
    status: "draft",
    notes: batch.notes || "",
    orders,
    totalAmount: _batchTotal(orders),
    createdAt: serverTimestamp(),
    createdBy: me().email,
    createdByName: me().name
  });
  return ref.id;
}

export async function updateBatch(id, batch) {
  const orders = (batch.orders || []).map(_normalizeOrder);
  await updateDoc(doc(db, "batches", id), {
    name: batch.name || "",
    deliveryDate: batch.deliveryDate instanceof Date ? Timestamp.fromDate(batch.deliveryDate) : batch.deliveryDate,
    deliveryStaff: batch.deliveryStaff || "",
    notes: batch.notes || "",
    orders,
    totalAmount: _batchTotal(orders),
    updatedAt: serverTimestamp(),
    updatedBy: me().email
  });
}

export async function deleteBatch(id) {
  await deleteDoc(doc(db, "batches", id));
}

// 確認出貨：依序為每筆 order 建立銷貨單（扣庫存）+ 出貨單（如果有地址）
// 已建過的 order（已有 saleId）會跳過，可重複呼叫補做失敗的
export async function confirmBatch(id) {
  const batch = await getBatch(id);
  if (!batch) throw new Error("找不到批次");

  const deliveryDate = batch.deliveryDate?.toDate
    ? batch.deliveryDate.toDate()
    : (batch.deliveryDate instanceof Date ? batch.deliveryDate : new Date(batch.deliveryDate));

  const updatedOrders = [];
  const errors = [];
  const successes = [];

  for (const raw of (batch.orders || [])) {
    const o = _normalizeOrder(raw);
    const validLines = o.lines.filter(l => l.itemId && l.qty > 0);

    // 銷貨：未建過才建
    if (!o.saleId) {
      if (!validLines.length) {
        errors.push(`「${o.customer || "(無客戶名)"}」沒有有效品項，已跳過`);
        updatedOrders.push(o);
        continue;
      }
      try {
        const saleId = await addSale({
          date: deliveryDate,
          customer: o.customer,
          note: `[${batch.name}] ${o.notes || ""}`.trim(),
          lines: validLines.map(l => ({ itemId: l.itemId, name: l.name, qty: l.qty, price: l.price }))
        });
        o.saleId = saleId;
      } catch (err) {
        errors.push(`「${o.customer || "(無客戶名)"}」銷貨建立失敗：${err.message}`);
        updatedOrders.push(o);
        continue;
      }
    }

    // 出貨單：未建過才建（不管有沒有地址，一律建；上次失敗的這次會重試）
    if (!o.shipmentId) {
      if (validLines.length) {
        try {
          const ship = await addShipment({
            date: deliveryDate,
            recipient: o.customer,
            phone: o.phone || "",
            address: o.address || "",
            handlerName: batch.deliveryStaff || me().name,
            note: `[${batch.name}] ${o.notes || ""}`.trim(),
            lines: validLines.map(l => ({
              itemId: l.itemId, name: l.name, unit: l.unit || "", qty: l.qty, price: l.price
            }))
          });
          o.shipmentId = ship.id;
          o.shipmentNo = ship.docNo;
        } catch (err) {
          errors.push(`「${o.customer || "(無客戶名)"}」出貨單建立失敗（銷貨已建）：${err.message}`);
        }
      }
    }

    successes.push(o.customer || "(無名)");
    updatedOrders.push(o);
  }

  const allDone = updatedOrders.every(o => o.saleId);
  await updateDoc(doc(db, "batches", id), {
    orders: updatedOrders,
    totalAmount: _batchTotal(updatedOrders),
    status: (allDone && errors.length === 0) ? "completed" : "draft",
    confirmedAt: (allDone && errors.length === 0) ? serverTimestamp() : null,
    confirmedBy: (allDone && errors.length === 0) ? me().email : null,
    updatedAt: serverTimestamp(),
    updatedBy: me().email
  });

  return { allDone, successes, errors, orderCount: updatedOrders.length };
}

// ============ Settings / Lookups (共用下拉資料) ============
// 單一文件 settings/lookups，含 suppliers / deliveryStaff 等陣列
const LOOKUPS_REF = () => doc(db, "settings", "lookups");
// 預設名單（首次讀取或未設定時 fallback）
const DEFAULT_LOOKUPS = {
  suppliers: [],
  deliveryStaff: [],
  handlers: ["凱宇", "凱帆", "妍慧", "于真"]
};

export async function getLookups() {
  const s = await getDoc(LOOKUPS_REF());
  if (!s.exists()) return { ...DEFAULT_LOOKUPS };
  const data = s.data();
  // 個別欄位若沒設或空 → fallback 到預設
  return {
    suppliers:     Array.isArray(data.suppliers)     ? data.suppliers     : DEFAULT_LOOKUPS.suppliers,
    deliveryStaff: Array.isArray(data.deliveryStaff) ? data.deliveryStaff : DEFAULT_LOOKUPS.deliveryStaff,
    handlers:      (Array.isArray(data.handlers) && data.handlers.length) ? data.handlers : DEFAULT_LOOKUPS.handlers
  };
}

export async function saveLookups(data) {
  await setDoc(LOOKUPS_REF(), {
    suppliers:     Array.isArray(data.suppliers)     ? data.suppliers     : [],
    deliveryStaff: Array.isArray(data.deliveryStaff) ? data.deliveryStaff : [],
    handlers:      Array.isArray(data.handlers)      ? data.handlers      : [],
    updatedAt: serverTimestamp(),
    updatedBy: me().email
  }, { merge: true });
}

// ============ 系統資料總覽 / 危險區批次清除 ============
// 一次抓所有 collection 的計數與總額（不分日期、全部）
export async function getDataStats() {
  const [items, sales, purchases, shipments, batches] = await Promise.all([
    getDocs(collection(db, "items")),
    getDocs(collection(db, "sales")),
    getDocs(collection(db, "purchases")),
    getDocs(collection(db, "shipments")),
    getDocs(collection(db, "batches"))
  ]);
  const sumTotal = snap => snap.docs.reduce((s, d) => s + (Number(d.data().total) || Number(d.data().totalAmount) || 0), 0);
  const stockSummary = items.docs.reduce((acc, d) => {
    const i = d.data();
    acc.totalStockValue += (Number(i.stock)||0) * (Number(i.avgCost)||0);
    if (Number(i.stock||0) <= 0) acc.outOfStock++;
    else if (Number(i.stock||0) <= Number(i.lowStock ?? 5)) acc.lowStock++;
    return acc;
  }, { totalStockValue: 0, lowStock: 0, outOfStock: 0 });

  const batchStatuses = batches.docs.map(d => d.data().status);

  return {
    items: {
      count: items.size,
      lowStock: stockSummary.lowStock,
      outOfStock: stockSummary.outOfStock,
      totalStockValue: stockSummary.totalStockValue
    },
    sales:     { count: sales.size,     total: sumTotal(sales) },
    purchases: { count: purchases.size, total: sumTotal(purchases) },
    shipments: { count: shipments.size },
    batches: {
      count: batches.size,
      draft: batchStatuses.filter(s => s !== "completed").length,
      completed: batchStatuses.filter(s => s === "completed").length
    }
  };
}

// 清空指定 collection 的所有文件（僅 admin 能成功，受 firestore.rules 控管）
export async function clearCollection(name) {
  const allowed = ["items", "sales", "purchases", "shipments", "batches"];
  if (!allowed.includes(name)) throw new Error("不允許清空 collection: " + name);
  const snap = await getDocs(collection(db, name));
  if (snap.empty) return 0;
  // Firestore writeBatch 限制 500 個操作 → 分批
  let total = 0;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
    total += Math.min(400, docs.length - i);
  }
  return total;
}

// 重置全部交易資料：清 sales/purchases/shipments/batches + items 的 stock/avgCost 歸零
// 品項主檔保留（只重置庫存與成本）
export async function resetTransactionsAndStock() {
  const result = {};
  for (const name of ["sales", "purchases", "shipments", "batches"]) {
    result[name] = await clearCollection(name);
  }
  const itemsSnap = await getDocs(collection(db, "items"));
  let resetCount = 0;
  const docs = itemsSnap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i + 400).forEach(d =>
      batch.update(d.ref, { stock: 0, avgCost: 0, updatedAt: serverTimestamp(), updatedBy: me().email })
    );
    await batch.commit();
    resetCount += Math.min(400, docs.length - i);
  }
  result.itemsReset = resetCount;
  return result;
}
