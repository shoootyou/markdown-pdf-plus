import * as vscode from "vscode";
import { promises as fsAsync } from "fs";
import * as fs from "fs";
import * as path from "path";
import puppeteer, { Browser, Page } from "puppeteer";
import { load, type CheerioAPI } from "cheerio";
import PCR from "puppeteer-chromium-resolver";
import * as crypto from "crypto";

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
  const config = vscode.workspace.getConfiguration("markdown-pdf-plus");
  const [inputMarkdownFilename, inputHtmlFilename] = await exportHtml(true);

  if (!inputHtmlFilename) {
    return false;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor || !isMdDocument(editor?.document)) {
    vscode.window.showErrorMessage(UIMessages.noValidMarkdownFile);
    return false;
  }
  const doc = editor.document;

  let inputHtmlHome = path.parse(doc.fileName).dir;
  if (!inputHtmlHome) {
    if (!vscode.window.activeTextEditor) {
      await fsAsync.unlink(inputHtmlFilename).catch(() => {});
      vscode.window.showErrorMessage(UIMessages.exportToPdfFailed);
      return false;
    }
    inputHtmlHome = path.parse(vscode.window.activeTextEditor.document.fileName).dir;
  }

  const inputHtmlPath = path.join(inputHtmlHome, inputHtmlFilename);

  let outputPdfHome = config.get<string>("outputHome", "");
  if (!outputPdfHome) {
    if (!vscode.window.activeTextEditor) {
      await fsAsync.unlink(inputHtmlPath).catch(() => {});
      vscode.window.showErrorMessage(UIMessages.exportToPdfFailed);
      return false;
    }
    outputPdfHome = path.parse(vscode.window.activeTextEditor.document.fileName).dir;
  }

  const outputPdfFilename = `${config.get<string>("outputFilename", "") || inputMarkdownFilename}.pdf`;
  const outputPdfPath = path.join(outputPdfHome, outputPdfFilename);

  const success = await convertHtmlToPdf(inputHtmlPath, outputPdfPath);
  await fsAsync.unlink(inputHtmlPath).catch(() => {});

  if (success) {
    vscode.window.showInformationMessage(conditionalUIMessage);
  } else {
    vscode.window.showErrorMessage(UIMessages.exportToPdfFailed);
  }
  return success;
};

const convertHtmlToPdf = async (htmlFilePath: string, pdfFilePath: string): Promise<boolean> => {
  const tempHtmlFilePath = path.join(
    path.dirname(htmlFilePath),
    `${crypto.randomBytes(20).toString("hex")}.html`
  );

  try {
    const config = vscode.workspace.getConfiguration("markdown-pdf-plus");

    const preferCSSPageSize = config.get<boolean>("usePageStyleFromCSS", false);
    const executablePath = await resolveChromiumPath(config);
    const sandboxMode = config.get<string>("puppeteerSandbox", "auto") || "auto";
    const browser = await launchBrowser(executablePath, sandboxMode);
    const page = await browser.newPage();

    await page.emulateMediaType("screen");

    let rawHtml = await fsAsync.readFile(htmlFilePath, "utf8");

    // Protect Mermaid blocks from cheerio serialization corruption
    const mermaidBlocks: string[] = [];
    rawHtml = rawHtml.replace(
      /<pre class="mermaid">([\s\S]*?)<\/pre>/g,
      (match) => {
        const idx = mermaidBlocks.length;
        mermaidBlocks.push(match);
        return `<!-- __MERMAID_PLACEHOLDER_${idx}__ -->`;
      }
    );

    const allowExternalResources = config.get<boolean>("allowExternalResources", true);
    const workspaceBoundary =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || path.dirname(htmlFilePath);

    // Single cheerio parse for all transforms
    const $ = load(rawHtml);
    replaceLocalImgSrcWithBase64($, allowExternalResources, workspaceBoundary);
    await replaceLocalBackgroundImagesWithBase64($, htmlFilePath, allowExternalResources, workspaceBoundary);
    injectPageStyle($);

    let htmlContent = $.html();

    // Restore Mermaid blocks
    htmlContent = htmlContent.replace(
      /<!-- __MERMAID_PLACEHOLDER_(\d+)__ -->/g,
      (_, idx) => mermaidBlocks[parseInt(idx)]
    );

    await fsAsync.writeFile(tempHtmlFilePath, htmlContent, "utf8");

    await page.goto(`file://${tempHtmlFilePath}`, { waitUntil: "networkidle0" });
    await addExternalStylesheetsToPage(htmlFilePath, page, allowExternalResources, workspaceBoundary);

    // Wait for Mermaid diagrams to finish rendering (if any)
    const hasMermaid = await page.evaluate(
      `document.querySelectorAll("pre.mermaid").length > 0`
    );

    if (hasMermaid) {
      try {
        await page.waitForFunction(
          `Array.from(document.querySelectorAll("pre.mermaid")).every(el => el.querySelector("svg") !== null)`,
          { timeout: 15000 }
        );
      } catch {
        console.warn(
          "[markdown-pdf-plus] Mermaid render timeout — PDF may have incomplete diagrams"
        );
      }
    }

    await page.pdf({
      path: pdfFilePath,
      format: "A4",
      margin: { top: "96px", right: "96px", bottom: "96px", left: "96px" },
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: preferCSSPageSize,
    });

    await browser.close();
    return true;
  } catch (error) {
    console.error("Error converting HTML to PDF:", error);
    return false;
  } finally {
    try {
      await fsAsync.unlink(tempHtmlFilePath);
    } catch {
      // temp file already gone or never created
    }
  }
};

