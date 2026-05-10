import * as vscode from "vscode";
import type { CommandContext } from "./types";

const COMMAND_PREFIX = "frappeScriptEditor.";

export function registerAddSite(context: CommandContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${COMMAND_PREFIX}addSite`,
    async () => {
      type Step = {
        prompt: string;
        placeholder: string;
        password?: boolean;
        key: "name" | "url" | "apiKey" | "apiSecret";
      };
      const steps: Step[] = [
        {
          key: "name",
          prompt: "Enter Site Name (Step 1/4)",
          placeholder: "My Site",
        },
        {
          key: "url",
          prompt: "Enter Site URL (Step 2/4)",
          placeholder: "https://mysite.frappe.cloud",
        },
        {
          key: "apiKey",
          prompt: "Enter API Key (Step 3/4)",
          placeholder: "API key from Frappe user settings",
        },
        {
          key: "apiSecret",
          prompt: "Enter API Secret (Step 4/4)",
          placeholder: "API secret",
          password: true,
        },
      ];

      const state: Partial<Record<Step["key"], string>> = {};
      let currentIdx = 0;

      const showStepInput = (idx: number): Promise<string | undefined> => {
        return new Promise((resolve) => {
          const step = steps[idx];
          const input = vscode.window.createInputBox();
          input.prompt = step.prompt;
          input.placeholder = step.placeholder;
          input.password = step.password ?? false;
          input.ignoreFocusOut = true;
          input.value = state[step.key] ?? "";

          if (idx > 0) {
            input.buttons = [vscode.QuickInputButtons.Back];
          }

          input.onDidTriggerButton((btn) => {
            if (btn === vscode.QuickInputButtons.Back) {
              input.hide();
              resolve("__BACK__");
            }
          });

          input.onDidAccept(() => {
            if (input.value.trim()) {
              input.hide();
              resolve(input.value.trim());
            }
          });

          input.onDidHide(() => {
            input.dispose();
            if (!state[step.key]) {
              resolve(undefined);
            }
          });

          input.show();
        });
      };

      while (currentIdx < steps.length) {
        const result = await showStepInput(currentIdx);
        if (result === undefined) return;
        if (result === "__BACK__") {
          currentIdx = Math.max(0, currentIdx - 1);
          continue;
        }
        state[steps[currentIdx].key] = result;
        currentIdx++;
      }

      const { name, url, apiKey, apiSecret } = state as {
        name: string;
        url: string;
        apiKey: string;
        apiSecret: string;
      };

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Adding Site ${name}…`,
          },
          async () => {
            const site = await context.siteManager.addSite(
              name,
              url,
              apiKey,
              apiSecret,
            );
            if (site.hasBuilder === false) {
              vscode.window.showWarningMessage(
                "Site added but Builder app is not installed. Install Builder on this site or click Reload to re-check.",
              );
            } else {
              vscode.window.showInformationMessage(
                `Site "${site.name}" added successfully!`,
              );
            }
            await context.registry.loadAll();
            context.socketManager.connect(site.id);
          },
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to add site: ${msg}`);
      }
    },
  );
}