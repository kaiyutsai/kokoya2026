// =====================================================
// 果果家 KOKOYA · AI 訂單解析（Google Gemini）
// 把 LINE 訊息/筆記格式的訂單，解析成結構化的客戶訂單陣列
// =====================================================
import { EXTRA_API_KEY } from "./firebase-config.js";

const MODEL = "gemini-2.0-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${EXTRA_API_KEY}`;

function buildPrompt(items) {
  const itemsList = items.map(i =>
    `  - id="${i.id}" name="${i.name}" unit="${i.unit||''}" 預設售價=${i.price||0}`
  ).join("\n");

  return `你是水果攤訂單解析助手。把使用者貼上的訂單文字（多為 LINE 訊息或筆記格式），解析成結構化 JSON。

【可用品項清單】（lines.itemId 必須從這裡選；找不到對應的請設為空字串並在 warnings 提醒）
${itemsList}

【規則】
1. 每位客戶獨立一筆 order；客戶名稱通常在編號後（如 "1.吳慧儀"、"蔡佳蓉："、"秀珠阿姨："）
2. 同一位客戶買多種品項：每種品項獨立一行 line
3. 品項對應策略：
   - 文字含「紐西蘭蘋果」+「X顆」 → 找名稱含「蘋果」的品項，沒寫 size 預設用最便宜（單價最低）那個
   - 文字含「紅色奇異果」「奇異果X盒」「奇異果」 → 找對應品項
   - 「黃金奇異果」 → 對應另一個品項
   - 文字若直接寫「一箱」「整箱」+ 顆數，請用該顆數當 qty，unit 用「顆」
   - 找不到任何對應 → itemId 設空字串，name 填識別出的水果名，warnings 加註「無對應品項：xxx」
4. 數量解析：
   - 「兩盒」「2盒」 → qty=2, unit=盒
   - 「4顆」「四顆」 → qty=4, unit=顆
   - 「一箱共12小盒」 → qty=12, unit=盒（依訊息中的細項拆解單位）
5. 單價解析：
   - 同一行有「X顆Y元」 → price = Y / X（每顆單價）
   - 「2盒300元」 → price = 150（每盒單價）
6. 付款狀態：
   - 「已付款」「已收款」「已匯款」 → isPaid:true
   - 「現金」「收現金」 → paymentMethod:"cash"
   - 「匯款」「用匯款」 → paymentMethod:"transfer"
   - 都沒寫 → 留空字串
7. 配送資訊放 notes（如「5/6 姸慧送」「送高雄」），address 只在文字明確有地址時才填
8. 沒寫的欄位請留空字串或 false，不要捏造資料

【嚴格的輸出 JSON 格式】
{
  "orders": [
    {
      "customer": "客戶名",
      "phone": "",
      "address": "",
      "paymentMethod": "",
      "isPaid": false,
      "notes": "",
      "lines": [
        { "itemId": "abc123", "name": "紐西蘭蘋果80", "unit": "顆", "qty": 4, "price": 25 }
      ]
    }
  ],
  "warnings": ["可疑或不確定的事項，每項一個字串"]
}

只輸出 JSON 物件，不要有 markdown 程式碼框、不要任何說明文字。`;
}

export async function parseOrders(text, items) {
  if (!EXTRA_API_KEY || !EXTRA_API_KEY.startsWith("AIzaSy")) {
    throw new Error("Gemini API key 未設定（檢查 firebase-config.js 的 EXTRA_API_KEY）");
  }
  if (!text || !text.trim()) throw new Error("沒有輸入文字");
  if (!items || !items.length) throw new Error("品項清單為空，請先到「進貨/庫存」建立品項");

  const body = {
    contents: [{
      parts: [{ text: buildPrompt(items) + "\n\n【使用者貼上的訂單】\n" + text }]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error?.message || ""; } catch {}
    throw new Error(`AI 請求失敗 (${res.status}) ${detail}`);
  }

  const json = await res.json();
  const out = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error("AI 沒有回傳結果（可能被安全過濾擋下）");

  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch (e) {
    throw new Error("AI 回傳的不是合法 JSON：" + out.slice(0, 200));
  }
  return {
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
  };
}
