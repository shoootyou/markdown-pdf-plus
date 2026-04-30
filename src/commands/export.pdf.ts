import * as vscode from "vscode";
import * as fs from "fs";
import path = require("path");
import puppeteer, { Browser, Page } from "puppeteer";
import { load } from "cheerio";
import PCR from "puppeteer-chromium-resolver";
import crypto = require("crypto");

import UIMessages from "../constants/uiMessages";
import exportHtml from "./export.html";
import StylesheetInfo from "../interfaces/stylesheetInfo";
import { isMdDocument } from "../util/general";
import {
  sanitizeCssForStyleTag,
  validateCssLength,
  validatePageSize,
  isPathWithinBoundary,
} from "../util/security";

let conditionalUIMessage = "";

const exportPdf = async (): Promise<boolean> => {
  const config: vscode.WorkspaceConfiguration =
    vscode.workspace.getConfiguration("markdown-pdf-plus");
  const [inputMarkdownFilename, inputHtmlFilename] = await exportHtml(true);

  if (inputHtmlFilename) {
    const editor = vscode.window.activeTextEditor;

    if (!editor || !isMdDocument(editor?.document)) {
      vscode.window.showErrorMessage(UIMessages.noValidMarkdownFile);
      return false;
    }
    const doc: vscode.TextDocument = editor.document;

    let inputHtmlHome = path.parse(doc.fileName).dir;
    if (!inputHtmlHome) {
      if (!vscode.window.activeTextEditor) {
        fs.unlink(inputHtmlFilename, () => {
          console.log("Temporary HTML file deleted.");
        });
        vscode.window.showErrorMessage(UIMessages.exportToPdfFailed);
        return false;
      } else {
        inputHtmlHome = path.parse(vscode.window.activeTextEditor.document.fileName).dir;
      }
    }

    const inputHtmlPath = path.join(inputHtmlHome, inputHtmlFilename);

    let outputPdfHome = config.get("outputHome", "");
    if (!outputPdfHome) {
      if (!vscode.window.activeTextEditor) {
        fs.unlink(inputHtmlPath, () => {
          console.log("Temporary HTML file deleted.");
        });
        vscode.window.showErrorMessage(UIMessages.exportToPdfFailed);
        return false;
      } else {
        outputPdfHome = path.parse(vscode.window.activeTextEditor.document.fileName).dir;
      }
    }
    const outputPdfFilename = `${config.get("outputFilename", "") || inputMarkdownFilename}.pdf`;

    const outputPdfPath = path.join(outputPdfHome, outputPdfFilename);

    if (await convertHtmlToPdf(inputHtmlPath, outputPdfPath)) {
      fs.unlink(inputHtmlPath, () => {
        console.log("Temporary HTML file deleted.");
      });

      vscode.window.showInformationMessage(conditionalUIMessage);
      return true;
    } else {
      fs.unlink(inputHtmlPath, () => {
        console.log("Temporary HTML file deleted.");
      });
      vscode.window.showErrorMessage(UIMessages.exportToPdfFailed);
      return false;
    }
  } else {
    return false;
  }
};

