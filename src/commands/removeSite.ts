import * as vscode from "vscode";
import type { CommandContext, TreeItemSiteId } from "./types";
import { APP_NAME } from "../utils";
import { setIsSiteViewContext } from "../subscriptions/setupContextKeys";

export function registerRemoveSite(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${APP_NAME}.removeSite`,
    async (item: TreeItemSiteId) => {
      if (item?.siteId) {
        const site = context.siteManager.getSite(item.siteId);
        if (site) {
          const confirm = await vscode.window.showWarningMessage(
            `Remove site "${site.name}"?`,
            { modal: true },
            "Remove",
          );
          if (confirm === "Remove") {
            const removedSiteId = item.siteId;
            const wasCurrentSite =
              context.treeProvider.currentSiteId === removedSiteId;
            await context.siteManager.removeSite(removedSiteId);
            context.registry.removeSiteTreeData(removedSiteId);
            if (wasCurrentSite) {
              context.treeProvider.currentSiteId = null;
              await setIsSiteViewContext(false);
            }
            context.treeProvider.refresh();
          }
        }
      }
    },
  );
}
