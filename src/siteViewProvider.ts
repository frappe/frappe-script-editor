/**
 * Site View Provider — WebviewViewProvider for the Sites panel.
 *
 * Renders a webview with a form to add new Frappe sites and displays
 * the list of configured sites with their connection status.
 */

import * as vscode from "vscode";
import type { SiteManager } from "./siteManager";
import type { ScriptRegistry } from "./scriptRegistry";

export class SiteViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "frappe-script-editor-sites";

  private view?: vscode.WebviewView;
  private siteManager: SiteManager;
  private registry: ScriptRegistry;

  constructor(siteManager: SiteManager, registry: ScriptRegistry) {
    this.siteManager = siteManager;
    this.registry = registry;

    // Update webview when sites change
    this.siteManager.onDidChangeSites(() => {
      this.updateWebview();
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "addSite":
          await this.handleAddSite(message);
          break;
        case "removeSite":
          await this.handleRemoveSite(message.siteId);
          break;
        case "reloadSite":
          await this.handleReloadSite(message.siteId);
          break;
        case "refreshScripts":
          await this.registry.loadAll();
          break;
      }
    });
  }

  private async handleAddSite(message: {
    name: string;
    url: string;
    apiKey: string;
    apiSecret: string;
  }): Promise<void> {
    try {
      this.postMessage({ type: "loading", loading: true });
      const site = await this.siteManager.addSite(
        message.name,
        message.url,
        message.apiKey,
        message.apiSecret,
      );

      if (site.hasBuilder === false) {
        this.postMessage({
          type: "info",
          message:
            "Site added but Frappe Script Editor app is not installed. Install Builder on this site or click Reload to re-check.",
        });
      } else {
        this.postMessage({
          type: "success",
          message: `Site "${site.name}" added successfully!`,
        });
      }

      // Load scripts after adding site
      await this.registry.loadAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: "error", message: msg });
    } finally {
      this.postMessage({ type: "loading", loading: false });
    }
  }

  private async handleRemoveSite(siteId: string): Promise<void> {
    const site = this.siteManager.getSite(siteId);
    if (!site) return;

    const confirm = await vscode.window.showWarningMessage(
      `Remove site "${site.name}"? This will remove the saved credentials.`,
      { modal: true },
      "Remove",
    );

    if (confirm === "Remove") {
      await this.siteManager.removeSite(siteId);
      await this.registry.loadAll();
    }
  }

  private async handleReloadSite(siteId: string): Promise<void> {
    await this.siteManager.reloadSiteStatus(siteId);
    await this.registry.loadAll();
    this.postMessage({
      type: "success",
      message: "Site status reloaded.",
    });
  }

  private postMessage(message: unknown): void {
    this.view?.webview.postMessage(message);
  }

  private updateWebview(): void {
    if (this.view) {
      this.view.webview.html = this.getHtml();
    }
  }

  private getHtml(): string {
    const sites = this.siteManager.getSites();

    const siteListHtml = sites
      .map((site) => {
        let statusIcon: string;
        let statusText: string;
        let statusClass: string;

        if (site.hasBuilder === true) {
          statusIcon = "🟢";
          statusText = "Builder detected";
          statusClass = "status-ok";
        } else if (site.hasBuilder === false) {
          statusIcon = "🟡";
          statusText = "Builder not installed";
          statusClass = "status-warn";
        } else {
          statusIcon = "🔴";
          statusText = "Status unknown";
          statusClass = "status-error";
        }

        return `
          <div class="site-card">
            <div class="site-header">
              <span class="site-name">${escapeHtml(site.name)}</span>
              <div class="site-actions">
                <button class="icon-btn" title="Reload status" onclick="reloadSite('${site.id}')">↻</button>
                <button class="icon-btn danger" title="Remove site" onclick="removeSite('${site.id}')">✕</button>
              </div>
            </div>
            <div class="site-url">${escapeHtml(site.url)}</div>
            <div class="site-status ${statusClass}">
              <span>${statusIcon}</span>
              <span>${statusText}</span>
            </div>
          </div>
        `;
      })
      .join("");

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 12px;
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }

    /* ── Form ────────────────────────────────────────────────── */
    .form-group {
      margin-bottom: 8px;
    }
    .form-group label {
      display: block;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 3px;
    }
    .form-group input {
      width: 100%;
      padding: 4px 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 2px;
      font-size: 13px;
      outline: none;
    }
    .form-group input:focus {
      border-color: var(--vscode-focusBorder);
    }

    .btn-primary {
      width: 100%;
      padding: 6px 12px;
      margin-top: 4px;
      border: none;
      border-radius: 2px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-size: 13px;
      cursor: pointer;
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ── Messages ────────────────────────────────────────────── */
    .message {
      padding: 6px 8px;
      border-radius: 3px;
      font-size: 12px;
      margin-top: 8px;
      display: none;
    }
    .message.visible { display: block; }
    .message.error {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
    }
    .message.success {
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-inputValidation-infoBorder);
    }
    .message.info {
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
    }

    /* ── Site list ───────────────────────────────────────────── */
    .sites-section {
      margin-top: 16px;
      border-top: 1px solid var(--vscode-widget-border);
      padding-top: 12px;
    }

    .site-card {
      padding: 8px;
      margin-bottom: 6px;
      border-radius: 4px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border);
    }
    .site-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .site-name {
      font-weight: 600;
      font-size: 13px;
    }
    .site-url {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }
    .site-status {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      margin-top: 4px;
    }
    .status-ok { color: var(--vscode-testing-iconPassed); }
    .status-warn { color: var(--vscode-editorWarning-foreground); }
    .status-error { color: var(--vscode-editorError-foreground); }

    .site-actions {
      display: flex;
      gap: 2px;
    }
    .icon-btn {
      background: none;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 14px;
    }
    .icon-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }
    .icon-btn.danger:hover {
      color: var(--vscode-errorForeground);
    }

    .no-sites {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 12px;
    }
  </style>