const addExternalStylesheetsToPage = async (
  htmlFilePath: string,
  page: Page,
  allowExternalResources: boolean,
  boundary: string
): Promise<void> => {
  const fileContent = await fsAsync.readFile(htmlFilePath, "utf8");
  const stylesheets = extractStylesheetsFromHtml(fileContent, htmlFilePath);

  conditionalUIMessage = UIMessages.exportToPdfSucceeded;
  for (const stylesheet of stylesheets) {
    if (stylesheet.isExternal) {
      try {
        await page.addStyleTag({ url: stylesheet.path });
      } catch {
        conditionalUIMessage = UIMessages.exportToPdfSucceededExternalCssFailed;
      }
    } else {
      if (!allowExternalResources && !isPathWithinBoundary(stylesheet.path, boundary)) {
        console.warn(`[markdown-pdf-plus] Skipping stylesheet outside workspace: ${stylesheet.path}`);
        continue;
      }
      const stylesheetContent = await fsAsync.readFile(stylesheet.path, "utf8");
      await page.addStyleTag({ content: stylesheetContent });
    }
  }
};

const extractStylesheetsFromHtml = (
  htmlContent: string,
  htmlFilePath: string
): StylesheetInfo[] => {
  const $doc = load(htmlContent);
  const stylesheets: StylesheetInfo[] = [];

  $doc('link[rel="stylesheet"]').each((_, element) => {
    const href = $doc(element).attr("href");
    if (href) {
      const isExternal = isExternalReference(href);
      const stylesheetPath = isExternal ? href : path.resolve(path.dirname(htmlFilePath), href);
      stylesheets.push({ path: stylesheetPath, isExternal });
    }
  });

  return stylesheets;
};

/**
 * Replaces local image src attributes with base64 data URIs (mutates cheerio instance).
 */
const replaceLocalImgSrcWithBase64 = (
  $: CheerioAPI,
  allowExternalResources: boolean,
  boundary: string
): void => {
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
        $(element).attr("src", `data:${mimeType};base64,${imageContent}`);
      } catch {
        console.warn(`[markdown-pdf-plus] Could not read image: ${imagePath}`);
      }
    }
  });
};

/**
 * Inlines background images from linked CSS files as base64 (mutates cheerio instance).
 */
const replaceLocalBackgroundImagesWithBase64 = async (
  $: CheerioAPI,
  htmlFilePath: string,
  allowExternalResources: boolean,
  boundary: string
): Promise<void> => {
  const stylesheets = extractStylesheetsFromHtml($.html(), htmlFilePath);
  for (const stylesheet of stylesheets) {
    if (!stylesheet.isExternal) {
      if (!allowExternalResources && !isPathWithinBoundary(stylesheet.path, boundary)) {
        console.warn(`[markdown-pdf-plus] Skipping CSS outside workspace: ${stylesheet.path}`);
        continue;
      }
      const cssContent = await fsAsync.readFile(stylesheet.path, "utf8");
      const updatedCssContent = replaceLocalUrlsWithBase64(
        cssContent,
        path.dirname(stylesheet.path),
        allowExternalResources,
        boundary
      );

      $("head").append(`<style>${sanitizeCssForStyleTag(updatedCssContent)}</style>`);
    }
  }
};

const replaceLocalUrlsWithBase64 = (
  cssContent: string,
  cssDir: string,
  allowExternalResources: boolean,
  boundary: string
): string => {
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
        return `url(data:${mimeType};base64,${imageContent})`;
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
    case ".webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
};

const isExternalReference = (reference: string): boolean => {
  return /^(https?:)?\/\//i.test(reference);
};

/**
 * Injects @page CSS with margins and page size (mutates cheerio instance).
 */
const injectPageStyle = ($: CheerioAPI): void => {
  const config = vscode.workspace.getConfiguration("markdown-pdf-plus");

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

  $("head").append(`<style>${sanitizeCssForStyleTag(styleContent)}</style>`);
};

/**
 * Resolves the Chromium executable path.
 * Priority: user-configured chromiumPath (machine-scope) → PCR auto-detection.
 */
const resolveChromiumPath = async (
  config: vscode.WorkspaceConfiguration
): Promise<string> => {
  const userPath = config.get<string>("chromiumPath", "");
  if (userPath) {
    try {
      await fsAsync.access(userPath);
      return userPath;
    } catch {
      console.warn(
        `[markdown-pdf-plus] chromiumPath not found: ${userPath}, falling back to auto-detection`
      );
    }
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
