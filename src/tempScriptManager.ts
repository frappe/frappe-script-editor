/**
 * Temp Script Manager — Exports Frappe Script Editor scripts to a cross-platform temp directory.
 *
 * This enables AI agents to access script files via real filesystem paths.
 * - Auto-exports scripts to os.tmpdir()/frappe-scripts/ on document open
 * - Auto-syncs changes back to Frappe on file save
 * - Cleanup on extension deactivation
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
    const sanitized = this.sanitizeFileName(displayPath);
    const key = `${siteId}:${displayPath}`;

    // Use existing unique ID if already generated for this key
    let uniqueId = this.uniqueIdMap.get(key);
    if (!uniqueId) {
      uniqueId = this.generateUniqueId();
      this.uniqueIdMap.set(key, uniqueId);
    }

    return path.join(this.tempDir, siteId, `${uniqueId}_${sanitized}`);
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

  async exportAll(
    getReferences: () => Iterable<[string, ScriptReference]>,
    getCachedContent: (uri: vscode.Uri) => string | undefined,
  ): Promise<void> {
    this.ensureTempDir();

    for (const [uriStr, ref] of getReferences()) {
      const uri = vscode.Uri.parse(uriStr);
      const cached = getCachedContent(uri);

      if (cached !== undefined) {
        this.exportScriptSync(uri, ref, cached);
      }
    }
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
