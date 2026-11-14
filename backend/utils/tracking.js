const clip = (value, max) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");

// Courier details the admin types when shipping an order. Links must be http(s) so a customer can
// never be sent to a javascript: URL.
function normalizeTracking(input) {
  const source = input && typeof input === "object" ? input : {};
  const url = clip(source.trackingUrl, 300);
  return {
    courier: clip(source.courier, 60),
    trackingNumber: clip(source.trackingNumber, 60),
    trackingUrl: /^https?:\/\//i.test(url) ? url : "",
  };
}

module.exports = { normalizeTracking };
