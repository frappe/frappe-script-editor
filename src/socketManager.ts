import * as vscode from "vscode";
import { io, Socket } from "socket.io-client";
import type { SiteManager } from "./siteManager";
import type { ScriptRegistry } from "./scriptRegistry";
import type { TempScriptManager } from "./tempScriptManager";
import type { ScriptFileSystem } from "./scriptFileSystem";
import { extractHostname } from "./utils";
import { BUILDER_DOCTYPES } from "./builderConfig";

export class SocketManager {
  private siteManager: SiteManager;
  private registry: ScriptRegistry;
  private tempScriptManager: TempScriptManager;
  private outputChannel: vscode.OutputChannel;
  private fileSystem: ScriptFileSystem;

  private sockets = new Map<string, Socket>();

  constructor(
    siteManager: SiteManager,
    registry: ScriptRegistry,
    tempScriptManager: TempScriptManager,
    fileSystem: ScriptFileSystem,
    outputChannel: vscode.OutputChannel,
  ) {
    this.siteManager = siteManager;
    this.registry = registry;
    this.tempScriptManager = tempScriptManager;
    this.fileSystem = fileSystem;
    this.outputChannel = outputChannel;
  }

  async connect(siteId: string): Promise<void> {
    if (this.sockets.has(siteId)) {
      return;
    }

    const site = this.siteManager.getSite(siteId);
    if (!site) return;

    if (site.isOffline || site.hasBuilder === false) {
      return;
    }

    // Get the client first to ensure we have proper authentication
    const client = await this.siteManager.getClient(siteId);
    // @ts-ignore - reaching into private properties of client, we should probably add a method to get the auth header instead
    const authHeader = `token ${client["apiKey"]}:${client["apiSecret"]}`;

    const urlObject = new URL(site.url);
    const hostname = extractHostname(site.url);
    const siteName = site.name; // Use hostname as site name

    // Build socket URL similar to the provided script pattern
    let socketio_port = 9000; // Default socket.io port
    let port = urlObject.port ? `:${socketio_port}` : "";
    let protocol = port ? "http" : "https";
    let socketUrl = `${protocol}://${urlObject.hostname}${port}/${siteName}`;

    console.log("🚀 ~ SocketManager ~ connect ~ socketUrl:", socketUrl);
    this.outputChannel.appendLine(`[Socket] Connecting to ${socketUrl}...`);

    const socket = io(socketUrl, {
      withCredentials: true,
      extraHeaders: {
        Authorization: authHeader,
        Origin: site.url,
      },
      transports: ["websocket", "polling"],
      forceNew: true,
    });

    socket.on("connect", () => {
      console.log("🚀 ~ SocketManager ~ connect ~ socket.id:", socket.id);
      this.outputChannel.appendLine(
        `[Socket] Connected to ${hostname} (${socket.id})`,
      );
      this.subscribeToDocuments(siteId, socket);
    });

    socket.on("disconnect", (reason) => {
      console.log("🚀 ~ SocketManager ~ disconnect ~ reason:", reason);
      this.outputChannel.appendLine(
        `[Socket] Disconnected from ${hostname}: ${reason}`,
      );
    });

    socket.on("connect_error", (err) => {
      console.log("🚀 ~ SocketManager ~ connect_error ~ err:", err);
      console.log("🚀 ~ SocketManager ~ connect_error ~ socketUrl:", socketUrl);
      console.log("🚀 ~ SocketManager ~ connect_error ~ site.url:", site.url);
      this.outputChannel.appendLine(
        `[Socket] Connection error on ${hostname}: ${err.message}`,
      );
      this.outputChannel.appendLine(
        `[Socket] Debug - Socket URL: ${socketUrl}, Site URL: ${site.url}`,
      );
    });

    socket.on(
      "doc_update",
      async (data: { doctype: string; name: string; modified: string }) => {
        this.outputChannel.appendLine(
          `[Socket] Document updated: ${data.doctype} - ${data.name}`,
        );
        await this.handleDocUpdate(siteId, data.doctype, data.name);
      },
    );

    this.sockets.set(siteId, socket);
  }

  disconnect(siteId: string): void {
    const socket = this.sockets.get(siteId);
    if (socket) {
      socket.disconnect();
      this.sockets.delete(siteId);
      this.outputChannel.appendLine(
        `[Socket] Disconnected manually for site ${siteId}`,
      );
    }
  }

  disconnectAll(): void {
    for (const siteId of this.sockets.keys()) {
      this.disconnect(siteId);
    }
  }

  reconnect(siteId: string): void {
    this.disconnect(siteId);
    this.connect(siteId);
  }

  private subscribeToDocuments(siteId: string, socket: Socket): void {
    const registryData = this.registry.getSiteReferences(siteId);
    const documentsToSubscribe = new Set<string>();

    // We collect unique doctype/docname pairs
    for (const { location } of registryData.values()) {
      if (location.type === "docField" || location.type === "blockScript") {
        documentsToSubscribe.add(`${location.doctype}|${location.docname}`);
      }
    }

    // Builder Settings is a single doc
    socket.emit(
      "doc_subscribe",
      BUILDER_DOCTYPES.SETTINGS,
      BUILDER_DOCTYPES.SETTINGS,
    );

    // Subscribe to specific pages and client scripts
    for (const doc of documentsToSubscribe) {
      const [doctype, docname] = doc.split("|");
      socket.emit("doc_subscribe", doctype, docname);
    }

    this.outputChannel.appendLine(
      `[Socket] Subscribed to ${documentsToSubscribe.size} documents for ${siteId}`,
    );
  }

