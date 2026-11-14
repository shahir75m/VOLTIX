// Behind Nginx / Render / Railway / Vercel every request looks like it comes from the proxy's IP,
// so the rate limiters would treat all customers as one person. Set TRUST_PROXY=1 (number of
// proxies in front of the app) or a value such as "loopback" in production. Unset = off (local dev).
function applyTrustProxy(app, value) {
  if (value === undefined || value === null || String(value).trim() === "") return;
  const text = String(value).trim();
  app.set("trust proxy", /^\d+$/.test(text) ? Number(text) : text);
}

module.exports = { applyTrustProxy };
