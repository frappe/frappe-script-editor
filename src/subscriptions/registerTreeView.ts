import * as vscode from "vscode";
import { ScriptTreeProvider } from "../treeProvider";
import type { ScriptRegistry } from "../scriptRegistry";
import type { TempScriptManager } from "../tempScriptManager";
import type { SiteManager } from "../siteManager";

export function registerTreeView(
  registry: ScriptRegistry,
  tempScriptManager: TempScriptManager,
  savedSiteId: string | undefined,
  siteManager: SiteManager,
): {
  treeView: vscode.TreeView<unknown>;
  treeProvider: ScriptTreeProvider;
  updateViewTitle: () => void;
} {
  const treeProvider = new ScriptTreeProvider(registry);
  treeProvider.setTempManager(tempScriptManager);
  if (savedSiteId) {
    treeProvider.currentSiteId = savedSiteId;
  }

  const treeView = vscode.window.createTreeView("frappe-script-editor", {
    treeDataProvider: treeProvider,
  });

  const updateViewTitle = () => {
    if (treeProvider.currentSiteId) {
      const site = siteManager.getSite(treeProvider.currentSiteId);
      treeView.title = site?.name || "Site";
    } else {
      treeView.title = "Sites";
    }
  };

  updateViewTitle();

  return { treeView, treeProvider, updateViewTitle };
}
