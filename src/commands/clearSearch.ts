import * as vscode from "vscode";
import type { CommandContext } from "./types";
import { APP_NAME } from "../utils";

export function registerClearSearch(
  context: CommandContext,
): vscode.Disposable {
  return vscode.commands.registerCommand(`${APP_NAME}.clearSearch`, () => {
    context.treeProvider.searchQuery = "";
    context.treeProvider.refresh();
    vscode.commands.executeCommand(
      "setContext",
      `${APP_NAME}.hasSearchQuery`,
      false,
    );
  });
}
