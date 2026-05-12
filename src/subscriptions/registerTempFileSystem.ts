import * as vscode from "vscode";
import { TempFileSystemProvider } from "../tempFileSystemProvider";
import type { TempScriptManager } from "../tempScriptManager";
import { TEMP_SCHEME } from "../utils";

export function registerTempFileSystem(
  tempScriptManager: TempScriptManager,
): vscode.Disposable {
  const tempFileSystem = new TempFileSystemProvider(tempScriptManager);

  return vscode.workspace.registerFileSystemProvider(
    TEMP_SCHEME,
    tempFileSystem,
    {
      isCaseSensitive: true,
      isReadonly: false,
    },
  );
}
