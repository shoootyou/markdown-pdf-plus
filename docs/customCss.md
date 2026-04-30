This document explains the different ways to style exports with Markdown PDF Plus, the precedence
order when multiple styling methods are used simultaneously, and how to customize page layout via
CSS embedded directly in your Markdown source.

# CSS Precedence

There are several ways to apply styles to exported files. When multiple methods are active at the
same time, styles are applied in the following order (higher entries override lower ones):

1. Inline `style` attributes in raw HTML embedded in the Markdown source
2. Styles defined in the extension setting `markdown-pdf-plus.CSSRaw`
3. Styles defined in a stylesheet located at the path provided by `markdown-pdf-plus.CSSPath`
4. Styles defined in `<style>` tags or referenced by `<link>` elements embedded in the Markdown source

> **Tip:** If you rely on `CSSRaw` or `CSSPath` to style tables, set `markdown-pdf-plus.tableStyle`
> to `"none"` to prevent the built-in table preset from conflicting with your custom rules.
> See [Table Style Interaction](#table-style-interaction) below.

# CSS Sanitization

Before your CSS is written into the export output, Markdown PDF Plus sanitizes it: any occurrence of
`</style>` in the raw text is escaped. This prevents a malformed or malicious CSS string from
closing the `<style>` tag early and injecting arbitrary HTML into the document.

This sanitization applies to both `CSSRaw` and the contents of the file at `CSSPath`. It is
transparent for all normal CSS — the only strings affected are literal `</style>` sequences, which
are not valid in CSS anyway.

# Table Style Interaction

The `markdown-pdf-plus.tableStyle` setting injects a CSS preset for tables before your custom CSS is
applied. The preset targets `table`, `th`, and `td` elements. The available values are:

- **`none`** — no table CSS is injected; only page-break handling is applied
- **`minimal`** — light bottom borders on header cells and body rows only
- **`bordered`** — full grid borders on all cells (default)
- **`striped`** — bordered grid with alternating row background colors

Because `CSSRaw` and `CSSPath` are applied **after** the table preset (see precedence order above),
any table rules in your custom CSS will override the preset. If you want full control over table
appearance, set `tableStyle` to `"none"` and define all table styles yourself.

# Defining Styles within Markdown-Embedded `<style>` Tags

To help explain how this can be done with Markdown PDF Plus, let's reference [this project](https://github.com/ThomasLatham/markdown-resume-template/tree/main/resume), a resume template written in Markdown, styled with CSS, and exported to PDF.

1. Click on the link above to navigate to the `resume` directory in the `markdown-resume-template` repo.

2. Click on `resume.md`, then click "Code" to see the raw Markdown source.

3. Notice the [`<link>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/link) HTML tag at the top of the document. Markdown supports embedded raw HTML, and this element is what pulls in a CSS stylesheet. Key attributes to note:
   - `rel="stylesheet"` — tells the HTML engine this element imports styles
   - `href="resume.css"` — points to the stylesheet (relative to the Markdown file, but can also be an absolute URL)

4. Navigate back to the `resume` directory and open `resume.css`. A few things to highlight:
   - The [`@page`](https://developer.mozilla.org/en-US/docs/Web/CSS/@page) at-rule defines page-specific properties such as margins and page size. Set `markdown-pdf-plus.usePageStyleFromCSS` to `true` so these rules take priority over the extension's margin/pageSize settings.
   - The `body` rule sets a base `font-size` and `font-family` that applies to the whole document unless overridden by a more specific rule.

5. When Markdown PDF Plus exports `resume.md`, the output will reflect all of these styles — matching the `resume.pdf` available in the same directory.

Following these same steps for your own files, or cloning `markdown-resume-template` and adapting it,
is a reliable way to produce finely-tuned PDFs with explicit fonts, margins, and layout.

# Page Breaks

Insert the following HTML anywhere in your Markdown source to force a page break at that point:

```html
<div style="page-break-before: always"></div>
```

This works in both PDF and HTML exports (though it only has a visible effect in PDFs).
