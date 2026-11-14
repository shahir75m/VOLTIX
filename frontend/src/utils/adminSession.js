import { API_BASE_URL } from "../config/api";
import { createAdminSessionCache } from "./adminSessionCache";

const cache = createAdminSessionCache(async () => {
  const response = await fetch(`${API_BASE_URL}/api/admin/dashboard`, { credentials: "include" });
  const data = await response.json();
  if (!response.ok || !data.success || data.admin?.role !== "admin") {
    const error = new Error(data.message || "Admin session expired");
    error.status = response.status === 403 ? 403 : 401;
    throw error;
  }
  return data.admin;
});
const dataCache = new Map();
export const hasAdminSession = () => Boolean(cache.peek());
export const getAdminSession = () => cache.load();
export const refreshAdminSession = () => cache.load({ force: true });
export const adminSessionRefreshDelay = () => Math.max(1000, cache.remaining() - 60000);
export const invalidateAdminSession = () => { cache.clear(); dataCache.clear(); };
export const getAdminCachedData = (key) => {
  const entry = dataCache.get(key);
  return hasAdminSession() && entry && Date.now() - entry.at < 60000 ? entry.data : null;
};
export const setAdminCachedData = (key, data) => {
  if (dataCache.size >= 40 && !dataCache.has(key)) dataCache.delete(dataCache.keys().next().value);
  dataCache.set(key, { at: Date.now(), data });
};
export const clearAdminCachedData = () => dataCache.clear();
