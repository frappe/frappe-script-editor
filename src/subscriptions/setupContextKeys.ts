import * as vscode from "vscode";
import type { SiteManager } from "../siteManager";
import { APP_NAME } from "../utils";

export function setupContextKeys(siteManager: SiteManager): vscode.Disposable {
  const updateHasSitesContext = () => {
    vscode.commands.executeCommand(
      "setContext",
      `${APP_NAME}.hasSites`,
      siteManager.getSites().length > 0,
    );
  };
  siteManager.onDidChangeSites(updateHasSitesContext);
  updateHasSitesContext();

  return {
    dispose: () => {},
  };
}

export async function setIsSiteViewContext(
  isInSiteView: boolean,
): Promise<void> {
  await vscode.commands.executeCommand(
    "setContext",
    `${APP_NAME}.isInSiteView`,
    isInSiteView,
  );
}
