import * as vscode from "vscode";
import type { ScriptRegistry } from "../scriptRegistry";
import type { ScriptTreeProvider } from "../treeProvider";
import type { TempScriptManager } from "../tempScriptManager";

const TEMP_SCHEME = "frappe-temp";
const SCHEME = "frappe-script";

export function onDidChangeWindowState(
  registry: ScriptRegistry,
  tempScriptManager: TempScriptManager | null,
  treeProvider: ScriptTreeProvider,
  outputChannel: vscode.OutputChannel,
): vscode.Disposable {
  return vscode.window.onDidChangeWindowState(async (state) => {
    if (!state.focused) return;

    const activeSiteId = treeProvider.currentSiteId;
    if (!activeSiteId) return;

    const activeEditor = vscode.window.activeTextEditor;
    const activeDoc = activeEditor?.document;

    if (
      !activeDoc ||
      (activeDoc.uri.scheme !== SCHEME && activeDoc.uri.scheme !== TEMP_SCHEME)
    ) {
      return;
    }

    try {
      await registry.reloadSite(activeSiteId);
      outputChannel.appendLine(`Refetched scripts for site: ${activeSiteId}`);

      let virtualUri: vscode.Uri | undefined;
      if (activeDoc.uri.scheme === SCHEME) {
        virtualUri = activeDoc.uri;
      } else if (activeDoc.uri.scheme === TEMP_SCHEME && tempScriptManager) {
        const filePath = tempScriptManager.getTempDir() + activeDoc.uri.path;
        const uriString = tempScriptManager.getVirtualUri(filePath);
        if (uriString) {
          virtualUri = vscode.Uri.parse(uriString);
        }
      }

      if (virtualUri) {
        const ref = registry.getReference(virtualUri);
        if (ref) {
          const updatedContent = registry.getCachedContent(virtualUri);
          if (updatedContent !== undefined && tempScriptManager) {
            tempScriptManager.exportScriptSync(virtualUri, ref, updatedContent);
            await vscode.commands.executeCommand("workbench.action.files.revert");
            outputChannel.appendLine(`Reloaded file on focus: ${ref.displayPath}`);
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Refetch failed: ${msg}`);
    }
  });
}