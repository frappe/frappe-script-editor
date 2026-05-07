import * as vscode from "vscode";
import { ScriptFileSystem } from "../scriptFileSystem";
import { SCHEME } from "../scriptRegistry";

export function registerFileSystem(
  fileSystem: ScriptFileSystem,
): vscode.Disposable {
  return vscode.workspace.registerFileSystemProvider(SCHEME, fileSystem, {
    isCaseSensitive: true,
    isReadonly: false,
  });
}