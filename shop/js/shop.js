// =====================================================
// 果果家 KOKOYA · 購物網前端主邏輯
// 串 Firestore 撈 items / 購物車 / 送單 → webOrders
// =====================================================
import {
  db, collection, doc, addDoc, getDocs, query, orderBy, serverTimestamp, Timestamp
} from "./firebase-shop.js";

const $ = id => document.getElementById(id);
const fmtMoney = v => "$" + (Math.round(Number(v) || 0)).toLocaleString();

// 依品項名稱猜 emoji（沒有圖片時的視覺）
const EMOJI_MAP = [
  [/蘋果|apple/i,        "🍎"],
  [/橘|柑/,               "🍊"],
  [/梨/,                  "🍐"],
  [/葡萄/,                "🍇"],
  [/草莓/,                "🍓"],
  [/奇異果|kiwi/i,        "🥝"],
  [/香蕉/,                "🍌"],
  [/桃/,                  "🍑"],
  [/西瓜/,                "🍉"],
  [/鳳梨/,                "🍍"],
  [/芒果/,                "🥭"],
  [/檸檬/,                "🍋"],
  [/櫻桃/,                "🍒"],
  [/藍莓/,                "🫐"],
  [/瓜/,                  "🍈"],
  [/禮盒|綜合/,           "🎁"],
];
function emojiOf(name) {
  for (const [re, e] of EMOJI_MAP) if (re.test(name)) return e;
  return "🍎";
}

const state = {
  items: [],
  cart: JSON.parse(localStorage.getItem("kokoya_cart") || "{}"),
  catFilter: ""
};

// ============= UI Helpers =============
function toast(msg, type = "ok") {
  const $t = $("toast");
  $t.textContent = msg;
  $t.className = `toast ${type} show`;
  setTimeout(() => $t.className = "toast", 2400);
}
function persist() {
  localStorage.setItem("kokoya_cart", JSON.stringify(state.cart));
  renderCart();
}

// ============= 商品 =============
async function loadItems() {
  try {
    const snap = await getDocs(query(collection(db, "items"), orderBy("name")));
    state.items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(i => Number(i.price) > 0);   // 只顯示有定價的商品
    renderProducts();
  } catch (err) {
    console.error("載入商品失敗:", err);
    $("productList").innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--ink-3)">
        <div style="font-size:2.4rem;margin-bottom:8px">😢</div>
        商品載入失敗，請確認網路或稍後再試
        <div style="font-size:.8rem;margin-top:8px;color:var(--muted)">${err.message}</div>
      </div>`;
  }
}

function renderProducts() {
  let list = state.items;
  if (state.catFilter) {
    list = list.filter(i =>
      (i.name || "").includes(state.catFilter) ||
      (i.category || "").includes(state.catFilter)
    );
  }
  if (!list.length) {
    $("productList").innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:50px 20px;color:var(--ink-3)">
        ${state.catFilter ? `「${state.catFilter}」目前沒有商品` : "目前沒有商品"}
      </div>`;
    return;
  }
  $("productList").innerHTML = list.map(i => {
    const stock = Number(i.stock || 0);
    const out = stock <= 0;
    return `
      <div class="card-product">
        <div class="thumb">
          ${out ? `<span class="badge sold">售完</span>` : (stock <= 5 ? `<span class="badge">最後${stock}${i.unit||""}</span>` : "")}
          <span>${emojiOf(i.name)}</span>
        </div>
        <div class="body">
          <div class="name">${i.name}</div>
          <div class="desc">${i.desc || i.category || "新鮮直送，當季嚴選"}</div>
          <div class="row">
            <div class="price">
              <small>NT$</small>${fmtMoney(i.price).replace("$","")}
              <span style="font-size:.7rem;color:var(--muted);font-weight:500">/${i.unit||"份"}</span>
            </div>
            <button class="btn-cart" data-add="${i.id}" ${out ? "disabled" : ""} title="${out ? "售完" : "加入購物車"}">
              ${out ? "—" : "🛒"}
            </button>
          </div>
        </div>
      </div>`;
  }).join("");
}

// ============= 購物車 =============
function addToCart(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;
  const cur = state.cart[itemId] || { qty: 0 };
  state.cart[itemId] = {
    qty: cur.qty + 1,
    name: item.name,
    unit: item.unit || "份",
    price: Number(item.price) || 0
  };
  persist();
  toast(`✓ ${item.name} 加入購物車`, "ok");
}

function changeQty(itemId, delta) {
  if (!state.cart[itemId]) return;
  state.cart[itemId].qty += delta;
  if (state.cart[itemId].qty <= 0) delete state.cart[itemId];
  persist();
}

function removeFromCart(itemId) {
  delete state.cart[itemId];
  persist();
}

