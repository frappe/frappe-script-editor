import * as vscode from "vscode";
import { APP_NAME } from "../utils";

export function registerCollapseFolders(): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${APP_NAME}.collapseFolders`,
    async () => {
      await vscode.commands.executeCommand(
        "frappe-script-editor-scripts.focus",
      );
      await vscode.commands.executeCommand("list.collapseAll");
    },
  );
}
