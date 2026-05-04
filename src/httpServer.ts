/**
 * Local HTTP Server for browser → VS Code communication.
 *
 * Allows Frappe Script Editor to:
 *   1. Check if VS Code extension is running (GET /status)
 *   2. Open a specific script in the editor (POST /open)
 *
 * Binds to 127.0.0.1 only for security.
 */

import * as http from "http";
import * as vscode from "vscode";
import type { ScriptRegistry } from "./scriptRegistry";
import type { SiteManager } from "./siteManager";
import type { OpenScriptRequest } from "./types";

export class HttpServer {
  private server: http.Server | null = null;
  private port: number;
  private registry: ScriptRegistry;
  private siteManager: SiteManager;
  private outputChannel: vscode.OutputChannel;

  constructor(
    port: number,
    registry: ScriptRegistry,
    siteManager: SiteManager,
    outputChannel: vscode.OutputChannel,
  ) {
    this.port = port;
    this.registry = registry;
    this.siteManager = siteManager;
    this.outputChannel = outputChannel;
  }

  start(): void {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      // CORS headers for local dev servers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || "/", `http://127.0.0.1:${this.port}`);

      if (req.method === "GET" && url.pathname === "/status") {
        this.handleStatus(res);
      } else if (req.method === "POST" && url.pathname === "/open") {
        this.handleOpen(req, res);
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    this.server.listen(this.port, "127.0.0.1", () => {
      this.outputChannel.appendLine(
        `HTTP server listening on http://127.0.0.1:${this.port}`,
      );
    });

    this.server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        this.outputChannel.appendLine(
          `Port ${this.port} is in use. HTTP server not started. Change the port in settings (frappeScriptEditor.httpServerPort).`,
        );
        vscode.window.showWarningMessage(
          `Frappe Script Editor: Port ${this.port} is in use. Browser integration unavailable. Change the port in settings.`,
        );
      } else {
        this.outputChannel.appendLine(`HTTP server error: ${err.message}`);
      }
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.outputChannel.appendLine("HTTP server stopped.");
    }
  }

  dispose(): void {
    this.stop();
  }

  // ── Handlers ──────────────────────────────────────────────────────────

  private handleStatus(res: http.ServerResponse): void {
    const pkg = require("../package.json");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        active: true,
        version: pkg.version || "0.1.0",
        extension: "frappe-script-editor",
      }),
    );
  }

  private handleOpen(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", async () => {
      try {
        const data: OpenScriptRequest = JSON.parse(body);

        if (!data.site || !data.doctype || !data.docname) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Missing required fields: site, doctype, docname",
            }),
          );
          return;
        }

        this.outputChannel.appendLine(
          `Open request: ${data.doctype}/${data.docname}/${data.field || data.blockField || ""}`,
        );

        // Find the matching script reference
        const result = this.registry.findByDocReference(
          data.site,
          data.doctype,
          data.docname,
          data.field,
          data.blockId,
          data.blockField,
        );

        if (result) {
          // Open the file in VS Code
          const doc = await vscode.workspace.openTextDocument(result.uri);
          await vscode.window.showTextDocument(doc, { preview: false });

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ success: true, path: result.uri.toString() }),
          );
        } else {
          // Script not found in registry — maybe site not configured
          const site = this.siteManager.findSiteByUrl(data.site);
          if (!site) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: `Site "${data.site}" is not configured in VS Code. Add it from the Frappe Script Editor sidebar.`,
              }),
            );

            vscode.window.showWarningMessage(
              `Frappe Script Editor: Site "${data.site}" is not configured. Add it from the sidebar.`,
            );
          } else {
            // Site exists but script not in registry — try reloading
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: `Script not found. Try refreshing the scripts list in VS Code.`,
              }),
            );

            vscode.window.showWarningMessage(
              `Frappe Script Editor: Script not found for ${data.doctype}/${data.docname}. Try refreshing the scripts list.`,
            );
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg }));
      }
    });
  }
}
