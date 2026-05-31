import * as vscode from "vscode";
import type { CommandContext } from "./types";
import { registerAddSite } from "./addSite";
import { registerOpenSite } from "./openSite";
import { registerGoBack } from "./goBack";
import { registerRemoveSite } from "./removeSite";
import { registerReloadSite } from "./reloadSite";
import { registerRefreshScripts } from "./refreshScripts";
import { registerCollapseFolders } from "./collapseFolders";
import { registerSearchBlocks } from "./searchBlocks";
import { registerClearSearch } from "./clearSearch";
import { registerManagePagesVisibility } from "./managePagesVisibility";

export type { CommandContext, TreeItemSiteId } from "./types";

export function registerAllCommands(
  context: CommandContext,
): vscode.Disposable[] {
  return [
    registerAddSite(context),
    registerOpenSite(context),
    registerGoBack(context),
    registerRemoveSite(context),
    registerReloadSite(context),
    registerRefreshScripts(context),
    registerCollapseFolders(),
    registerSearchBlocks(context),
    registerClearSearch(context),
    registerManagePagesVisibility(context),
  ];
}