import type { ScriptType } from "./types";

export const BUILDER_DOCTYPES = {
  SETTINGS: "Builder Settings",
  CLIENT_SCRIPT: "Builder Client Script",
  PAGE: "Builder Page",
} as const;

export const BLOCK_FIELDS = {
  CLIENT_SCRIPT: "blockClientScript",
  DATA_SCRIPT: "blockDataScript",
} as const;

export const BUILDER_FIELDS = {
  SETTINGS: {
    SCRIPT: "script",
    STYLE: "style",
    HEAD_HTML: "head_html",
    BODY_HTML: "body_html",
  },
  PAGE: {
    PAGE_DATA_SCRIPT: "page_data_script",
    HEAD_HTML: "head_html",
    BODY_HTML: "body_html",
    CLIENT_SCRIPTS: "client_scripts",
    DRAFT_BLOCKS: "draft_blocks",
    BLOCKS: "blocks",
  },
  BLOCK: {
    CLIENT_SCRIPT: "blockClientScript",
    DATA_SCRIPT: "blockDataScript",
  },
  CLIENT_SCRIPT: {
    SCRIPT: "script",
  },
} as const;

export const BUILDER_SETTINGS_FIELDS = [
  {
    field: BUILDER_FIELDS.SETTINGS.SCRIPT,
    displayName: "client script",
    ext: ".js",
  },
  {
    field: BUILDER_FIELDS.SETTINGS.STYLE,
    displayName: "style",
    ext: ".css",
  },
  {
    field: BUILDER_FIELDS.SETTINGS.HEAD_HTML,
    displayName: "Head code",
    ext: ".html",
  },
  {
    field: BUILDER_FIELDS.SETTINGS.BODY_HTML,
    displayName: "Body code",
    ext: ".html",
  },
] as const;

export const PAGE_SCRIPT_FIELDS: Record<
  string,
  { label: string; ext: string; scriptType: ScriptType; iconId: string }
> = {
  [BUILDER_FIELDS.PAGE.PAGE_DATA_SCRIPT]: {
    label: "data script",
    ext: ".py",
    scriptType: "pageDataScript",
    iconId: "symbol-method",
  },
  [BUILDER_FIELDS.PAGE.HEAD_HTML]: {
    label: "Head code",
    ext: ".html",
    scriptType: "clientScript",
    iconId: "code",
  },
  [BUILDER_FIELDS.PAGE.BODY_HTML]: {
    label: "Body code",
    ext: ".html",
    scriptType: "clientScript",
    iconId: "code",
  },
};

export const FOLDER_LABELS = {
  CLIENT_SCRIPTS: "client scripts",
  DATA_SCRIPT: "data script.py",
  PAGE_BLOCKS: "page blocks",
  CLIENT_SCRIPT: "client script.js",
  DATA_SCRIPT_PY: "data script.py",
  HEAD_CODE: "Head code.html",
  BODY_CODE: "Body code.html",
} as const;

export const TOOLTIPS = {
  SITE_OFFLINE: "Site is offline. Click to retry.",
  NO_BUILDER:
    "Builder app is not installed on this site. Click to reload and check again.",
  ROUTE_PREFIX: "Route: ",
} as const;

export const ERROR_MESSAGES = {
  LOADING_SCRIPTS: (siteName: string, msg: string) =>
    `Failed to load scripts from "${siteName}": ${msg}`,
  LOADING_SETTINGS: (siteName: string, msg: string) =>
    `Failed to load Builder Settings for "${siteName}": ${msg}`,
  LOADING_PAGE: (pageName: string, msg: string) =>
    `Failed to load page "${pageName}": ${msg}`,
  LOADING_CLIENT_SCRIPT: (scriptName: string, msg: string) =>
    `Failed to load client script "${scriptName}": ${msg}`,
  LISTING_PAGES: (siteName: string, msg: string) =>
    `Failed to list pages for "${siteName}": ${msg}`,
  BLOCK_NOT_FOUND: (blockId: string, docname: string) =>
    `Block "${blockId}" not found in page "${docname}"`,
  UNKNOWN_FIELD: (fieldName: string) =>
    `Unknown field "${fieldName}" for on-demand registration`,
  PAGE_NOT_FOUND: (docname: string) => `Builder Page "${docname}" not found`,
} as const;

export const PROGRESS_TITLES = {
  LOADING_SITES: "Frappe Script Editor: Loading sites…",
  LOADING_SCRIPTS: "Frappe Script Editor: Loading scripts…",
  LOADING_SITE: (siteName: string) => `Loading ${siteName}…`,
} as const;
