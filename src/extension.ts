import * as vscode from "vscode";
import * as fs from "fs";
import * as portfinder from "portfinder";
import { HttpServer } from "./httpServer";
import { ScriptFileSystem, findBlockById } from "./scriptFileSystem";
import { ScriptRegistry, SCHEME } from "./scriptRegistry";
import { SiteManager } from "./siteManager";
import { ScriptTreeProvider } from "./treeProvider";
import { TempScriptManager } from "./tempScriptManager";
import {
  TempFileSystemProvider,
  TEMP_SCHEME,
  getCleanTempUri,
} from "./tempFileSystemProvider";
import { BUILDER_DOCTYPES, ERROR_MESSAGES } from "./builderConfig";
import type { BlockFieldScript, BlockNode } from "./types";
import { sanitizeName } from "./utils";
import { registerAllCommands, type CommandContext } from "./commands";

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

  // ── Temp FileSystem Provider for clean URIs ────────────────────────────────────────

  const tempFileSystem = new TempFileSystemProvider(tempScriptManager);
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(TEMP_SCHEME, tempFileSystem, {
      isCaseSensitive: true,
      isReadonly: false,
    }),
  );

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
        const cleanUri = getCleanTempUri(
          realPath,
          tempScriptManager.getTempDir(),
        );
        outputChannel.appendLine(`Exported to temp: ${realPath}`);
        vscode.window.setStatusBarMessage(
          `Frappe: Exported to ${cleanUri.toString()}`,
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

      let filePath: string;

      if (doc.uri.scheme === TEMP_SCHEME) {
        // For frappe-temp:// URIs, reconstruct the actual file path
        filePath = tempScriptManager.getTempDir() + doc.uri.path;
      } else if (doc.uri.scheme === "file") {
        filePath = doc.uri.fsPath;
        if (!filePath.startsWith(tempScriptManager.getTempDir())) return;
      } else {
        return;
      }

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

  // ── Sync Tree View with Active Editor ─────────────────────────────────────

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) return;
      const doc = editor.document;

      let virtualUri: vscode.Uri | undefined;
      if (doc.uri.scheme === SCHEME) {
        virtualUri = doc.uri;
      } else if (doc.uri.scheme === TEMP_SCHEME && tempScriptManager) {
        const filePath = tempScriptManager.getTempDir() + doc.uri.path;
        const uriString = tempScriptManager.getVirtualUri(filePath);
        if (uriString) {
          virtualUri = vscode.Uri.parse(uriString);
        }
      }

      if (virtualUri) {
        const node = treeProvider.findNodeByUri(virtualUri);
        if (node) {
          treeView.reveal(node, { select: true, focus: false, expand: true });
        }
      }
    }),
  );

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

  const commandContext: CommandContext = {
    siteManager,
    registry,
    treeProvider,
    ctx: context,
    updateViewTitle,
  };

  context.subscriptions.push(...registerAllCommands(commandContext));

  // ── URI Handler ─────────────────────────────────────────────────────────

  const openScriptDoc = async (result: {
    uri: vscode.Uri;
    ref: import("./types").ScriptReference;
  }): Promise<void> => {
    const cached = registry.getCachedContent(result.uri);
    if (tempScriptManager && cached !== undefined) {
      const tempPath = tempScriptManager.exportScriptSync(
        result.uri,
        result.ref,
        cached,
      );
      const cleanUri = getCleanTempUri(
        tempPath,
        tempScriptManager.getTempDir(),
      );
      const doc = await vscode.workspace.openTextDocument(cleanUri);
      await vscode.window.showTextDocument(doc, { preview: false });
      outputChannel.appendLine(`Exported to temp (URI handler): ${tempPath}`);
    } else {
      const doc = await vscode.workspace.openTextDocument(result.uri);
      await vscode.window.showTextDocument(doc, { preview: false });
    }
  };

  const createMissingScript = async (
    siteUrl: string,
    doctype: string,
    docname: string,
    field: string | undefined,
    blockId: string | undefined,
    blockField: BlockFieldScript,
  ): Promise<{
    uri: vscode.Uri;
    ref: import("./types").ScriptReference;
  } | null> => {
    const site = siteManager.findSiteByUrl(siteUrl);
    if (!site) {
      vscode.window.showWarningMessage(
        `Frappe Script Editor: Site "${siteUrl}" is not configured. Add it from the sidebar.`,
      );
      return null;
    }

    const client = await siteManager.getClient(site.id);

    if (doctype === BUILDER_DOCTYPES.PAGE && docname && blockId && blockField) {
      // Block-level script: update the block JSON, then register in-place
      const { json, field: blocksField } =
        await client.getPageBlocksRaw(docname);
      const blocks: BlockNode[] = JSON.parse(json);
      const block = findBlockById(blocks, blockId);
      if (!block) {
        throw new Error(ERROR_MESSAGES.BLOCK_NOT_FOUND(blockId, docname));
      }
      await client.updatePageBlocks(
        docname,
        blocksField,
        JSON.stringify(blocks),
      );

      // Derive labels for tree insertion
      const pageDoc = await client.getPageDoc(docname);
      const pageLabel = pageDoc.page_title || pageDoc.page_name || pageDoc.name;
      const pageTitleSlug = sanitizeName(pageLabel);

      return registry.registerBlockScript(
        site.id,
        docname,
        blockId,
        blockField,
        pageTitleSlug,
        "",
        blocks,
      );
    } else if (doctype === BUILDER_DOCTYPES.PAGE && docname && field) {
      // Page-level doc field script (data script, head/body code)
      const pageDoc = await client.getPageDoc(docname);
      if (!pageDoc) {
        throw new Error(ERROR_MESSAGES.PAGE_NOT_FOUND(docname));
      }
      await client.updateField(doctype, docname, field, "");

      const pageLabel = pageDoc.page_title || pageDoc.page_name || pageDoc.name;
      const pageTitleSlug = sanitizeName(pageLabel);

      return registry.registerDocFieldScript(
        site.id,
        doctype,
        docname,
        field,
        pageTitleSlug,
        "",
      );
    }

    return null;
  };

  const findAndOpenScript = async (
    siteUrl: string,
    doctype: string,
    docname: string,
    field: string | undefined,
    blockId: string | undefined,
    blockField: BlockFieldScript,
  ): Promise<boolean> => {
    const result = registry.findByDocReference(
      siteUrl,
      doctype,
      docname,
      field,
      blockId,
      blockField,
    );

    if (result) {
      await openScriptDoc(result);
      return true;
    }

    outputChannel.appendLine(
      `URI Handler: script not found. blockId=${blockId} blockField=${blockField} field=${field}`,
    );

    const created = await createMissingScript(
      siteUrl,
      doctype,
      docname,
      field,
      blockId,
      blockField,
    );

    if (created) {
      await openScriptDoc(created);
      outputChannel.appendLine(
        `Created and opened new script: ${doctype}/${docname}`,
      );
      return true;
    }

    return false;
  };

  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
        if (uri.path !== "/open-script") return;

        const query = new URLSearchParams(uri.query);
        const siteUrl = query.get("site");
        const doctype = query.get("doctype");
        const docname = query.get("docname");
        const field = query.get("field") || undefined;
        const blockId = query.get("blockId") || undefined;
        const blockField: BlockFieldScript =
          (query.get("blockField") as BlockFieldScript) || "blockClientScript";

        outputChannel.appendLine("URI Handler:");
        outputChannel.appendLine(
          JSON.stringify({
            query,
            siteUrl,
            doctype,
            docname,
            field,
            blockId,
            blockField,
          }),
        );

        if (!siteUrl || !doctype || !docname) return;

        return vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Opening script from Frappe…",
            cancellable: false,
          },
          async () => {
            await registry.whenLoaded();

            const found = await findAndOpenScript(
              siteUrl,
              doctype,
              docname,
              field,
              blockId,
              blockField,
            );

            if (!found) {
              vscode.window.showWarningMessage(
                `Frappe Script Editor: Script not found for ${doctype}/${docname}. Try refreshing the scripts list.`,
              );
            }
          },
        );
      },
    }),
  );

  // ── HTTP Server ─────────────────────────────────────────────────────────

  const port = await portfinder.getPortPromise({
    port: 59000,
    stopPort: 59021,
  });

  httpServer = new HttpServer(port, outputChannel);
  httpServer.start();

  context.subscriptions.push({
    dispose: () => {
      httpServer?.stop();
      httpServer = null;
    },
  });

  // ── Initial load ────────────────────────────────────────────────────────

  // Load site info only (scripts loaded on-demand per site)
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

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(async (state) => {
      if (!state.focused) return;

      const activeSiteId = treeProvider.currentSiteId;
      if (!activeSiteId) return;

      const activeEditor = vscode.window.activeTextEditor;
      const activeDoc = activeEditor?.document;

      if (
        !activeDoc ||
        (activeDoc.uri.scheme !== SCHEME &&
          activeDoc.uri.scheme !== TEMP_SCHEME)
      ) {
        return;
      }

      try {
        await registry.reloadSite(activeSiteId);
        outputChannel.appendLine(`Refetched scripts for site: ${activeSiteId}`);

        let virtualUri: vscode.Uri | undefined;
        if (activeDoc.uri.scheme === SCHEME) {
          virtualUri = activeDoc.uri;
        } else if (activeDoc.uri.scheme === TEMP_SCHEME && tempScriptManager) {
          const filePath = tempScriptManager.getTempDir() + activeDoc.uri.path;
          const uriString = tempScriptManager.getVirtualUri(filePath);
          if (uriString) {
            virtualUri = vscode.Uri.parse(uriString);
          }
        }

        if (virtualUri) {
          const ref = registry.getReference(virtualUri);
          if (ref) {
            const updatedContent = registry.getCachedContent(virtualUri);
            if (updatedContent !== undefined && tempScriptManager) {
              tempScriptManager.exportScriptSync(
                virtualUri,
                ref,
                updatedContent,
              );
              await vscode.commands.executeCommand(
                "workbench.action.files.revert",
              );
              outputChannel.appendLine(
                `Reloaded file on focus: ${ref.displayPath}`,
              );
            }
          }
        }
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
