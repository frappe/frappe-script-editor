import * as vscode from "vscode";
import { APP_NAME } from "./utils";
import { ScriptFileSystem } from "./scriptFileSystem";
import { ScriptRegistry } from "./scriptRegistry";
import { SiteManager } from "./siteManager";
import { TempScriptManager } from "./tempScriptManager";
import { registerAllCommands, type CommandContext } from "./commands";
import { registerFileSystem } from "./subscriptions/registerFileSystem";
import { registerTempFileSystem } from "./subscriptions/registerTempFileSystem";
import { onDidOpenTextDocument } from "./subscriptions/onDidOpenTextDocument";
import { onDidSaveTextDocument } from "./subscriptions/onDidSaveTextDocument";
import { registerTreeView } from "./subscriptions/registerTreeView";
import { onDidChangeActiveTextEditor } from "./subscriptions/onDidChangeActiveTextEditor";
import {
  setupContextKeys,
  setIsSiteViewContext,
} from "./subscriptions/setupContextKeys";
import { registerUriHandler } from "./subscriptions/registerUriHandler";
import { startHttpServer } from "./subscriptions/startHttpServer";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(
    "Frappe Script Editor",
  );
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine("Frappe Script Editor activated.");

  // ── Core services ─────────────────────────────────────────────────────

  const siteManager = new SiteManager(context);
  const registry = new ScriptRegistry(siteManager);
  const fileSystem = new ScriptFileSystem(siteManager, registry, outputChannel);

  // ── Temp script manager ─────────────────────────────────────────────

  const tempScriptManager = new TempScriptManager();
  tempScriptManager.cleanup();
  tempScriptManager.ensureTempDir();

  // ── FileSystem providers ─────────────────────────────────────────────────

  context.subscriptions.push(registerFileSystem(fileSystem));
  context.subscriptions.push(registerTempFileSystem(tempScriptManager));

  // ── Document event handlers ───────────────────────────────────────────────

  context.subscriptions.push(
    onDidOpenTextDocument(registry, tempScriptManager, outputChannel),
  );
  context.subscriptions.push(
    onDidSaveTextDocument(
      registry,
      fileSystem,
      tempScriptManager,
      outputChannel,
    ),
  );

  // ── Restore saved state ───────────────────────────────────────────────

  const savedSiteId = context.workspaceState.get<string>(
    `${APP_NAME}.currentSiteId`,
  );

  if (savedSiteId) {
    await vscode.commands.executeCommand(
      "setContext",
      `${APP_NAME}.currentSiteId`,
      savedSiteId,
    );
    await setIsSiteViewContext(true);
  }

  // ── Tree view ────────────────────────────────────────────────────────

  const { treeView, treeProvider, updateViewTitle } = registerTreeView(
    registry,
    tempScriptManager,
    savedSiteId,
    siteManager,
  );
  context.subscriptions.push(treeView);

  // ── Tree sync with active editor ─────────────────────────────────────

  context.subscriptions.push(
    onDidChangeActiveTextEditor(treeProvider, tempScriptManager, treeView),
  );

  // ── Context keys ────────────────────────────────────────────────────

  context.subscriptions.push(setupContextKeys(siteManager));

  // ── Commands ────────────────────────────────────────────────────────────

  const commandContext: CommandContext = {
    siteManager,
    registry,
    treeProvider,
    ctx: context,
    updateViewTitle,
  };

  context.subscriptions.push(...registerAllCommands(commandContext));

  // ── Realtime doc updates ───────────────────────────────────────────────

  context.subscriptions.push(
    siteManager.onDocUpdate(async ({ siteId, doctype, name }) => {
      const uris = registry.getUrisByDoc(siteId, doctype, name);
      if (uris.length === 0) return;

      for (const uri of uris) {
        registry.clearCachedContent(uri);

        const ref = registry.getReference(uri);
        if (!ref) continue;

        try {
          const bytes = await fileSystem.readFile(uri);
          const text = Buffer.from(bytes).toString("utf8");
          tempScriptManager.updateTempFile(ref.siteId, ref.displayPath, text);
        } catch {
          // ignore fetch errors silently
        }
      }
    }),
  );

  // ── URI handler ────────────────────────────────────────────────────────

  context.subscriptions.push(
    registerUriHandler(
      registry,
      tempScriptManager,
      siteManager,
      outputChannel,
      treeProvider,
      treeView,
      context,
      updateViewTitle,
    ),
  );

  // ── HTTP server ────────────────────────────────────────────────────────

  const httpDisposable = await startHttpServer(outputChannel);
  context.subscriptions.push(httpDisposable);

  // ── Initial load ─────────────────────────────────────────────────

  const sites = siteManager.getSites();
  if (sites.length > 0) {
    await registry.loadSites();
    if (savedSiteId) {
      const savedSite = siteManager.getSite(savedSiteId);
      if (savedSite && savedSite.hasBuilder !== false) {
        await registry.loadAll(savedSiteId);
      }
    }
    treeProvider.refresh();
  }

  outputChannel.appendLine(
    `Initialized with ${sites.length} configured site(s).`,
  );
}
