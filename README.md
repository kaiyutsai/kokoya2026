# 果果家 KOKOYA · 水果攤記帳銷貨系統

純前端網站（HTML/CSS/JS）+ Firebase（Auth + Firestore），可直接託管在 GitHub Pages。

## 功能總覽

| 頁面 | 功能 |
| --- | --- |
| `index.html` | Google 登入（限白名單帳號） |
| `dashboard.html` | 首頁主控台：今日/本月營收、低庫存、近 7 天圖、最近銷貨 |
| `batches.html` | **訂單批次**：多客戶訂單匯總、SKU 總需求 vs 庫存對比、一鍵建銷貨+出貨單；支援 🤖 AI 解析 LINE 訂單 |
| `sales.html` | 銷貨記錄：每日銷售明細，自動扣庫存、計算毛利；下拉選單支援多種售價組合（單顆/4顆組/7顆組...） |
| `purchase.html` | 進貨記錄：整箱換算 + 加權平均成本 |
| `items.html` | **品項清單**：品項主檔管理 + 當前庫存表；每個品項可加多筆「售價組合」供銷貨/批次快速選 |
| `shipping.html` | 出貨單建立 + 列印（含單號、地址、收貨人、經辦人員） |
| `reports.html` | 營收/毛利/熱賣品項/員工銷售排行報表 |
| `settings.html` | **系統設定**（僅管理員）：管理供應商、配送員清單，供進貨/批次下拉選用 |
| ~~`inventory.html`~~ | 已改名為 `items.html`，舊網址自動跳轉 |

## 一、Firebase 設定（首次部署必做）

### 1. 啟用 Authentication
1. 前往 [Firebase Console](https://console.firebase.google.com/) → 選擇 **kokoya-b5e5c** 專案
2. 左側選單 → **Authentication** → **Sign-in method**
3. 啟用 **Google** 登入
4. **授權網域**：把你 GitHub Pages 的網址加進去（例：`<你的 GitHub 帳號>.github.io`）

### 2. 建立 Firestore Database
1. 左側選單 → **Firestore Database**（不是 Realtime Database）
2. 點「**建立資料庫**」→ 選 **正式版** → 地區建議 **asia-east1（台灣）**
3. 進入「**規則**」分頁，把 `firestore.rules` 的內容整個貼進去並 **發布**

### 3. 使用者白名單（已設定完成）
4 位成員的 Gmail 已寫死在 `js/users.js` 與 `firestore.rules` 裡，無需修改：

| Email | 名字 | 角色 |
| --- | --- | --- |
| kaiyu097@gmail.com | 凱宇 | admin（全權限） |
| caikaifan2017@gmail.com | 凱帆 | staff |
| a0939023198@gmail.com | 妍慧 | staff |
| linoreo52001@gmail.com | 于真 | staff |

未來若要加人，**兩個檔案都要同步修改**（`js/users.js` 與 `firestore.rules` 的 `staff()` 名單），否則登入後存取會被擋。

## 二、上傳 GitHub 並部署

### 1. 建立 GitHub Repo
```bash
cd "KOKOYA記帳系統"
git init
git add .
git commit -m "果果家 KOKOYA · 初版"
git branch -M main
git remote add origin https://github.com/<你的帳號>/kokoya.git
git push -u origin main
```

### 2. 開啟 GitHub Pages
1. 進入 GitHub Repo → **Settings** → **Pages**
2. **Source** 選 `main` 分支、`/ (root)`
3. 等 1～2 分鐘，網址出來：`https://<你的帳號>.github.io/kokoya/`
4. 把這個網址加回 Firebase Console → Authentication → 授權網域

### 3. LOGO（已就位）
`assets/logo.png` 已是正式 LOGO。系統會優先使用它，找不到才用 SVG 暫代版。若日後要換新 LOGO，直接覆蓋這個檔案再 push 即可。

## 三、檔案結構

```
KOKOYA記帳系統/
├── index.html              # 登入頁
├── dashboard.html          # 主控台
├── sales.html              # 銷貨
├── purchase.html           # 進貨
├── inventory.html          # 庫存／品項
├── shipping.html           # 出貨單（含列印）
├── reports.html            # 報表
├── firestore.rules         # Firestore 安全規則（貼到 Console）
├── README.md
├── css/
│   └── style.css           # 全站樣式
├── js/
│   ├── firebase-config.js  # Firebase 初始化
│   ├── users.js            # 白名單
│   ├── app-shell.js        # 共用 TopBar/權限/Toast
│   └── data.js             # Firestore CRUD
├── assets/
│   ├── logo.png            # 你的正式 LOGO（請放進這裡）
│   └── logo-fallback.svg   # 暫代版 SVG LOGO
├── firebase.txt            # 原始 Firebase 設定（保留參考）
└── API KEY.txt             # 額外 API 金鑰（地圖／AI 等用途）
```

## 四、權限設計

| 角色 | 凱宇（admin） | 凱帆／妍慧／于真（staff） |
| --- | --- | --- |
| 登入系統 | ✓ | ✓ |
| 查看所有資料 | ✓ | ✓ |
| 新增銷貨 / 進貨 / 出貨單 / 品項 | ✓ | ✓ |
| 編輯品項 | ✓ | ✓ |
| **刪除任何資料** | ✓ | ✗ |
| 修改別人的紀錄 | ✓ | ✗ |

## 五、常見問題

**Q：員工想刪除自己打錯的單，但系統不給？**
A：請凱宇登入後幫忙刪除，這是設計上的安全防護，避免誤刪。

**Q：怎麼新增第 5 位員工？**
A：(1) 編輯 `js/users.js` 加一行；(2) 編輯 `firestore.rules` 的 `staff()` 函式加 Gmail；(3) 把規則重新「發布」。

**Q：要做門市 POS 用法嗎？**
A：本系統是「老闆／員工開帳系統」，建議裝在手機/平板上隨時記帳，不是收銀機。

**Q：Firestore 免費額度夠嗎？**
A：免費方案每月 50,000 次讀、20,000 次寫。一個攤位每天 100 筆銷貨遠遠用不完。

## 六、客製化提示

- **配色**：改 `css/style.css` 最上面的 CSS Variables（`--orange`、`--leaf`、`--tomato` 等）
- **預設低庫存警示**：改 `js/data.js` 中 `lowStock ?? 5` 的 5
- **報表期間**：在 `reports.html` 最上方下拉清單調整

---

© 果果家 KOKOYA · 凱宇、凱帆、妍慧、于真
