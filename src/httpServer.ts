/**
 * Local HTTP Server for browser → VS Code communication.
 *
 */

import * as http from "http";
import * as vscode from "vscode";

export class HttpServer {
  private server: http.Server | null = null;

  constructor(
    private port: number,
    private outputChannel: vscode.OutputChannel,
  ) {}

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
          `Port ${this.port} is in use. HTTP server not started.`,
        );
        vscode.window.showWarningMessage(
          `Frappe Script Editor: Port ${this.port} is in use. Browser integration unavailable.`,
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

  // ── Handlers ──────────────────────────────────────────────────────────

  private handleStatus(res: http.ServerResponse): void {
    const pkg = require("../package.json");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        active: true,
        version: pkg.version || "0.1.0",
        extension: "frappe-script-editor",
        uriScheme: vscode.env.uriScheme,
        name: vscode.env.appName,
      }),
    );
  }
}
