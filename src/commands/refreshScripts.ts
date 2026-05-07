import * as vscode from "vscode";
import type { CommandContext } from "./types";

const COMMAND_PREFIX = "frappeScriptEditor.";

export function registerRefreshScripts(
  context: CommandContext,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${COMMAND_PREFIX}refreshScripts`,
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