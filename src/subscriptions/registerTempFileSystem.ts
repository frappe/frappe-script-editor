import * as vscode from "vscode";
import { TempFileSystemProvider, TEMP_SCHEME } from "../tempFileSystemProvider";
import type { TempScriptManager } from "../tempScriptManager";

export function registerTempFileSystem(
  tempScriptManager: TempScriptManager,
): vscode.Disposable {
  const tempFileSystem = new TempFileSystemProvider(tempScriptManager);

  return vscode.workspace.registerFileSystemProvider(TEMP_SCHEME, tempFileSystem, {
    isCaseSensitive: true,
    isReadonly: false,
  });
}