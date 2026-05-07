import * as vscode from "vscode";
import { BUILDER_DOCTYPES } from "./builderConfig";

export type BlockFieldScript = "blockClientScript" | "blockDataScript";

export interface FrappeSiteConfig {
  id: string;
  name: string;
  url: string;
  apiKey: string;

  hasBuilder: boolean | null;
  isOffline: boolean | null;
}

export interface StoredSiteConfig {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  hasBuilder: boolean | null;
  isOffline: boolean | null;
}

export type ScriptType =
  | "clientScript"
  | "pageDataScript"
  | "blockClientScript"
  | "blockDataScript";

export type ScriptLocation =
  | { type: "docField"; doctype: string; docname: string; fieldName: string }
  | {
      type: "blockScript";
      doctype: typeof BUILDER_DOCTYPES.PAGE;
      docname: string;

      blockId: string;
      blockField: BlockFieldScript;
    };

export interface ScriptReference {
  siteId: string;
  location: ScriptLocation;
  scriptType: ScriptType;
  fileExtension: string;
  displayPath: string;
}

export type TreeItemType =
  | "site"
  | "settings"
  | "page"
  | "clientScriptsFolder"
  | "pageBlocksFolder"
  | "blockFolder"
  | "scriptFile"
  | "searchNode";

export interface ScriptTreeItemData {
  type: TreeItemType;
  label: string;
  siteId: string;
  siteUrl?: string;
  hasBuilder?: boolean | null;
  isOffline?: boolean | null;

  uri?: vscode.Uri;

  children?: ScriptTreeItemData[];

  contextValue?: string;
  tooltip?: string;
  iconId?: string;

  collapsibleState?: vscode.TreeItemCollapsibleState;
}

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
  [key: string]: unknown;
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
  [key: string]: unknown;
}

export interface BlockNode {
  blockId?: string;
  blockName?: string;
  blockClientScript?: string;
  blockDataScript?: string;
  children?: BlockNode[];
  [key: string]: unknown;
}

export interface OpenScriptRequest {
  site: string;
  doctype: string;
  docname: string;
  field?: string;
  blockId?: string;
  blockField?: BlockFieldScript;
}
