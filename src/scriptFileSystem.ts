/**
 * Virtual FileSystem Provider for Frappe Script Editor scripts.
 *
 * Registers the `frappe-builder://` URI scheme so that scripts appear as
 * regular editable files in VS Code. Saves automatically push changes
 * back to Frappe via the REST API.
 */

import * as vscode from "vscode";
import type { SiteManager } from "./siteManager";
import type { ScriptRegistry } from "./scriptRegistry";
import type { BlockNode } from "./types";

export class ScriptFileSystem implements vscode.FileSystemProvider {
  private _onDidChangeFile = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
    this._onDidChangeFile.event;

  private siteManager: SiteManager;
  private registry: ScriptRegistry;
  private outputChannel: vscode.OutputChannel;

  constructor(
    siteManager: SiteManager,
    registry: ScriptRegistry,
    outputChannel: vscode.OutputChannel,
  ) {
    this.siteManager = siteManager;
    this.registry = registry;
    this.outputChannel = outputChannel;
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const ref = this.registry.getReference(uri);
    if (!ref) {
      if (this.isDirectoryUri(uri)) {
        return {
          type: vscode.FileType.Directory,
          ctime: 0,
          mtime: 0,
          size: 0,
        };
      }
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const content = this.registry.getCachedContent(uri);
    return {
      type: vscode.FileType.File,
      ctime: 0,
      mtime: Date.now(),
      size: content ? Buffer.byteLength(content, "utf8") : 0,
    };
  }

  readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] {
    return [];
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const ref = this.registry.getReference(uri);
    if (!ref) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const cached = this.registry.getCachedContent(uri);
    if (cached !== undefined) {
      return Buffer.from(cached, "utf8");
    }

    try {
      const client = await this.siteManager.getClient(ref.siteId);
      let content = "";

      if (ref.location.type === "docField") {
        const { doctype, docname, fieldName } = ref.location;

        if (doctype === "Builder Settings") {
          const settings = await client.getBuilderSettings();
          content =
            ((settings as unknown as Record<string, unknown>)[
              fieldName
            ] as string) || "";
        } else if (doctype === "Builder Client Script") {
          const csDoc = await client.getClientScript(docname);
          content = csDoc.script || "";
        } else {
          const pageDoc = await client.getPageDoc(docname);
          content =
            ((pageDoc as unknown as Record<string, unknown>)[
              fieldName
            ] as string) || "";
        }
      } else if (ref.location.type === "blockScript") {
        const { docname, blockId, blockField } = ref.location;
        const { json } = await client.getPageBlocksRaw(docname);
        const blocks: BlockNode[] = JSON.parse(json);
        const block = findBlockById(blocks, blockId);
        content = block ? (block[blockField] as string) || "" : "";
      }

      this.registry.setCachedContent(uri, content);
      return Buffer.from(content, "utf8");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw vscode.FileSystemError.Unavailable(
        `Failed to read from Frappe: ${msg}`,
      );
    }
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    _options: { create: boolean; overwrite: boolean },
  ): Promise<void> {
    const ref = this.registry.getReference(uri);
    if (!ref) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const text = Buffer.from(content).toString("utf8");

    try {
      const client = await this.siteManager.getClient(ref.siteId);

      if (ref.location.type === "docField") {
        const { doctype, docname, fieldName } = ref.location;
        await client.updateField(doctype, docname, fieldName, text);
        this.outputChannel.appendLine(
          `✅ Saved ${fieldName} on ${doctype}/${docname}`,
        );
      } else if (ref.location.type === "blockScript") {
        const { docname, blockId, blockField } = ref.location;

        // Re-fetch current blocks to avoid overwriting concurrent changes
        const { json, field } = await client.getPageBlocksRaw(docname);
        const blocks: BlockNode[] = JSON.parse(json);
        const block = findBlockById(blocks, blockId);

        if (!block) {
          throw new Error(
            `Block "${blockId}" not found in page "${docname}". The block may have been removed.`,
          );
        }

        (block as Record<string, unknown>)[blockField] = text;
        await client.updatePageBlocks(docname, field, JSON.stringify(blocks));
        this.outputChannel.appendLine(
          `✅ Saved ${blockField} on block "${blockId}" in page "${docname}"`,
        );
      }

      // Update cache
      this.registry.setCachedContent(uri, text);

      // Notify VS Code
      this._onDidChangeFile.fire([
        { type: vscode.FileChangeType.Changed, uri },
      ]);

      vscode.window.setStatusBarMessage("✅ Frappe: saved", 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(`❌ Save failed: ${msg}`);
      vscode.window.showErrorMessage(`Frappe: save failed — ${msg}`);
      throw vscode.FileSystemError.Unavailable(msg);
    }
  }

  // ── Unsupported operations ────────────────────────────────────────────

  createDirectory(_uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(
      "Cannot create directories in Frappe Script Editor.",
    );
  }

  delete(_uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(
      "Cannot delete files from Frappe Script Editor via this extension.",
    );
  }

  rename(_oldUri: vscode.Uri, _newUri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(
      "Cannot rename files in Frappe Script Editor via this extension.",
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private isDirectoryUri(uri: vscode.Uri): boolean {
    const path = uri.path;
    const lastSegment = path.split("/").pop() || "";
    return !lastSegment.includes(".");
  }
}

/**
 * Recursively search the block tree for a block with the given blockId.
 */
export function findBlockById(
  blocks: BlockNode[],
  blockId: string,
): BlockNode | null {
  for (const block of blocks) {
    if (!block) continue;
    if (block.blockId === blockId) return block;
    if (block.children && block.children.length > 0) {
      const found = findBlockById(block.children, blockId);
      if (found) return found;
    }
  }
  return null;
}
