import * as vscode from "vscode";
import type { CommandContext, TreeItemSiteId } from "./types";

const COMMAND_PREFIX = "frappeScriptEditor.";

export function registerReloadSite(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${COMMAND_PREFIX}reloadSite`,
    async (item: TreeItemSiteId) => {
      if (item?.siteId) {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Frappe Script Editor",
          },
          async (progress) => {
            progress.report({ message: "Reloading site status…" });
            await context.siteManager.reloadSiteStatus(item.siteId!);
            progress.report({ message: "Loading scripts…" });
            await context.registry.reloadSite(item.siteId!);
            progress.report({ message: "Site status reloaded." });
          },
        );
      }
    },
  );
}