import crypto from "crypto";
import path from "path";

/**
 * Escapes CSS content to prevent HTML breakout from `<style>` tags.
 * Replaces `</` sequences that could close a style element.
 * Safe for CSS: backslash-escaped `/` is still `/` in CSS.
 */
export const sanitizeCssForStyleTag = (css: string): string => {
  return css.replace(/<\//g, "<\\/");
};

/**
 * Generates a cryptographic nonce for CSP script tags.
 */
export const generateNonce = (): string => {
  return crypto.randomBytes(16).toString("base64");
};

/**
 * Sanitizes a filename by removing null bytes, path separators, and parent refs.
 */
export const sanitizeFilename = (filename: string): string => {
  return filename.replace(/\0/g, "").replace(/[/\\]/g, "").replace(/\.\./g, "");
};

/**
 * Checks whether a resolved file path is within a boundary directory.
 */
export const isPathWithinBoundary = (filePath: string, boundary: string): boolean => {
  const resolved = path.resolve(filePath);
  const resolvedBoundary = path.resolve(boundary);
  return resolved === resolvedBoundary || resolved.startsWith(resolvedBoundary + path.sep);
};

/**
 * Validates a CSS length value (e.g., "70px", "2.5cm").
 * Returns the value if valid, or the default if not.
 */
export const validateCssLength = (value: string, defaultValue: string): string => {
  return /^\d+(\.\d+)?\s*(px|cm|mm|in|pt|pc|em|rem|%)$/.test(value.trim()) ? value : defaultValue;
};

/**
 * Validates a CSS page size value (e.g., "a4", "letter", "210mm 297mm").
 * Returns the value if valid, or the default if not.
 */
export const validatePageSize = (value: string, defaultValue: string): string => {
  const knownSizes = ["a3", "a4", "a5", "b4", "b5", "letter", "legal", "ledger"];
  const trimmed = value.trim().toLowerCase();
  if (knownSizes.includes(trimmed)) return value;
  if (/^(\d+(\.\d+)?\s*(px|cm|mm|in|pt|pc)\s*){1,2}$/.test(trimmed)) return value;
  return defaultValue;
};

/**
 * Builds a CSP policy string with a script nonce for Mermaid.
 */
export const buildCspContent = (nonce: string): string => {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline' https: file:",
    "img-src data: file: https: http:",
    "font-src data: file: https:",
    `script-src 'nonce-${nonce}' https://cdn.jsdelivr.net`,
    "connect-src 'none'",
    "frame-src 'none'",
  ].join("; ");
};
