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
import * as portfinder from "portfinder";
import { HttpServer } from "./httpServer";
import { ScriptFileSystem } from "./scriptFileSystem";
import { ScriptRegistry, SCHEME } from "./scriptRegistry";
import { SiteManager } from "./siteManager";
import { ScriptTreeProvider } from "./treeProvider";
import { TempScriptManager } from "./tempScriptManager";

let httpServer: HttpServer | null = null;
let tempScriptManager: TempScriptManager | null = null;

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
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

  // ── Restore currentSiteId from workspaceState (before tree registration) ──

  const savedSiteId = context.workspaceState.get<string>(
    "frappeScriptEditor.currentSiteId",
  );
  if (savedSiteId) {
    await vscode.commands.executeCommand(
      "setContext",
      "frappeScriptEditor.currentSiteId",
      savedSiteId,
    );
  }

  // ── Tree View Provider ──────────────────────────────────────────────────

  const treeProvider = new ScriptTreeProvider(registry);
  treeProvider.setTempManager(tempScriptManager);
  if (savedSiteId) {
    treeProvider.currentSiteId = savedSiteId;
  }

  const treeView = vscode.window.createTreeView(
    "frappe-script-editor-scripts",
    {
      treeDataProvider: treeProvider,
    },
  );
  context.subscriptions.push(treeView);

  // Helper to update view title based on current site
  const updateViewTitle = () => {
    if (treeProvider.currentSiteId) {
      const site = siteManager.getSite(treeProvider.currentSiteId);
      treeView.title = site?.name || "Site";
    } else {
      treeView.title = "Sites";
    }
  };

  // Set initial title
  updateViewTitle();

  // ── Setup Context Keys ──────────────────────────────────────────────────

  const updateHasSitesContext = () => {
    vscode.commands.executeCommand(
      "setContext",
      "frappeScriptEditor.hasSites",
      siteManager.getSites().length > 0,
    );
  };
  siteManager.onDidChangeSites(updateHasSitesContext);
  updateHasSitesContext();

  // ── Commands ────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("frappeScriptEditor.addSite", async () => {
      const name = await vscode.window.showInputBox({
        prompt: "Enter Site Name",
        placeHolder: "My Site",
      });
      if (!name) return;
      const url = await vscode.window.showInputBox({
        prompt: "Enter Site URL",
        placeHolder: "https://mysite.frappe.cloud",
      });
      if (!url) return;
      const apiKey = await vscode.window.showInputBox({
        prompt: "Enter API Key",
        placeHolder: "API key from Frappe user settings",
      });
      if (!apiKey) return;
      const apiSecret = await vscode.window.showInputBox({
        prompt: "Enter API Secret",
        placeHolder: "API secret",
        password: true,
      });
      if (!apiSecret) return;

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Adding Site ${name}…`,
          },
          async () => {
            const site = await siteManager.addSite(
              name,
              url,
              apiKey,
              apiSecret,
            );
            if (site.hasBuilder === false) {
              vscode.window.showWarningMessage(
                "Site added but Builder app is not installed. Install Builder on this site or click Reload to re-check.",
              );
            } else {
              vscode.window.showInformationMessage(
                `Site "${site.name}" added successfully!`,
              );
            }
            await registry.loadAll();
          },
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to add site: ${msg}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "frappeScriptEditor.openSite",
      async (item: { siteId?: string }) => {
        if (item?.siteId) {
          treeProvider.currentSiteId = item.siteId;
          await vscode.commands.executeCommand(
            "setContext",
            "frappeScriptEditor.currentSiteId",
            item.siteId,
          );
          await context.workspaceState.update(
            "frappeScriptEditor.currentSiteId",
            item.siteId,
          );
          updateViewTitle();
          treeProvider.refresh();
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("frappeScriptEditor.goBack", async () => {
      treeProvider.currentSiteId = null;
      await vscode.commands.executeCommand(
        "setContext",
        "frappeScriptEditor.currentSiteId",
        "",
      );
      await context.workspaceState.update(
        "frappeScriptEditor.currentSiteId",
        undefined,
      );
      updateViewTitle();
      treeProvider.refresh();
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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "frappeScriptEditor.collapseFolders",
      async () => {
        await vscode.commands.executeCommand(
          "frappe-script-editor-scripts.focus",
        );
        await vscode.commands.executeCommand("list.collapseAll");
      },
    ),
  );

  // ── HTTP Server ─────────────────────────────────────────────────────────

  const port = await portfinder.getPortPromise({
    port: 59000,
    stopPort: 59999,
  });

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

  // Refetch scripts when VS Code regains focus
  let isFirstFocus = true;
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(async (state) => {
      if (!state.focused) return;
      if (isFirstFocus) {
        isFirstFocus = false;
        return;
      }

      const activeSiteId = treeProvider.currentSiteId;
      if (!activeSiteId) return;

      try {
        await registry.reloadSite(activeSiteId);
        outputChannel.appendLine(`Refetched scripts for site: ${activeSiteId}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        outputChannel.appendLine(`Refetch failed: ${msg}`);
      }
    }),
  );
}

export function deactivate(): void {
  httpServer?.stop();
  httpServer = null;
  tempScriptManager?.cleanup();
  tempScriptManager = null;
}
