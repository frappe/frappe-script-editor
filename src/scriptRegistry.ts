/**
 * Script Registry — maps virtual file URIs to Frappe document/field references.
 *
 * Responsible for loading all scripts from all configured sites and building
 * the mapping that the FileSystemProvider and TreeDataProvider use.
 */

import * as vscode from "vscode";
import type { FrappeClient } from "./frappeClient";
import type { SiteManager } from "./siteManager";
import type {
  BlockNode,
  FrappePageDoc,
  ScriptReference,
  ScriptTreeItemData,
} from "./types";
import { sanitizeName, normalizeUrl } from "./utils";

/** Custom URI scheme for virtual script files. */
export const SCHEME = "frappe-builder";

export class ScriptRegistry {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  /** URI string → ScriptReference */
  private registry = new Map<string, ScriptReference>();

  /** siteId → tree data (for TreeDataProvider) */
  private treeData = new Map<string, ScriptTreeItemData>();

  /** Cache of file contents: URI string → content string */
  private contentCache = new Map<string, string>();

  private siteManager: SiteManager;

  constructor(siteManager: SiteManager) {
    this.siteManager = siteManager;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getReference(uri: vscode.Uri): ScriptReference | undefined {
    return this.registry.get(uri.toString());
  }

  getTreeData(): ScriptTreeItemData[] {
    return Array.from(this.treeData.values());
  }

  getCachedContent(uri: vscode.Uri): string | undefined {
    return this.contentCache.get(uri.toString());
  }

  setCachedContent(uri: vscode.Uri, content: string): void {
    this.contentCache.set(uri.toString(), content);
  }

  getAllReferences(): Iterable<[string, ScriptReference]> {
    return this.registry.entries();
  }

  getCachedContentByUriString(uriString: string): string | undefined {
    return this.contentCache.get(uriString);
  }

  setCachedContentSync(uriString: string, content: string): void {
    this.contentCache.set(uriString, content);
  }

  isVirtualUri(uri: vscode.Uri): boolean {
    return uri.scheme === SCHEME;
  }

  invalidateCache(uri: vscode.Uri): void {
    this.contentCache.delete(uri.toString());
  }

  /**
   * Load/reload all scripts for all configured sites.
   * Shows progress notification during loading.
   */
  async loadAll(): Promise<void> {
    this.registry.clear();
    this.treeData.clear();
    this.contentCache.clear();

    const sites = this.siteManager.getSites();

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Frappe Script Editor: Loading scripts…",
        cancellable: false,
      },
      async (progress) => {
        for (const site of sites) {
          if (site.hasBuilder === false) continue;

          progress.report({ message: `Loading ${site.name}…` });

          try {
            const client = await this.siteManager.getClient(site.id);
            await this.loadSite(site.id, site.name, site.url, client);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showWarningMessage(
              `Failed to load scripts from "${site.name}": ${msg}`,
            );
          }
        }
      },
    );

