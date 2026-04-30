# Change Log

All notable changes to the "markdown-pdf-plus" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- **Table styling presets** — new `tableStyle` setting with four options: `none`, `minimal`, `bordered` (default), and `striped`
- **Custom Chromium path** — `chromiumPath` setting (machine-scope) lets users point to a locally installed Chrome or Chromium binary instead of the auto-resolved one
- **Sandbox control** — `puppeteerSandbox` setting (machine-scope, `auto`/`on`/`off`) for environments where the default Chromium sandbox is unavailable (e.g., Linux containers)
- **External resource control** — `allowExternalResources` setting to restrict file reads to the current workspace when working with untrusted content
- **PDF timeout** — `pdfTimeout` setting (default: 60 s, minimum: 5 s) for documents that take longer to render
- **VS Code progress notification** — a progress bar appears in the status area during PDF export
- **Output channel** — all export activity, warnings, and errors are logged to the "Markdown PDF Plus" output channel (View → Output → Markdown PDF Plus)
- **Content Security Policy** — nonce-based CSP applied to Mermaid script tags; each export gets a fresh cryptographic nonce
- **CSS sanitization** — `</style>` sequences in `CSSRaw` and `CSSPath` content are escaped before being written into the output HTML to prevent style-tag injection
- **CI/CD pipeline** — `pr.yml` quality gate (compile, lint, build, package) and `publish.yml` automated Marketplace publishing workflow
- **CONTRIBUTING.md** — contributor and maintainer documentation

### Changed

- Puppeteer updated from 20 → 24; `puppeteer-chromium-resolver` updated to match
- cheerio updated from `1.0.0-rc.12` → `1.2.0` (stable release)
- TypeScript updated from 5.0 → 5.9
- Build system migrated to **esbuild** bundler; extension bundle size reduced from ~17 MB to ~2 MB
- VS Code engine minimum bumped from `^1.75.0` → `^1.85.0`
- All filesystem operations converted to async (`fs.promises`) for improved performance under load
- HTML is now parsed by cheerio once per export (previously 3–4 separate parse/serialize cycles)
- Mermaid render failures now emit a VS Code warning notification instead of failing silently
- `.vscodeignore` tightened — published VSIX size reduced from 14.35 MB → 4.94 MB

### Fixed

- Extension activation: `context.subscriptions.push()` was called with unresolved Promises instead of `Disposable` objects; command registration now correctly pushes the resolved `Disposable`
- `doc.save()` was fire-and-forget before export; it is now properly `await`ed to ensure unsaved edits are included in the output
- Chromium browser instance is now always closed in a `finally` block, preventing zombie processes when export errors occurred mid-render
- Dynamic `import()` calls were incompatible with esbuild bundling; replaced with a static command-to-handler map

## [1.1.0]

- Contributed settings `markdown-pdf-plus.CSSPath` and `markdown-pdf-plus.CSSRaw` to enable globally
  setting styles that are applied to all exports.

## [1.0.0]

- Initial release