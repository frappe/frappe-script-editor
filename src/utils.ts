export function sanitizeName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim();
}

export function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function normalizeUrl(url: string): string {
  let normalized = url.trim().toLowerCase();
  // Add protocol if missing so URL parsing works consistently
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`;
  }
  return normalized.replace(/\/+$/, "");
}

export function extractHostname(url: string): string {
  let normalized = url.trim().toLowerCase();
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`;
  }
  try {
    return new URL(normalized).hostname;
  } catch {
    // If URL parsing fails, strip protocol/port manually
    return normalized
      .replace(/^https?:\/\//, "")
      .replace(/:\d+.*$/, "")
      .replace(/\/.*$/, "");
  }
}
