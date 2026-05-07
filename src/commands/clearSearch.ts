import * as vscode from "vscode";
import type { CommandContext } from "./types";

const COMMAND_PREFIX = "frappeScriptEditor.";

export function registerClearSearch(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${COMMAND_PREFIX}clearSearch`,
    () => {
      context.treeProvider.searchQuery = "";
      context.treeProvider.refresh();
      vscode.commands.executeCommand(
        "setContext",
        "frappeScriptEditor.hasSearchQuery",
        false,
      );
    },
  );
}