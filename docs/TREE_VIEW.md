# Tree View

## ScriptTreeProvider (`src/treeProvider.ts`)

Implements `vscode.TreeDataProvider<ScriptTreeItemData>`.

### State

| Property | Type | Meaning |
|:---|:---|:---|
| `currentSiteId` | `string \| null` | Single site drill-down mode; null = sites list |
| `searchQuery` | `string` | Active filter string |

### TreeItem Construction

`getTreeItem(element)`:
- Collapsible state: `site` expands if `currentSiteId` set; folders default collapsed; files never collapsible
- Icons: `globe` (site), `settings-gear` (settings), `file-code` (page), `folder` (folders), file-specific icons for scripts
- Script files open via `vscode.open` command on the **temp file path** (exported on demand)
- Search node triggers `searchBlocks` command
- "Show more pages" node triggers `managePagesVisibility`

### Site Status Icons

| State | Icon | Color |
|:---|:---|:---|
| Offline | `error` | problemsErrorIcon |
| Builder installed | `pass-filled` | testing.iconPassed |
| No builder | `warning` | problemsWarningIcon |
| Unknown | `circle-large-filled` | problemsErrorIcon |

### Children (`getChildren`)

- **No `currentSiteId`**: returns `registry.getTreeData()` (all sites)
- **In site view**: returns `[searchNode, ...filteredChildren]`
  - Applies page limit
  - Applies search filter if `searchQuery` set

### Page Limit (`applyPageLimit`)

- Default: show first `DEFAULT_PAGE_LIMIT` (15) pages
- If user explicitly hides pages via `managePagesVisibility`: show only non-hidden pages
- Appends `showMorePages` node if any pages are hidden

### Search Filter (`filterTreeData`)

- Case-insensitive match on `node.label`
- Matching `page`, `blockFolder`, or `pageBlocksFolder` nodes keep all their children
- Other nodes match recursively on children
- Matching expands `pageBlocksFolder` and `clientScriptsFolder`

### Navigation Helpers

| Method | Description |
|:---|:---|
| `getParent(element)` | Finds parent in full tree data |
| `findNodeByUri(uri)` | Finds tree node matching a virtual URI |
| `refresh()` | Fires `onDidChangeTreeData` |
| `setTempManager(tm)` | Injects TempScriptManager for export-on-open |

## registerTreeView (`src/subscriptions/registerTreeView.ts`)

Factory that:
1. Creates `ScriptTreeProvider`
2. Injects `TempScriptManager`
3. Restores `currentSiteId` from workspace state
4. Creates `vscode.TreeView` with the provider
5. Provides `updateViewTitle()` → sets title to site name or "Sites"

## onDidChangeActiveTextEditor (`src/subscriptions/onDidChangeActiveTextEditor.ts`)

Syncs tree selection with active editor:
- Detects virtual URI from `frappe-builder://`, `frappe-temp://`, or `file://` (inside temp dir)
- Finds matching tree node
- Calls `treeView.reveal(node, {select: true, focus: false, expand: true})`
