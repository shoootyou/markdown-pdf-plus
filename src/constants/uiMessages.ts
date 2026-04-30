"use strict";

const enum UIMessages {
  invalidInputMarkdownPath = "Export failed: Path to Markdown file was not valid.",
  invalidInputMarkdownFile = "Export failed: Input file is not in Markdown.",
  noValidMarkdownFile = "Export failed: No valid Markdown file.",
  exportToHtmlFailed = "Exporting file to HTML failed.",
  exportToHtmlSucceeded = "File successfully exported to HTML.",
  renamingOrMovingHtmlFailed = "Exported HTML could not be renamed and/or moved.",
  exportToPdfFailed = "Exporting file to PDF failed.",
  exportToPdfSucceeded = "File successfully exported to PDF.",
  exportToPdfSucceededExternalCssFailed = "File successfully exported to PDF, but one or more external stylesheets could not be retrieved.",
  chromiumNotFound = "Could not find Chromium. Install Chrome/Chromium or configure 'chromiumPath' in user settings.",
  chromiumLaunchFailed = "Failed to launch Chromium. Check permissions or try setting 'puppeteerSandbox' to 'off'.",
  pdfTimeout = "PDF generation timed out. Try increasing 'pdfTimeout' in settings or simplifying the document.",
  mermaidRenderWarning = "Mermaid diagrams may not have fully rendered. PDF was generated without complete diagrams.",
  fileWriteFailed = "Could not write file. Check disk space and permissions.",
}

export default UIMessages;