const convertHtmlToPdf = async (htmlFilePath: string, pdfFilePath: string): Promise<boolean> => {
  const tempHtmlFilePath = path.join(
    path.dirname(htmlFilePath),
    `${crypto.randomBytes(20).toString("hex")}.html`
  );

  try {
    const config: vscode.WorkspaceConfiguration =
      vscode.workspace.getConfiguration("markdown-pdf-plus");

    const preferCSSPageSize: boolean = config.get("usePageStyleFromCSS", false);
    const executablePath = await resolveChromiumPath(config);
    const sandboxMode = (config.get("puppeteerSandbox", "auto") as string) || "auto";
    const browser = await launchBrowser(executablePath, sandboxMode);
    const page = await browser.newPage();

    // Emulate screen media type to remove default header and footer
    await page.emulateMediaType("screen");

    // 1. read the HTML content
    let rawHtml = await fs.promises.readFile(htmlFilePath, "utf8");

    // Protect Mermaid blocks from cheerio serialization corruption.
    // Extract them before cheerio touches the HTML, re-inject after.
    const mermaidBlocks: string[] = [];
    rawHtml = rawHtml.replace(
      /<pre class="mermaid">([\s\S]*?)<\/pre>/g,
      (match) => {
        const idx = mermaidBlocks.length;
        mermaidBlocks.push(match);
        return `<!-- __MERMAID_PLACEHOLDER_${idx}__ -->`;
      }
    );

    // Security: resolve workspace boundary for file reads
    const allowExternalResources: boolean = config.get("allowExternalResources", true);
    const workspaceBoundary =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || path.dirname(htmlFilePath);

    // 2–4: cheerio-based transforms (now safe — Mermaid blocks are placeholders)
    let htmlContent = await injectPageStyle(
      await replaceLocalBackgroundImagesWithBase64InMemory(
        replaceLocalImgSrcWithBase64(rawHtml, allowExternalResources, workspaceBoundary),
        htmlFilePath,
        allowExternalResources,
        workspaceBoundary
      )
    );

    // Restore Mermaid blocks
    htmlContent = htmlContent.replace(
      /<!-- __MERMAID_PLACEHOLDER_(\d+)__ -->/g,
      (_, idx) => mermaidBlocks[parseInt(idx)]
    );

    // Write the modified HTML content to a temporary file
    fs.writeFileSync(tempHtmlFilePath, htmlContent, "utf8");

    // Set content of the page to the temporary HTML file
    await page.goto(`file://${tempHtmlFilePath}`, { waitUntil: "networkidle0" });
    await addExternalStylesheetsToPage(htmlFilePath, page, allowExternalResources, workspaceBoundary);

    // Wait for Mermaid diagrams to finish rendering (if any)
    const hasMermaid = await page.evaluate(
      () => document.querySelectorAll("pre.mermaid").length > 0
    );

    if (hasMermaid) {
      try {
        await page.waitForFunction(
          () =>
            Array.from(document.querySelectorAll("pre.mermaid")).every(
              (el) => el.querySelector("svg") !== null
            ),
          { timeout: 15000 }
        );
      } catch {
        console.warn(
          "[markdown-pdf-plus] Mermaid render timeout — PDF may have incomplete diagrams"
        );
      }
    }

    // Generate PDF without the header and footer
    await page.pdf({
      path: pdfFilePath,
      format: "A4",
      margin: { top: "96px", right: "96px", bottom: "96px", left: "96px" },
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: preferCSSPageSize,
    });

    await browser.close();
    return true; // Conversion successful
  } catch (error) {
    console.error("Error converting HTML to PDF:", error);
    return false; // Conversion failed
  } finally {
    if (fs.existsSync(tempHtmlFilePath)) {
      fs.unlinkSync(tempHtmlFilePath);
      console.log("Temporary HTML file deleted.");
    }
  }
};

const addExternalStylesheetsToPage = async (
  htmlFilePath: string,
  page: Page,
  allowExternalResources: boolean,
  boundary: string
): Promise<void> => {
  const fileContent = await fs.promises.readFile(htmlFilePath, "utf8");
  const stylesheets = extractStylesheetsFromHtml(fileContent, htmlFilePath);

  conditionalUIMessage = UIMessages.exportToPdfSucceeded;
  for (const stylesheet of stylesheets) {
    if (stylesheet.isExternal) {
      try {
        await page.addStyleTag({ url: stylesheet.path });
      } catch (error) {
        conditionalUIMessage = UIMessages.exportToPdfSucceededExternalCssFailed;
      }
    } else {
      if (!allowExternalResources && !isPathWithinBoundary(stylesheet.path, boundary)) {
        console.warn(`[markdown-pdf-plus] Skipping stylesheet outside workspace: ${stylesheet.path}`);
        continue;
      }
      const stylesheetContent = await fs.promises.readFile(stylesheet.path, "utf8");
      await page.addStyleTag({ content: stylesheetContent });
    }
  }
};

const extractStylesheetsFromHtml = (
  htmlContent: string,
  htmlFilePath: string
): StylesheetInfo[] => {
  const $ = load(htmlContent);
  const stylesheets: StylesheetInfo[] = [];

  // eslint-disable-next-line quotes
  $('link[rel="stylesheet"]').each((_, element) => {
    const href = $(element).attr("href");
    if (href) {
      const isExternal = isExternalReference(href);
      const stylesheetPath = isExternal ? href : path.resolve(path.dirname(htmlFilePath), href);
      stylesheets.push({ path: stylesheetPath, isExternal });
    }
  });

  return stylesheets;
};

const replaceLocalImgSrcWithBase64 = (
  htmlContent: string,
  allowExternalResources: boolean,
  boundary: string
): string => {
  const $ = load(htmlContent);

  $("img[src]").each((_, element) => {
    const src = $(element).attr("src");
    if (src && !isExternalReference(src)) {
      const imagePath = path.resolve(src.replace("file:///", ""));
      if (!allowExternalResources && !isPathWithinBoundary(imagePath, boundary)) {
        console.warn(`[markdown-pdf-plus] Skipping image outside workspace: ${imagePath}`);
        return;
      }
      try {
        const imageContent = fs.readFileSync(imagePath).toString("base64");
        const mimeType = getImageMimeType(imagePath);
        const dataUri = `data:${mimeType};base64,${imageContent}`;
        $(element).attr("src", dataUri);
      } catch {
        console.warn(`[markdown-pdf-plus] Could not read image: ${imagePath}`);
      }
    }
  });

  return $.html();
};

