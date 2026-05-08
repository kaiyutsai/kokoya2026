// =====================================================
// 果果家 KOKOYA · 簡易 Markdown 解析器
// 只支援我們需要的：## h2, ### h3, **bold**, *italic*, - list, 段落
// （可同時被後台 articles.html 預覽 + 前台 blog.html 渲染共用）
// =====================================================

// 把字串中的 HTML 危險字元跳脫，避免 XSS
function escapeHtml(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 處理單行內聯（**bold** *italic* `code` [text](url)）
function inline(s) {
  return escapeHtml(s)
    // [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // **bold**
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // *italic*
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    // `code`
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function renderMarkdown(md) {
  if (!md) return "";
  const lines = md.split(/\r?\n/);
  const out = [];
  let inList = false;
  let inPara = [];

  const flushPara = () => {
    if (inPara.length) {
      out.push("<p>" + inPara.map(inline).join("<br>") + "</p>");
      inPara = [];
    }
  };
  const flushList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    // h3
    let m = line.match(/^###\s+(.+)$/);
    if (m) { flushPara(); flushList(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    // h2
    m = line.match(/^##\s+(.+)$/);
    if (m) { flushPara(); flushList(); out.push(`<h2>${inline(m[1])}</h2>`); continue; }
    // h1
    m = line.match(/^#\s+(.+)$/);
    if (m) { flushPara(); flushList(); out.push(`<h1>${inline(m[1])}</h1>`); continue; }
    // list
    m = line.match(/^[-*]\s+(.+)$/);
    if (m) {
      flushPara();
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    // > blockquote
    m = line.match(/^>\s*(.+)$/);
    if (m) { flushPara(); flushList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    // 一般段落
    flushList();
    inPara.push(line);
  }
  flushPara();
  flushList();
  return out.join("\n");
}

// 把標題轉成 slug（保留中文，把空白和特殊字符處理掉）
export function slugify(s) {
  if (!s) return "";
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s一-鿿-]/g, "")  // 保留英數、底線、空白、中文、連字號
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}
