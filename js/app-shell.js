// =====================================================
// 果果家 KOKOYA · 共用頁殼 (TopBar / 權限守門 / Toast)
// 每個頁面 import { mountShell } 即可
// =====================================================
import { auth, signOut, onAuthStateChanged, db, collection, query, where, onSnapshot } from "./firebase-config.js";
import { getUserProfile, isAdmin } from "./users.js";

const NAV = [
  { href: "dashboard.html",  label: "主控台",   icon: "🏠", key: "dashboard" },
  { href: "web-orders.html", label: "網站訂單", icon: "📨", key: "web-orders" },
  { href: "batches.html",    label: "訂單批次", icon: "📋", key: "batches" },
  { href: "sales.html",      label: "銷貨",     icon: "🛒", key: "sales" },
  { href: "purchase.html",   label: "進貨",     icon: "📦", key: "purchase" },
  { href: "waste.html",      label: "損耗單",   icon: "🗑", key: "waste" },
  { href: "stocktake.html",  label: "庫存盤點", icon: "📋", key: "stocktake" },
  { href: "items.html",      label: "品項清單", icon: "🍎", key: "items" },
  { href: "shipping.html",   label: "出貨單",   icon: "🚚", key: "shipping" },
  { href: "reports.html",    label: "報表",     icon: "📊", key: "reports" },
  { href: "customers.html",  label: "會員清單", icon: "👥", key: "customers" },
  { href: "articles.html",   label: "水果小教室", icon: "📚", key: "articles" },
  { href: "settings.html",   label: "設定",     icon: "⚙️", key: "settings", adminOnly: true },
];

export function mountShell({ active = "" } = {}) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      // 未登入 → 回登入頁
      if (!user) {
        location.replace("index.html");
        return;
      }

      const profile = getUserProfile(user.email);
      if (!profile) {
        // 不在白名單 → 強制登出
        await signOut(auth);
        alert(`此帳號 ${user.email} 尚未授權使用果果家系統。\n請聯繫管理員加入白名單。`);
        location.replace("index.html");
        return;
      }

      renderTopbar(user, profile, active);
      bindLogout();
      watchNewWebOrders();
      installQuickSearch();
      window.__currentUser = { uid: user.uid, email: user.email, ...profile };
      resolve(window.__currentUser);
    });
  });
}

// ============= 全站快速搜尋 (Ctrl/Cmd + K) =============
let _qsCache = null;   // { items, sales, shipments, customers, webOrders }
async function _loadQsCache() {
  if (_qsCache) return _qsCache;
  // 動態 import data.js 避免循環
  const data = await import("./data.js");
  const [items, sales, shipments, customers, webOrders] = await Promise.all([
    data.listItems().catch(() => []),
    data.listSales({ days: 90 }).catch(() => []),
    data.listShipments({ days: 90 }).catch(() => []),
    data.listCustomers().catch(() => []),
    data.listWebOrders().catch(() => [])
  ]);
  _qsCache = { items, sales, shipments, customers, webOrders };
  return _qsCache;
}