</head>
<body>
  <div class="section-title">Add Site</div>
  <form id="addSiteForm">
    <div class="form-group">
      <label for="siteName">Site Name</label>
      <input type="text" id="siteName" placeholder="My Site" required>
    </div>
    <div class="form-group">
      <label for="siteUrl">Site URL</label>
      <input type="url" id="siteUrl" placeholder="https://mysite.frappe.cloud" required>
    </div>
    <div class="form-group">
      <label for="apiKey">API Key</label>
      <input type="text" id="apiKey" placeholder="API key from Frappe user settings" required>
    </div>
    <div class="form-group">
      <label for="apiSecret">API Secret</label>
      <input type="password" id="apiSecret" placeholder="API secret" required>
    </div>
    <button type="submit" class="btn-primary" id="addBtn">Add Site</button>
  </form>
  <div id="msg" class="message"></div>

  ${
    sites.length > 0
      ? `<div class="sites-section">
           <div class="section-title">Connected Sites</div>
           ${siteListHtml}
         </div>`
      : ""
  }

  <script>
    const vscode = acquireVsCodeApi();

    document.getElementById('addSiteForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('siteName').value.trim();
      const url = document.getElementById('siteUrl').value.trim();
      const apiKey = document.getElementById('apiKey').value.trim();
      const apiSecret = document.getElementById('apiSecret').value.trim();

      if (!name || !url || !apiKey || !apiSecret) return;

      vscode.postMessage({ type: 'addSite', name, url, apiKey, apiSecret });
    });

    function removeSite(siteId) {
      vscode.postMessage({ type: 'removeSite', siteId });
    }

    function reloadSite(siteId) {
      vscode.postMessage({ type: 'reloadSite', siteId });
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      const el = document.getElementById('msg');
      const btn = document.getElementById('addBtn');

      if (msg.type === 'loading') {
        btn.disabled = msg.loading;
        btn.textContent = msg.loading ? 'Connecting…' : 'Add Site';
        return;
      }

      if (['error', 'success', 'info'].includes(msg.type)) {
        el.className = 'message visible ' + msg.type;
        el.textContent = msg.message;
        if (msg.type === 'success') {
          document.getElementById('addSiteForm').reset();
          setTimeout(() => { el.className = 'message'; }, 3000);
        }
      }
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
