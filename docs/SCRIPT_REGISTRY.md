# Script Registry

## ScriptRegistry (`src/scriptRegistry.ts`)

Maps virtual URIs (`frappe-builder://`) to Frappe document/field references and builds the tree view data.

### Internal Maps

| Map | Key | Value |
|:---|:---|:---|
| `registry` | `uri.toString()` | `ScriptReference` |
| `docRefIndex` | `{siteId}:{doctype}:{docname}:{block\|field}:{...}` | `uri.toString()` |
| `treeData` | `siteId` | `ScriptTreeItemData` (root site node) |
| `contentCache` | `uri.toString()` | `string` (file content) |
| `blockPathCache` | `{siteId}:{docname}` | `Map<blockId, blockPath>` |
| `hiddenPageNames` | `siteId` | `Set<docname>` |

### URI ↔ Doc Reference

**Doc field script**: `frappe-builder:///{siteId}/{pageSlug}/{fieldLabel}{ext}`
**Block script**: `frappe-builder:///{siteId}/{pageSlug}/page blocks/{blockPath}/{fileLabel}`

### Public API

| Method | Use |
|:---|:---|
| `getReference(uri)` | Lookup ScriptReference by URI |
| `getTreeData()` | Root nodes for tree provider |
| `getCachedContent(uri)` | Cached file content |
| `setCachedContent(uri, content)` | Write cache |
| `clearCachedContent(uri)` | Invalidate cache |
| `getUrisByDoc(siteId, doctype, docname)` | All URIs for a given doc |
| `findByDocReference(...)` | Reverse lookup by doctype/docname/field/blockId (used by HTTP/URI handler) |
| `registerBlockScript(...)` | On-demand register a block script + insert into tree |
| `registerDocFieldScript(...)` | On-demand register a page-level field script + insert into tree |
| `getHiddenPageNames(siteId)` / `setHiddenPageNames(...)` | Page visibility control |
| `loadSites()` | Build empty site nodes (no pages) |
| `loadAll(siteId?)` | Full load: clear → fetch settings + all pages → build tree |
| `reloadSite(siteId)` | Clear site data → re-fetch → rebuild tree |
| `whenLoaded()` | Awaits current `loadingPromise` |

### Tree Structure Per Site

```
site (type="site")
├── settings (type="settings")
│   └── scriptFile × 4 (client-script.js, style.css, head-code.html, body-code.html)
├── page (type="page")
│   ├── clientScriptsFolder
│   │   └── scriptFile × N (.js / .css)
│   ├── scriptFile: data-script.py
│   ├── scriptFile: head-code.html
│   ├── scriptFile: body-code.html
│   └── pageBlocksFolder
│       └── blockFolder
│           ├── scriptFile: client-script.js
│           └── scriptFile: data-script.py
└── ...more pages
```

### On-Demand Registration

Used by URI handler when a browser requests a script not yet in the tree:

1. `registerBlockScript()` — fetches page blocks, finds block by id, creates URI + tree node
2. `registerDocFieldScript()` — creates URI + tree node for page-level fields (head-code, body-code, data-script)

Both write to `registry`, `docRefIndex`, `contentCache`, and mutate `treeData` directly.

### Loading Details

`loadSite(siteId, siteName, siteUrl, client)`:
1. **Builder Settings** — always loaded first; subscribes to doc updates
2. **Builder Pages** — lists all pages, fetches each page doc, subscribes to doc updates
3. **Per page** — client scripts folder, data script, head/body code, block scripts
4. Errors per page are caught and shown as warnings; other pages continue loading

### Block Path Cache

Block paths are `{sanitizeName(blockLabel)}-{blockId}`. Nested blocks use parent paths. Cached to keep tree stable across reloads.