function installQuickSearch() {
  // 建一次就好
  if (document.getElementById("qsModal")) return;

  const style = document.createElement("style");
  style.textContent = `
    #qsModal { position: fixed; inset: 0; background: rgba(74,51,37,.5); z-index: 1000; display: none; padding-top: 80px; }
    #qsModal.show { display: block; }
    #qsModal .qs-box { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.3); overflow: hidden; }
    #qsModal .qs-input { width: 100%; padding: 18px 22px; font-size: 1.1rem; border: 0; border-bottom: 1px solid #E0CDAA; background: #FFFCF4; outline: none; font-family: inherit; }
    #qsModal .qs-results { max-height: 60vh; overflow-y: auto; }
    #qsModal .qs-empty { padding: 50px 20px; text-align: center; color: #B8A689; }
    #qsModal .qs-group { padding: 8px 22px 4px; font-size: .76rem; color: #8B7355; letter-spacing: .15em; background: #F5EFE0; }
    #qsModal .qs-item { display: flex; gap: 12px; align-items: center; padding: 10px 22px; border-bottom: 1px dashed #E0CDAA; cursor: pointer; text-decoration: none; color: inherit; }
    #qsModal .qs-item:hover, #qsModal .qs-item.active { background: #FFF6E6; }
    #qsModal .qs-item .icon { font-size: 1.4rem; flex-shrink: 0; }
    #qsModal .qs-item .meta { flex: 1; min-width: 0; }
    #qsModal .qs-item .ttl { font-weight: 600; color: #4A3325; }
    #qsModal .qs-item .sub { font-size: .82rem; color: #8B7355; }
    #qsModal .qs-foot { padding: 10px 22px; font-size: .76rem; color: #8B7355; background: #F5EFE0; display: flex; justify-content: space-between; }
    #qsModal kbd { background: #fff; border: 1px solid #E0CDAA; padding: 1px 6px; border-radius: 4px; font-family: inherit; font-size: .9em; }
  `;
  document.head.appendChild(style);

  const modal = document.createElement("div");
  modal.id = "qsModal";
  modal.innerHTML = `
    <div class="qs-box">
      <input class="qs-input" id="qsInput" placeholder="🔍 搜尋品項 / 客人 / 銷貨單號 / 出貨單號..." autocomplete="off">
      <div class="qs-results" id="qsResults">
        <div class="qs-empty">輸入關鍵字開始搜尋…<br><span style="font-size:.84rem">支援：品項、客人、單號、Email、電話</span></div>
      </div>
      <div class="qs-foot">
        <span><kbd>Esc</kbd> 關閉　<kbd>↑</kbd>/<kbd>↓</kbd> 移動　<kbd>Enter</kbd> 開啟</span>
        <span>Ctrl+K 隨時呼叫</span>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const $modal   = modal;
  const $input   = document.getElementById("qsInput");
  const $results = document.getElementById("qsResults");
  let curIdx = 0;
  let resultLinks = [];

  const open = async () => {
    $modal.classList.add("show");
    $input.value = "";
    $input.focus();
    $results.innerHTML = `<div class="qs-empty">⏳ 載入索引中…</div>`;
    await _loadQsCache();
    $results.innerHTML = `<div class="qs-empty">輸入關鍵字開始搜尋…<br><span style="font-size:.84rem">支援：品項、客人、單號、Email、電話</span></div>`;
  };
  const close = () => $modal.classList.remove("show");

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if ($modal.classList.contains("show")) close(); else open();
    } else if (e.key === "Escape" && $modal.classList.contains("show")) {
      close();
    } else if ($modal.classList.contains("show")) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (resultLinks.length) {
          curIdx = (curIdx + 1) % resultLinks.length;
          updateActive();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (resultLinks.length) {
          curIdx = (curIdx - 1 + resultLinks.length) % resultLinks.length;
          updateActive();
        }
      } else if (e.key === "Enter") {
        if (resultLinks[curIdx]) {
          e.preventDefault();
          location.href = resultLinks[curIdx].href;
        }
      }
    }
  });
  $modal.addEventListener("click", e => { if (e.target === $modal) close(); });

  $input.addEventListener("input", () => {
    const kw = $input.value.trim().toLowerCase();
    if (!kw || !_qsCache) {
      $results.innerHTML = `<div class="qs-empty">輸入關鍵字開始搜尋…</div>`;
      resultLinks = [];
      return;
    }
    const hits = { items: [], customers: [], sales: [], shipments: [], webOrders: [] };
    _qsCache.items.forEach(i => {
      if ((i.name||"").toLowerCase().includes(kw)) hits.items.push(i);
    });
    _qsCache.customers.forEach(c => {
      if ((c.name||"").toLowerCase().includes(kw) ||
          (c.displayName||"").toLowerCase().includes(kw) ||
          (c.email||"").toLowerCase().includes(kw) ||
          (c.phone||"").includes(kw)) hits.customers.push(c);
    });
    _qsCache.sales.forEach(s => {
      const idShort = s.id.slice(0,6).toLowerCase();
      if ((s.customer||"").toLowerCase().includes(kw) ||
          idShort.includes(kw) ||
          (s.lines||[]).some(l => (l.name||"").toLowerCase().includes(kw))) hits.sales.push(s);
    });
    _qsCache.shipments.forEach(s => {
      if ((s.recipient||"").toLowerCase().includes(kw) ||
          (s.docNo||"").toLowerCase().includes(kw)) hits.shipments.push(s);
    });
    _qsCache.webOrders.forEach(o => {
      const idShort = o.id.slice(0,6).toLowerCase();
      if ((o.customer||"").toLowerCase().includes(kw) ||
          (o.phone||"").includes(kw) ||
          idShort.includes(kw)) hits.webOrders.push(o);
    });

    const totalCount = Object.values(hits).reduce((a,arr) => a + arr.length, 0);
    if (!totalCount) {
      $results.innerHTML = `<div class="qs-empty">沒有找到「${kw}」相關結果</div>`;
      resultLinks = [];
      return;
    }

    let html = "";
    resultLinks = [];
    if (hits.items.length) {
      html += `<div class="qs-group">🍎 品項（${hits.items.length}）</div>`;
      hits.items.slice(0,5).forEach(i => {
        const href = `items.html`;
        resultLinks.push({ href });
        html += `<a class="qs-item" href="${href}">
          <span class="icon">🍎</span>
          <div class="meta">
            <div class="ttl">${i.name}${i.category?` <span style="font-size:.78rem;color:#8B7355">· ${i.category}</span>`:""}</div>
            <div class="sub">庫存 ${i.stock||0} ${i.unit||""}　售價 ${i.price?"$"+i.price:"未定"}</div>
          </div>
        </a>`;
      });
    }
    if (hits.customers.length) {
      html += `<div class="qs-group">👥 會員（${hits.customers.length}）</div>`;
      hits.customers.slice(0,5).forEach(c => {
        const href = `customer-detail.html?uid=${encodeURIComponent(c.uid)}`;
        resultLinks.push({ href });
        const name = c.name || c.displayName || c.email?.split("@")[0] || "(未命名)";
        html += `<a class="qs-item" href="${href}">
          <span class="icon">👤</span>
          <div class="meta">
            <div class="ttl">${name}</div>
            <div class="sub">${c.email||""}${c.phone?` · ${c.phone}`:""}</div>
          </div>
        </a>`;
      });
    }
    if (hits.sales.length) {
      html += `<div class="qs-group">🛒 銷貨單（${hits.sales.length}）</div>`;
      hits.sales.slice(0,5).forEach(s => {
        const href = `sales.html`;
        resultLinks.push({ href });
        const dt = s.date?.toDate ? s.date.toDate() : new Date(s.date);
        html += `<a class="qs-item" href="${href}">
          <span class="icon">🛒</span>
          <div class="meta">
            <div class="ttl">${s.customer||"—"} <span style="color:#8B7355;font-size:.78rem">#${s.id.slice(0,6)}</span></div>
            <div class="sub">${dt.toLocaleDateString()} · $${(s.total||0).toLocaleString()}</div>
          </div>
        </a>`;
      });
    }
    if (hits.shipments.length) {
      html += `<div class="qs-group">🚚 出貨單（${hits.shipments.length}）</div>`;
      hits.shipments.slice(0,5).forEach(s => {
        const href = `shipping.html`;
        resultLinks.push({ href });
        html += `<a class="qs-item" href="${href}">
          <span class="icon">🚚</span>
          <div class="meta">
            <div class="ttl">${s.recipient||"—"} <span style="color:#8B7355;font-size:.78rem">${s.docNo||""}</span></div>
            <div class="sub">$${(s.total||0).toLocaleString()}</div>
          </div>
        </a>`;
      });
    }
    if (hits.webOrders.length) {
      html += `<div class="qs-group">📨 網站訂單（${hits.webOrders.length}）</div>`;
      hits.webOrders.slice(0,5).forEach(o => {
        const href = `web-orders.html`;
        resultLinks.push({ href });
        html += `<a class="qs-item" href="${href}">
          <span class="icon">📨</span>
          <div class="meta">
            <div class="ttl">${o.customer||"—"} <span style="color:#8B7355;font-size:.78rem">#${o.id.slice(0,6)}</span></div>
            <div class="sub">${o.phone||""} · $${(o.total||0).toLocaleString()}</div>
          </div>
        </a>`;
      });
    }
    $results.innerHTML = html;
    curIdx = 0;
    updateActive();
  });

  function updateActive() {
    $results.querySelectorAll(".qs-item").forEach((el, i) => {
      el.classList.toggle("active", i === curIdx);
    });
  }
}

// 監聽新網站訂單，更新 nav 紅徽章 + 跳出通知
let _wOrderUnsub = null;
let _seenWebOrderIds = new Set();
let _initialWebOrderLoad = true;
function watchNewWebOrders() {
  if (_wOrderUnsub) _wOrderUnsub();
  try {
    const q = query(collection(db, "webOrders"), where("status", "==", "new"));
    _wOrderUnsub = onSnapshot(q, snap => {
      const n = snap.size;
      const $b = document.getElementById("navBadgeWebOrders");
      if ($b) {
        if (n > 0) { $b.textContent = n; $b.hidden = false; }
        else       { $b.textContent = "";  $b.hidden = true; }
      }
      // 第一次載入不跳通知（避免重整就跳一堆）
      if (_initialWebOrderLoad) {
        snap.docs.forEach(d => _seenWebOrderIds.add(d.id));
        _initialWebOrderLoad = false;
        return;
      }
      // 真正的新增才跳
      snap.docChanges().forEach(ch => {
        if (ch.type === "added" && !_seenWebOrderIds.has(ch.doc.id)) {
          _seenWebOrderIds.add(ch.doc.id);
          const d = ch.doc.data();
          toast(`📨 新訂單來了！${d.customer || "客人"} · $${(d.total||0).toLocaleString()}`, "ok");
          // 簡單音效（用 Web Audio API beep）
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start();
            osc.stop(ctx.currentTime + 0.4);
          } catch {}
        }
      });
    });
  } catch (err) {
    console.warn("無法監聽網站訂單：", err);
  }
}

function renderTopbar(user, profile, active) {
  const navItems = NAV.filter(n => !n.adminOnly || profile.role === "admin").map(n =>
    `<a href="${n.href}" class="${active===n.key?'active':''}">
       <span class="ico">${n.icon}</span><span>${n.label}${n.key==='web-orders'?' <span class="nav-badge" id="navBadgeWebOrders" hidden></span>':''}</span>
     </a>`).join("");

  // 上方 bar：左漢堡 + 中間 brand + 右使用者
  const top = document.createElement("header");
  top.className = "topbar";
  top.innerHTML = `
    <button class="btn-hamburger" id="btnHamburger" title="開啟選單" aria-label="開啟選單">☰</button>
    <a class="brand" href="dashboard.html">
      <span class="brand-icon"><img src="assets/logo.png" alt="果果家"
        onerror="this.onerror=null; this.src='assets/logo-fallback.svg';"></span>
      <span>果果家 <span class="muted" style="font-size:.8em;letter-spacing:.2em">KOKOYA</span></span>
    </a>
    <div class="user-chip" title="${user.email}">
      <img src="${user.photoURL || 'assets/logo-fallback.svg'}" alt="">
      <span>${profile.name}</span>
      <span class="role ${profile.role==='admin'?'admin':''}">${profile.role==='admin'?'管理員':'員工'}</span>
      <button id="btnLogout" class="btn ghost icon-only" title="登出">⏻</button>
    </div>
  `;
  document.body.prepend(top);

  // 左側抽屜 + 遮罩
  const overlay = document.createElement("div");
  overlay.className = "drawer-overlay";
  overlay.id = "navOverlay";

  const drawer = document.createElement("aside");
  drawer.className = "drawer";
  drawer.id = "navDrawer";
  drawer.innerHTML = `
    <div class="drawer-head">
      <div class="drawer-title">選單</div>
      <button class="btn-hamburger" id="btnDrawerClose" title="關閉選單" aria-label="關閉">✕</button>
    </div>
    <nav class="drawer-nav">
      ${navItems}
    </nav>
    <div class="drawer-foot muted">${profile.name}　·　${profile.role==='admin'?'管理員':'員工'}</div>
  `;
  document.body.append(overlay, drawer);

  // 開合控制
  const open  = () => { drawer.classList.add("open"); overlay.classList.add("open"); };
  const close = () => { drawer.classList.remove("open"); overlay.classList.remove("open"); };
  document.getElementById("btnHamburger").addEventListener("click", open);
  document.getElementById("btnDrawerClose").addEventListener("click", close);
  overlay.addEventListener("click", close);
  // 點 nav link 後關閉（因為通常會跳頁）
  drawer.querySelectorAll(".drawer-nav a").forEach(a => a.addEventListener("click", close));
  // ESC 關閉
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
}

function bindLogout() {
  document.getElementById("btnLogout")?.addEventListener("click", async () => {
    await signOut(auth);
    location.replace("index.html");
  });
}

// ----- 全域 Toast -----
const area = document.createElement("div");
area.className = "toast-area";
document.addEventListener("DOMContentLoaded", () => document.body.appendChild(area));

export function toast(msg, type = "") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  area.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(8px)"; }, 2200);
  setTimeout(() => t.remove(), 2700);
}

// ----- 小工具 -----
export const fmt = {
  money(n){ return "$" + (Number(n)||0).toLocaleString("zh-TW", {maximumFractionDigits: 0}); },
  num(n){ return (Number(n)||0).toLocaleString("zh-TW"); },
  date(d){
    const dt = d?.toDate ? d.toDate() : (d instanceof Date ? d : new Date(d));
    if (isNaN(dt)) return "—";
    return dt.toLocaleDateString("zh-TW", { year:"numeric", month:"2-digit", day:"2-digit" }).replace(/\//g, "-");
  },
  dateInput(d){
    const dt = d ? (d.toDate ? d.toDate() : new Date(d)) : new Date();
    const z = n => String(n).padStart(2,"0");
    return `${dt.getFullYear()}-${z(dt.getMonth()+1)}-${z(dt.getDate())}`;
  },
  monthKey(d){
    const dt = d?.toDate ? d.toDate() : (d instanceof Date ? d : new Date(d));
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
  }
};

export { isAdmin };
