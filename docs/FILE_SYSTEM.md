# File Systems

## ScriptFileSystem (`src/scriptFileSystem.ts`)

VS Code `FileSystemProvider` for `frappe-builder://` scheme.

### Supported Operations

| Operation | Behavior |
|:---|:---|
| `stat(uri)` | File if in registry; Directory if path has no dot; else FileNotFound |
| `readFile(uri)` | Returns cached content if available; else fetches from Frappe API |
| `writeFile(uri, content)` | Pushes to Frappe REST API; updates cache; fires `onDidChangeFile` |
| `watch/readDirectory/createDirectory/delete/rename` | Stub or NoPermissions |

### Read Flow

1. Get `ScriptReference` from registry
2. If cached content exists → return it
3. Else fetch via `FrappeClient`:
   - `docField` (settings, client script, page field) → direct GET
   - `blockScript` → `getPageBlocksRaw()`, parse JSON, `findBlockById()`, extract field value
4. Cache result, return bytes

### Write Flow

1. Get `ScriptReference`
2. `docField` → `client.updateField(doctype, docname, fieldName, text)`
3. `blockScript`:
   - Re-fetch current blocks JSON
   - Compare SHA-256 hash with stored hash → if mismatch, prompt "Force Save"
   - Update block field, `updatePageBlocks()`
   - Store new hash
4. Update cache, fire `onDidChangeFile`, show status message

### Conflict Detection

Block scripts store a SHA-256 of the raw blocks JSON at read time. On write, if the remote blocks changed, a modal warns the user.

## TempScriptManager (`src/tempScriptManager.ts`)

Exports cached virtual scripts to real OS temp files for AI agents and external tools.

### Temp Layout

```
{os.tmpdir()}/frappe-scripts/
├── {pageName}/
│   └── {uniqueId}/
│       └── {blockName}/
│           └── {scriptFile}
```

- `uniqueId` = per `(siteId, displayPath)` stable ID (generated once, cached in `uniqueIdMap`)
- `blockName` = first segment after "page blocks" in display path, or "root"
- `scriptFile` = spaces replaced with hyphens

### Methods

| Method | Description |
|:---|:---|
| `ensureTempDir()` | Creates `{tmpdir}/frappe-scripts` |
| `cleanup()` | Deletes entire temp dir and clears maps |
| `getTempPath(siteId, displayPath)` | Computes real file path |
| `exportScriptSync(uri, ref, content)` | Writes file, maps `tempPath → virtualUri` |
| `getVirtualUri(filePath)` | Reverse map: temp path → virtual URI string |
| `updateTempFile(siteId, displayPath, content)` | Overwrites existing temp file |

### URI Mapping

`virtualUriMap: Map<tempPath, uriString>` — used by `onDidSaveTextDocument` to route temp file saves back to the virtual file system.

## TempFileSystemProvider (`src/tempFileSystemProvider.ts`)

VS Code `FileSystemProvider` for `frappe-temp://` scheme.

Provides full CRUD over the temp directory:
- `stat`, `readDirectory`, `readFile`, `writeFile`, `delete`, `rename`, `createDirectory`

All operations delegate to `fs` sync methods against `tempDir + uri.path`.

## Save/Open Sync

### Open (`onDidOpenTextDocument`)

- Triggered when `frappe-builder://` document opens
- Exports cached content to temp file via `TempScriptManager`
- Shows status bar message with real path

### Save (`onDidSaveTextDocument`)

- Triggered on save of `frappe-temp://`, `file://` (inside temp dir), or `frappe-builder://`
- Maps temp path → virtual URI
- Reads file content from disk
- If content changed from cache → calls `ScriptFileSystem.writeFile()` → syncs to Frappe
- Updates cache, shows "Synced to Frappe" status
