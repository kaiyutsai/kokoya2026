// =====================================================
// 果果家 KOKOYA · AI 圖片美化（Google Gemini 2.5 Flash Image）
// 用途：把上傳的水果商品照美化成「展示用主圖」
// API 金鑰共用 ai-parse.js 那把（Firestore settings/secrets.geminiApiKey）
// =====================================================
import { getSecrets } from "./data.js";

const MODEL = "gemini-2.5-flash-image-preview";   // 若官方換名稱可在這裡改

let cachedKey = null;
async function getApiKey() {
  if (cachedKey) return cachedKey;
  const s = await getSecrets();
  cachedKey = s.geminiApiKey || "";
  return cachedKey;
}
export function clearAiImageKeyCache() { cachedKey = null; }

// File / Blob → base64 字串（不含 data:image/...;base64, 前綴）
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = String(r.result || "");
      const idx = result.indexOf(",");
      resolve(idx > -1 ? result.slice(idx + 1) : result);
    };
    r.onerror = () => reject(new Error("讀取圖片失敗"));
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, mime = "image/png") {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// 預設美化提示詞（商品攝影級大修；只保留水果種類與數量）
const DEFAULT_PROMPT = [
  "Transform this photo into a professional, magazine-quality fruit product photography hero shot for an e-commerce store.",
  "",
  "GOAL: Make the fruit look as appetizing, fresh, and premium as possible — like a high-end supermarket catalog or food magazine cover.",
  "",
  "YOU MAY EXTENSIVELY EDIT (do all of these as needed):",
  "- Replace the background with a clean studio background (soft cream / off-white / subtle gradient / wooden surface), remove any distracting clutter, hands, hangers, packaging, plastic wrap, price tags, original surroundings.",
  "- Re-light dramatically with soft studio lighting, add highlights, gentle shadows, and dewy water-droplet sheen on the fruit skin to convey freshness.",
  "- Boost saturation, vibrancy, contrast, and clarity. Make colors pop richly but stay natural and edible-looking.",
  "- Recompose to centered, hero-style framing with breathing room. Crop in tight if needed.",
  "- Smooth out blemishes, dust, scratches, bruises, stickers, and any imperfections on the fruit surface.",
  "- Add a few elegant decorative touches if it looks too plain (e.g., a tiny green leaf, water droplets, a soft drop shadow).",
  "",
  "STRICT RULES (must keep):",
  "- The SAME fruit type/variety. If it is apples, output apples. If grapes, output grapes. Do not swap to a different fruit.",
  "- The SAME approximate count of fruits (don't multiply 1 apple into 5).",
  "- Realistic and photographic — NOT cartoon, NOT illustration, NOT painting, NOT 3D render style.",
  "",
  "OUTPUT: A clean, premium, photorealistic e-commerce product photo. Square or 4:3 ratio. High resolution. Same aspect ratio as input."
].join("\n");

/**
 * 用 Gemini 2.5 Flash Image 美化單張圖片
 * @param {Blob|File} blob 原圖
 * @param {string} [prompt] 自訂提示詞
 * @returns {Promise<{ blob: Blob, mimeType: string }>}
 */
export async function enhanceImage(blob, prompt = DEFAULT_PROMPT) {
  const apiKey = await getApiKey();
  if (!apiKey || !apiKey.startsWith("AIzaSy")) {
    throw new Error("Gemini API 金鑰未設定，請到「⚙️ 設定」頁的「🔑 API 金鑰」填入");
  }
  if (!blob) throw new Error("沒有圖片");
  const mime = blob.type || "image/jpeg";
  if (!mime.startsWith("image/")) throw new Error("不是圖片檔");

  const b64 = await blobToBase64(blob);

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: mime, data: b64 } }
      ]
    }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
      temperature: 0.4
    }
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error?.message || ""; } catch {}
    throw new Error(`AI 美化失敗 (${res.status}) ${detail}`);
  }

  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData);
  if (!imgPart) {
    const textPart = parts.find(p => p.text)?.text || "";
    throw new Error("AI 沒回傳圖片" + (textPart ? `（訊息：${textPart.slice(0,80)}）` : ""));
  }
  const outMime = imgPart.inlineData.mimeType || "image/png";
  const outBlob = base64ToBlob(imgPart.inlineData.data, outMime);
  return { blob: outBlob, mimeType: outMime };
}
