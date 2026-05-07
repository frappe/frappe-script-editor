/**
 * Site Manager — handles add/remove/persist of Frappe site connections.
 *
 */

import * as vscode from "vscode";
import { FrappeClient } from "./frappeClient";
import type { FrappeSiteConfig, StoredSiteConfig } from "./types";
import { generateId, normalizeUrl, extractHostname } from "./utils";

const SITES_STORAGE_KEY = "frappeScriptEditor.sites";
const SECRET_PREFIX = "frappeScriptEditor.secret.";

export class SiteManager {
  private _onDidChangeSites = new vscode.EventEmitter<void>();
  readonly onDidChangeSites = this._onDidChangeSites.event;

  private sites: FrappeSiteConfig[] = [];
  private globalState: vscode.Memento;
  private secrets: vscode.SecretStorage;

  private clients = new Map<string, FrappeClient>();

  constructor(context: vscode.ExtensionContext) {
    this.globalState = context.globalState;
    this.secrets = context.secrets;
    this.loadSites();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getSites(): FrappeSiteConfig[] {
    return [...this.sites];
  }

  getSite(id: string): FrappeSiteConfig | undefined {
    return this.sites.find((s) => s.id === id);
  }

  findSiteByUrl(url: string): FrappeSiteConfig | undefined {
    const normalized = normalizeUrl(url);

    const exact = this.sites.find((s) => normalizeUrl(s.url) === normalized);
    if (exact) return exact;

    const hostname = extractHostname(url);
    return this.sites.find((s) => extractHostname(s.url) === hostname);
  }

  async addSite(
    name: string,
    url: string,
    apiKey: string,
    apiSecret: string,
  ): Promise<FrappeSiteConfig> {
    url = normalizeUrl(url);

    if (this.sites.some((s) => normalizeUrl(s.url) === url)) {
      throw new Error(`Site "${url}" is already configured.`);
    }

    const client = new FrappeClient(url, apiKey, apiSecret);
    try {
      await client.authenticate();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Authentication failed: ${msg}`);
    }

    let hasBuilder: boolean | null = null;
    let isOffline: boolean | null = null;
    try {
      hasBuilder = await client.checkBuilderInstalled();
    } catch {
      isOffline = true;
      hasBuilder = null;
    }

    const site: FrappeSiteConfig = {
      id: generateId(),
      name,
      url,
      apiKey,
      hasBuilder,
      isOffline,
    };

    await this.secrets.store(SECRET_PREFIX + site.id, apiSecret);

    this.sites.push(site);
    this.clients.set(site.id, client);
    await this.persistSites();
    this._onDidChangeSites.fire();

    return site;
  }

  async removeSite(id: string): Promise<void> {
    this.sites = this.sites.filter((s) => s.id !== id);
    this.clients.delete(id);
    await this.secrets.delete(SECRET_PREFIX + id);
    await this.persistSites();
    this._onDidChangeSites.fire();
  }

  async reloadSiteStatus(id: string): Promise<void> {
    const site = this.getSite(id);
    if (!site) return;

    try {
      const client = await this.getClient(id);
      site.hasBuilder = await client.checkBuilderInstalled();
      site.isOffline = false;
    } catch {
      site.hasBuilder = null;
      site.isOffline = true;
    }

    await this.persistSites();
    this._onDidChangeSites.fire();
  }

  async getClient(siteId: string): Promise<FrappeClient> {
    const existing = this.clients.get(siteId);
    if (existing) return existing;

    const site = this.getSite(siteId);
    if (!site) throw new Error(`Site ${siteId} not found.`);

    const secret = await this.secrets.get(SECRET_PREFIX + siteId);
    if (!secret) {
      throw new Error(
        `API secret for site "${site.name}" not found. Please remove and re-add the site.`,
      );
    }

    const client = new FrappeClient(site.url, site.apiKey, secret);
    this.clients.set(siteId, client);
    return client;
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  private loadSites(): void {
    const stored =
      this.globalState.get<StoredSiteConfig[]>(SITES_STORAGE_KEY) || [];
    this.sites = stored.map((s) => ({
      ...s,
      hasBuilder: s.hasBuilder ?? null,
      isOffline: s.isOffline ?? null,
    }));
  }

  private async persistSites(): Promise<void> {
    const toStore: StoredSiteConfig[] = this.sites.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      apiKey: s.apiKey,
      hasBuilder: s.hasBuilder,
      isOffline: s.isOffline,
    }));
    await this.globalState.update(SITES_STORAGE_KEY, toStore);
  }
}
