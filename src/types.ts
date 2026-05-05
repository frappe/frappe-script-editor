import * as vscode from "vscode";

// ── Site Configuration ──────────────────────────────────────────────────────

export interface FrappeSiteConfig {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  // apiSecret is stored separately in SecretStorage
  hasBuilder: boolean | null; // null = not yet checked
}

/** Persisted site config (without secret) */
export interface StoredSiteConfig {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  hasBuilder: boolean | null;
}

// ── Script References ───────────────────────────────────────────────────────

export type ScriptType =
  | "clientScript"
  | "pageDataScript"
  | "blockClientScript"
  | "blockDataScript";

export type ScriptLocation =
  | { type: "docField"; doctype: string; docname: string; fieldName: string }
  | {
      type: "blockScript";
      doctype: "Builder Page";
      docname: string;
      /** Which blocks field to use: draft_blocks → blocks fallback */
      blockId: string;
      blockField: "blockClientScript" | "blockDataScript";
    };

export interface ScriptReference {
  siteId: string;
  location: ScriptLocation;
  scriptType: ScriptType;
  fileExtension: string; // ".js" | ".py" | ".html" | ".css"
  displayPath: string; // human-readable path shown in tree
}

// ── Tree View ───────────────────────────────────────────────────────────────

export type TreeItemType =
  | "site"
  | "settings"
  | "page"
  | "clientScriptsFolder"
  | "pageBlocksFolder"
  | "blockFolder"
  | "scriptFile";

export interface ScriptTreeItemData {
  type: TreeItemType;
  label: string;
  siteId: string;
  siteUrl?: string;
  hasBuilder?: boolean | null;
  /** For file nodes, the URI to open */
  uri?: vscode.Uri;
  /** For collapsible nodes, child items */
  children?: ScriptTreeItemData[];
  /** contextValue for menu contributions */
  contextValue?: string;
  tooltip?: string;
  iconId?: string;
}

// ── Frappe API ──────────────────────────────────────────────────────────────

export interface FrappePageSummary {
  name: string;
  page_name: string;
  page_title: string | null;
}

export interface FrappePageDoc {
  name: string;
  page_name: string;
  page_title: string | null;
  page_data_script: string | null;
  head_html: string | null;
  body_html: string | null;
  blocks: string | null;
  draft_blocks: string | null;
  client_scripts: Array<{ builder_script: string; name: string }>;
}

export interface FrappeClientScriptDoc {
  name: string;
  script: string;
  script_type: "JavaScript" | "CSS";
}

export interface FrappeBuilderSettingsDoc {
  head_html: string | null;
  body_html: string | null;
  script: string | null;
  style: string | null;
}

export interface BlockNode {
  blockId?: string;
  blockName?: string;
  blockClientScript?: string;
  blockDataScript?: string;
  children?: BlockNode[];
  [key: string]: unknown;
}

// ── HTTP Server ─────────────────────────────────────────────────────────────

export interface OpenScriptRequest {
  site: string; // site URL
  doctype: string;
  docname: string;
  field?: string;
  blockId?: string;
  blockField?: string;
}
