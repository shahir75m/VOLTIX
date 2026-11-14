import { API_BASE_URL } from "../config/api";

// Small fetch wrapper used by the shop pages.
// - always sends the login cookie
// - throws an Error with .status, .errors (field errors) and .data on failure
export async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || data?.success === false) {
    const error = new Error(data?.message || "Something went wrong. Please try again.");
    error.status = response.status;
    error.errors = data?.errors || {};
    error.data = data;
    throw error;
  }

  return data;
}

// multipart upload (images): the browser sets the Content-Type with its boundary itself
export function apiForm(path, method, formData) {
  return apiFetch(path, { method, body: formData });
}

export function apiJson(path, method, body) {
  return apiFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
