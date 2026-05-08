import * as vscode from "vscode";
import { SCHEME } from "../scriptRegistry";
import type { ScriptRegistry } from "../scriptRegistry";
import type { TempScriptManager } from "../tempScriptManager";

export function onDidOpenTextDocument(
  registry: ScriptRegistry,
  tempScriptManager: TempScriptManager,
  outputChannel: vscode.OutputChannel,
): vscode.Disposable {
  return vscode.workspace.onDidOpenTextDocument(async (doc) => {
    if (doc.uri.scheme !== SCHEME) return;
    if (!tempScriptManager) return;

    const ref = registry.getReference(doc.uri);
    if (!ref) return;

    const cached = registry.getCachedContent(doc.uri);
    if (cached === undefined) return;

    try {
      const realPath = tempScriptManager.exportScriptSync(doc.uri, ref, cached);
      const tempDir = tempScriptManager.getTempDir();
      const cleanPath = realPath.replace(tempDir, "");
      const cleanUri = vscode.Uri.parse(`frappe-temp://${cleanPath}`);
      outputChannel.appendLine(`Exported to temp: ${realPath}`);
      vscode.window.setStatusBarMessage(
        `Frappe: Exported to ${cleanUri.toString()}`,
        5000,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Export failed: ${msg}`);
    }
  });
}
