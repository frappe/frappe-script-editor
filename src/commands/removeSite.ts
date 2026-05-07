import * as vscode from "vscode";
import type { CommandContext, TreeItemSiteId } from "./types";

const COMMAND_PREFIX = "frappeScriptEditor.";

export function registerRemoveSite(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${COMMAND_PREFIX}removeSite`,
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
            const wasCurrentSite = context.treeProvider.currentSiteId === removedSiteId;
            await context.siteManager.removeSite(removedSiteId);
            context.registry.removeSiteTreeData(removedSiteId);
            if (wasCurrentSite) {
              context.treeProvider.currentSiteId = null;
            }
            context.treeProvider.refresh();
          }
        }
      }
    },
  );
}