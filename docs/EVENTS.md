# Events & Subscriptions

All files in `src/subscriptions/`.

## Document Events

### onDidOpenTextDocument

- **File**: `src/subscriptions/onDidOpenTextDocument.ts`
- **Trigger**: VS Code opens a `frappe-builder://` document
- **Action**: Exports cached content to temp file via `TempScriptManager`; logs path to output channel

### onDidSaveTextDocument

- **File**: `src/subscriptions/onDidSaveTextDocument.ts`
- **Trigger**: Save on `frappe-temp://`, `file://` (inside temp dir), or `frappe-builder://`
- **Action**:
  1. Resolve temp file path
  2. Map to virtual URI via `tempScriptManager.getVirtualUri()`
  3. Read disk content
  4. Skip if unchanged from cache
  5. Call `fileSystem.writeFile(virtualUri, content)` → pushes to Frappe
  6. Update cache, show status message

## Context Keys

### setupContextKeys

- **File**: `src/subscriptions/setupContextKeys.ts`
- Watches `siteManager.onDidChangeSites`
- Sets `frappe-script-editor.hasSites` = `sites.length > 0`

### setIsSiteViewContext

- Sets `frappe-script-editor.isInSiteView` boolean
- Called by `openSite`, `goBack`, `removeSite`

## Tree View

### registerTreeView

- **File**: `src/subscriptions/registerTreeView.ts`
- Creates `ScriptTreeProvider`, injects `TempScriptManager`, restores `currentSiteId`
- Returns `{treeView, treeProvider, updateViewTitle}`

### onDidChangeActiveTextEditor

- **File**: `src/subscriptions/onDidChangeActiveTextEditor.ts`
- Maps active editor URI → virtual URI → tree node → `treeView.reveal()`
- Supports `frappe-builder://`, `frappe-temp://`, and matching `file://` paths

## FileSystem Registration

### registerFileSystem

- **File**: `src/subscriptions/registerFileSystem.ts`
- Registers `ScriptFileSystem` under `frappe-builder://` scheme

### registerTempFileSystem

- **File**: `src/subscriptions/registerTempFileSystem.ts`
- Creates `TempFileSystemProvider`, registers under `frappe-temp://` scheme

## URI Handler

### registerUriHandler

- **File**: `src/subscriptions/registerUriHandler.ts`
- Handles `vscode://frappe-script-editor/open-script?site=&doctype=&docname=&field=&blockId=&blockField=`
- **Flow**:
  1. Parse query params
  2. `findAndOpenScript()` → tries `registry.findByDocReference()`
  3. If found: activate site, ensure page visible, open temp file, reveal tree node
  4. If not found: `createMissingScript()` → fetches page blocks/page doc, creates empty field, registers on-demand, opens
- **createMissingScript** supports:
  - Block scripts (blockId + blockField)
  - Page doc field scripts (field name)

## HTTP Server

### startHttpServer

- **File**: `src/subscriptions/startHttpServer.ts`
- Uses `portfinder` to find open port in 59000–59021
- Starts `HttpServer` instance
- Returns disposable that calls `server.stop()`

### HttpServer (`src/httpServer.ts`)

- `GET /status` → JSON: `{active, version, extension, uriScheme, name}`
- CORS enabled for local dev
- Logs EADDRINUSE warning if port taken
