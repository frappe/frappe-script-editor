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
  BlockFieldScript,
  BlockNode,
  FrappePageDoc,
  ScriptReference,
  ScriptTreeItemData,
} from "./types";
import { sanitizeName, normalizeUrl, extractHostname } from "./utils";
import {
  BUILDER_DOCTYPES,
  BUILDER_FIELDS,
  BUILDER_SETTINGS_FIELDS,
  PAGE_SCRIPT_FIELDS,
  FOLDER_LABELS,
  TOOLTIPS,
  ERROR_MESSAGES,
  PROGRESS_TITLES,
} from "./builderConfig";

export const SCHEME = "frappe-builder";

function makeDocRefKey(
  siteId: string,
  location: ScriptReference["location"],
): string {
  if (location.type === "blockScript") {
    return `${siteId}:${location.doctype}:${location.docname}:block:${location.blockId}:${location.blockField}`;
  }
  return `${siteId}:${location.doctype}:${location.docname}:field:${location.fieldName}`;
}

export class ScriptRegistry {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private registry = new Map<string, ScriptReference>();

  private docRefIndex = new Map<string, string>();

  private treeData = new Map<string, ScriptTreeItemData>();

  private contentCache = new Map<string, string>();

  private blockPathCache = new Map<string, Map<string, string>>();

  private loadingPromise: Promise<void> = Promise.resolve();

  private isLoading = false;

  private siteManager: SiteManager;

