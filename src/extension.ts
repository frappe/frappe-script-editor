/**
 * Frappe Script Editor — VS Code Extension Entry Point
 *
 * Registers all providers, commands, and services:
 *   - FileSystemProvider for frappe-builder:// virtual files
 *   - TreeDataProvider for the sidebar script browser
 *   - WebviewViewProvider for the site management panel
 *   - HTTP server for browser → VS Code communication
 */

import * as vscode from "vscode";
import { HttpServer } from "./httpServer";
import { ScriptFileSystem } from "./scriptFileSystem";
import { ScriptRegistry, SCHEME } from "./scriptRegistry";
import { SiteManager } from "./siteManager";
import { SiteViewProvider } from "./siteViewProvider";
import { ScriptTreeProvider } from "./treeProvider";

let httpServer: HttpServer | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel(
    "Frappe Script Editor"
  );
  outputChannel.appendLine("Frappe Script Editor activated.");

  // ── Core services ───────────────────────────────────────────────────────

  const siteManager = new SiteManager(context);
  const registry = new ScriptRegistry(siteManager);

  // ── FileSystem Provider ─────────────────────────────────────────────────

  const fileSystem = new ScriptFileSystem(
    siteManager,
    registry,
    outputChannel
  );

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(SCHEME, fileSystem, {
      isCaseSensitive: true,
      isReadonly: false,
    })
  );

  // ── Tree View Provider ──────────────────────────────────────────────────

  const treeProvider = new ScriptTreeProvider(registry);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "frappe-builder-scripts",
      treeProvider
    )
  );

  // ── Webview View Provider (Site Management) ─────────────────────────────

  const siteViewProvider = new SiteViewProvider(siteManager, registry);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SiteViewProvider.viewType,
      siteViewProvider
    )
  );

  // ── Commands ────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("frappeBuilder.addSite", () => {
      // Focus the sites panel — the webview handles the form
      vscode.commands.executeCommand("frappe-builder-sites.focus");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "frappeBuilder.removeSite",
      async (item: { siteId?: string }) => {
        if (item?.siteId) {
          const site = siteManager.getSite(item.siteId);
          if (site) {
            const confirm = await vscode.window.showWarningMessage(
              `Remove site "${site.name}"?`,
              { modal: true },
              "Remove"
            );
            if (confirm === "Remove") {
              await siteManager.removeSite(item.siteId);
              await registry.loadAll();
            }
          }
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "frappeBuilder.reloadSite",
      async (item: { siteId?: string }) => {
        if (item?.siteId) {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Frappe Builder: Reloading site status…",
            },
            async () => {
              await siteManager.reloadSiteStatus(item.siteId!);
              await registry.loadAll();
            }
          );
          vscode.window.showInformationMessage(
            "Frappe Builder: Site status reloaded."
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("frappeBuilder.refreshScripts", async () => {
      await registry.loadAll();
      treeProvider.refresh();
    })
  );

  // ── HTTP Server ─────────────────────────────────────────────────────────

  const config = vscode.workspace.getConfiguration("frappeBuilder");
  const port = config.get<number>("httpServerPort", 52698);

  httpServer = new HttpServer(port, registry, siteManager, outputChannel);
  httpServer.start();

  context.subscriptions.push({
    dispose: () => {
      httpServer?.stop();
      httpServer = null;
    },
  });

  // ── Initial load ────────────────────────────────────────────────────────

  // Load scripts from all configured sites in background
  const sites = siteManager.getSites();
  if (sites.length > 0) {
    registry.loadAll().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Initial load failed: ${msg}`);
    });
  }

  outputChannel.appendLine(
    `Initialized with ${sites.length} configured site(s).`
  );
}

export function deactivate(): void {
  httpServer?.stop();
  httpServer = null;
}
