import * as vscode from "vscode";
import type { CommandContext } from "./types";
import { APP_NAME } from "../utils";

export function registerRefreshScripts(
  context: CommandContext,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${APP_NAME}.refreshScripts`,
    async () => {
      const currentSiteId = context.treeProvider.currentSiteId;
      if (currentSiteId) {
        await context.registry.loadAll(currentSiteId);
      } else {
        await context.registry.loadSites();
      }
      context.treeProvider.refresh();
    },
  );
}
