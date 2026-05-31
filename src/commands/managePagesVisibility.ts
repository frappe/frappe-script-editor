import * as vscode from "vscode";
import type { CommandContext } from "./types";
import { APP_NAME } from "../utils";
import { DEFAULT_PAGE_LIMIT } from "../builderConfig";

export function registerManagePagesVisibility(
  context: CommandContext,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    `${APP_NAME}.managePagesVisibility`,
    async (arg?: unknown) => {
      const activeSiteId =
        (typeof arg === "string" ? arg : null) ||
        context.treeProvider.currentSiteId;
      if (!activeSiteId) return;

      const allPages = context.registry.getAllPageNodes(activeSiteId);
      if (allPages.length === 0) {
        vscode.window.showInformationMessage("No pages found for this site.");
        return;
      }

      const hiddenNames = new Set(
        context.registry.getHiddenPageNames(activeSiteId),
      );
      const isDefaultMode = hiddenNames.size === 0;

      const buildItems = (
        currentHidden: Set<string>,
        defaultMode: boolean,
      ): vscode.QuickPickItem[] =>
        allPages.map((page, index) => {
          const docname = page.docname ?? page.label;
          const isHiddenByDefault = defaultMode && index >= DEFAULT_PAGE_LIMIT;
          const isHiddenExplicit = currentHidden.has(docname);
          const picked = !(isHiddenByDefault || isHiddenExplicit);

          return {
            label: page.label,
            description: page.description,
            detail: docname,
            picked,
          };
        });

      const resetButton: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon("discard"),
        tooltip: `Reset to default (show first ${DEFAULT_PAGE_LIMIT} pages)`,
      };

      const picker = vscode.window.createQuickPick();
      picker.title = "Manage Visible Pages";
      picker.placeholder = "Search pages... (checked = visible in tree)";
      picker.canSelectMany = true;
      picker.matchOnDescription = true;
      picker.matchOnDetail = true;
      picker.buttons = [resetButton];

      const items = buildItems(hiddenNames, isDefaultMode);
      picker.items = items;
      picker.selectedItems = items.filter((i) => i.picked);

      picker.onDidTriggerButton((button) => {
        if (button === resetButton) {
          const defaultItems = buildItems(new Set(), true);
          picker.items = defaultItems;
          picker.selectedItems = defaultItems.filter((i) => i.picked);
        }
      });

      picker.onDidAccept(() => {
        const selectedDocnames = new Set(
          picker.selectedItems.map((i) => i.detail),
        );
        const newHidden = new Set<string>(
          allPages
            .map((page) => page.docname ?? page.label)
            .filter((docname) => !selectedDocnames.has(docname)),
        );

        context.registry.setHiddenPageNames(activeSiteId, newHidden);
        context.treeProvider.refresh();
        picker.hide();
      });

      picker.onDidHide(() => picker.dispose());
      picker.show();
    },
  );
}
