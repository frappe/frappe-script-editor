import * as vscode from "vscode";
import type { ScriptRegistry } from "./scriptRegistry";
import type { ScriptTreeItemData } from "./types";
import type { TempScriptManager } from "./tempScriptManager";
import { getCleanTempUri } from "./tempFileSystemProvider";

export class ScriptTreeProvider implements vscode.TreeDataProvider<ScriptTreeItemData> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    ScriptTreeItemData | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private registry: ScriptRegistry;
  private tempManager: TempScriptManager | null = null;
  public currentSiteId: string | null = null;
  public searchQuery: string = "";

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

    let collapsibleState: vscode.TreeItemCollapsibleState;
    if (!isCollapsible) {
      collapsibleState = vscode.TreeItemCollapsibleState.None;
    } else if (element.type === "site") {
      collapsibleState = this.currentSiteId
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None;
    } else if (element.collapsibleState) {
      collapsibleState = element.collapsibleState;
    } else {
      collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }

    const treeItem = new vscode.TreeItem(element.label, collapsibleState);

    treeItem.contextValue = element.contextValue || element.type;

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
        case "scriptFile":
          treeItem.iconPath = new vscode.ThemeIcon("file");
          break;
        case "searchNode":
          treeItem.iconPath = new vscode.ThemeIcon("search");
          treeItem.command = {
            command: "frappeScriptEditor.searchBlocks",
            title: "Search Blocks",
          };
          break;
      }
    }

    if (element.tooltip) {
      treeItem.tooltip = element.tooltip;
    }

    if (element.type === "site" && !this.currentSiteId) {
      treeItem.command = {
        command: "frappeScriptEditor.openSite",
        title: "Open Site",
        arguments: [{ siteId: element.siteId }],
      };

      let statusIcon = "circle-large-filled";
      let statusText: string;
      let iconColor: vscode.ThemeColor;

      if (element.isOffline === true) {
        statusIcon = "error";
        statusText = "Site offline";
        iconColor = new vscode.ThemeColor("problemsErrorIcon.foreground");
      } else if (element.hasBuilder === true) {
        statusIcon = "pass-filled";
        statusText = "Builder detected";
        iconColor = new vscode.ThemeColor("testing.iconPassed");
      } else if (element.hasBuilder === false) {
        statusIcon = "warning";
        statusText = "Builder not installed";
        iconColor = new vscode.ThemeColor("problemsWarningIcon.foreground");
      } else {
        statusIcon = "circle-large-filled";
        statusText = "Status unknown";
        iconColor = new vscode.ThemeColor("problemsErrorIcon.foreground");
      }

      treeItem.description = element.siteUrl;
      treeItem.tooltip = `${element.siteUrl}\nStatus: ${statusText}`;
      treeItem.iconPath = new vscode.ThemeIcon(statusIcon, iconColor);
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
          openUri = getCleanTempUri(tempPath, this.tempManager.getTempDir());
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

  getParent(
    element: ScriptTreeItemData,
  ): vscode.ProviderResult<ScriptTreeItemData> {
    return this.findParent(this.registry.getTreeData(), element);
  }

  private findParent(
    nodes: ScriptTreeItemData[],
    target: ScriptTreeItemData,
  ): ScriptTreeItemData | undefined {
    for (const node of nodes) {
      if (node.children) {
        if (node.children.includes(target)) {
          return node;
        }
        const found = this.findParent(node.children, target);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  findNodeByUri(uri: vscode.Uri): ScriptTreeItemData | undefined {
    const uriString = uri.toString();
    return this.findNodeByUriRecursive(this.registry.getTreeData(), uriString);
  }

  private findNodeByUriRecursive(
    nodes: ScriptTreeItemData[],
    uriString: string,
  ): ScriptTreeItemData | undefined {
    for (const node of nodes) {
      if (node.uri && node.uri.toString() === uriString) {
        return node;
      }
      if (node.children) {
        const found = this.findNodeByUriRecursive(node.children, uriString);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  getChildren(
    element?: ScriptTreeItemData,
  ): vscode.ProviderResult<ScriptTreeItemData[]> {
    if (!element) {
      if (this.currentSiteId) {
        const siteNode = this.registry
          .getTreeData()
          .find((s) => s.siteId === this.currentSiteId);

        let children = siteNode?.children || [];

        if (this.searchQuery) {
          children = this.filterTreeData(children, this.searchQuery);
        }

        const searchNode: ScriptTreeItemData = {
          type: "searchNode",
          label: this.searchQuery
            ? `Search: "${this.searchQuery}"`
            : "Search blocks...",
          siteId: this.currentSiteId,
          contextValue: this.searchQuery
            ? "searchNodeActive"
            : "searchNodeEmpty",
        };

        return [searchNode, ...children];
      }
      return this.registry.getTreeData();
    }

    return element.children || [];
  }

  private filterTreeData(
    nodes: ScriptTreeItemData[],
    query: string,
    keepAllChildren = false,
  ): ScriptTreeItemData[] {
    const lowerQuery = query.toLowerCase();
    const result: ScriptTreeItemData[] = [];

    for (const node of nodes) {
      if (keepAllChildren) {
        const cloned = { ...node };
        if (cloned.children) {
          cloned.children = this.filterTreeData(cloned.children, query, true);
        }
        result.push(cloned);
        continue;
      }

      const matchesQuery =
        node.label?.toLowerCase().includes(lowerQuery) || false;

      const isMatchingBlockOrPage =
        (node.type === "blockFolder" ||
          node.type === "page" ||
          node.type === "pageBlocksFolder") &&
        matchesQuery;

      const shouldKeepChildren = keepAllChildren || isMatchingBlockOrPage;

      let filteredChildren: ScriptTreeItemData[] | undefined = undefined;
      if (node.children) {
        filteredChildren = this.filterTreeData(
          node.children,
          query,
          shouldKeepChildren,
        );
      }

      const hasMatchingChildren =
        filteredChildren && filteredChildren.length > 0;

      if (matchesQuery || hasMatchingChildren) {
        if (
          node.type == "pageBlocksFolder" ||
          node.type == "clientScriptsFolder"
        ) {
          node.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
        const cloned = { ...node };
        if (filteredChildren) {
          cloned.children = filteredChildren;
        }
        result.push(cloned);
      }
    }
    return result;
  }
}
