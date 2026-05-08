/**
 * Frappe REST API client.
 *
 */

import { PAGE_FIELDS } from "./builderConfig";
import type {
  FrappeBuilderSettingsDoc,
  FrappeClientScriptDoc,
  FrappePageDoc,
  FrappePageSummary,
  PageBlocksField,
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

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `token ${this.apiKey}:${this.apiSecret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();

    if (response.ok) {
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }

    let message = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed.exc_type) {
        message += `: ${parsed.exc_type}`;
      }
    } catch {
      if (text.length < 500) {
        message += `: ${text}`;
      }
    }
    throw new Error(message);
  }

  // ── Public API methods ──────────────────────────────────────────────────

  async authenticate(): Promise<string> {
    const res = await this.request<{ message: string }>(
      "GET",
      "/api/method/frappe.auth.get_logged_user",
    );
    return res.message;
  }

  async checkBuilderInstalled(): Promise<boolean> {
    try {
      await this.request("GET", `/api/resource/Module Def/Builder`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message?.includes("fetch failed") ||
        message?.includes("ECONNREFUSED") ||
        message?.includes("ENOTFOUND") ||
        message?.includes("Timeout") ||
        message?.includes("SSL") ||
        message?.includes("TLS")
      ) {
        throw err;
      }
      return false;
    }
  }

  async getBuilderPages(): Promise<FrappePageSummary[]> {
    const res = await this.request<{ data: FrappePageSummary[] }>(
      "GET",
      `/api/resource/Builder Page?fields=["name","page_name","page_title"]&limit_page_length=0&order_by=page_name asc`,
    );
    return res.data || [];
  }

  async getPageDoc(name: string): Promise<FrappePageDoc> {
    const res = await this.request<{ data: FrappePageDoc }>(
      "GET",
      `/api/resource/Builder Page/${encodeURIComponent(name)}`,
    );
    return res.data;
  }

  async getBuilderSettings(): Promise<FrappeBuilderSettingsDoc> {
    const res = await this.request<{ data: FrappeBuilderSettingsDoc }>(
      "GET",
      `/api/resource/Builder Settings/Builder Settings`,
    );
    return res.data;
  }

  async getClientScript(name: string): Promise<FrappeClientScriptDoc> {
    const res = await this.request<{ data: FrappeClientScriptDoc }>(
      "GET",
      `/api/resource/Builder Client Script/${encodeURIComponent(name)}`,
    );
    return res.data;
  }

  async updateField(
    doctype: string,
    docname: string,
    fieldName: string,
    value: string,
  ): Promise<void> {
    await this.request(
      "PUT",
      `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(docname)}`,
      { [fieldName]: value },
    );
  }

  async getPageBlocksRaw(
    name: string,
  ): Promise<{ json: string; field: PageBlocksField }> {
    const doc = await this.getPageDoc(name);
    if (doc.draft_blocks) {
      return {
        json: doc.draft_blocks || "[]",
        field: PAGE_FIELDS.DRAFT_BLOCKS,
      };
    }
    return { json: doc.blocks || "[]", field: PAGE_FIELDS.BLOCKS };
  }

  async updatePageBlocks(
    name: string,
    field: PageBlocksField,
    blocksJson: string,
  ): Promise<void> {
    await this.request(
      "PUT",
      `/api/resource/Builder Page/${encodeURIComponent(name)}`,
      { [field]: blocksJson },
    );
  }
}
