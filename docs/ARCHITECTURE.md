# Architecture

## Activation Sequence

```
extension.activate(context)
├── Core services: SiteManager, ScriptRegistry, ScriptFileSystem
├── TempScriptManager: cleanup(), ensureTempDir()
├── Register FileSystemProviders: frappe-builder://, frappe-temp://
├── Document events: onDidOpenTextDocument, onDidSaveTextDocument
├── Restore state: currentSiteId from workspaceState
├── Tree view: ScriptTreeProvider + registerTreeView()
├── Active editor sync: onDidChangeActiveTextEditor
├── Context keys: hasSites, isInSiteView, currentSiteId
├── Commands: registerAllCommands()
├── Realtime: siteManager.onDocUpdate → re-fetch + update temp
├── URI handler: registerUriHandler()
├── HTTP server: startHttpServer()
└── Initial load: loadSites() → loadAll(savedSiteId) → refresh()
```

## Data Flow Diagrams

### Open a Script

```
User clicks scriptFile in tree
  → treeProvider.getTreeItem() sets command="vscode.open"
  → treeProvider opens temp file path (exports if needed)
  → User edits real temp file
  → VS Code auto-saves or manual save
  → onDidSaveTextDocument reads file
  → maps temp path → virtual URI via TempScriptManager
  → ScriptFileSystem.writeFile() → FrappeClient.updateField()
  → registry.setCachedContent() → status bar message
```

### Browser → VS Code (URI Handler)

```
Browser opens vscode://frappe-script-editor/open-script?...
  → registerUriHandler.handleUri()
  → registry.findByDocReference() or createMissingScript()
  → setSiteAsActive() if needed
  → openScriptDoc() → exports to temp → opens editor
  → treeView.reveal() highlights node
```

### Realtime Update

```
Frappe doc_updated event
  → RealtimeClient.socket.on("doc_update")
  → siteManager._onDocUpdate.fire()
  → extension.onDocUpdate listener
  → registry.clearCachedContent(uri)
  → fileSystem.readFile(uri) → re-fetch from API
  → tempScriptManager.updateTempFile()
```

## Layer Responsibilities

| Layer | Files | Responsibility |
|:---|:---|:---|
| UI | `treeProvider.ts`, `commands/`, `httpServer.ts`, `subscriptions/` | User interaction, VS Code integration |
| Registry | `scriptRegistry.ts` | URI mapping, tree data, content cache |
| Sync | `scriptFileSystem.ts`, `tempScriptManager.ts`, `tempFileSystemProvider.ts` | Virtual ↔ real file bridging |
| Network | `frappeClient.ts`, `realtimeClient.ts` | REST API, Socket.IO |
| Persistence | `siteManager.ts` | Secrets, globalState, workspaceState |

## Disposables Registered on Activate

1. outputChannel
2. registerFileSystem(ScriptFileSystem)
3. registerTempFileSystem(TempFileSystemProvider)
4. onDidOpenTextDocument
5. onDidSaveTextDocument
6. treeView
7. onDidChangeActiveTextEditor
8. setupContextKeys
9. all commands (10)
10. siteManager.onDocUpdate
11. registerUriHandler
12. startHttpServer
