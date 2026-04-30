/**
 * Default table CSS presets for PDF output.
 * These supplement (never replace) user-provided CSS.
 */

export type TableStylePreset = "none" | "minimal" | "bordered" | "striped";

const baseTableCss = `
/* Page break handling */
table { page-break-inside: auto; width: 100%; border-collapse: collapse; }
tr { page-break-inside: avoid; page-break-after: auto; }
thead { display: table-header-group; }
tfoot { display: table-footer-group; }

/* Wide table overflow */
td, th { word-wrap: break-word; overflow-wrap: break-word; }
`;

const minimalCss = `
${baseTableCss}
th, td { padding: 6px 12px; text-align: left; vertical-align: top; }
th { font-weight: 600; border-bottom: 2px solid #d0d7de; }
td { border-bottom: 1px solid #d0d7de; }
`;

const borderedCss = `
${baseTableCss}
th, td {
  padding: 6px 12px;
  text-align: left;
  vertical-align: top;
  border: 1px solid #d0d7de;
}
th { font-weight: 600; background-color: #f6f8fa; }
`;

const stripedCss = `
${baseTableCss}
th, td {
  padding: 6px 12px;
  text-align: left;
  vertical-align: top;
  border: 1px solid #d0d7de;
}
th { font-weight: 600; background-color: #f6f8fa; }
tbody tr:nth-child(even) { background-color: #f6f8fa; }
`;

const presets: Record<TableStylePreset, string> = {
  none: baseTableCss,
  minimal: minimalCss,
  bordered: borderedCss,
  striped: stripedCss,
};

export const getTableCss = (preset: string): string => {
  const key = (preset || "bordered").toLowerCase() as TableStylePreset;
  return presets[key] ?? presets.bordered;
};
