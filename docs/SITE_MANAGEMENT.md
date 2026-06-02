# Site Management

## SiteManager (`src/siteManager.ts`)

Lifecycle manager for Frappe site connections.

### State

- `sites: FrappeSiteConfig[]` — in-memory site list
- `globalState` / `secrets` — VS Code persistence
- `clients: Map<siteId, FrappeClient>` — cached REST clients
- `realtimeClients: Map<siteId, RealtimeClient>` — cached Socket.IO clients

### Events

| Event | Emitted When |
|:---|:---|
| `onDidChangeSites` | Site added, removed, or status reloaded |
| `onDocUpdate` | RealtimeClient receives `doc_update` |

### Methods

| Method | Description |
|:---|:---|
| `getSites()` | All configured sites |
| `getSite(id)` | Single site by id |
| `findSiteByUrl(url)` | Match by normalized URL or hostname |
| `addSite(name, url, apiKey, apiSecret)` | Auth → checkBuilder → persist secrets → connect realtime |
| `removeSite(id)` | Disconnect realtime, delete secrets, filter sites |
| `reloadSiteStatus(id)` | Re-check builder install, update offline status |
| `getClient(siteId)` | Lazy-create/return FrappeClient; reconnects realtime |
| `subscribeDoc(siteId, doctype, docname)` | Delegates to RealtimeClient.docSubscribe |

### Persistence Keys

- `globalState`: `${APP_NAME}.sites` — site metadata (no secrets)
- `secrets`: `${APP_NAME}.secret.{siteId}` — API secret

## FrappeClient (`src/frappeClient.ts`)

Thin REST wrapper using `fetch()`.

### Auth

All requests send `Authorization: token {apiKey}:{apiSecret}`.

### Methods

| Method | Endpoint | Returns |
|:---|:---|:---|
| `authenticate()` | `GET /api/method/frappe.auth.get_logged_user` | username |
| `checkBuilderInstalled()` | `GET /api/resource/Module Def/Builder` | boolean |
| `getBuilderPages()` | `GET /api/resource/Builder Page?fields=...` | `FrappePageSummary[]` |
| `getPageDoc(name)` | `GET /api/resource/Builder Page/{name}` | `FrappePageDoc` |
| `getBuilderSettings()` | `GET /api/resource/Builder Settings/Builder Settings` | `FrappeBuilderSettingsDoc` |
| `getClientScript(name)` | `GET /api/resource/Builder Client Script/{name}` | `FrappeClientScriptDoc` |
| `updateField(doctype, docname, field, value)` | `PUT /api/resource/{doctype}/{docname}` | void |
| `getPageBlocksRaw(name)` | Calls `getPageDoc`, returns `{json, field}` (prefers `draft_blocks`) | — |
| `updatePageBlocks(name, field, blocksJson)` | `PUT /api/resource/Builder Page/{name}` | void |

### Error Strategy

`checkBuilderInstalled()` distinguishes "no builder" (404) from "offline" (network errors) by checking message for fetch/connection/SSL keywords.

## RealtimeClient (`src/realtimeClient.ts`)

Socket.IO client for Frappe `doc_update` events.

### Connection

```
URL: {protocol}//{host}[:9000]/{siteName}
Transports: websocket, polling
Headers: Authorization, Origin
```

### Behavior

- `connect()` → re-subscribes all `open_docs`
- `docSubscribe(doctype, docname)` → emits `doc_subscribe` if connected; tracks in `open_docs` set
- `addDocUpdateHandler(handler)` → called on every `doc_update`
- `disconnect()` → clears all handlers and docs
