/**
 * Utility helpers for the Frappe Script Editor extension.
 */

/**
 * Sanitize a string to be safe for use as a file/directory name.
 * Replaces problematic characters with underscores.
 */
export function sanitizeName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim();
}

/**
 * Generate a simple UUID v4 for site IDs.
 */
export function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Normalize a URL by removing trailing slashes.
 */
export function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "").toLowerCase();
}
