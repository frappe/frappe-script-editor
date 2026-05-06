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
import { sanitizeName, normalizeUrl, extractHostname } from "./utils";

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

  /**
   * Load/reload scripts for a single site.
   * Updates only that site's data without clearing other sites.
   */
  async reloadSite(siteId: string): Promise<void> {
    const site = this.siteManager.getSite(siteId);
    if (!site) return;

    this.clearSiteRegistryData(siteId);

    const existingNode = this.treeData.get(siteId);
    if (existingNode) {
      existingNode.children = [];
      existingNode.hasBuilder = site.hasBuilder;
      existingNode.tooltip =
        site.hasBuilder === false
          ? "Builder app is not installed on this site. Click to reload and check again."
          : undefined;
    }

    if (site.hasBuilder === false) {
      if (!existingNode) {
        const siteNode: ScriptTreeItemData = {
          type: "site",
          label: `${site.name}`,
          siteId,
          siteUrl: site.url,
          hasBuilder: site.hasBuilder,
          contextValue: "site",
          children: [],
          tooltip:
            "Builder app is not installed on this site. Click to reload and check again.",
        };
        this.treeData.set(siteId, siteNode);
      }
      this._onDidChange.fire();
      return;
    }

    try {
      const client = await this.siteManager.getClient(siteId);
      await this.loadSite(siteId, site.name, site.url, client);
      this._onDidChange.fire();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showWarningMessage(
        `Failed to reload scripts from "${site.name}": ${msg}`,
      );
    }
  }

  private clearSiteRegistryData(siteId: string): void {
    for (const [uriStr, ref] of this.registry.entries()) {
      if (ref.siteId === siteId) {
        this.registry.delete(uriStr);
        this.contentCache.delete(uriStr);
      }
    }
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
          progress.report({ message: `Loading ${site.name}…` });

          if (site.hasBuilder === false) {
            // Add site node without builder
            const siteNode: ScriptTreeItemData = {
              type: "site",
              label: `${site.name}`,
              siteId: site.id,
              siteUrl: site.url,
              hasBuilder: site.hasBuilder,
              contextValue: "site",
              children: [],
              tooltip:
                "Builder app is not installed on this site. Click to reload and check again.",
            };
            this.treeData.set(site.id, siteNode);
            continue;
          }

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
      label: `${siteName}`,
      siteId,
      siteUrl,
      hasBuilder: true,
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
        const displayPath = `Builder Settings/${sf.displayName}${sf.ext}`;
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
    const pageTitleSlug = sanitizeName(pageLabel);

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
          const displayPath = `${pageTitleSlug}/client scripts/${csName}${ext}`;
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
      const displayPath = `${pageTitleSlug}/data script.py`;
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
          pageTitleSlug,
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
      const displayPath = `${pageTitleSlug}/${displayName}.html`;
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
   * Recursively walk the block tree and extract blocks that have scripts.
   * Returns tree nodes for blocks with blockClientScript or blockDataScript.
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

      const hasClientScript = !!block.blockClientScript;
      const hasDataScript = !!block.blockDataScript;

      if (hasClientScript || hasDataScript) {
        const blockLabel = block.blockName || block.blockId || "unnamed-block";
        const blockPath = parentPath
          ? `${parentPath}/${sanitizeName(blockLabel)}`
          : sanitizeName(blockLabel);

        const blockFolder: ScriptTreeItemData = {
          type: "blockFolder",
          label: blockLabel,
          siteId,
          children: [],
          iconId: "symbol-structure",
        };

        if (hasClientScript && block.blockId) {
          const displayPath = `${pageName}/page blocks/${blockPath}/client script.js`;
          const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

          const ref: ScriptReference = {
            siteId,
            location: {
              type: "blockScript",
              doctype: "Builder Page",
              docname,
              blockId: block.blockId,
              blockField: "blockClientScript",
            },
            scriptType: "blockClientScript",
            fileExtension: ".js",
            displayPath,
          };

          this.registry.set(uri.toString(), ref);
          this.contentCache.set(uri.toString(), block.blockClientScript || "");

          blockFolder.children!.push({
            type: "scriptFile",
            label: "client script.js",
            siteId,
            uri,
            iconId: "symbol-event",
          });
        }

        if (hasDataScript && block.blockId) {
          const displayPath = `${pageName}/page blocks/${blockPath}/data script.py`;
          const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

          const ref: ScriptReference = {
            siteId,
            location: {
              type: "blockScript",
              doctype: "Builder Page",
              docname,
              blockId: block.blockId,
              blockField: "blockDataScript",
            },
            scriptType: "blockDataScript",
            fileExtension: ".py",
            displayPath,
          };

          this.registry.set(uri.toString(), ref);
          this.contentCache.set(uri.toString(), block.blockDataScript || "");

          blockFolder.children!.push({
            type: "scriptFile",
            label: "data script.py",
            siteId,
            uri,
            iconId: "symbol-method",
          });
        }

        nodes.push(blockFolder);
      }

      // Recurse into children
      if (block.children && block.children.length > 0) {
        const childPath = block.blockName
          ? parentPath
            ? `${parentPath}/${sanitizeName(block.blockName)}`
            : sanitizeName(block.blockName)
          : parentPath;

        const childNodes = this.extractBlockScripts(
          siteId,
          docname,
          pageName,
          block.children,
          childPath,
        );
        nodes.push(...childNodes);
      }
    }

    return nodes;
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
    const incomingHostname = extractHostname(siteUrl);

    for (const [uriStr, ref] of this.registry.entries()) {
      const site = this.siteManager.getSites().find((s) => s.id === ref.siteId);
      if (!site) continue;

      // Try exact normalized URL match first, then fall back to hostname
      const urlMatch =
        normalizeUrl(site.url) === normalizeUrl(siteUrl) ||
        extractHostname(site.url) === incomingHostname;
      if (!urlMatch) continue;

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
