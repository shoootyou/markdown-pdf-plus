import * as vscode from "vscode";
import { ExtensionContext, Uri, Webview } from "vscode";
import path from "path";
import { promises as fs } from "fs";

import LanguageIdentifiers from "../constants/languageIdentifiers";

/**
 * Determines whether the given document is Markdown.
 */
const isMdDocument = (doc: vscode.TextDocument | undefined): boolean => {
  /*---------------------------------------------------------------------------------------------
   *  Copyright (c) 2017 张宇. All rights reserved.
   *  Licensed under the MIT License. See LICENSE in the project root for license information.
   *--------------------------------------------------------------------------------------------*/
  if (doc) {
    const extraLangIds = vscode.workspace
      .getConfiguration("markdown.extension")
      .get<Array<string>>("extraLangIds");
    const langId = doc.languageId;
    if (extraLangIds?.includes(langId)) {
      return true;
    }
    if (langId === LanguageIdentifiers.Markdown) {
      return true;
    }
  }
  return false;
};

/**
 * Returns the absolute path to a file located in the MRS package.
 */
const getAbsolutePath = (
  relativePath: string,
  context: ExtensionContext,
  webView?: Webview
): string => {
  if (webView) {
    const uri = Uri.file(context.asAbsolutePath(relativePath));
    return webView.asWebviewUri(uri).toString();
  }
  return context.asAbsolutePath(relativePath);
};

/**
 * Converts a filename from one extension to another.
 */
const convertFileExtension = (
  filename: string,
  currentExtension: string,
  desiredExtension: string
): string => {
  return filename.includes(currentExtension)
    ? filename.replace(currentExtension, desiredExtension)
    : filename + desiredExtension;
};

/**
 * Polls for a file to exist on disk within the given timeout (ms).
 */
const checkFileExists = async (filePath: string, timeout: number): Promise<boolean> => {
  const endTime = Date.now() + timeout;
  while (Date.now() < endTime) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return false;
};

export { convertFileExtension, getAbsolutePath, isMdDocument, checkFileExists };
