import * as vscode from "vscode";
import type { SiteManager } from "../siteManager";

export function setupContextKeys(siteManager: SiteManager): vscode.Disposable {
  const updateHasSitesContext = () => {
    vscode.commands.executeCommand(
      "setContext",
      "frappeScriptEditor.hasSites",
      siteManager.getSites().length > 0,
    );
  };
  siteManager.onDidChangeSites(updateHasSitesContext);
  updateHasSitesContext();

  return {
    dispose: () => {},
  };
}