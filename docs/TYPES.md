# Types & Config

## Types (`src/types.ts`)

### Core Interfaces

```typescript
interface FrappeSiteConfig {
  id: string; name: string; url: string; apiKey: string;
  hasBuilder: boolean | null; isOffline: boolean | null;
}

type ScriptType =
  | "clientScript" | "pageDataScript" | "blockClientScript" | "blockDataScript";

type ScriptLocation =
  | { type: "docField"; doctype: string; docname: string; fieldName: string }
  | { type: "blockScript"; doctype: "Builder Page"; docname: string;
      blockId: string; blockField: "blockClientScript" | "blockDataScript" };

interface ScriptReference {
  siteId: string; location: ScriptLocation; scriptType: ScriptType;
  fileExtension: string; displayPath: string;
}

type TreeItemType =
  | "site" | "settings" | "page" | "clientScriptsFolder"
  | "pageBlocksFolder" | "blockFolder" | "scriptFile"
  | "searchNode" | "showMorePages";

interface ScriptTreeItemData {
  type: TreeItemType; label: string; siteId: string;
  siteUrl?: string; hasBuilder?: boolean | null; isOffline?: boolean | null;
  uri?: vscode.Uri; children: ScriptTreeItemData[];
  contextValue?: string; tooltip?: string; description?: string;
  iconId?: string; docname?: string;
  collapsibleState?: vscode.TreeItemCollapsibleState;
  blockId?: string;
}
```

### Doc Types

```typescript
interface FrappePageSummary { name: string; page_name: string; page_title: string | null; }

interface FrappePageDoc extends FrappePageSummary {
  route: string;
  page_data_script: string | null;
  head_html: string | null; body_html: string | null;
  blocks: string | null; draft_blocks: string | null;
  client_scripts: Array<{ builder_script: string; name: string }>;
}

interface FrappeClientScriptDoc {
  name: string; script_type: "JavaScript" | "CSS"; script: string;
}

type FrappeBuilderSettingsDoc = {
  script: string | null; style: string | null;
  head_html: string | null; body_html: string | null;
};

interface BlockNode {
  blockId: string; blockName?: string;
  blockClientScript?: string; blockDataScript?: string;
  children?: BlockNode[];
}

interface OpenScriptRequest {
  site: string; doctype: string; docname: string;
  field?: string; blockId?: string; blockField?: BlockFieldScript;
}
```

## Builder Config (`src/builderConfig.ts`)

### Doctypes

| Constant | Value |
|:---|:---|
| `BUILDER_DOCTYPES.SETTINGS` | `Builder Settings` |
| `BUILDER_DOCTYPES.CLIENT_SCRIPT` | `Builder Client Script` |
| `BUILDER_DOCTYPES.PAGE` | `Builder Page` |

### Fields

| Group | Fields |
|:---|:---|
| `SETTINGS_FIELDS` | `script`, `style`, `head_html`, `body_html` |
| `PAGE_FIELDS` | `page_data_script`, `head_html`, `body_html`, `client_scripts`, `draft_blocks`, `blocks` |
| `CLIENT_SCRIPT_FIELDS` | `script` |
| `BLOCK_PROPERTIES` | `blockClientScript`, `blockDataScript` |

### UI Config

| Constant | Value |
|:---|:---|
| `DEFAULT_PAGE_LIMIT` | `15` |
| `FOLDER_LABELS.CLIENT_SCRIPTS` | `Client Scripts` |
| `FOLDER_LABELS.PAGE_BLOCKS` | `Page Blocks` |
| `FOLDER_LABELS.DATA_SCRIPT` | `data-script.py` |
| `FOLDER_LABELS.CLIENT_SCRIPT` | `client-script.js` |

### Builder Settings Fields

```typescript
BUILDER_SETTINGS_FIELDS = [
  { field: "script", displayName: "client-script", ext: ".js" },
  { field: "style", displayName: "style", ext: ".css" },
  { field: "head_html", displayName: "head-code", ext: ".html" },
  { field: "body_html", displayName: "body-code", ext: ".html" },
];
```

### Page Script Fields

```typescript
PAGE_SCRIPT_FIELDS = {
  page_data_script: { label: "data-script", ext: ".py", scriptType: "pageDataScript", iconId: "symbol-method" },
  head_html: { label: "head-code", ext: ".html", scriptType: "clientScript", iconId: "code" },
  body_html: { label: "body-code", ext: ".html", scriptType: "clientScript", iconId: "code" },
};
```

## Utils (`src/utils.ts`)

| Export | Description |
|:---|:---|
| `APP_NAME` | `"frappe-script-editor"` |
| `TEMP_SCHEME` | `"frappe-temp"` |
| `sanitizeName(name)` | Replaces `[/\\?%*:\|"<>]` with `_` |
| `generateId()` | UUID v4 string |
| `normalizeUrl(url)` | Lowercase, ensures `http(s)://`, strips trailing `/` |
| `extractHostname(url)` | Parses hostname from URL string |
