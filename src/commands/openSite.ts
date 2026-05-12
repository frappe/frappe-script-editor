import * as vscode from "vscode";
import type { CommandContext, TreeItemSiteId } from "./types";
import { APP_NAME } from "../utils";

export function registerOpenSite(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${APP_NAME}.openSite`,
    async (item: TreeItemSiteId) => {
      if (item?.siteId) {
        context.treeProvider.currentSiteId = item.siteId;
        await vscode.commands.executeCommand(
          "setContext",
          `${APP_NAME}.currentSiteId`,
          item.siteId,
        );
        await context.ctx.workspaceState.update(
          `${APP_NAME}.currentSiteId`,
          item.siteId,
        );
        context.updateViewTitle();
        await context.registry.loadAll(item.siteId);
        context.treeProvider.refresh();
      }
    },
  );
}
