// WhatsApp, Telegram and Facebook do not run JavaScript, so a React page can never give a rich link
// preview. This tiny server-rendered page carries the Open Graph tags, then sends people to the real product page.
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const safeHttpUrl = (value) => (/^https?:\/\//i.test(String(value || "")) ? String(value) : "");

function renderShareHtml(product, { frontendUrl }) {
  const target = `${String(frontendUrl).replace(/\/+$/, "")}/products/${encodeURIComponent(product._id)}`;
  const title = `${product.name} | Voltix`;
  const description = String(product.shortDescription || product.description || `Buy ${product.name} on Voltix`).slice(0, 200);
  const image = safeHttpUrl(product.image);
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(target);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Voltix">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}">\n<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<meta http-equiv="refresh" content="0; url=${u}">
<link rel="canonical" href="${u}">
</head><body><p>Opening <a href="${u}">${t}</a>...</p></body></html>`;
}

module.exports = { renderShareHtml, escapeHtml };
