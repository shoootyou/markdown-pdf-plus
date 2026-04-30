import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

const manifest = fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8");
const meta: { name: string; contributes: { commands: Array<{ command: string; title: string }> } } =
  JSON.parse(manifest);

const activate = async (context: vscode.ExtensionContext): Promise<vscode.ExtensionContext> => {
  const disposables = await Promise.all(
    meta.contributes.commands.map(async (commandObj) => {
      const commandFunction = await import(
        `./commands/${commandObj.command.split(`${meta.name}.`)[1]}`
      );
      return vscode.commands.registerCommand(commandObj.command, commandFunction.default);
    })
  );
  context.subscriptions.push(...disposables);
  return context;
};

// eslint-disable-next-line @typescript-eslint/no-empty-function
const deactivate = () => {};

export { activate, deactivate };
