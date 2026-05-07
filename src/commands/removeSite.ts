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
            await context.siteManager.removeSite(item.siteId);
            await context.registry.loadSites();
          }
        }
      }
    },
  );
}