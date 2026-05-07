import * as vscode from "vscode";

const COMMAND_PREFIX = "frappeScriptEditor.";

export function registerCollapseFolders(): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${COMMAND_PREFIX}collapseFolders`,
    async () => {
      await vscode.commands.executeCommand(
        "frappe-script-editor-scripts.focus",
      );
      await vscode.commands.executeCommand("list.collapseAll");
    },
  );
}