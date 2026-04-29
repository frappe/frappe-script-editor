/**
 * Tree Data Provider for the sidebar Scripts view.
 *
 * Displays a hierarchical view of all scripts from all configured sites:
 *   Site → Builder Settings → Pages → Scripts / Blocks
 */

import * as vscode from "vscode";
import type { ScriptRegistry } from "./scriptRegistry";
import type { ScriptTreeItemData } from "./types";
import type { TempScriptManager } from "./tempScriptManager";

export class ScriptTreeProvider implements vscode.TreeDataProvider<ScriptTreeItemData> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    ScriptTreeItemData | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private registry: ScriptRegistry;
  private tempManager: TempScriptManager | null = null;

  constructor(registry: ScriptRegistry) {
    this.registry = registry;

    this.registry.onDidChange(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  setTempManager(tempManager: TempScriptManager): void {
    this.tempManager = tempManager;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ScriptTreeItemData): vscode.TreeItem {
    const isCollapsible =
      element.children !== undefined && element.children.length > 0;

    const treeItem = new vscode.TreeItem(
      element.label,
      isCollapsible
        ? element.type === "site"
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    // Set context value for context menus
    treeItem.contextValue = element.contextValue || element.type;

    // Set icon
    if (element.iconId) {
      treeItem.iconPath = new vscode.ThemeIcon(element.iconId);
    } else {
      switch (element.type) {
        case "site":
          treeItem.iconPath = new vscode.ThemeIcon("globe");
          break;
        case "settings":
          treeItem.iconPath = new vscode.ThemeIcon("settings-gear");
          break;
        case "page":
          treeItem.iconPath = new vscode.ThemeIcon("file-code");
          break;
        case "clientScriptsFolder":
        case "pageBlocksFolder":
          treeItem.iconPath = new vscode.ThemeIcon("folder");
          break;
        case "blockFolder":
          treeItem.iconPath = new vscode.ThemeIcon("symbol-structure");
          break;
        case "scriptFile":
          treeItem.iconPath = new vscode.ThemeIcon("file");
          break;
      }
    }

    // Set tooltip
    if (element.tooltip) {
      treeItem.tooltip = element.tooltip;
    }

    // For script files, clicking opens the temp file if available
    if (element.type === "scriptFile" && element.uri) {
      const ref = this.registry.getReference(element.uri);
      let openUri: vscode.Uri | undefined = element.uri;

      if (this.tempManager && ref) {
        const cached = this.registry.getCachedContent(element.uri);
        if (cached !== undefined) {
          this.tempManager.exportScriptSync(element.uri, ref, cached);
          const tempPath = this.tempManager.getTempPath(
            ref.siteId,
            ref.displayPath,
          );
          openUri = vscode.Uri.file(tempPath);
        }
      }

      if (openUri) {
        treeItem.command = {
          command: "vscode.open",
          title: "Open Script",
          arguments: [openUri],
        };
        treeItem.resourceUri = openUri;
      }
    }

    return treeItem;
  }

  getChildren(
    element?: ScriptTreeItemData,
  ): vscode.ProviderResult<ScriptTreeItemData[]> {
    if (!element) {
      // Root level: return site nodes
      return this.registry.getTreeData();
    }

    return element.children || [];
  }
}
