/**
 * Frappe REST API client.
 *
 * Uses Node.js built-in http/https modules — no external dependencies.
 * Handles authentication via API key + secret token.
 */

import * as http from "http";
import * as https from "https";
import { URL } from "url";
import type {
  FrappeBuilderSettingsDoc,
  FrappeClientScriptDoc,
  FrappePageDoc,
  FrappePageSummary,
} from "./types";

export class FrappeClient {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(baseUrl: string, apiKey: string, apiSecret: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  // ── Internal HTTP helper ────────────────────────────────────────────────

  private request<T = unknown>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const mod = url.protocol === "https:" ? https : http;

      const options: http.RequestOptions = {
        method,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          Authorization: `token ${this.apiKey}:${this.apiSecret}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      };

      const req = mod.request(options, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data) as T);
            } catch {
              resolve(data as unknown as T);
            }
          } else {
            let message = `HTTP ${res.statusCode}`;
            try {
              const parsed = JSON.parse(data);
              if (parsed.exc_type) {
                message += `: ${parsed.exc_type}`;
              }
              if (parsed._server_messages) {
                const msgs = JSON.parse(parsed._server_messages);
                if (Array.isArray(msgs) && msgs.length > 0) {
                  try {
                    const inner = JSON.parse(msgs[0]);
                    message += ` — ${inner.message || msgs[0]}`;
                  } catch {
                    message += ` — ${msgs[0]}`;
                  }
                }
              }
            } catch {
              if (data.length < 500) {
                message += `: ${data}`;
              }
            }
            reject(new Error(message));
          }
        });
      });

      req.on("error", (err) => reject(err));

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  // ── Public API methods ──────────────────────────────────────────────────

  /** Validate credentials by checking logged-in user. */
  async authenticate(): Promise<string> {
    const res = await this.request<{ message: string }>(
      "GET",
      "/api/method/frappe.auth.get_logged_user"
    );
    return res.message;
  }

  /**
   * Check if the Builder module is installed by trying to fetch the Module Def.
   * Returns true if installed, false otherwise.
   */
  async checkBuilderInstalled(): Promise<boolean> {
    try {
      await this.request(
        "GET",
        `/api/resource/Module Def/Builder`
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Fetch all Builder Page documents (summary only). */
  async getBuilderPages(): Promise<FrappePageSummary[]> {
    const res = await this.request<{ data: FrappePageSummary[] }>(
      "GET",
      `/api/resource/Builder Page?fields=["name","page_name","page_title"]&limit_page_length=0&order_by=page_name asc`
    );
    return res.data || [];
  }

  /** Fetch full Builder Page document including blocks and scripts. */
  async getPageDoc(name: string): Promise<FrappePageDoc> {
    const res = await this.request<{ data: FrappePageDoc }>(
      "GET",
      `/api/resource/Builder Page/${encodeURIComponent(name)}`
    );
    return res.data;
  }

  /** Fetch Builder Settings (single doctype). */
  async getBuilderSettings(): Promise<FrappeBuilderSettingsDoc> {
    const res = await this.request<{ data: FrappeBuilderSettingsDoc }>(
      "GET",
      `/api/resource/Builder Settings/Builder Settings`
    );
    return res.data;
  }

  /** Fetch a Builder Client Script document. */
  async getClientScript(name: string): Promise<FrappeClientScriptDoc> {
    const res = await this.request<{ data: FrappeClientScriptDoc }>(
      "GET",
      `/api/resource/Builder Client Script/${encodeURIComponent(name)}`
    );
    return res.data;
  }

  /** Update a single field on a document. */
  async updateField(
    doctype: string,
    docname: string,
    fieldName: string,
    value: string
  ): Promise<void> {
    await this.request(
      "PUT",
      `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(docname)}`,
      { [fieldName]: value }
    );
  }

  /**
   * Fetch the raw blocks JSON for a page (draft_blocks or blocks fallback).
   * Returns the JSON string and which field it came from.
   */
  async getPageBlocksRaw(
    name: string
  ): Promise<{ json: string; field: "draft_blocks" | "blocks" }> {
    const doc = await this.getPageDoc(name);
    if (doc.draft_blocks) {
      return { json: doc.draft_blocks, field: "draft_blocks" };
    }
    return { json: doc.blocks || "[]", field: "blocks" };
  }

  /** Update the blocks JSON on a Builder Page. */
  async updatePageBlocks(
    name: string,
    field: "draft_blocks" | "blocks",
    blocksJson: string
  ): Promise<void> {
    await this.request(
      "PUT",
      `/api/resource/Builder Page/${encodeURIComponent(name)}`,
      { [field]: blocksJson }
    );
  }
}
