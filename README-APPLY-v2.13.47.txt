CaneSprout v2.13.46 -> v2.13.47
Native PDF / Word / Excel profile export patch

WHAT CHANGES
- Keeps the existing sharp vector Save PDF output.
- Adds Save Word (.docx) using real editable paragraphs and tables.
- Adds Save Excel (.xlsx) using real workbook cells.
- Word and Excel are NOT screenshots or pasted images.
- Excel sets explicit column widths and wrap-friendly cell layout.
- Word uses explicit paragraph/table spacing to prevent compressed or overlapping text.
- Core and Complete profile modes can both be exported to all three formats.

INSTALL
1. Extract this ZIP directly into the CaneSprout project root.
2. Replace files if Windows asks.
3. Run:
   APPLY-PROFILE-DOCUMENT-EXPORTS-v2.13.47.cmd
4. Run:
   npm.cmd install
5. Run:
   npm.cmd run verify:profile-document-exports
   npm.cmd run verify:profile-pdf-quality
   npm.cmd run verify:profile-card-print
   npm.cmd run build

WHY NPM INSTALL IS REQUIRED
The Word exporter uses the `docx` package. XLSX is already part of CaneSprout, and jsPDF was added by the previous PDF patch.
