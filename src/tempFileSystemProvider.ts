/**
 * FileSystemProvider for clean temporary file URIs.
 *
 */

import * as vscode from "vscode";
import * as fs from "fs";
import type { TempScriptManager } from "./tempScriptManager";

export class TempFileSystemProvider implements vscode.FileSystemProvider {
  private tempManager: TempScriptManager;
  private _onDidChangeFile = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile = this._onDidChangeFile.event;

  constructor(tempManager: TempScriptManager) {
    this.tempManager = tempManager;
  }

  private getTempFilePath(uri: vscode.Uri): string {
    const cleanPath = uri.path;
    const tempDir = this.tempManager.getTempDir();
    return tempDir + cleanPath;
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const filePath = this.getTempFilePath(uri);
    const stats = fs.statSync(filePath);

    return {
      type: stats.isDirectory()
        ? vscode.FileType.Directory
        : vscode.FileType.File,
      ctime: stats.ctimeMs,
      mtime: stats.mtimeMs,
      size: stats.size,
    };
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    const filePath = this.getTempFilePath(uri);
    const entries = fs.readdirSync(filePath, { withFileTypes: true });
    return entries.map((entry) => [
      entry.name,
      entry.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File,
    ]);
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const filePath = this.getTempFilePath(uri);
    return fs.readFileSync(filePath);
  }

  writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): void {
    const filePath = this.getTempFilePath(uri);
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!options.overwrite && fs.existsSync(filePath)) {
      throw vscode.FileSystemError.FileExists(uri);
    }

    fs.writeFileSync(filePath, content);
    this._onDidChangeFile.fire([{ uri, type: vscode.FileChangeType.Changed }]);
  }

  delete(uri: vscode.Uri, options: { recursive: boolean }): void {
    const filePath = this.getTempFilePath(uri);
    if (options.recursive) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
  }

  rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
  ): void {
    const oldPath = this.getTempFilePath(oldUri);
    const newPath = this.getTempFilePath(newUri);

    if (!options.overwrite && fs.existsSync(newPath)) {
      throw vscode.FileSystemError.FileExists(newUri);
    }

    fs.renameSync(oldPath, newPath);
  }

  createDirectory(uri: vscode.Uri): void {
    const filePath = this.getTempFilePath(uri);
    fs.mkdirSync(filePath, { recursive: true });
  }

  watch(
    uri: vscode.Uri,
    options: { recursive: boolean; excludes: string[] },
  ): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }
}
