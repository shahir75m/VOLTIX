// Builds the API origin used by every request.
// Requests are written as `${API_BASE_URL}/api/...`, so the base must be a bare origin.
// A trailing slash or an accidental "/api" (which once produced /api/api/products on the
// deployed site) is removed instead of failing silently.
export function normaliseApiBase(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "").replace(/\/api$/, "");
}
