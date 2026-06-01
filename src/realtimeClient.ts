import { io, Socket } from "socket.io-client";
import { extractHostname } from "./utils";

const SOCKET_IO_PORT = 9000;

function buildSocketUrl(siteUrl: string): string {
  let normalized = siteUrl.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`;
  }
  const parsed = new URL(normalized);
  const host = parsed.hostname;
  if (parsed.port) {
    return `${parsed.protocol}//${host}:${SOCKET_IO_PORT}`;
  }
  return `${parsed.protocol}//${host}`;
}

export interface DocUpdateEvent {
  doctype: string;
  name: string;
  modified?: string;
}

export class RealtimeClient {
  private socket: Socket | null = null;
  private host: string;
  private siteName: string;
  private socketUrl: string;
  private origin: string;
  private apiKey: string;
  private apiSecret: string;
  private open_docs = new Set<string>();
  private docUpdateHandlers: Array<(data: DocUpdateEvent) => void> = [];

  constructor(
    siteUrl: string,
    siteName: string,
    apiKey: string,
    apiSecret: string,
  ) {
    this.host = extractHostname(siteUrl);
    this.siteName = siteName;
    this.socketUrl = buildSocketUrl(siteUrl);

    let normalized = siteUrl.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `http://${normalized}`;
    }
    const parsed = new URL(normalized);
    this.origin = parsed.origin;

    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    const url = `${this.socketUrl}/${this.siteName}`;

    this.socket = io(url, {
      transports: ["websocket", "polling"],
      extraHeaders: {
        Authorization: `token ${this.apiKey}:${this.apiSecret}`,
        Origin: this.origin,
      },
    });

    this.socket.on("connect", () => {
      console.log(`[realtime:${this.host}] connected`, this.socket?.id);
      for (const key of this.open_docs) {
        const sep = key.indexOf(":");
        const doctype = key.slice(0, sep);
        const docname = key.slice(sep + 1);
        this.socket?.emit("doc_subscribe", doctype, docname);
      }
    });

    this.socket.on("disconnect", (reason) => {
      console.log(`[realtime:${this.host}] disconnected`, reason);
    });

    this.socket.on("doc_update", (data: DocUpdateEvent) => {
      for (const handler of this.docUpdateHandlers) {
        handler(data);
      }
    });

    this.socket.on("connect_error", (err) => {
      console.error(`[realtime:${this.host}] error`, err.message);
    });
  }

  addDocUpdateHandler(handler: (data: DocUpdateEvent) => void): void {
    this.docUpdateHandlers.push(handler);
  }

  docSubscribe(doctype: string, docname: string): void {
    const key = `${doctype}:${docname}`;
    if (!this.open_docs.has(key)) {
      this.open_docs.add(key);
    }

    if (this.socket?.connected) {
      this.socket.emit("doc_subscribe", doctype, docname);
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.offAny();
      this.socket.disconnect();
      this.socket = null;
    }
    this.open_docs.clear();
  }
}
