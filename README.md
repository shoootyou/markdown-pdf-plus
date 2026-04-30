# Markdown PDF Plus

Export Markdown as PDF or HTML — with custom CSS, Mermaid diagrams, table styling presets, and security-hardened rendering.

![CI](https://github.com/ThomasLatham/markdown-pdf-plus/actions/workflows/pr.yml/badge.svg)
![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/tom-latham.markdown-pdf-plus)
![Installs](https://img.shields.io/visual-studio-marketplace/i/tom-latham.markdown-pdf-plus)

---

## Features

- **Export to PDF** — renders your Markdown through Chromium (via Puppeteer) for pixel-accurate output
- **Export to HTML** — produces a self-contained HTML file ready to share or further process
- **Mermaid diagram support** — diagrams in fenced code blocks are rendered automatically
- **Custom CSS** — apply styles via a stylesheet file (`CSSPath`) or inline CSS string (`CSSRaw`)
- **Table styling presets** — choose from four built-in table styles: `none`, `minimal`, `bordered`, or `striped`
- **Progress notifications** — VS Code progress bar during PDF export so you always know what's happening
- **Detailed logging** — all export activity is written to the **Markdown PDF Plus** output channel
- **Security hardening** — nonce-based CSP for Mermaid scripts, CSS sanitization, and configurable sandbox mode

---

## Requirements

- **VS Code 1.85** or later
- **[Markdown All in One](https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one)** extension — installed automatically as a dependency
- **Chromium** — downloaded automatically on first use via `puppeteer-chromium-resolver`; no manual setup needed

---

## Usage

### Export PDF

1. Open a Markdown file in a VS Code editor.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **Markdown PDF Plus: Export PDF**.
4. A progress notification appears while the PDF is generated.
5. The PDF is saved alongside your Markdown file (or to your configured `outputHome` directory).

![Export PDF](public/recording_export_pdf.gif)

### Export HTML

1. Open a Markdown file in a VS Code editor.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **Markdown PDF Plus: Export HTML**.

The flow is the same as Export PDF — refer to the demo above.

---

## Extension Settings

All settings are prefixed with `markdown-pdf-plus.`.

### Page Layout

| Setting | Type | Default | Description |
|---|---|---|---|
| `marginTop` | string | `"70px"` | Top margin for exported PDF pages. Accepts CSS length units (`px`, `cm`, `in`, etc.). |
| `marginBottom` | string | `"70px"` | Bottom margin for exported PDF pages. |
| `marginLeft` | string | `"70px"` | Left margin for exported PDF pages. |
| `marginRight` | string | `"70px"` | Right margin for exported PDF pages. |
| `pageSize` | string | `"a4"` | Page size for exported PDFs. Accepts any value valid for the CSS [`@page size`](https://developer.mozilla.org/en-US/docs/Web/CSS/@page/size) descriptor (e.g., `"letter"`, `"a3"`, `"210mm 297mm"`). |
| `usePageStyleFromCSS` | boolean | `false` | When `true`, any [`@page`](https://developer.mozilla.org/en-US/docs/Web/CSS/@page) rule in your CSS takes priority over the margin/pageSize settings above. |

### Output

| Setting | Type | Default | Description |
|---|---|---|---|
| `outputHome` | string | `""` | Directory where exported files are saved (no trailing slash). Defaults to the directory of the source Markdown file. |
| `outputFilename` | string | `""` | Base filename for the exported file (no extension). Defaults to the source filename. |

### Styling

| Setting | Type | Default | Description |
|---|---|---|---|
| `CSSPath` | string | `""` | Path to a CSS file applied to all exports. See [Custom CSS](./docs/customCss.md) for precedence details. |
| `CSSRaw` | string | `""` | Inline CSS string applied to all exports (e.g., `body { color: red; }`). Takes precedence over `CSSPath`. See [Custom CSS](./docs/customCss.md). |
| `tableStyle` | enum | `"bordered"` | Table CSS preset. Options: `none`, `minimal`, `bordered`, `striped`. See [Table Styles](#table-styles). |

### Security

| Setting | Type | Default | Scope | Description |
|---|---|---|---|---|
| `chromiumPath` | string | `""` | machine | Path to a custom Chromium or Chrome executable. Overrides the auto-resolved bundled Chromium. Cannot be set per-workspace. |
| `puppeteerSandbox` | enum | `"auto"` | machine | Chromium sandbox mode: `auto` (tries sandboxed, falls back), `on` (always sandboxed), `off` (always `--no-sandbox`). Cannot be set per-workspace. |
| `allowExternalResources` | boolean | `true` | — | Allow images and stylesheets from outside the workspace to be embedded during export. Disable when working with untrusted content. |

### Performance

| Setting | Type | Default | Description |
|---|---|---|---|
| `pdfTimeout` | number | `60` | Maximum seconds to wait for PDF generation. Minimum: 5. Increase for documents with many images or complex Mermaid diagrams. |

---

## Custom CSS

Styles can be applied in multiple ways. See the [Custom CSS documentation](./docs/customCss.md) for the full precedence order, page-break examples, and a walkthrough using a real-world Markdown resume.

**Quick reference — precedence (highest → lowest):**

1. Inline `style` attributes in HTML embedded in the Markdown source
2. `CSSRaw` setting
3. `CSSPath` setting
4. `<style>` tags or `<link>` elements embedded in the Markdown source

---

## Table Styles

The `tableStyle` setting applies a CSS preset to all tables in the exported PDF.

| Value | Description |
|---|---|
| `none` | No table styles — only page-break handling is applied. Use this when your own CSS fully controls table appearance. |
| `minimal` | Light bottom borders on header and body rows only; no outer border. |
| `bordered` | Full grid — borders on all cells and the outer table edge. *(default)* |
| `striped` | Bordered grid with alternating row background colors for readability. |

> **Tip:** If you use `CSSRaw` or `CSSPath` to style tables, set `tableStyle` to `none` to avoid conflicts.

---

## Security

### Content Security Policy for Mermaid

Mermaid diagrams are rendered using inline scripts. Each script tag is issued a unique cryptographic nonce per export, and a `Content-Security-Policy` header restricts script execution to those nonces only. This prevents injected scripts from running.

### CSS Sanitization

Raw CSS (from `CSSRaw` or `CSSPath`) is sanitized before being written into the output HTML. Any `</style>` sequences are escaped to prevent early tag termination and style-tag injection.

### Sandbox Mode

Chromium's sandbox provides an additional layer of process isolation. The `puppeteerSandbox` setting controls this:

- **`auto`** (default) — tries sandboxed mode first; if launch fails, retries without the sandbox and logs a warning.
- **`on`** — always sandboxed; the export fails if the sandbox cannot be established.
- **`off`** — always runs with `--no-sandbox`; suitable for Linux CI environments or containers where sandboxing is unavailable.

### Machine-Scoped Settings

`chromiumPath` and `puppeteerSandbox` are scoped to machine settings and **cannot be overridden by workspace settings**. This prevents a malicious repository from redirecting the extension to a custom Chromium binary or disabling the sandbox.

### External Resources

Set `allowExternalResources` to `false` when exporting documents from untrusted sources. This prevents the extension from reading images or stylesheets from outside the current workspace folder.

---

## Troubleshooting

**"Chromium not found" or PDF export fails to start**
Chromium is downloaded automatically on first use. If the auto-download fails (e.g., on a restricted network), set `markdown-pdf-plus.chromiumPath` to the path of a locally installed Chrome or Chromium binary.

**PDF generation times out**
Increase `markdown-pdf-plus.pdfTimeout` (default: 60 seconds). Complex documents with many images or large Mermaid diagrams may need 90–120 seconds.

**Sandbox errors on Linux / in containers**
Set `markdown-pdf-plus.puppeteerSandbox` to `"off"`. This is common in Docker containers and Linux CI runners where the kernel does not support the Chromium sandbox.

**Viewing detailed logs**
Open **View → Output** and select **Markdown PDF Plus** from the dropdown. All export steps, warnings, and errors are written here.

---

## Known Issues

### Exporting PDF overwrites HTML

**Steps to reproduce:**
1. Export `my_file.md` to HTML → produces `my_file.html`.
2. Edit and save `my_file.md`.
3. Export `my_file.md` to PDF → produces `my_file.pdf`.

**Expected:** `my_file.html` is unchanged after step 3.  
**Actual:** `my_file.html` is updated with the changes from step 2.

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Release Notes

See the [CHANGELOG](CHANGELOG.md) for a full history of changes.

## License

MIT — see [LICENSE.md](LICENSE.md).

This product also includes third-party software. See the Third-Party Software section of LICENSE.md for details.
