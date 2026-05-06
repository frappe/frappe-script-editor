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
  ScriptType,
} from "./types";
import { sanitizeName, normalizeUrl, extractHostname } from "./utils";

export const SCHEME = "frappe-builder";

export class ScriptRegistry {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private registry = new Map<string, ScriptReference>();

  private treeData = new Map<string, ScriptTreeItemData>();

  private contentCache = new Map<string, string>();

  private loadingPromise: Promise<void> = Promise.resolve();

  private isLoading = false;

  private siteManager: SiteManager;

  constructor(siteManager: SiteManager) {
    this.siteManager = siteManager;
  }

  async whenLoaded(): Promise<void> {
    await this.loadingPromise;
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

  getCachedContentByUriString(uriString: string): string | undefined {
    return this.contentCache.get(uriString);
  }

  setCachedContentSync(uriString: string, content: string): void {
    this.contentCache.set(uriString, content);
  }

  async reloadSite(siteId: string): Promise<void> {
    const site = this.siteManager.getSite(siteId);
    if (!site) return;

    this.isLoading = true;
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
      this.isLoading = false;
      this._onDidChange.fire();
      return;
    }

    this.loadingPromise = (async () => {
      try {
        const client = await this.siteManager.getClient(siteId);
        await this.loadSite(siteId, site.name, site.url, client);
        this._onDidChange.fire();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showWarningMessage(
          `Failed to reload scripts from "${site.name}": ${msg}`,
        );
      } finally {
        this.isLoading = false;
      }
    })();

    await this.loadingPromise;
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
    this.isLoading = true;
    this.registry.clear();
    this.treeData.clear();
    this.contentCache.clear();

    const sites = this.siteManager.getSites();

    this.loadingPromise = Promise.resolve(
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Frappe Script Editor: Loading scripts…",
          cancellable: false,
        },
        async (progress) => {
          for (const site of sites) {
            progress.report({ message: `Loading ${site.name}…` });

            if (site.hasBuilder === false) {
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
      ),
    );

    await this.loadingPromise;

    this.isLoading = false;
    this._onDidChange.fire();
  }

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
      const value = doc[field] as string | null;

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
      this.contentCache.set(uri.toString(), value || "");

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
          ? `${parentPath}/${sanitizeName(blockLabel)}-${block.blockId}`
          : `${sanitizeName(blockLabel)}-${block.blockId}`;

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

      if (block.children && block.children.length > 0) {
        const childPath = block.blockName
          ? parentPath
            ? `${parentPath}/${sanitizeName(block.blockName)}-${block.blockId}`
            : `${sanitizeName(block.blockName)}-${block.blockId}`
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
  /**
   * Register a single block script entry on-demand (called when opening a
   * script that didn't previously exist). Adds it to both the registry
   * and the tree so it appears immediately in the sidebar.
   */
  registerBlockScript(
    siteId: string,
    docname: string,
    blockId: string,
    blockField: "blockClientScript" | "blockDataScript",
    pageTitleSlug: string,
    content: string,
    blocks: BlockNode[],
  ): { uri: vscode.Uri; ref: ScriptReference } {
    const block = this.findBlockInTree(blocks, blockId);
    if (!block) {
      throw new Error(`Block "${blockId}" not found in page "${docname}"`);
    }

    const blockLabel = block.blockName || block.blockId || "unnamed-block";
    const parentPath = this.findBlockParentPath(blocks, blockId);
    const blockPath = parentPath
      ? `${parentPath}/${sanitizeName(blockLabel)}-${blockId}`
      : `${sanitizeName(blockLabel)}-${blockId}`;

    const isClient = blockField === "blockClientScript";
    const ext = isClient ? ".js" : ".py";
    const fileName = isClient ? "client script.js" : "data script.py";
    const displayPath = `${pageTitleSlug}/page blocks/${blockPath}/${fileName}`;
    const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

    const ref: ScriptReference = {
      siteId,
      location: {
        type: "blockScript",
        doctype: "Builder Page",
        docname,
        blockId,
        blockField,
      },
      scriptType: isClient ? "blockClientScript" : "blockDataScript",
      fileExtension: ext,
      displayPath,
    };

    this.registry.set(uri.toString(), ref);
    this.contentCache.set(uri.toString(), content);

    // ── Insert into tree ──────────────────────────────────────────────
    const siteNode = this.treeData.get(siteId);
    if (siteNode?.children) {
      // Find the page node that owns this docname
      for (const pageNode of siteNode.children) {
        if (pageNode.type !== "page") continue;
        if (pageNode.tooltip !== `Route: ${docname}`) continue;

        // Find or create "page blocks" folder
        let blocksFolder = pageNode.children?.find(
          (c) => c.type === "pageBlocksFolder",
        );
        if (!blocksFolder) {
          blocksFolder = {
            type: "pageBlocksFolder",
            label: "page blocks",
            siteId,
            children: [],
            iconId: "folder",
          };
          pageNode.children!.push(blocksFolder);
        }

        // Find or create the block folder
        let blockFolder = blocksFolder.children?.find(
          (c) => c.type === "blockFolder" && c.label === blockLabel,
        );
        if (!blockFolder) {
          blockFolder = {
            type: "blockFolder",
            label: blockLabel,
            siteId,
            children: [],
            iconId: "symbol-structure",
          };
          blocksFolder.children!.push(blockFolder);
        }

        // Add the script file node
        blockFolder.children!.push({
          type: "scriptFile",
          label: fileName,
          siteId,
          uri,
          iconId: isClient ? "symbol-event" : "symbol-method",
        });

        break;
      }
    }

    this._onDidChange.fire();
    return { uri, ref };
  }

  private findBlockInTree(
    blocks: BlockNode[],
    blockId: string,
  ): BlockNode | null {
    for (const block of blocks) {
      if (!block) continue;
      if (block.blockId === blockId) return block;
      if (block.children && block.children.length > 0) {
        const found = this.findBlockInTree(block.children, blockId);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Compute the parent path for a given blockId, matching the logic in
   * extractBlockScripts. Walks the block tree to build the ancestor path.
   */
  private findBlockParentPath(
    blocks: BlockNode[],
    targetBlockId: string,
    currentPath: string = "",
  ): string | null {
    for (const block of blocks) {
      if (!block) continue;
      if (block.blockId === targetBlockId) return currentPath;

      if (block.children && block.children.length > 0) {
        const childPath = block.blockName
          ? currentPath
            ? `${currentPath}/${sanitizeName(block.blockName)}-${block.blockId}`
            : `${sanitizeName(block.blockName)}-${block.blockId}`
          : currentPath;

        const result = this.findBlockParentPath(
          block.children,
          targetBlockId,
          childPath,
        );
        if (result !== null) return result;
      }
    }

    return null;
  }

  /**
   * Register a page-level doc field script on-demand (data script, head/body code).
   * Adds it to both the registry and the tree so it appears immediately.
   */
  registerDocFieldScript(
    siteId: string,
    doctype: string,
    docname: string,
    fieldName: string,
    pageTitleSlug: string,
    content: string,
  ): { uri: vscode.Uri; ref: ScriptReference } {
    const fieldConfig: Record<
      string,
      { label: string; ext: string; scriptType: ScriptType; iconId: string }
    > = {
      page_data_script: {
        label: "data script",
        ext: ".py",
        scriptType: "pageDataScript",
        iconId: "symbol-method",
      },
      head_html: {
        label: "Head code",
        ext: ".html",
        scriptType: "clientScript",
        iconId: "code",
      },
      body_html: {
        label: "Body code",
        ext: ".html",
        scriptType: "clientScript",
        iconId: "code",
      },
    };

    const config = fieldConfig[fieldName];
    if (!config) {
      throw new Error(
        `Unknown field "${fieldName}" for on-demand registration`,
      );
    }

    const displayPath = `${pageTitleSlug}/${config.label}${config.ext}`;
    const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

    const ref: ScriptReference = {
      siteId,
      location: {
        type: "docField",
        doctype,
        docname,
        fieldName,
      },
      scriptType: config.scriptType,
      fileExtension: config.ext,
      displayPath,
    };

    this.registry.set(uri.toString(), ref);
    this.contentCache.set(uri.toString(), content);

    // ── Insert into tree ──────────────────────────────────────────────
    const siteNode = this.treeData.get(siteId);
    if (siteNode?.children) {
      for (const pageNode of siteNode.children) {
        if (pageNode.type !== "page") continue;
        if (pageNode.tooltip !== `Route: ${docname}`) continue;

        pageNode.children!.push({
          type: "scriptFile",
          label: `${config.label}${config.ext}`,
          siteId,
          uri,
          iconId: config.iconId,
        });

        break;
      }
    }

    this._onDidChange.fire();
    return { uri, ref };
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

      if (blockId && ref.location.type === "blockScript") {
        if (
          ref.location.doctype === doctype &&
          ref.location.docname === docname &&
          ref.location.blockId === blockId &&
          (!blockField || ref.location.blockField === blockField)
        ) {
          return { uri: vscode.Uri.parse(uriStr), ref };
        }
      } else if (!blockId && ref.location.type === "docField") {
        if (
          ref.location.doctype === doctype &&
          ref.location.docname === docname &&
          (!field || ref.location.fieldName === field)
        ) {
          return { uri: vscode.Uri.parse(uriStr), ref };
        }
      }
    }
    return undefined;
  }
}
