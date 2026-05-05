// =====================================================
// 果果家 KOKOYA · 使用者白名單
// 只有列在這裡的 Gmail 才能登入系統
// admin = 全權限 (新增/編輯/刪除)
// staff = 只能登入＋新增＋查看，不能編輯/刪除
// =====================================================

export const ALLOWED_USERS = {
  "kaiyu097@gmail.com":       { name: "凱宇", role: "admin", color: "#C97B63" },
  "caikaifan2017@gmail.com":  { name: "凱帆", role: "staff", color: "#E8A87C" },
  "a0939023198@gmail.com":    { name: "妍慧", role: "staff", color: "#A8B89E" },
  "linoreo52001@gmail.com":   { name: "于真", role: "staff", color: "#E9C46A" },
};

// 取得登入者資訊；若未授權則回傳 null
export function getUserProfile(email){
  if (!email) return null;
  return ALLOWED_USERS[email.toLowerCase()] ?? null;
}

export function isAdmin(email){
  return getUserProfile(email)?.role === "admin";
}
