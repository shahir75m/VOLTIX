// Behind Nginx / Render / Railway / Vercel every request looks like it comes from the proxy's IP,
// so the rate limiters would treat all customers as one person. Set TRUST_PROXY=1 (number of
// proxies in front of the app) or a value such as "loopback" in production. Unset = off (local dev).
function applyTrustProxy(app, value) {
  const text = value === undefined || value === null ? "" : String(value).trim();

  if (text === "") {
    // Without this every customer shares one rate-limit bucket, so "5 logins per 15 minutes"
    // becomes a limit for the whole store. Say it loudly instead of failing silently.
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[proxy] TRUST_PROXY is not set. Behind nginx, all users share one IP for rate limiting. " +
          "Set TRUST_PROXY=1 in the backend environment."
      );
    }
    return;
  }

  app.set("trust proxy", /^\d+$/.test(text) ? Number(text) : text);
}

module.exports = { applyTrustProxy };
