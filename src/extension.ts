import * as vscode from "vscode";

import exportHtml from "./commands/export.html";
import exportPdf from "./commands/export.pdf";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const commandMap: Record<string, (...args: any[]) => any> = {
  "markdown-pdf-plus.export.html": exportHtml,
  "markdown-pdf-plus.export.pdf": exportPdf,
};

const activate = (context: vscode.ExtensionContext): vscode.ExtensionContext => {
  for (const [commandId, handler] of Object.entries(commandMap)) {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, handler));
  }
  return context;
};

// eslint-disable-next-line @typescript-eslint/no-empty-function
const deactivate = () => {};

export { activate, deactivate };
