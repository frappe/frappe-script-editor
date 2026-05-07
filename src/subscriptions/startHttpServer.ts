import * as vscode from "vscode";
import * as portfinder from "portfinder";
import { HttpServer } from "../httpServer";

export async function startHttpServer(
  outputChannel: vscode.OutputChannel,
): Promise<{ disposable: vscode.Disposable; httpServer: HttpServer }> {
  const port = await portfinder.getPortPromise({
    port: 59000,
    stopPort: 59021,
  });

  const httpServer = new HttpServer(port, outputChannel);
  httpServer.start();

  const disposable = {
    dispose: () => {
      httpServer.stop();
    },
  };

  return { disposable, httpServer };
}