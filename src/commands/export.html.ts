import * as vscode from "vscode";
import { promises as fs } from "fs";
import * as path from "path";
import * as crypto from "crypto";

import UIMessages from "../constants/uiMessages";
import { isMdDocument, convertFileExtension, checkFileExists } from "../util/general";
import {
  sanitizeCssForStyleTag,
  generateNonce,
  buildCspContent,
  sanitizeFilename,
} from "../util/security";

/**
 * Exports the current Markdown document to HTML.
 *
 * @param isCalledFromExportPdf True if called from `exportPdf()`.
 * @returns A 2-element string array: [inputName, outputName] or ["",""] on failure.
 */
const exportHtml = async (isCalledFromExportPdf = false): Promise<[string, string]> => {
  const config = vscode.workspace.getConfiguration("markdown-pdf-plus");
  const editor = vscode.window.activeTextEditor;

  if (!editor || !isMdDocument(editor?.document)) {
    vscode.window.showErrorMessage(UIMessages.noValidMarkdownFile);
    return ["", ""];
  }
  const doc = editor.document;

  if (doc.isDirty || doc.isUntitled) {
    await doc.save();
  }

  if (!(await printToHtml())) {
    vscode.window.showErrorMessage(UIMessages.exportToHtmlFailed);
    return ["", ""];
  }

  const htmlFilePath = convertFileExtension(doc.fileName, ".md", ".html");

  if (!(await checkFileExists(htmlFilePath, 6000)) && isCalledFromExportPdf) {
    vscode.window.showErrorMessage(UIMessages.exportToPdfFailed);
    return ["", ""];
  }

  try {
    let htmlContent = await fs.readFile(htmlFilePath, "utf-8");

    // Inject CSP meta tag with nonce
    const nonce = generateNonce();
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${buildCspContent(nonce)}">`;
    const headIndex = htmlContent.indexOf("<head>");
    if (headIndex !== -1) {
      htmlContent =
        htmlContent.slice(0, headIndex + 6) + "\n" + cspMeta + htmlContent.slice(headIndex + 6);
    }

    // Inject Mermaid scripts with nonce
    const mermaidScript = `
    <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
    <script nonce="${nonce}">
      mermaid.initialize({ startOnLoad: true });
    </script>`;

    const styleIndex = htmlContent.indexOf("</style>");
    if (styleIndex !== -1) {
      htmlContent =
        htmlContent.slice(0, styleIndex + 8) + mermaidScript + htmlContent.slice(styleIndex + 8);
    } else {
      htmlContent += mermaidScript;
    }

    htmlContent = stripExternalMermaidScripts(htmlContent);
    htmlContent = convertMermaidBlocks(htmlContent);

    // Append user CSS (extension settings)
    const cssPath = config.get<string>("CSSPath", "");
    if (cssPath) {
      try {
        const stylesheetContent = await fs.readFile(cssPath, "utf-8");
        htmlContent += `<style>${sanitizeCssForStyleTag(stylesheetContent)}</style>`;
      } catch {
        console.warn(`[markdown-pdf-plus] Could not read CSS file: ${cssPath}`);
      }
    }

    const rawCss = config.get<string>("CSSRaw", "");
    if (rawCss) {
      htmlContent += `<style>${sanitizeCssForStyleTag(rawCss)}</style>`;
    }

    await fs.writeFile(htmlFilePath, htmlContent, "utf-8");
  } catch (error) {
    vscode.window.showErrorMessage(UIMessages.exportToHtmlFailed);
    console.error("Error modifying HTML content:", error);
    return ["", ""];
  }

  if (!isCalledFromExportPdf) {
    vscode.window.showInformationMessage(UIMessages.exportToHtmlSucceeded);
  }

  // Rename/move output file if configured
  const outputRawFilename = config.get<string>("outputFilename", "");
  const outputFilename = isCalledFromExportPdf
    ? crypto.randomBytes(20).toString("hex")
    : sanitizeFilename(outputRawFilename) || path.parse(doc.fileName).name;
  const outputHome = config.get<string>("outputHome", "");

  if (outputFilename !== path.parse(doc.fileName).name || (outputHome && !isCalledFromExportPdf)) {
    let renameDirectory: string;
    if (outputHome && !isCalledFromExportPdf) {
      await fs.mkdir(outputHome, { recursive: true });
      renameDirectory = outputHome;
    } else {
      renameDirectory = path.parse(doc.fileName).dir;
    }

    try {
      await fs.rename(htmlFilePath, path.join(renameDirectory, `${outputFilename}.html`));
    } catch {
      if (isCalledFromExportPdf) {
        await fs.unlink(htmlFilePath).catch(() => {});
      }
      vscode.window.showErrorMessage(UIMessages.renamingOrMovingHtmlFailed);
      return ["", ""];
    }
  }
  return [path.parse(doc.fileName).name, `${outputFilename}.html`];
};

const printToHtml = async (): Promise<boolean> => {
  const ext = vscode.extensions.getExtension("markdown-all-in-one");
  try {
    if (ext && !ext.isActive) {
      await ext.activate();
    }
    await vscode.commands.executeCommand("markdown.extension.printToHtml");
    return true;
  } catch {
    return false;
  }
};

const convertMermaidBlocks = (html: string): string => {
  // Match both patterns:
  //   <pre><code class="language-mermaid">…</code></pre>  (raw markdown-it output)
  //   <pre class="mermaid" …>…</pre>                      (bierner.markdown-mermaid output)
  html = html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    (_, content) => `<pre class="mermaid">${decodeMermaidEntities(content)}</pre>`
  );
  html = html.replace(
    /<pre class="mermaid"[^>]*>([\s\S]*?)<\/pre>/g,
    (_, content) => `<pre class="mermaid">${decodeMermaidEntities(content)}</pre>`
  );
  return html;
};

const decodeMermaidEntities = (text: string): string => {
  // Decode only entities that break Mermaid parsing.
  // Keep &lt; so <br/> stays as text (Mermaid line-break directive).
  // Keep &amp; to avoid bare ampersand issues in HTML.
  return text
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
};

const stripExternalMermaidScripts = (html: string): string => {
  // Remove bierner.markdown-mermaid config span
  html = html.replace(/<span id="markdown-mermaid"[^>]*><\/span>/g, "");
  // Remove bierner.markdown-mermaid inline script bundle
  html = html.replace(
    /\/\* From extension bierner\.markdown-mermaid \*\/[\s\S]*?<\/script>/g,
    "</script>"
  );
  return html;
};

export default exportHtml;