function renderCart() {
  const entries = Object.entries(state.cart);
  const count = entries.reduce((s, [, v]) => s + v.qty, 0);
  const total = entries.reduce((s, [, v]) => s + v.qty * v.price, 0);

  $("cartCount").textContent = count > 0 ? count : "";
  $("cartTotal").textContent = fmtMoney(total);

  if (!entries.length) {
    $("cartBody").innerHTML = `
      <div class="cart-empty">
        <div style="font-size:3rem;margin-bottom:10px">🍃</div>
        購物車空空如也<br>挑些水果吧 ✨
      </div>`;
    return;
  }
  $("cartBody").innerHTML = entries.map(([id, v]) => `
    <div class="cart-item">
      <div class="ph">${emojiOf(v.name)}</div>
      <div class="info">
        <div class="nm">${v.name}</div>
        <div class="pr">${fmtMoney(v.price)} / ${v.unit}</div>
        <div class="qty-box">
          <button data-dec="${id}">−</button>
          <span class="n">${v.qty}</span>
          <button data-inc="${id}">＋</button>
          <span style="margin-left:auto;font-size:.86rem;color:var(--ink-2);font-weight:600">
            ${fmtMoney(v.qty * v.price)}
          </span>
        </div>
      </div>
      <button class="rm" data-rm="${id}" title="移除">✕</button>
    </div>
  `).join("");
}

// ============= Cart drawer 開關 =============
function openCart()  { $("cartDrawer").classList.add("show");    $("cartMask").classList.add("show"); }
function closeCart() { $("cartDrawer").classList.remove("show"); $("cartMask").classList.remove("show"); }

$("btnOpenCart").addEventListener("click", openCart);
$("btnCloseCart").addEventListener("click", closeCart);
$("cartMask").addEventListener("click", closeCart);

// 商品卡片點擊：加入購物車
$("productList").addEventListener("click", e => {
  const id = e.target.closest("[data-add]")?.dataset.add;
  if (id) addToCart(id);
});
// 購物車 +/- / 移除
$("cartBody").addEventListener("click", e => {
  const inc = e.target.closest("[data-inc]")?.dataset.inc;
  const dec = e.target.closest("[data-dec]")?.dataset.dec;
  const rm  = e.target.closest("[data-rm]")?.dataset.rm;
  if (inc) changeQty(inc, +1);
  if (dec) changeQty(dec, -1);
  if (rm)  removeFromCart(rm);
});

// 分類點擊
document.querySelectorAll(".cat").forEach(c => {
  c.addEventListener("click", () => {
    state.catFilter = c.dataset.cat || "";
    renderProducts();
    document.getElementById("products").scrollIntoView({ behavior: "smooth" });
  });
});

// 漢堡選單
$("menuToggle")?.addEventListener("click", () => $("mainNav").classList.toggle("show"));
$("mainNav")?.addEventListener("click", e => {
  if (e.target.matches("a")) $("mainNav").classList.remove("show");
});

// ============= 結帳 =============
$("btnCheckout").addEventListener("click", () => {
  const entries = Object.entries(state.cart);
  if (!entries.length) return toast("購物車是空的", "err");
  closeCart();
  $("checkoutModal").classList.add("show");
});
$("btnCancelCheckout").addEventListener("click", () => $("checkoutModal").classList.remove("show"));
$("checkoutModal").addEventListener("click", e => {
  if (e.target === $("checkoutModal")) $("checkoutModal").classList.remove("show");
});

// 取貨方式切換 → 自取就隱藏地址欄
$("cMethod").addEventListener("change", () => {
  const method = $("cMethod").value;
  $("addrField").style.display = method === "宅配" ? "block" : "none";
});

$("checkoutForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name   = $("cName").value.trim();
  const phone  = $("cPhone").value.trim();
  const method = $("cMethod").value;
  const addr   = $("cAddr").value.trim();
  const note   = $("cNote").value.trim();
  if (!name || !phone) return toast("請填姓名與電話", "err");
  if (method === "宅配" && !addr) return toast("宅配請填地址", "err");

  const lines = Object.entries(state.cart).map(([itemId, v]) => ({
    itemId,
    name: v.name,
    unit: v.unit,
    qty:  v.qty,
    price: v.price,
    lineTotal: v.qty * v.price
  }));
  if (!lines.length) return toast("購物車是空的", "err");
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);

  const $btn = e.target.querySelector("button[type='submit']");
  $btn.disabled = true;
  $btn.textContent = "送出中…";

  try {
    await addDoc(collection(db, "webOrders"), {
      customer: name,
      phone,
      method,
      address: method === "宅配" ? addr : "",
      note,
      lines,
      total,
      status: "new",                       // new → confirmed → completed
      source: "web",
      createdAt: serverTimestamp()
    });
    state.cart = {};
    persist();
    $("checkoutModal").classList.remove("show");
    $("checkoutForm").reset();
    $("addrField").style.display = "block";
    toast("✓ 訂單已送出，我們會盡快與您聯絡 🍊", "ok");
  } catch (err) {
    console.error(err);
    toast("送出失敗：" + err.message, "err");
  }
  $btn.disabled = false;
  $btn.textContent = "送出訂單";
});

// ============= 啟動 =============
loadItems();
renderCart();
