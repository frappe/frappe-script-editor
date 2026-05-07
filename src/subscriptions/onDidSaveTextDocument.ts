import * as vscode from "vscode";
import * as fs from "fs";
import type { ScriptRegistry } from "../scriptRegistry";
import { ScriptFileSystem } from "../scriptFileSystem";
import type { TempScriptManager } from "../tempScriptManager";

export function onDidSaveTextDocument(
  registry: ScriptRegistry,
  fileSystem: ScriptFileSystem,
  tempScriptManager: TempScriptManager,
  outputChannel: vscode.OutputChannel,
): vscode.Disposable {
  return vscode.workspace.onDidSaveTextDocument(async (doc) => {
    if (!tempScriptManager) return;

    let filePath: string;

    if (doc.uri.scheme === "frappe-temp") {
      filePath = tempScriptManager.getTempDir() + doc.uri.path;
    } else if (doc.uri.scheme === "file") {
      filePath = doc.uri.fsPath;
      if (!filePath.startsWith(tempScriptManager.getTempDir())) return;
    } else {
      return;
    }

    const virtualUriString = tempScriptManager.getVirtualUri(filePath);
    if (!virtualUriString) return;

    const virtualUri = vscode.Uri.parse(virtualUriString);
    const ref = registry.getReference(virtualUri);
    if (!ref) return;

    const savedContent = fs.readFileSync(filePath, "utf8");
    const cachedContent = registry.getCachedContentByUriString(virtualUriString);

    if (savedContent === cachedContent) return;

    try {
      await fileSystem.writeFile(
        virtualUri,
        new TextEncoder().encode(savedContent),
        { create: false, overwrite: true },
      );
      registry.setCachedContentSync(virtualUriString, savedContent);
      vscode.window.setStatusBarMessage("Frappe: Synced to Frappe", 3000);
      outputChannel.appendLine(`Synced: ${ref.displayPath}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(`Sync failed: ${msg}`);
      vscode.window.showErrorMessage(`Frappe: sync failed — ${msg}`);
    }
  });
}