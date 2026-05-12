import * as vscode from "vscode";
import type { CommandContext, TreeItemSiteId } from "./types";
import { APP_NAME } from "../utils";

export function registerReloadSite(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${APP_NAME}.reloadSite`,
    async (item: TreeItemSiteId) => {
      if (item?.siteId) {
        const siteId = item.siteId;
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Frappe Script Editor",
          },
          async (progress) => {
            progress.report({ message: "Reloading site status…" });
            await context.siteManager.reloadSiteStatus(siteId);
            progress.report({ message: "Loading scripts…" });
            await context.registry.reloadSite(siteId);
            progress.report({ message: "Site status reloaded." });
          },
        );
      }
    },
  );
}
