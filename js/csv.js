// =====================================================
// 果果家 KOKOYA · CSV 匯出工具
// 用法：exportCsv("檔名.csv", [...rows], [{ key, label, format }])
// =====================================================

function escapeCsv(v) {
  if (v == null) return "";
  let s = String(v);
  // 包含逗號/雙引號/換行 → 用 "" 包，內部 " 雙寫
  if (/[,"\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 把 rows 匯出成 CSV 並觸發下載
 * @param {string} filename - 檔名（含 .csv）
 * @param {Array<Object>} rows
 * @param {Array<{key:string,label:string,format?:Function}>} columns
 */
export function exportCsv(filename, rows, columns) {
  const header = columns.map(c => escapeCsv(c.label)).join(",");
  const body = rows.map(r =>
    columns.map(c => {
      let v = r[c.key];
      if (typeof c.format === "function") v = c.format(v, r);
      return escapeCsv(v);
    }).join(",")
  ).join("\n");
  const csv = "﻿" + header + "\n" + body;   // BOM 讓 Excel 正確顯示中文
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 200);
}

// 把 Firestore Timestamp 或 Date 轉成 YYYY-MM-DD HH:mm 字串
export function fmtDateTime(d) {
  if (!d) return "";
  const dt = d.toDate ? d.toDate() : new Date(d);
  if (isNaN(dt)) return "";
  const z = n => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${z(dt.getMonth()+1)}-${z(dt.getDate())} ${z(dt.getHours())}:${z(dt.getMinutes())}`;
}

export function fmtDate(d) {
  if (!d) return "";
  const dt = d.toDate ? d.toDate() : new Date(d);
  if (isNaN(dt)) return "";
  const z = n => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${z(dt.getMonth()+1)}-${z(dt.getDate())}`;
}
