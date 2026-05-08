/**
 * Temp Script Manager — Exports Frappe Script Editor scripts to a cross-platform temp directory.
 *
 * This enables AI agents to access script files via real filesystem paths.
 *
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { ScriptReference } from "./types";

export class TempScriptManager {
  private tempDir: string;
  private virtualUriMap = new Map<string, string>();
  private uniqueIdMap = new Map<string, string>();

  constructor() {
    this.tempDir = path.join(os.tmpdir(), "frappe-scripts");
  }

  ensureTempDir(): string {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    return this.tempDir;
  }

  sanitizeFileName(displayPath: string): string {
    return displayPath.replace(/\//g, path.sep).replace(/ /g, "_");
  }

  private generateUniqueId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  }

  getTempPath(siteId: string, displayPath: string): string {
    const key = `${siteId}:${displayPath}`;

    let uniqueId = this.uniqueIdMap.get(key);
    if (!uniqueId) {
      uniqueId = this.generateUniqueId();
      this.uniqueIdMap.set(key, uniqueId);
    }

    const pathParts = displayPath.split("/");
    const pageName = pathParts[0];

    let blockName = "root";
    let scriptFile = pathParts[pathParts.length - 1];

    // Extract block name from path - prioritize block name over parent folder
    const pageBlocksIndex = pathParts.indexOf("page blocks");
    if (pageBlocksIndex !== -1 && pageBlocksIndex < pathParts.length - 1) {
      blockName = pathParts[pageBlocksIndex + 1];
    } else if (pathParts.length >= 3) {
      blockName = pathParts[pathParts.length - 2];
    }

    const cleanScriptFile = scriptFile.replace(/ /g, "-").replace(/_/g, "-");

    return path.join(
      this.tempDir,
      pageName,
      uniqueId,
      blockName,
      cleanScriptFile,
    );
  }

  exportScriptSync(
    uri: vscode.Uri,
    ref: ScriptReference,
    content: string,
  ): string {
    const tempPath = this.getTempPath(ref.siteId, ref.displayPath);
    const tempDir = path.dirname(tempPath);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    fs.writeFileSync(tempPath, content, "utf8");
    this.virtualUriMap.set(tempPath, uri.toString());

    return tempPath;
  }

  getVirtualUri(filePath: string): string | undefined {
    return this.virtualUriMap.get(filePath);
  }

  getTempDir(): string {
    return this.tempDir;
  }

  cleanup(): void {
    if (fs.existsSync(this.tempDir)) {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    }
    this.virtualUriMap.clear();
    this.uniqueIdMap.clear();
  }
}
