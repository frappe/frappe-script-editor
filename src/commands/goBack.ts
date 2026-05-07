import * as vscode from "vscode";
import type { CommandContext } from "./types";

const COMMAND_PREFIX = "frappeScriptEditor.";

export function registerGoBack(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${COMMAND_PREFIX}goBack`,
    async () => {
      await vscode.commands.executeCommand("frappeScriptEditor.clearSearch");
      context.treeProvider.currentSiteId = null;
      await vscode.commands.executeCommand(
        "setContext",
        "frappeScriptEditor.currentSiteId",
        "",
      );
      await context.ctx.workspaceState.update(
        "frappeScriptEditor.currentSiteId",
        undefined,
      );
      context.updateViewTitle();
      context.treeProvider.refresh();
    },
  );
}