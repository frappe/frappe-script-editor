import * as vscode from "vscode";
import type { CommandContext } from "./types";
import { APP_NAME } from "../utils";

export function registerSearchBlocks(
  context: CommandContext,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${APP_NAME}.searchBlocks`,
    async () => {
      const query = await vscode.window.showInputBox({
        prompt: "Enter block name to search",
        placeHolder: "Search query...",
        value: context.treeProvider.searchQuery,
      });

      if (query !== undefined) {
        context.treeProvider.searchQuery = query.trim();
        context.treeProvider.refresh();
        vscode.commands.executeCommand(
          "setContext",
          `${APP_NAME}.hasSearchQuery`,
          !!context.treeProvider.searchQuery,
        );
      }
    },
  );
}
