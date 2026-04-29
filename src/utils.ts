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
 * Get the file extension for a given script field.
 */
export function getFileExtension(
  fieldName: string,
  scriptType?: string
): string {
  switch (fieldName) {
    case "page_data_script":
    case "blockDataScript":
      return ".py";
    case "head_html":
    case "body_html":
      return ".html";
    case "style":
      return ".css";
    case "script":
      if (scriptType === "CSS") return ".css";
      return ".js";
    case "blockClientScript":
      return ".js";
    default:
      return ".txt";
  }
}

/**
 * Get a human-friendly display name for a script field.
 */
export function getScriptDisplayName(
  fieldName: string,
  scriptType?: string
): string {
  switch (fieldName) {
    case "page_data_script":
      return "data script";
    case "head_html":
      return "Head code";
    case "body_html":
      return "Body code";
    case "script":
      if (scriptType === "CSS") return "style";
      return "client script";
    case "style":
      return "style";
    case "blockClientScript":
      return "client script";
    case "blockDataScript":
      return "data script";
    default:
      return fieldName;
  }
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
  return url.replace(/\/+$/, "");
}
