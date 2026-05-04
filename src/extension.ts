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
import * as fs from "fs";
import { HttpServer } from "./httpServer";
import { ScriptFileSystem } from "./scriptFileSystem";
import { ScriptRegistry, SCHEME } from "./scriptRegistry";
import { SiteManager } from "./siteManager";
import { SiteViewProvider } from "./siteViewProvider";
import { ScriptTreeProvider } from "./treeProvider";
import { TempScriptManager } from "./tempScriptManager";

let httpServer: HttpServer | null = null;
let tempScriptManager: TempScriptManager | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel(
    "Frappe Script Editor",
  );
  outputChannel.appendLine("Frappe Script Editor activated.");

  // ── Core services ───────────────────────────────────────────────────────

  const siteManager = new SiteManager(context);
  const registry = new ScriptRegistry(siteManager);

  // ── FileSystem Provider ─────────────────────────────────────────────────

  const fileSystem = new ScriptFileSystem(siteManager, registry, outputChannel);

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(SCHEME, fileSystem, {
      isCaseSensitive: true,
      isReadonly: false,
    }),
  );

  // ── Temp Script Manager ─────────────────────────────

  tempScriptManager = new TempScriptManager();
  tempScriptManager.cleanup();
  tempScriptManager.ensureTempDir();

  // ── Auto-save temp files on document open ─────────────────────────────────────────

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async (doc) => {
      if (doc.uri.scheme !== SCHEME) return;
      if (!tempScriptManager) return;

      const ref = registry.getReference(doc.uri);
      if (!ref) return;

      const cached = registry.getCachedContent(doc.uri);
      if (cached === undefined) return;

      try {
        const realPath = tempScriptManager.exportScriptSync(
          doc.uri,
          ref,
          cached,
        );
        outputChannel.appendLine(`Exported to temp: ${realPath}`);
        vscode.window.setStatusBarMessage(
          `Frappe: Exported to ${realPath}`,
          5000,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        outputChannel.appendLine(`Export failed: ${msg}`);
      }
    }),
  );

  // ── Auto-sync on file save ────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (!tempScriptManager) return;

      const filePath = doc.uri.fsPath;
      if (!filePath || !filePath.startsWith(tempScriptManager.getTempDir()))
        return;

      const virtualUriString = tempScriptManager.getVirtualUri(filePath);
      if (!virtualUriString) return;

      const virtualUri = vscode.Uri.parse(virtualUriString);
      const ref = registry.getReference(virtualUri);
      if (!ref) return;

      const savedContent = fs.readFileSync(filePath, "utf8");
      const cachedContent =
        registry.getCachedContentByUriString(virtualUriString);

      if (savedContent === cachedContent) return;

      try {
        await fileSystem.writeFile(
          virtualUri,
          new TextEncoder().encode(savedContent),
          { create: false, overwrite: true },
        );
        registry.setCachedContentSync(virtualUriString, savedContent);
        vscode.window.setStatusBarMessage("Frappe: Synced to Frappe", 3000);
        outputChannel.appendLine(`Synced: ${ref.displayPath}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        outputChannel.appendLine(`Sync failed: ${msg}`);
        vscode.window.showErrorMessage(`Frappe: sync failed — ${msg}`);
      }
    }),
  );

  // ── Tree View Provider ──────────────────────────────────────────────────

  const treeProvider = new ScriptTreeProvider(registry);
  treeProvider.setTempManager(tempScriptManager);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "frappe-script-editor-scripts",
      treeProvider,
    ),
  );

  // ── Webview View Provider (Site Management) ─────────────────────────────

  const siteViewProvider = new SiteViewProvider(siteManager, registry);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SiteViewProvider.viewType,
      siteViewProvider,
    ),
  );

  // ── Commands ────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("frappeScriptEditor.addSite", () => {
      // Focus the sites panel — the webview handles the form
      vscode.commands.executeCommand("frappe-script-editor-sites.focus");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "frappeScriptEditor.removeSite",
      async (item: { siteId?: string }) => {
        if (item?.siteId) {
          const site = siteManager.getSite(item.siteId);
          if (site) {
            const confirm = await vscode.window.showWarningMessage(
              `Remove site "${site.name}"?`,
              { modal: true },
              "Remove",
            );
            if (confirm === "Remove") {
              await siteManager.removeSite(item.siteId);
              await registry.loadAll();
            }
          }
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "frappeScriptEditor.reloadSite",
      async (item: { siteId?: string }) => {
        if (item?.siteId) {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Frappe Script Editor: Reloading site status…",
            },
            async () => {
              await siteManager.reloadSiteStatus(item.siteId!);
              await registry.loadAll();
            },
          );
          vscode.window.showInformationMessage(
            "Frappe Script Editor: Site status reloaded.",
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "frappeScriptEditor.refreshScripts",
      async () => {
        await registry.loadAll();
        treeProvider.refresh();
      },
    ),
  );

  // ── HTTP Server ─────────────────────────────────────────────────────────

  const config = vscode.workspace.getConfiguration("frappeScriptEditor");
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
    `Initialized with ${sites.length} configured site(s).`,
  );
}

export function deactivate(): void {
  httpServer?.stop();
  httpServer = null;
  tempScriptManager?.cleanup();
  tempScriptManager = null;
}
