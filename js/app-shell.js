// =====================================================
// 果果家 KOKOYA · 共用頁殼 (TopBar / 權限守門 / Toast)
// 每個頁面 import { mountShell } 即可
// =====================================================
import { auth, signOut, onAuthStateChanged } from "./firebase-config.js";
import { getUserProfile, isAdmin } from "./users.js";

const NAV = [
  { href: "dashboard.html", label: "主控台",   icon: "🏠", key: "dashboard" },
  { href: "batches.html",   label: "訂單批次", icon: "📋", key: "batches" },
  { href: "sales.html",     label: "銷貨",     icon: "🛒", key: "sales" },
  { href: "purchase.html",  label: "進貨",     icon: "📦", key: "purchase" },
  { href: "items.html",     label: "品項清單", icon: "🍎", key: "items" },
  { href: "shipping.html",  label: "出貨單",   icon: "🚚", key: "shipping" },
  { href: "reports.html",   label: "報表",     icon: "📊", key: "reports" },
  { href: "settings.html",  label: "設定",     icon: "⚙️", key: "settings", adminOnly: true },
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
      window.__currentUser = { uid: user.uid, email: user.email, ...profile };
      resolve(window.__currentUser);
    });
  });
}

function renderTopbar(user, profile, active) {
  const el = document.createElement("header");
  el.className = "topbar";
  el.innerHTML = `
    <a class="brand" href="dashboard.html">
      <span class="brand-icon"><img src="assets/logo.png" alt="果果家"
        onerror="this.onerror=null; this.src='assets/logo-fallback.svg';"></span>
      <span>果果家 <span class="muted" style="font-size:.8em;letter-spacing:.2em">KOKOYA</span></span>
    </a>
    <nav>
      ${NAV.filter(n => !n.adminOnly || profile.role === "admin").map(n =>
        `<a href="${n.href}" class="${active===n.key?'active':''}">
           <span>${n.icon}</span><span>${n.label}</span>
         </a>`).join("")}
    </nav>
    <div class="user-chip" title="${user.email}">
      <img src="${user.photoURL || 'assets/logo-fallback.svg'}" alt="">
      <span>${profile.name}</span>
      <span class="role ${profile.role==='admin'?'admin':''}">${profile.role==='admin'?'管理員':'員工'}</span>
      <button id="btnLogout" class="btn ghost icon-only" title="登出">⏻</button>
    </div>
  `;
  document.body.prepend(el);
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
