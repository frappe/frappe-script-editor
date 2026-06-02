import * as vscode from "vscode";
import type { ScriptRegistry } from "../scriptRegistry";
import type { TempScriptManager } from "../tempScriptManager";
import type { SiteManager } from "../siteManager";
import {
  BUILDER_DOCTYPES,
  DEFAULT_PAGE_LIMIT,
  ERROR_MESSAGES,
  PAGE_SCRIPT_FIELDS,
} from "../builderConfig";
import { findBlockById } from "../scriptFileSystem";
import type { BlockFieldScript, BlockNode } from "../types";
import { APP_NAME, sanitizeName } from "../utils";
import type { ScriptReference } from "../types";
import { setIsSiteViewContext } from "./setupContextKeys";

export function registerUriHandler(
  registry: ScriptRegistry,
  tempScriptManager: TempScriptManager,
  siteManager: SiteManager,
  outputChannel: vscode.OutputChannel,
  treeProvider: import("../treeProvider").ScriptTreeProvider,
  treeView: vscode.TreeView<unknown>,
  context: vscode.ExtensionContext,
  updateViewTitle: () => void,
): vscode.Disposable {
  const setSiteAsActive = async (siteUrl: string): Promise<void> => {
    if (!treeProvider.currentSiteId) {
      const site = siteManager.findSiteByUrl(siteUrl);
      if (site) {
        treeProvider.currentSiteId = site.id;
        await vscode.commands.executeCommand(
          "setContext",
          `${APP_NAME}.currentSiteId`,
          site.id,
        );
        await context.workspaceState.update(
          `${APP_NAME}.currentSiteId`,
          site.id,
        );
        await setIsSiteViewContext(true);
        updateViewTitle();
        await registry.loadAll(site.id);
        treeProvider.refresh();
      }
    }
  };

  const openScriptDoc = async (result: {
    uri: vscode.Uri;
    ref: ScriptReference;
  }): Promise<void> => {
    const cached = registry.getCachedContent(result.uri);
    if (tempScriptManager && cached !== undefined) {
      const tempPath = tempScriptManager.exportScriptSync(
        result.uri,
        result.ref,
        cached,
      );
      const doc = await vscode.workspace.openTextDocument(tempPath);
      await vscode.window.showTextDocument(doc, { preview: false });
      outputChannel.appendLine(`Exported to temp (URI handler): ${tempPath}`);
    } else {
      const doc = await vscode.workspace.openTextDocument(result.uri);
      await vscode.window.showTextDocument(doc, { preview: false });
    }

    const node = treeProvider.findNodeByUri(result.uri);
    if (node) {
      treeView.reveal(node, { select: true, focus: false, expand: true });
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
    ref: ScriptReference;
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
      if (!(field in PAGE_SCRIPT_FIELDS)) {
        throw new Error(ERROR_MESSAGES.UNKNOWN_FIELD(field));
      }
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
        field as keyof typeof PAGE_SCRIPT_FIELDS,
        pageTitleSlug,
        "",
      );
    }

    return null;
  };

  const ensurePageIsVisible = (siteId: string, docname: string): void => {
    const hiddenNames = new Set(registry.getHiddenPageNames(siteId));
    const allPages = registry.getAllPageNodes(siteId);

    if (hiddenNames.size > 0) {
      if (hiddenNames.has(docname)) {
        hiddenNames.delete(docname);
        registry.setHiddenPageNames(siteId, hiddenNames);
        treeProvider.refresh();
      }
    } else {
      const pageIndex = allPages.findIndex(
        (p) => (p.docname ?? p.label) === docname,
      );
      if (pageIndex >= DEFAULT_PAGE_LIMIT) {
        const newHidden = new Set<string>(
          allPages.slice(DEFAULT_PAGE_LIMIT).map((p) => p.docname ?? p.label),
        );
        newHidden.delete(docname);
        registry.setHiddenPageNames(siteId, newHidden);
        treeProvider.refresh();
      }
    }
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

    if (!treeProvider.currentSiteId && result) {
      await setSiteAsActive(siteUrl);
    }

    if (result) {
      if (doctype === BUILDER_DOCTYPES.PAGE && treeProvider.currentSiteId) {
        ensurePageIsVisible(treeProvider.currentSiteId, docname);
      }
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
      if (!treeProvider.currentSiteId) {
        await setSiteAsActive(siteUrl);
      }

      if (doctype === BUILDER_DOCTYPES.PAGE && treeProvider.currentSiteId) {
        ensurePageIsVisible(treeProvider.currentSiteId, docname);
      }
      await openScriptDoc(created);
      outputChannel.appendLine(
        `Created and opened new script: ${doctype}/${docname}`,
      );
      return true;
    }

    return false;
  };

  return vscode.window.registerUriHandler({
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
  });
}
