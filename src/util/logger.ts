import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export const getOutputChannel = (): vscode.OutputChannel => {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Markdown PDF Plus");
  }
  return channel;
};

export const log = (message: string): void => {
  getOutputChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
};

export const logError = (message: string, error?: unknown): void => {
  const errMsg = error instanceof Error ? error.message : String(error ?? "");
  getOutputChannel().appendLine(
    `[${new Date().toISOString()}] ERROR: ${message}${errMsg ? ` — ${errMsg}` : ""}`
  );
};
