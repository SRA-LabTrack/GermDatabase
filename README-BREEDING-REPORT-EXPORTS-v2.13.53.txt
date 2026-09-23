CaneSprout v2.13.53 — Breeding Report Layout + Native Exports

WHAT THIS FIXES
- Prevents the Breeding Reports modal from extending beyond the viewport.
- Prevents clipped right-side controls.
- Prevents footer text from running outside the modal.
- Allows input grids, technical-report fields, summary cards, and action buttons
  to wrap cleanly on narrower screens.
- Keeps large Timeline and Breeding Events tables inside horizontal scroll
  containers instead of forcing the entire modal wider.

NEW EXPORT ACTIONS
- Print
- Save PDF
- Save Word
- Save Excel
- Download HTML remains available.

EXPORT QUALITY
PDF
- Generated from vector text, lines, and table cells with jsPDF.
- No html2canvas or screenshot capture.
- Text stays sharp when zooming or printing.
- Long tables paginate row-by-row rather than being sliced as images.
- Includes multi-year timeline, breeding events, and optional Technical Report.

WORD (.docx)
- Real editable Word document.
- Real headings and tables.
- Rows use cantSplit where supported to reduce broken table rows.
- Multi-year timeline and technical report are preserved.

EXCEL (.xlsx)
- Real workbook with separate worksheets:
  Summary
  Timeline (for time-range reports)
  Breeding Events
  Technical Report (when requested)
- Wrapped cells and controlled column widths reduce spacing problems.

APPLY
1. Extract the ZIP directly into your CaneSprout project root.
2. Run:
   APPLY-BREEDING-REPORT-EXPORTS-v2.13.53.cmd
3. Run:
   npm.cmd install
   npm.cmd run verify:breeding-report-exports
   npm.cmd run verify:breeding-report-ranges
   npm.cmd run verify:breeding-reports
   npm.cmd run build
