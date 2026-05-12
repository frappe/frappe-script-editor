import * as vscode from "vscode";
import type { CommandContext } from "./types";
import { APP_NAME } from "../utils";
import { setIsSiteViewContext } from "../subscriptions/setupContextKeys";

export function registerGoBack(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(`${APP_NAME}.goBack`, async () => {
    await vscode.commands.executeCommand(`${APP_NAME}.clearSearch`);
    context.treeProvider.currentSiteId = null;
    await vscode.commands.executeCommand(
      "setContext",
      `${APP_NAME}.currentSiteId`,
      "",
    );
    await context.ctx.workspaceState.update(
      `${APP_NAME}.currentSiteId`,
      undefined,
    );
    await setIsSiteViewContext(false);
    context.updateViewTitle();
    context.treeProvider.refresh();
  });
}
