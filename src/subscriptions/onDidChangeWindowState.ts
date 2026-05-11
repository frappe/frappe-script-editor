import * as vscode from "vscode";
import { SCHEME } from "../scriptRegistry";
import type { ScriptRegistry } from "../scriptRegistry";
import type { ScriptTreeProvider } from "../treeProvider";
import type { TempScriptManager } from "../tempScriptManager";

const TEMP_SCHEME = "frappe-temp";

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

    if (!activeDoc) {
      return;
    }

    let isRelevant =
      activeDoc.uri.scheme === SCHEME || activeDoc.uri.scheme === TEMP_SCHEME;

    if (!isRelevant && activeDoc.uri.scheme === "file" && tempScriptManager) {
      const filePath = activeDoc.uri.fsPath;
      const tempDir = tempScriptManager.getTempDir();
      isRelevant = filePath.startsWith(tempDir);
    }

    if (!isRelevant) {
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
      } else if (activeDoc.uri.scheme === "file" && tempScriptManager) {
        const filePath = activeDoc.uri.fsPath;
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
            await vscode.commands.executeCommand(
              "workbench.action.files.revert",
            );
            outputChannel.appendLine(
              `Reloaded file on focus: ${ref.displayPath}`,
            );
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Refetch failed: ${msg}`);
    }
  });
}