    this._onDidChange.fire();
  }

  /**
   * Load/reload scripts for a single site.
   */
  async loadSite(
    siteId: string,
    siteName: string,
    siteUrl: string,
    client: FrappeClient,
  ): Promise<void> {
    const siteNode: ScriptTreeItemData = {
      type: "site",
      label: `${siteName} (${new URL(siteUrl).hostname})`,
      siteId,
      contextValue: "site",
      children: [],
    };

    // ── Builder Settings (always at top) ──────────────────────────────────
    try {
      const settings = await client.getBuilderSettings();
      const settingsNode: ScriptTreeItemData = {
        type: "settings",
        label: "Builder Settings",
        siteId,
        children: [],
        iconId: "settings-gear",
      };

      const settingsFields: Array<{
        field: string;
        displayName: string;
        ext: string;
      }> = [
        { field: "script", displayName: "client script", ext: ".js" },
        { field: "style", displayName: "style", ext: ".css" },
        { field: "head_html", displayName: "Head code", ext: ".html" },
        { field: "body_html", displayName: "Body code", ext: ".html" },
      ];

      for (const sf of settingsFields) {
        const displayPath = `_settings/${sf.displayName}${sf.ext}`;
        const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

        const ref: ScriptReference = {
          siteId,
          location: {
            type: "docField",
            doctype: "Builder Settings",
            docname: "Builder Settings",
            fieldName: sf.field,
          },
          scriptType: "clientScript",
          fileExtension: sf.ext,
          displayPath,
        };

        this.registry.set(uri.toString(), ref);

        // Cache content
        const value = (settings as unknown as Record<string, unknown>)[
          sf.field
        ] as string | null;
        this.contentCache.set(uri.toString(), value || "");

        settingsNode.children!.push({
          type: "scriptFile",
          label: `${sf.displayName}${sf.ext}`,
          siteId,
          uri,
          iconId: this.getIconForExtension(sf.ext),
        });
      }

      siteNode.children!.push(settingsNode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showWarningMessage(
        `Failed to load Builder Settings for "${siteName}": ${msg}`,
      );
    }

    // ── Builder Pages ─────────────────────────────────────────────────────
    try {
      const pages = await client.getBuilderPages();

      for (const pageSummary of pages) {
        try {
          const pageDoc = await client.getPageDoc(pageSummary.name);
          const pageNode = await this.buildPageNode(siteId, pageDoc, client);
          siteNode.children!.push(pageNode);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showWarningMessage(
            `Failed to load page "${pageSummary.page_name}": ${msg}`,
          );
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showWarningMessage(
        `Failed to list pages for "${siteName}": ${msg}`,
      );
    }

    this.treeData.set(siteId, siteNode);
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private async buildPageNode(
    siteId: string,
    doc: FrappePageDoc,
    client: FrappeClient,
  ): Promise<ScriptTreeItemData> {
    const pageName = sanitizeName(doc.page_name || doc.name);
    const pageLabel = doc.page_title || doc.page_name || doc.name;

    const pageNode: ScriptTreeItemData = {
      type: "page",
      label: pageLabel,
      siteId,
      children: [],
      tooltip: `Route: ${doc.name}`,
      iconId: "file-code",
    };

    // ── Client scripts folder ───────────────────────────────────────────
    if (doc.client_scripts && doc.client_scripts.length > 0) {
      const clientScriptsFolder: ScriptTreeItemData = {
        type: "clientScriptsFolder",
        label: "client scripts",
        siteId,
        children: [],
        iconId: "folder",
      };

      for (const csRow of doc.client_scripts) {
        try {
          const csDoc = await client.getClientScript(csRow.builder_script);
          const ext = csDoc.script_type === "CSS" ? ".css" : ".js";
          const csName = sanitizeName(csDoc.name);
          const displayPath = `${pageName}/client scripts/${csName}${ext}`;
          const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

          const ref: ScriptReference = {
            siteId,
            location: {
              type: "docField",
              doctype: "Builder Client Script",
              docname: csDoc.name,
              fieldName: "script",
            },
            scriptType: "clientScript",
            fileExtension: ext,
            displayPath,
          };

          this.registry.set(uri.toString(), ref);
          this.contentCache.set(uri.toString(), csDoc.script || "");

          clientScriptsFolder.children!.push({
            type: "scriptFile",
            label: `${csDoc.name}${ext}`,
            siteId,
            uri,
            iconId: this.getIconForExtension(ext),
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showWarningMessage(
            `Failed to load client script "${csRow.builder_script}": ${msg}`,
          );
        }
      }

      pageNode.children!.push(clientScriptsFolder);
    }

    // ── Data script (single file) ───────────────────────────────────────
    {
      const displayPath = `${pageName}/data script.py`;
      const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

      const ref: ScriptReference = {
        siteId,
        location: {
          type: "docField",
          doctype: "Builder Page",
          docname: doc.name,
          fieldName: "page_data_script",
        },
        scriptType: "pageDataScript",
        fileExtension: ".py",
        displayPath,
      };

      this.registry.set(uri.toString(), ref);
      this.contentCache.set(uri.toString(), doc.page_data_script || "");

      pageNode.children!.push({
        type: "scriptFile",
        label: "data script.py",
        siteId,
        uri,
        iconId: "symbol-method",
      });
    }

    // ── Page blocks (with scripts) ──────────────────────────────────────
    const blocksJson = doc.draft_blocks || doc.blocks;
    if (blocksJson) {
      try {
        const blocks: BlockNode[] = JSON.parse(blocksJson);
        const blockScriptNodes = this.extractBlockScripts(
          siteId,
          doc.name,
          pageName,
          blocks,
        );

        if (blockScriptNodes.length > 0) {
          const pageBlocksFolder: ScriptTreeItemData = {
            type: "pageBlocksFolder",
            label: "page blocks",
            siteId,
            children: blockScriptNodes,
            iconId: "folder",
          };
          pageNode.children!.push(pageBlocksFolder);
        }
      } catch {
        // blocks JSON is invalid, skip
      }
    }

    // ── Head code & Body code ───────────────────────────────────────────
    for (const field of ["head_html", "body_html"] as const) {
      const displayName = field === "head_html" ? "Head code" : "Body code";
      const displayPath = `${pageName}/${displayName}.html`;
      const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

      const ref: ScriptReference = {
        siteId,
        location: {
          type: "docField",
          doctype: "Builder Page",
          docname: doc.name,
          fieldName: field,
        },
        scriptType: "clientScript",
        fileExtension: ".html",
        displayPath,
      };

      this.registry.set(uri.toString(), ref);
      this.contentCache.set(uri.toString(), (doc[field] as string) || "");

      pageNode.children!.push({
        type: "scriptFile",
        label: `${displayName}.html`,
        siteId,
        uri,
        iconId: "code",
      });
    }

    return pageNode;
  }

  /**
   * Recursively walk the block tree and build a nested tree structure
   * matching Builder's visual hierarchy. Every block becomes a node,
   * with scripts as children and nested blocks as grandchildren.
   */
  private extractBlockScripts(
    siteId: string,
    docname: string,
    pageName: string,
    blocks: BlockNode[],
    parentPath: string = "",
  ): ScriptTreeItemData[] {
    const nodes: ScriptTreeItemData[] = [];

    for (const block of blocks) {
      if (!block) continue;

      // Build the display label like Builder does (component name or block name)
      const blockLabel = this.getBlockDisplayLabel(block);
      const blockId =
        block.blockId || `block-${Math.random().toString(36).substr(2, 9)}`;

      // Build the path for this block
      const sanitizedLabel = sanitizeName(blockLabel);
      const blockPath = parentPath
        ? `${parentPath}/${sanitizedLabel}`
        : sanitizedLabel;

      // Create the block element node (always shown, like in Builder)
      const blockNode: ScriptTreeItemData = {
        type: "blockElement",
        label: blockLabel,
        siteId,
        blockId,
        children: [],
        iconId: this.getBlockIcon(block),
        tooltip: `Block: ${blockLabel}${block.componentName ? ` (${block.componentName})` : ""}`,
      };

      // Add script files as children if they exist
      if (block.blockClientScript) {
        const displayPath = `${pageName}/page blocks/${blockPath}/client script.js`;
        const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

        const ref: ScriptReference = {
          siteId,
          location: {
            type: "blockScript",
            doctype: "Builder Page",
            docname,
            blockId,
            blockField: "blockClientScript",
          },
          scriptType: "blockClientScript",
          fileExtension: ".js",
          displayPath,
        };

        this.registry.set(uri.toString(), ref);
        this.contentCache.set(uri.toString(), block.blockClientScript);

        blockNode.children!.push({
          type: "scriptFile",
          label: "client script.js",
          siteId,
          uri,
          iconId: "symbol-event",
        });
      }

      if (block.blockDataScript) {
        const displayPath = `${pageName}/page blocks/${blockPath}/data script.py`;
        const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

        const ref: ScriptReference = {
          siteId,
          location: {
            type: "blockScript",
            doctype: "Builder Page",
            docname,
            blockId,
            blockField: "blockDataScript",
          },
          scriptType: "blockDataScript",
          fileExtension: ".py",
          displayPath,
        };

        this.registry.set(uri.toString(), ref);
        this.contentCache.set(uri.toString(), block.blockDataScript);

        blockNode.children!.push({
          type: "scriptFile",
          label: "data script.py",
          siteId,
          uri,
          iconId: "symbol-method",
        });
      }

      // Recurse into children - add them as a "children" subfolder or inline
      if (block.children && block.children.length > 0) {
        const childNodes = this.extractBlockScripts(
          siteId,
          docname,
          pageName,
          block.children,
          blockPath,
        );

        // Add children directly to this block's children (not as a separate folder)
        // This creates the nested tree structure like Builder
        if (childNodes.length > 0) {
          blockNode.children!.push(...childNodes);
        }
      }

      // Only add this node if it has scripts or children (don't show empty leaf blocks)
      if (blockNode.children!.length > 0) {
        nodes.push(blockNode);
      }
    }

    return nodes;
  }

  /**
   * Get a display label for a block, similar to how Builder shows it.
   * Prioritizes: blockName > componentName > element > blockId > unnamed
   */
  private getBlockDisplayLabel(block: BlockNode): string {
    if (block.blockName) {
      return block.blockName;
    }
    if (block.componentName) {
      return block.componentName;
    }
    if (block.element) {
      return `<${block.element}>`;
    }
    if (block.blockId) {
      return `Block ${block.blockId.slice(0, 8)}`;
    }
    return "Unnamed Block";
  }

  /**
   * Get an appropriate icon for a block based on its type.
   */
  private getBlockIcon(block: BlockNode): string {
    const componentName = block.componentName?.toLowerCase() || "";
    const element = block.element?.toLowerCase() || "";

    // Container-type components
    if (
      ["container", "section", "div", "box"].some(
        (t) => componentName.includes(t) || element.includes(t),
      )
    ) {
      return "symbol-namespace";
    }
    // Text components
    if (
      [
        "text",
        "heading",
        "paragraph",
        "span",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
      ].some((t) => componentName.includes(t) || element === t)
    ) {
      return "symbol-string";
    }
    // Image components
    if (
      ["image", "img", "picture", "icon"].some(
        (t) => componentName.includes(t) || element.includes(t),
      )
    ) {
      return "symbol-color";
    }
    // Button components
    if (
      ["button", "btn"].some(
        (t) => componentName.includes(t) || element.includes(t),
      )
    ) {
      return "symbol-event";
    }
    // Link components
    if (
      ["link", "a", "anchor", "nav"].some(
        (t) => componentName.includes(t) || element.includes(t),
      )
    ) {
      return "link";
    }
    // Form components
    if (
      ["input", "form", "select", "textarea", "field"].some(
        (t) => componentName.includes(t) || element.includes(t),
      )
    ) {
      return "symbol-field";
    }
    // List components
    if (
      ["list", "ul", "ol", "li", "item"].some(
        (t) => componentName.includes(t) || element.includes(t),
      )
    ) {
      return "list-tree";
    }
    // Default
    return "symbol-structure";
  }

  private getIconForExtension(ext: string): string {
    switch (ext) {
      case ".js":
        return "symbol-event";
      case ".py":
        return "symbol-method";
      case ".html":
        return "code";
      case ".css":
        return "symbol-color";
      default:
        return "file";
    }
  }

  /**
   * Find a script reference by matching site URL, doctype, docname, and field/blockId.
   * Used by the HTTP server to locate scripts requested from the browser.
   */
  findByDocReference(
    siteUrl: string,
    doctype: string,
    docname: string,
    field?: string,
    blockId?: string,
    blockField?: string,
  ): { uri: vscode.Uri; ref: ScriptReference } | undefined {
    for (const [uriStr, ref] of this.registry.entries()) {
      const site = this.siteManager.getSites().find((s) => s.id === ref.siteId);
      if (!site) continue;
      if (normalizeUrl(site.url) !== normalizeUrl(siteUrl)) continue;

      if (ref.location.type === "docField") {
        if (
          ref.location.doctype === doctype &&
          ref.location.docname === docname &&
          (!field || ref.location.fieldName === field)
        ) {
          return { uri: vscode.Uri.parse(uriStr), ref };
        }
      } else if (ref.location.type === "blockScript") {
        if (
          ref.location.doctype === doctype &&
          ref.location.docname === docname &&
          ref.location.blockId === blockId &&
          (!blockField || ref.location.blockField === blockField)
        ) {
          return { uri: vscode.Uri.parse(uriStr), ref };
        }
      }
    }
    return undefined;
  }
}
