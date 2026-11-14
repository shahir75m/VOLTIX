import { API_BASE_URL } from "../config/api";

// Downloads a file from a protected API route (the login cookie is sent with the request).
export async function downloadFile(path, filename) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  if (!response.ok) {
    let message = "Download failed";
    try {
      message = (await response.json()).message || message;
    } catch {
      /* not json */
    }
    throw new Error(message);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
