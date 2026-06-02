# Commands

All commands registered in `src/commands/index.ts`. Prefix: `frappe-script-editor.`

## Command Index

| Command | File | Trigger | What It Does |
|:---|:---|:---|:---|
| `addSite` | `addSite.ts` | Sidebar "Add Site" button | 4-step input (name, URL, key, secret) → auth → persist |
| `openSite` | `openSite.ts` | Click site node | Sets `currentSiteId`, context keys, loads scripts, updates title |
| `goBack` | `goBack.ts` | Back arrow in title bar | Clears search, resets `currentSiteId`, shows sites list |
| `removeSite` | `removeSite.ts` | Trash icon on site node | Modal confirm → remove from secrets/state/registry |
| `reloadSite` | `reloadSite.ts` | Refresh icon on site node | Re-check builder status → reload site scripts |
| `refreshScripts` | `refreshScripts.ts` | Refresh icon in title bar | `loadAll(currentSiteId)` or `loadSites()` |
| `collapseFolders` | `collapseFolders.ts` | Collapse icon | Focus view → `list.collapseAll` |
| `searchBlocks` | `searchBlocks.ts` | Search node or title bar | Input box → sets `searchQuery` → refreshes tree |
| `clearSearch` | `clearSearch.ts` | Clear icon on active search node | Resets `searchQuery` → refreshes tree |
| `managePagesVisibility` | `managePagesVisibility.ts` | Eye icon or "Show more pages" | QuickPick multi-select to show/hide pages |

## addSite

Input flow uses `vscode.window.createInputBox` with Back button support. On completion:
1. `siteManager.addSite()` — validates auth, checks builder, stores secret
2. `registry.loadAll()` — fetches all scripts for the new site
3. Warns if builder not installed

## openSite / goBack

State transitions:

```
Sites list (currentSiteId = null, isInSiteView = false)
   │ click site
   ▼
Site view (currentSiteId = {id}, isInSiteView = true, title = site.name)
   │ click back
   ▼
Sites list
```

Persisted in `workspaceState`: `frappe-script-editor.currentSiteId`

## removeSite

If removing the currently open site:
- Clears `currentSiteId`
- Sets `isInSiteView = false`
- Calls `registry.removeSiteTreeData()` to prune tree

## managePagesVisibility

QuickPick behavior:
- `canSelectMany = true`
- Items: all pages with `picked` = visible
- Reset button restores default (first 15 pages)
- On accept: builds `hiddenPageNames` set from unselected pages
- Calls `registry.setHiddenPageNames()` + `treeProvider.refresh()`
