export const DEFAULT_PAGE_LIMIT = 15;

export const BUILDER_DOCTYPES = {
  SETTINGS: "Builder Settings",
  CLIENT_SCRIPT: "Builder Client Script",
  PAGE: "Builder Page",
} as const;


export const SETTINGS_FIELDS = {
  SCRIPT: "script",
  STYLE: "style",
  HEAD_HTML: "head_html",
  BODY_HTML: "body_html",
} as const;

export const PAGE_FIELDS = {
  PAGE_DATA_SCRIPT: "page_data_script",
  HEAD_HTML: "head_html",
  BODY_HTML: "body_html",
  CLIENT_SCRIPTS: "client_scripts",
  DRAFT_BLOCKS: "draft_blocks",
  BLOCKS: "blocks",
} as const;

export const CLIENT_SCRIPT_FIELDS = {
  SCRIPT: "script",
} as const;

export const BLOCK_PROPERTIES = {
  CLIENT_SCRIPT: "blockClientScript",
  DATA_SCRIPT: "blockDataScript",
} as const;

export const BUILDER_SETTINGS_FIELDS = [
  {
    field: SETTINGS_FIELDS.SCRIPT,
    displayName: "client-script",
    ext: ".js",
  },
  {
    field: SETTINGS_FIELDS.STYLE,
    displayName: "style",
    ext: ".css",
  },
  {
    field: SETTINGS_FIELDS.HEAD_HTML,
    displayName: "head-code",
    ext: ".html",
  },
  {
    field: SETTINGS_FIELDS.BODY_HTML,
    displayName: "body-code",
    ext: ".html",
  },
] as const;

export const PAGE_SCRIPT_FIELDS = {
  [PAGE_FIELDS.PAGE_DATA_SCRIPT]: {
    label: "data-script",
    ext: ".py",
    scriptType: "pageDataScript",
    iconId: "symbol-method",
  },
  [PAGE_FIELDS.HEAD_HTML]: {
    label: "head-code",
    ext: ".html",
    scriptType: "clientScript",
    iconId: "code",
  },
  [PAGE_FIELDS.BODY_HTML]: {
    label: "body-code",
    ext: ".html",
    scriptType: "clientScript",
    iconId: "code",
  },
} as const;

export const FOLDER_LABELS = {
  CLIENT_SCRIPTS: "Client Scripts",
  PAGE_BLOCKS: "Page Blocks",
  DATA_SCRIPT: "data-script.py",
  CLIENT_SCRIPT: "client-script.js",
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
};