  constructor(siteManager: SiteManager) {
    this.siteManager = siteManager;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getReference(uri: vscode.Uri): ScriptReference | undefined {
    return this.registry.get(uri.toString());
  }

  getTreeData(): ScriptTreeItemData[] {
    const sites = this.siteManager.getSites();
    const siteIds = sites.map((s) => s.id);
    const nodes = Array.from(this.treeData.values());

    nodes.sort((a, b) => {
      const idxA = siteIds.indexOf(a.siteId!);
      const idxB = siteIds.indexOf(b.siteId!);
      return idxA - idxB;
    });

    return nodes;
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

  /**
   * Register a single block script entry on-demand (called when opening a
   * script that didn't previously exist). Adds it to both the registry
   * and the tree so it appears immediately in the sidebar.
   */
  registerBlockScript(
    siteId: string,
    docname: string,
    blockId: string,
    blockField: BlockFieldScript,
    pageTitleSlug: string,
    content: string,
    blocks: BlockNode[],
  ): { uri: vscode.Uri; ref: ScriptReference } {
    const block = this.findBlockInTree(blocks, blockId);
    if (!block) {
      throw new Error(ERROR_MESSAGES.BLOCK_NOT_FOUND(blockId, docname));
    }

    const blockLabel = block.blockName || block.blockId || "unnamed-block";
    const cacheKey = `${siteId}:${docname}`;
    const pathCache = this.blockPathCache.get(cacheKey);
    let blockPath: string;

    if (pathCache && pathCache.has(blockId)) {
      blockPath = pathCache.get(blockId)!;
    } else {
      const parentPath = this.findBlockParentPath(blocks, blockId);
      blockPath = parentPath
        ? `${parentPath}/${sanitizeName(blockLabel)}-${blockId}`
        : `${sanitizeName(blockLabel)}-${blockId}`;
      if (pathCache) {
        pathCache.set(blockId, blockPath);
      }
    }

    const isClient = blockField === BUILDER_FIELDS.BLOCK.CLIENT_SCRIPT;
    const ext = isClient ? ".js" : ".py";
    const fileName = isClient
      ? FOLDER_LABELS.CLIENT_SCRIPT
      : FOLDER_LABELS.DATA_SCRIPT_PY;
    const displayPath = `${pageTitleSlug}/${FOLDER_LABELS.PAGE_BLOCKS}/${blockPath}/${fileName}`;
    const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

    const ref: ScriptReference = {
      siteId,
      location: {
        type: "blockScript",
        doctype: BUILDER_DOCTYPES.PAGE,
        docname,
        blockId,
        blockField,
      },
      scriptType: isClient ? "blockClientScript" : "blockDataScript",
      fileExtension: ext,
      displayPath,
    };

    this.registry.set(uri.toString(), ref);
    this.docRefIndex.set(makeDocRefKey(siteId, ref.location), uri.toString());
    this.contentCache.set(uri.toString(), content);

    // ── Insert into tree ──────────────────────────────────────────────
    const siteNode = this.treeData.get(siteId);
    if (siteNode?.children) {
      for (const pageNode of siteNode.children) {
        if (pageNode.type !== "page") continue;
        if (pageNode.tooltip !== `${TOOLTIPS.ROUTE_PREFIX}${docname}`) continue;

        let blocksFolder = pageNode.children?.find(
          (c) => c.type === "pageBlocksFolder",
        );
        if (!blocksFolder) {
          blocksFolder = {
            type: "pageBlocksFolder",
            label: FOLDER_LABELS.PAGE_BLOCKS,
            siteId,
            children: [],
            iconId: "folder",
          };
          pageNode.children!.push(blocksFolder);
        }

        let blockFolder = blocksFolder.children?.find(
          (c) => c.type === "blockFolder" && c.blockId === blockId,
        );
        if (!blockFolder) {
          blockFolder = {
            type: "blockFolder",
            label: blockLabel,
            blockId,
            siteId,
            children: [],
            iconId: "symbol-structure",
          };
          blocksFolder.children!.push(blockFolder);
        }

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
    const config = PAGE_SCRIPT_FIELDS[fieldName];
    if (!config) {
      throw new Error(ERROR_MESSAGES.UNKNOWN_FIELD(fieldName));
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
    this.docRefIndex.set(makeDocRefKey(siteId, ref.location), uri.toString());
    this.contentCache.set(uri.toString(), content);

    // ── Insert into tree ──────────────────────────────────────────────
    const siteNode = this.treeData.get(siteId);
    if (siteNode?.children) {
      for (const pageNode of siteNode.children) {
        if (pageNode.type !== "page") continue;
        if (pageNode.tooltip !== `${TOOLTIPS.ROUTE_PREFIX}${docname}`) continue;

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

  /**
   * Find a script reference by matching site URL, doctype, docname, and field/blockId.
   * Used by the HTTP server to locate scripts requested from the browser.
   *
   */
  findByDocReference(
    siteUrl: string,
    doctype: string,
    docname: string,
    field?: string,
    blockId?: string,
    blockField?: BlockFieldScript,
  ): { uri: vscode.Uri; ref: ScriptReference } | undefined {
    const incomingHostname = extractHostname(siteUrl);

    const site = this.siteManager
      .getSites()
      .find(
        (s) =>
          normalizeUrl(s.url) === normalizeUrl(siteUrl) ||
          extractHostname(s.url) === incomingHostname,
      );
    if (!site) return undefined;

    const indexKey = blockId
      ? `${site.id}:${doctype}:${docname}:block:${blockId}:${blockField ?? ""}`
      : `${site.id}:${doctype}:${docname}:field:${field ?? ""}`;

    const uriStr = this.docRefIndex.get(indexKey);
    if (!uriStr) return undefined;

    const ref = this.registry.get(uriStr);
    if (!ref) return undefined;

    return { uri: vscode.Uri.parse(uriStr), ref };
  }

  async whenLoaded(): Promise<void> {
    await this.loadingPromise;
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
      existingNode.isOffline = site.isOffline;

      if (site.isOffline === true) {
        existingNode.tooltip = TOOLTIPS.SITE_OFFLINE;
      } else if (site.hasBuilder === false) {
        existingNode.tooltip = TOOLTIPS.NO_BUILDER;
      } else {
        existingNode.tooltip = undefined;
      }
    }

    if (site.isOffline === true) {
      if (!existingNode) {
        const siteNode: ScriptTreeItemData = {
          type: "site",
          label: `${site.name}`,
          siteId,
          siteUrl: site.url,
          hasBuilder: site.hasBuilder,
          isOffline: site.isOffline,
          contextValue: "site",
          children: [],
          tooltip: TOOLTIPS.SITE_OFFLINE,
        };
        this.treeData.set(siteId, siteNode);
      }
      this.isLoading = false;
      this._onDidChange.fire();
      return;
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
          tooltip: TOOLTIPS.NO_BUILDER,
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
          ERROR_MESSAGES.LOADING_SCRIPTS(site.name, msg),
        );
      } finally {
        this.isLoading = false;
      }
    })();

    await this.loadingPromise;
  }

  removeSiteTreeData(siteId: string): void {
    this.treeData.delete(siteId);
  }

  async loadSites(): Promise<void> {
    const sites = this.siteManager.getSites();

    this.loadingPromise = Promise.resolve(
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: PROGRESS_TITLES.LOADING_SITES,
          cancellable: false,
        },
        async (progress) => {
          for (const site of sites) {
            progress.report({
              message: PROGRESS_TITLES.LOADING_SITE(site.name),
            });

            const existingNode = this.treeData.get(site.id);
            if (
              existingNode &&
              existingNode.children &&
              existingNode.children.length > 0
            ) {
              existingNode.hasBuilder = site.hasBuilder;
              existingNode.tooltip =
                site.hasBuilder === false ? TOOLTIPS.NO_BUILDER : undefined;
              continue;
            }

            const siteNode: ScriptTreeItemData = {
              type: "site",
              label: `${site.name}`,
              siteId: site.id,
              siteUrl: site.url,
              hasBuilder: site.hasBuilder,
              contextValue: "site",
              children: [],
              tooltip:
                site.hasBuilder === false ? TOOLTIPS.NO_BUILDER : undefined,
            };
            this.treeData.set(site.id, siteNode);
          }
        },
      ),
    );

    await this.loadingPromise;
    this._onDidChange.fire();
  }

  async loadAll(siteId?: string): Promise<void> {
    this.isLoading = true;

    if (!siteId) {
      this.registry.clear();
      this.docRefIndex.clear();
      this.treeData.clear();
      this.contentCache.clear();
    } else {
      this.clearSiteRegistryData(siteId);
      this.treeData.delete(siteId);
    }

    const sites = siteId
      ? [this.siteManager.getSite(siteId)].filter(Boolean)
      : this.siteManager.getSites();

    this.loadingPromise = Promise.resolve(
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: PROGRESS_TITLES.LOADING_SCRIPTS,
          cancellable: false,
        },
        async (progress) => {
          for (const site of sites) {
            if (!site) continue;
            progress.report({ message: `Loading ${site.name}…` });

            const baseSiteNode: ScriptTreeItemData = {
              type: "site",
              label: `${site.name}`,
              siteId: site.id,
              siteUrl: site.url,
              hasBuilder: site.hasBuilder,
              contextValue: "site",
              children: [],
            };

            if (site.isOffline === true) {
              const siteNode = {
                ...baseSiteNode,
                isOffline: site.isOffline,
                tooltip: TOOLTIPS.SITE_OFFLINE,
              };
              this.treeData.set(site.id, siteNode);
              continue;
            }

            if (site.hasBuilder === false) {
              const siteNode = {
                ...baseSiteNode,
                tooltip: TOOLTIPS.NO_BUILDER,
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
                ERROR_MESSAGES.LOADING_SCRIPTS(site.name, msg),
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
        label: BUILDER_DOCTYPES.SETTINGS,
        siteId,
        children: [],
        iconId: "settings-gear",
      };

      for (const builderField of BUILDER_SETTINGS_FIELDS) {
        const displayPath = `Builder Settings/${builderField.displayName}${builderField.ext}`;
        const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

        const ref: ScriptReference = {
          siteId,
          location: {
            type: "docField",
            doctype: BUILDER_DOCTYPES.SETTINGS,
            docname: BUILDER_DOCTYPES.SETTINGS,
            fieldName: builderField.field,
          },
          scriptType: "clientScript",
          fileExtension: builderField.ext,
          displayPath,
        };

        this.registry.set(uri.toString(), ref);
        this.docRefIndex.set(
          makeDocRefKey(siteId, ref.location),
          uri.toString(),
        );

        // Cache content
        const value = settings[builderField.field] as string | null;
        this.contentCache.set(uri.toString(), value || "");

        settingsNode.children!.push({
          type: "scriptFile",
          label: `${builderField.displayName}${builderField.ext}`,
          siteId,
          uri,
          iconId: this.getIconForExtension(builderField.ext),
        });
      }

      siteNode.children!.push(settingsNode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showWarningMessage(
        ERROR_MESSAGES.LOADING_SETTINGS(siteName, msg),
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
            ERROR_MESSAGES.LOADING_PAGE(pageSummary.page_name, msg),
          );
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showWarningMessage(
        ERROR_MESSAGES.LISTING_PAGES(siteName, msg),
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
      tooltip: `${TOOLTIPS.ROUTE_PREFIX}${doc.name}`,
      iconId: "file-code",
    };

    // ── Client scripts folder ───────────────────────────────────────────
    if (doc.client_scripts && doc.client_scripts.length > 0) {
      const clientScriptsFolder: ScriptTreeItemData = {
        type: "clientScriptsFolder",
        label: FOLDER_LABELS.CLIENT_SCRIPTS,
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
              doctype: BUILDER_DOCTYPES.CLIENT_SCRIPT,
              docname: csDoc.name,
              fieldName: BUILDER_FIELDS.CLIENT_SCRIPT.SCRIPT,
            },
            scriptType: "clientScript",
            fileExtension: ext,
            displayPath,
          };

          this.registry.set(uri.toString(), ref);
          this.docRefIndex.set(
            makeDocRefKey(siteId, ref.location),
            uri.toString(),
          );
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
            ERROR_MESSAGES.LOADING_CLIENT_SCRIPT(csRow.builder_script, msg),
          );
        }
      }

      pageNode.children!.push(clientScriptsFolder);
    }

    // ── Data script (single file) ───────────────────────────────────────

    const displayPath = `${pageTitleSlug}/${FOLDER_LABELS.DATA_SCRIPT}`;
    const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

    const ref: ScriptReference = {
      siteId,
      location: {
        type: "docField",
        doctype: BUILDER_DOCTYPES.PAGE,
        docname: doc.name,
        fieldName: BUILDER_FIELDS.PAGE.PAGE_DATA_SCRIPT,
      },
      scriptType: "pageDataScript",
      fileExtension: ".py",
      displayPath,
    };

    this.registry.set(uri.toString(), ref);
    this.docRefIndex.set(makeDocRefKey(siteId, ref.location), uri.toString());
    this.contentCache.set(uri.toString(), doc.page_data_script || "");

    pageNode.children!.push({
      type: "scriptFile",
      label: FOLDER_LABELS.DATA_SCRIPT,
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
            label: FOLDER_LABELS.PAGE_BLOCKS,
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
    for (const field of [
      BUILDER_FIELDS.PAGE.HEAD_HTML,
      BUILDER_FIELDS.PAGE.BODY_HTML,
    ] as const) {
      const value = doc[field] as string | null;

      const displayName =
        field === BUILDER_FIELDS.PAGE.HEAD_HTML
          ? PAGE_SCRIPT_FIELDS[field].label
          : PAGE_SCRIPT_FIELDS[field].label;
      const displayPath = `${pageTitleSlug}/${displayName}.html`;
      const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

      const ref: ScriptReference = {
        siteId,
        location: {
          type: "docField",
          doctype: BUILDER_DOCTYPES.PAGE,
          docname: doc.name,
          fieldName: field,
        },
        scriptType: "clientScript",
        fileExtension: ".html",
        displayPath,
      };

      this.registry.set(uri.toString(), ref);
      this.docRefIndex.set(makeDocRefKey(siteId, ref.location), uri.toString());
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

  private extractBlockScripts(
    siteId: string,
    docname: string,
    pageName: string,
    blocks: BlockNode[],
    parentPath: string = "",
  ): ScriptTreeItemData[] {
    const nodes: ScriptTreeItemData[] = [];
    const cacheKey = `${siteId}:${docname}`;
    let pathCache = this.blockPathCache.get(cacheKey);
    if (!pathCache) {
      pathCache = new Map();
      this.blockPathCache.set(cacheKey, pathCache);
    }

    for (const block of blocks) {
      if (!block) continue;

      const hasClientScript = !!block.blockClientScript;
      const hasDataScript = !!block.blockDataScript;

      if (hasClientScript || hasDataScript) {
        const blockLabel = block.blockName || block.blockId || "unnamed-block";
        const blockPath = parentPath
          ? `${parentPath}/${sanitizeName(blockLabel)}-${block.blockId}`
          : `${sanitizeName(blockLabel)}-${block.blockId}`;

        if (block.blockId) {
          pathCache.set(block.blockId, blockPath);
        }

        const blockFolder: ScriptTreeItemData = {
          type: "blockFolder",
          label: blockLabel,
          blockId: block.blockId,
          siteId,
          children: [],
          iconId: "symbol-structure",
        };

        if (hasClientScript && block.blockId) {
          const displayPath = `${pageName}/${FOLDER_LABELS.PAGE_BLOCKS}/${blockPath}/${FOLDER_LABELS.CLIENT_SCRIPT}`;
          const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

          const ref: ScriptReference = {
            siteId,
            location: {
              type: "blockScript",
              doctype: BUILDER_DOCTYPES.PAGE,
              docname,
              blockId: block.blockId,
              blockField: BUILDER_FIELDS.BLOCK.CLIENT_SCRIPT,
            },
            scriptType: "blockClientScript",
            fileExtension: ".js",
            displayPath,
          };

          this.registry.set(uri.toString(), ref);
          this.docRefIndex.set(
            makeDocRefKey(siteId, ref.location),
            uri.toString(),
          );
          this.contentCache.set(uri.toString(), block.blockClientScript || "");

          blockFolder.children!.push({
            type: "scriptFile",
            label: FOLDER_LABELS.CLIENT_SCRIPT,
            siteId,
            uri,
            iconId: "symbol-event",
          });
        }

        if (hasDataScript && block.blockId) {
          const displayPath = `${pageName}/${FOLDER_LABELS.PAGE_BLOCKS}/${blockPath}/${FOLDER_LABELS.DATA_SCRIPT_PY}`;
          const uri = vscode.Uri.parse(`${SCHEME}:///${siteId}/${displayPath}`);

          const ref: ScriptReference = {
            siteId,
            location: {
              type: "blockScript",
              doctype: BUILDER_DOCTYPES.PAGE,
              docname,
              blockId: block.blockId,
              blockField: BUILDER_FIELDS.BLOCK.DATA_SCRIPT,
            },
            scriptType: "blockDataScript",
            fileExtension: ".py",
            displayPath,
          };

          this.registry.set(uri.toString(), ref);
          this.docRefIndex.set(
            makeDocRefKey(siteId, ref.location),
            uri.toString(),
          );
          this.contentCache.set(uri.toString(), block.blockDataScript || "");

          blockFolder.children!.push({
            type: "scriptFile",
            label: FOLDER_LABELS.DATA_SCRIPT_PY,
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

  private clearSiteRegistryData(siteId: string): void {
    for (const [uriStr, ref] of this.registry.entries()) {
      if (ref.siteId === siteId) {
        const key = makeDocRefKey(ref.siteId, ref.location);
        this.docRefIndex.delete(key);
        this.registry.delete(uriStr);
        this.contentCache.delete(uriStr);
      }
    }

    for (const [cacheKey] of this.blockPathCache.entries()) {
      if (cacheKey.startsWith(`${siteId}:`)) {
        this.blockPathCache.delete(cacheKey);
      }
    }
  }
}
