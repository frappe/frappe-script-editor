import * as vscode from "vscode";
import {
  BUILDER_DOCTYPES,
  PAGE_FIELDS,
  SETTINGS_FIELDS,
  CLIENT_SCRIPT_FIELDS,
  BLOCK_PROPERTIES,
} from "./builderConfig";

export type BlockFieldScript =
  | typeof BLOCK_PROPERTIES.CLIENT_SCRIPT
  | typeof BLOCK_PROPERTIES.DATA_SCRIPT;

export interface FrappeSiteConfig {
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
  | {
      type: "docField";
      doctype: string;
      docname: string;
      fieldName:
        | (typeof SETTINGS_FIELDS)[keyof typeof SETTINGS_FIELDS]
        | (typeof PAGE_FIELDS)[keyof typeof PAGE_FIELDS]
        | typeof CLIENT_SCRIPT_FIELDS.SCRIPT;
    }
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

  children: ScriptTreeItemData[];

  contextValue?: string;
  tooltip?: string;
  description?: string;
  iconId?: string;

  collapsibleState?: vscode.TreeItemCollapsibleState;

  blockId?: string;
}

export interface FrappePageSummary {
  name: string;
  page_name: string;
  page_title: string | null;
}

export type PageBlocksField =
  | typeof PAGE_FIELDS.DRAFT_BLOCKS
  | typeof PAGE_FIELDS.BLOCKS;

type PageDocFieldTypes = Record<
  typeof PAGE_FIELDS.PAGE_DATA_SCRIPT,
  string | null
> &
  Record<typeof PAGE_FIELDS.HEAD_HTML, string | null> &
  Record<typeof PAGE_FIELDS.BODY_HTML, string | null> &
  Record<typeof PAGE_FIELDS.BLOCKS, string | null> &
  Record<typeof PAGE_FIELDS.DRAFT_BLOCKS, string | null> &
  Record<
    typeof PAGE_FIELDS.CLIENT_SCRIPTS,
    Array<{ builder_script: string; name: string }>
  >;

export type FrappePageDoc = {
  name: string;
  page_name: string;
  page_title: string | null;
  route: string;
} & PageDocFieldTypes;

export type FrappeClientScriptDoc = {
  name: string;
  script_type: "JavaScript" | "CSS";
} & Record<typeof CLIENT_SCRIPT_FIELDS.SCRIPT, string>;

type SettingsDocFieldTypes = Record<
  typeof SETTINGS_FIELDS.HEAD_HTML,
  string | null
> &
  Record<typeof SETTINGS_FIELDS.BODY_HTML, string | null> &
  Record<typeof SETTINGS_FIELDS.SCRIPT, string | null> &
  Record<typeof SETTINGS_FIELDS.STYLE, string | null>;

export type FrappeBuilderSettingsDoc = SettingsDocFieldTypes;

export interface BlockNode {
  blockId: string;
  blockName?: string;
  blockClientScript?: string;
  blockDataScript?: string;
  children?: BlockNode[];
}

export interface OpenScriptRequest {
  site: string;
  doctype: string;
  docname: string;
  field?: string;
  blockId?: string;
  blockField?: BlockFieldScript;
}