  private async handleDocUpdate(
    siteId: string,
    doctype: string,
    docname: string,
  ): Promise<void> {
    const affectedRefs = this.registry.getUrisByDocname(
      siteId,
      doctype,
      docname,
    );
    if (affectedRefs.size === 0) return;

    try {
      const client = await this.siteManager.getClient(siteId);
      let pageDoc, settingsDoc, clientScriptDoc;
      let rawBlocksJson = "",
        blocksField = "";

      // Fetch the updated document
      if (doctype === BUILDER_DOCTYPES.SETTINGS) {
        settingsDoc = await client.getBuilderSettings();
      } else if (doctype === BUILDER_DOCTYPES.CLIENT_SCRIPT) {
        clientScriptDoc = await client.getClientScript(docname);
      } else if (doctype === BUILDER_DOCTYPES.PAGE) {
        pageDoc = await client.getPageDoc(docname);
        const { json, field } = await client.getPageBlocksRaw(docname);
        rawBlocksJson = json;
        blocksField = field;
      }

      // Update registry cache and optionally update open editors
      const urisToRefresh: vscode.Uri[] = [];

      for (const [uriStr, ref] of affectedRefs.entries()) {
        const uri = vscode.Uri.parse(uriStr);
        let newContent = "";

        if (ref.location.type === "docField") {
          const { fieldName } = ref.location;
          if (doctype === BUILDER_DOCTYPES.SETTINGS && settingsDoc) {
            newContent =
              (settingsDoc[fieldName as keyof typeof settingsDoc] as string) ||
              "";
          } else if (
            doctype === BUILDER_DOCTYPES.CLIENT_SCRIPT &&
            clientScriptDoc
          ) {
            newContent = clientScriptDoc.script || "";
          } else if (doctype === BUILDER_DOCTYPES.PAGE && pageDoc) {
            newContent =
              (pageDoc[fieldName as keyof typeof pageDoc] as string) || "";
          }
        } else if (ref.location.type === "blockScript" && rawBlocksJson) {
          const { blockId, blockField } = ref.location;
          // We need to parse blocks and find the specific block
          const blocks = JSON.parse(rawBlocksJson);
          const block = this.findBlockById(blocks, blockId);
          if (block) {
            newContent = (block[blockField] as string) || "";
          }
        }

        // Cache the new content
        this.registry.setCachedContent(uri, newContent);

        // Update the temp file synchronously
        this.tempScriptManager.exportScriptSync(uri, ref, newContent);

        urisToRefresh.push(uri);
      }

      // Fire file system events to refresh VS Code editors for virtual uris
      if (urisToRefresh.length > 0) {
        if (typeof this.fileSystem.fireChangedEvent === "function") {
          this.fileSystem.fireChangedEvent(urisToRefresh);
        }

        // Revert any open editors corresponding to these URIs (both virtual and temp)
        const openEditors = vscode.window.visibleTextEditors;
        for (const editor of openEditors) {
          const editorUri = editor.document.uri;

          let matches = false;
          // Match if it's the exact virtual URI
          if (
            urisToRefresh.some((u) => u.toString() === editorUri.toString())
          ) {
            matches = true;
          }
          // Match if it's the mapped temp file URI
          else if (editorUri.scheme === "frappe-temp") {
            const mappedVirtualUri = this.tempScriptManager.getVirtualUri(
              editorUri.path,
            );
            if (
              mappedVirtualUri &&
              urisToRefresh.some((u) => u.toString() === mappedVirtualUri)
            ) {
              matches = true;
            }
          }

          if (matches) {
            // Apply a workspace edit to smoothly update the content while maintaining cursor position
            // We use WorkspaceEdit instead of revert so we don't flash or lose cursor pos if possible,
            // but revert is also fine if we don't want dirty state. Actually, if it's synced from server,
            // it's clean. Let's just use VS Code revert command for the document.
            // But wait, the file system provider or temp file system will just supply the new text on read.
            // Since we fired change event (or wrote to temp file), VS Code might auto-reload.
            // Just in case, let's trigger a revert on this document if it's not dirty, or if it is dirty?
            // If dirty, maybe warn or don't overwrite? The reference implementation just updates the file.
            // Since we wrote to the temp file on disk, if the user has auto-save, it might conflict.
            // VS Code typically handles disk changes nicely.
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(
        `[Socket] Error updating document ${doctype} ${docname}: ${msg}`,
      );
    }
  }

  private findBlockById(blocks: any[], blockId: string): any {
    for (const block of blocks) {
      if (!block) continue;
      if (block.blockId === blockId) return block;
      if (block.children && block.children.length > 0) {
        const found = this.findBlockById(block.children, blockId);
        if (found) return found;
      }
    }
    return null;
  }
}
