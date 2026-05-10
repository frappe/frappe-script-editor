import * as vscode from "vscode";
import type { CommandContext, TreeItemSiteId } from "./types";

const COMMAND_PREFIX = "frappeScriptEditor.";

export function registerOpenSite(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${COMMAND_PREFIX}openSite`,
    async (item: TreeItemSiteId) => {
      if (item?.siteId) {
        context.treeProvider.currentSiteId = item.siteId;
        await vscode.commands.executeCommand(
          "setContext",
          "frappeScriptEditor.currentSiteId",
          item.siteId,
        );
        await context.ctx.workspaceState.update(
          "frappeScriptEditor.currentSiteId",
          item.siteId,
        );
        context.updateViewTitle();
        await context.registry.loadAll(item.siteId);
        context.socketManager.connect(item.siteId);
        context.treeProvider.refresh();
      }
    },
  );
}