import * as vscode from "vscode";
import type { SiteManager } from "../siteManager";
import type { ScriptRegistry } from "../scriptRegistry";
import type { ScriptTreeProvider } from "../treeProvider";

export interface CommandContext {
  siteManager: SiteManager;
  registry: ScriptRegistry;
  treeProvider: ScriptTreeProvider;
  ctx: vscode.ExtensionContext;
  updateViewTitle: () => void;
}

export interface TreeItemSiteId {
  siteId?: string;
}