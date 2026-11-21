import { API_BASE_URL } from "../config/api";

// The guards and StoreLayout both need to know who is logged in. Keeping the last
// successful answer for a few seconds avoids making the same /me request twice when a
// guarded page mounts its own StoreLayout. A failed check is never cached.
const CACHE_MS = 15_000;

let cachedUser = null;
let cachedAt = 0;

export function primeUserSession(user) {
  cachedUser = user || null;
  cachedAt = cachedUser ? Date.now() : 0;
  return cachedUser;
}

export function clearUserSession() {
  cachedUser = null;
  cachedAt = 0;
}

export function peekUserSession() {
  if (!cachedUser) return null;
  if (Date.now() - cachedAt > CACHE_MS) {
    cachedUser = null;
    cachedAt = 0;
    return null;
  }
  return cachedUser;
}

/**
 * Reads /api/users/me. Never throws: the guards only need to know whether there is a
 * customer session and, when the account is blocked, why.
 * @returns {Promise<{user: object|null, blocked: boolean, message: string}>}
 */
export async function readUserSession() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/me`, {
      credentials: "include",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success || !data.user) {
      clearUserSession();
      return {
        user: null,
        blocked: response.status === 403,
        message: data.message || "",
      };
    }

    primeUserSession(data.user);
    return { user: data.user, blocked: false, message: "" };
  } catch {
    clearUserSession();
    return { user: null, blocked: false, message: "" };
  }
}
