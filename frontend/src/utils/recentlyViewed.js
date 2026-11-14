const KEY = "voltix_recent";
const MAX = 8;

const defaultStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

// localStorage can be blocked (private mode, full): every access is guarded and falls back to "nothing saved".
export function readRecent(storage = defaultStorage()) {
  try {
    const list = JSON.parse(storage?.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((p) => p && typeof p._id === "string") : [];
  } catch {
    return [];
  }
}

// Remembers the last few products this browser looked at (no account or server involved).
export function rememberProduct(product, storage = defaultStorage()) {
  if (!product?._id) return;
  const entry = {
    _id: product._id,
    name: String(product.name || "").slice(0, 120),
    image: product.images?.[0] || product.image || "",
    price: Number(product.price) || 0,
  };
  try {
    storage?.setItem(KEY, JSON.stringify([entry, ...readRecent(storage).filter((p) => p._id !== entry._id)].slice(0, MAX)));
  } catch {
    /* storage unavailable: the feature just stays empty */
  }
}
