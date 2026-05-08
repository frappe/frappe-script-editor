import * as vscode from "vscode";
import type { ScriptRegistry } from "../scriptRegistry";
import type { TempScriptManager } from "../tempScriptManager";
import type { SiteManager } from "../siteManager";
import {
  BUILDER_DOCTYPES,
  ERROR_MESSAGES,
  PAGE_SCRIPT_FIELDS,
} from "../builderConfig";
import { findBlockById } from "../scriptFileSystem";
import type { BlockFieldScript, BlockNode } from "../types";
import { sanitizeName } from "../utils";
import type { ScriptReference } from "../types";

export function registerUriHandler(
  registry: ScriptRegistry,
  tempScriptManager: TempScriptManager,
  siteManager: SiteManager,
  outputChannel: vscode.OutputChannel,
): vscode.Disposable {
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
      const tempDir = tempScriptManager.getTempDir();
      const cleanPath = tempPath.replace(tempDir, "");
      const cleanUri = vscode.Uri.parse(`frappe-temp://${cleanPath}`);
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