const replaceLocalBackgroundImagesWithBase64InMemory = async (
  htmlContent: string,
  htmlFilePath: string,
  allowExternalResources: boolean,
  boundary: string
): Promise<string> => {
  const $ = load(htmlContent);

  // Process each linked CSS file
  const stylesheets = extractStylesheetsFromHtml(htmlContent, htmlFilePath);
  for (const stylesheet of stylesheets) {
    if (!stylesheet.isExternal) {
      if (!allowExternalResources && !isPathWithinBoundary(stylesheet.path, boundary)) {
        console.warn(`[markdown-pdf-plus] Skipping CSS outside workspace: ${stylesheet.path}`);
        continue;
      }
      const cssContent = await fs.promises.readFile(stylesheet.path, "utf8");
      const updatedCssContent = await replaceLocalUrlsWithBase64(
        cssContent,
        path.dirname(stylesheet.path),
        allowExternalResources,
        boundary
      );

      $("head").append(`<style>${sanitizeCssForStyleTag(updatedCssContent)}</style>`);
    }
  }

  return $.html();
};

const replaceLocalUrlsWithBase64 = async (
  cssContent: string,
  cssDir: string,
  allowExternalResources: boolean,
  boundary: string
): Promise<string> => {
  return cssContent.replace(/url\(["']?(.*?)["']?\)/g, (match, url) => {
    if (!isExternalReference(url)) {
      const imagePath = path.resolve(cssDir, url);
      if (!allowExternalResources && !isPathWithinBoundary(imagePath, boundary)) {
        console.warn(`[markdown-pdf-plus] Skipping CSS resource outside workspace: ${imagePath}`);
        return match;
      }
      try {
        const imageContent = fs.readFileSync(imagePath).toString("base64");
        const mimeType = getImageMimeType(imagePath);
        const dataUri = `data:${mimeType};base64,${imageContent}`;
        return `url(${dataUri})`;
      } catch {
        console.warn(`[markdown-pdf-plus] Could not read CSS resource: ${imagePath}`);
        return match;
      }
    }
    return match;
  });
};

const getImageMimeType = (imagePath: string): string => {
  const extension = path.extname(imagePath).toLowerCase();
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "image/jpeg"; // Default to JPEG if the extension is unknown
  }
};

const isExternalReference = (reference: string): boolean => {
  return /^(https?:)?\/\//i.test(reference);
};

const injectPageStyle = async (htmlContent: string): Promise<string> => {
  const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("markdown-pdf-plus");

  const marginTop = validateCssLength(config.get("marginTop", "70px"), "70px");
  const marginBottom = validateCssLength(config.get("marginBottom", "70px"), "70px");
  const marginLeft = validateCssLength(config.get("marginLeft", "70px"), "70px");
  const marginRight = validateCssLength(config.get("marginRight", "70px"), "70px");
  const pageSize = validatePageSize(config.get("pageSize", "a4"), "a4");

  let styleContent = "@page {";

  if (marginTop) styleContent += ` margin-top: ${marginTop};`;
  if (marginBottom) styleContent += ` margin-bottom: ${marginBottom};`;
  if (marginLeft) styleContent += ` margin-left: ${marginLeft};`;
  if (marginRight) styleContent += ` margin-right: ${marginRight};`;
  if (pageSize) styleContent += ` size: ${pageSize};`;

  styleContent += " }";

  const $ = load(htmlContent);
  $("head").append(`<style>${sanitizeCssForStyleTag(styleContent)}</style>`);

  return $.html();
};

/**
 * Resolves the Chromium executable path.
 * Priority: user-configured chromiumPath (machine-scope) → PCR auto-detection.
 */
const resolveChromiumPath = async (
  config: vscode.WorkspaceConfiguration
): Promise<string> => {
  const userPath = config.get("chromiumPath", "");
  if (userPath && fs.existsSync(userPath)) {
    return userPath;
  }
  if (userPath) {
    console.warn(
      `[markdown-pdf-plus] chromiumPath not found: ${userPath}, falling back to auto-detection`
    );
  }
  try {
    const stats = await PCR({});
    return stats.executablePath;
  } catch {
    throw new Error(
      "Could not find Chromium. Install Chrome/Chromium or set markdown-pdf-plus.chromiumPath in user settings."
    );
  }
};

/**
 * Launches Puppeteer with configurable sandbox mode.
 * - "auto": try sandboxed first, fallback to unsandboxed
 * - "on": always sandboxed (may fail without SUID helpers)
 * - "off": always unsandboxed (--no-sandbox)
 */
const launchBrowser = async (
  executablePath: string,
  sandboxMode: string
): Promise<Browser> => {
  if (sandboxMode === "off") {
    return puppeteer.launch({ args: ["--no-sandbox"], executablePath });
  }
  if (sandboxMode === "on") {
    return puppeteer.launch({ args: [], executablePath });
  }
  // auto: try sandboxed, fallback to unsandboxed
  try {
    return await puppeteer.launch({ args: [], executablePath });
  } catch {
    console.warn("[markdown-pdf-plus] Sandboxed launch failed, retrying without sandbox");
    return puppeteer.launch({ args: ["--no-sandbox"], executablePath });
  }
};

export default exportPdf;
