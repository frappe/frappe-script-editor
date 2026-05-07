import * as vscode from "vscode";
import type { CommandContext } from "./types";

const COMMAND_PREFIX = "frappeScriptEditor.";

export function registerSearchBlocks(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${COMMAND_PREFIX}searchBlocks`,
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
          "frappeScriptEditor.hasSearchQuery",
          !!context.treeProvider.searchQuery,
        );
      }
    },
  );
}