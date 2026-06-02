# Frappe Script Editor — Agent Guide

> VS Code extension that edits Frappe Builder scripts (JS, Python, HTML, CSS) with sync-on-save.

## Quick Facts

| | |
|:---|:---|
| **Entry** | `src/extension.ts` → `activate()` |
| **Build** | `yarn compile` (esbuild, CJS, `out/extension.js`) |
| **Engine** | VS Code `^1.80.0` |
| **Deps** | `portfinder`, `socket.io-client` |
| **Scheme** | `frappe-builder://` (virtual FS), `frappe-temp://` (temp FS) |

## Architecture (5 Layers)

```
Commands + Tree UI
    |
ScriptRegistry ──→ ScriptFileSystem (frappe-builder://)
    |                  |
SiteManager ←──→ FrappeClient    TempScriptManager (real FS)
    |                  |              |
RealtimeClient    REST API      TempFileSystemProvider
    |                                     (frappe-temp://)
Socket.IO
```

1. **UI Layer** — Tree view (`treeProvider.ts`), Commands (`commands/`), URI handler, HTTP server
2. **Registry Layer** — `ScriptRegistry` maps virtual URIs to Frappe doc/field references and builds tree data
3. **Sync Layer** — `ScriptFileSystem` reads/writes via REST API; `TempScriptManager` mirrors scripts to real temp files for AI/external tools
4. **Network Layer** — `FrappeClient` (REST), `RealtimeClient` (Socket.IO doc subscriptions)
5. **Persistence Layer** — VS Code `globalState`/`secrets` for sites, `workspaceState` for current site/search

## File Map

| Path | Role |
|:---|:---|
| `src/extension.ts` | Activation, dependency wiring, bootstrap load |
| `src/siteManager.ts` | Add/remove/reload sites; secrets storage; client lifecycle |
| `src/frappeClient.ts` | REST API wrapper (auth, GET/PUT pages, settings, client scripts, blocks) |
| `src/realtimeClient.ts` | Socket.IO `doc_subscribe` + `doc_update` handler |
| `src/scriptRegistry.ts` | URI↔doc mapping, tree data builder, content cache, hidden pages |
| `src/scriptFileSystem.ts` | `FileSystemProvider` for `frappe-builder://`; save pushes to Frappe |
| `src/tempScriptManager.ts` | Exports cached scripts to OS temp dir; maps temp paths ↔ virtual URIs |
| `src/tempFileSystemProvider.ts` | `FileSystemProvider` for `frappe-temp://` |
| `src/treeProvider.ts` | `TreeDataProvider` for sidebar; search filter; page limit; visibility |
| `src/httpServer.ts` | Local HTTP status endpoint for browser integration |
| `src/commands/` | 10 commands: addSite, openSite, goBack, removeSite, reloadSite, refreshScripts, collapseFolders, searchBlocks, clearSearch, managePagesVisibility |
| `src/subscriptions/` | Event listeners: open/save document, active editor, context keys, tree view, URI handler, HTTP server startup |
| `src/types.ts` | Shared TypeScript interfaces |
| `src/builderConfig.ts` | Doctypes, fields, folder labels, tooltips, error messages |
| `src/utils.ts` | `APP_NAME`, `sanitizeName`, `generateId`, URL helpers |

## Key Concepts

- **Virtual URI** = `frappe-builder:///{siteId}/{pageSlug}/.../{file}` — what VS Code sees.
- **Temp path** = `{tmpdir}/frappe-scripts/{page}/{uid}/{block}/{file}` — real file for AI agents.
- **ScriptReference** — maps a URI to `{siteId, location: docField|blockScript, scriptType, ext, displayPath}`.
- **Tree flow** — Sites list → Open site → Page nodes → Folders (client scripts, page blocks) → Script files.
- **Save flow** — User saves temp file → `onDidSaveTextDocument` → `fileSystem.writeFile()` → Frappe REST PUT → update cache.
- **Realtime flow** — `RealtimeClient` subscribes to docs → `doc_update` → clear cache → re-fetch → update temp file.

## When You Need Detail

Load only the doc for the component you're touching:

- `docs/ARCHITECTURE.md` — Call flows, data diagrams, activation sequence
- `docs/SITE_MANAGEMENT.md` — `SiteManager`, `FrappeClient`, `RealtimeClient`
- `docs/SCRIPT_REGISTRY.md` — `ScriptRegistry`, tree building, on-demand registration
- `docs/FILE_SYSTEM.md` — `ScriptFileSystem`, `TempScriptManager`, save/open sync
- `docs/TREE_VIEW.md` — `ScriptTreeProvider`, search, pagination, visibility
- `docs/COMMANDS.md` — All 10 commands with inputs/outputs
- `docs/EVENTS.md` — Subscriptions, URI handler, HTTP server
- `docs/TYPES.md` — Type reference and `builderConfig.ts` constants

## Common Tasks

| Task | Start Here |
|:---|:---|
| Add a new command | `docs/COMMANDS.md` + `src/commands/index.ts` |
| Change how scripts sync on save | `docs/FILE_SYSTEM.md` + `src/subscriptions/onDidSaveTextDocument.ts` |
| Change tree structure/icons | `docs/TREE_VIEW.md` + `src/treeProvider.ts` |
| Add new doctype/field support | `docs/SCRIPT_REGISTRY.md` + `src/builderConfig.ts` |
| Modify API calls | `docs/SITE_MANAGEMENT.md` + `src/frappeClient.ts` |
| Fix realtime update handling | `docs/SITE_MANAGEMENT.md` + `src/extension.ts` (event handler) |
| Change temp file layout | `docs/FILE_SYSTEM.md` + `src/tempScriptManager.ts` |

## Build & Test

```bash
yarn install
yarn compile        # esbuild bundle → out/extension.js
yarn watch          # dev watch mode
```

Install locally via VS Code Command Palette → `Developer: Install Extension from Location`.

## Extension Manifest Summary

- Activation: `onStartupFinished`
- View container: Activity Bar icon → `frappe-script-editor` sidebar
- Commands: 10 commands prefixed with `frappe-script-editor.`
- Context keys: `hasSites`, `isInSiteView`, `currentSiteId`, `hasSearchQuery`
