import * as vscode from "vscode";
import { SCHEME } from "../scriptRegistry";
import type { ScriptTreeProvider } from "../treeProvider";
import type { TempScriptManager } from "../tempScriptManager";

const TEMP_SCHEME = "frappe-temp";

export function onDidChangeActiveTextEditor(
  treeProvider: ScriptTreeProvider,
  tempScriptManager: TempScriptManager | null,
  treeView: vscode.TreeView<unknown>,
): vscode.Disposable {
  return vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!editor) return;
    const doc = editor.document;

    let virtualUri: vscode.Uri | undefined;
    if (doc.uri.scheme === SCHEME) {
      virtualUri = doc.uri;
    } else if (doc.uri.scheme === TEMP_SCHEME && tempScriptManager) {
      const filePath = tempScriptManager.getTempDir() + doc.uri.path;
      const uriString = tempScriptManager.getVirtualUri(filePath);
      if (uriString) {
        virtualUri = vscode.Uri.parse(uriString);
      }
    } else if (doc.uri.scheme === "file" && tempScriptManager) {
      const filePath = doc.uri.fsPath;
      const uriString = tempScriptManager.getVirtualUri(filePath);
      if (uriString) {
        virtualUri = vscode.Uri.parse(uriString);
      }
    }

    if (virtualUri) {
      const node = treeProvider.findNodeByUri(virtualUri);
      if (node) {
        treeView.reveal(node, { select: true, focus: false, expand: true });
      }
    }
  });
}
