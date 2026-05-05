/**
 * Tree Data Provider for the sidebar Scripts view.
 *
 * Displays a hierarchical view matching Builder's nested structure*
 *
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
  public currentSiteId: string | null = null;

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

    // Determine collapsible state based on node type
    let collapsibleState: vscode.TreeItemCollapsibleState;
    if (!isCollapsible) {
      collapsibleState = vscode.TreeItemCollapsibleState.None;
    } else if (element.type === "site") {
      collapsibleState = this.currentSiteId
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None;
    } else if (element.type === "blockElement") {
      // Block elements show their scripts inline, collapse by default
      collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    } else {
      collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }

    const treeItem = new vscode.TreeItem(element.label, collapsibleState);

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
        case "blockElement":
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

    if (element.type === "site" && !this.currentSiteId) {
      treeItem.command = {
        command: "frappeScriptEditor.openSite",
        title: "Open Site",
        arguments: [{ siteId: element.siteId }],
      };
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
      if (this.currentSiteId) {
        const siteNode = this.registry
          .getTreeData()
          .find((s) => s.siteId === this.currentSiteId);
        return siteNode?.children || [];
      }
      // Root level: return site nodes
      return this.registry.getTreeData();
    }

    return element.children || [];
  }
}
