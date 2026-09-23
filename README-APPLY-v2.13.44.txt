CaneSprout v2.13.44 - Core Print Fix + Preview/Download Flow
============================================================

WHAT THIS FIXES
1. Core Information no longer produces an empty-looking printable sheet.
   Core fields always render and use "Not recorded" when a value is genuinely missing.
2. Card printing now merges the hydrated full record with useful locally cached preview values.
3. Choosing Core Information or Complete Information no longer triggers the browser print dialog immediately.

NEW PREVIEW FLOW
- Choose Core Information or Complete Information.
- CaneSprout opens a clean printable preview in a new window.
- Preview toolbar offers:
  * Download: saves a standalone printable .html file.
  * Print / Save PDF: opens the browser's normal print dialog, where Save as PDF is also available.
  * Close: closes the preview.

INSTALL
1. Extract all contents directly into the CaneSprout project root.
2. Replace files if Windows asks.
3. Run:

   APPLY-PROFILE-PRINT-PREVIEW-v2.13.44.cmd

4. Verify:

   npm.cmd pkg get version
   npm.cmd run verify:profile-print-preview
   npm.cmd run verify:profile-card-print
   npm.cmd run verify:profile-print
   npm.cmd run verify:origin-attribute-coordinates
   npm.cmd run verify:profile-trait-visuals
   npm.cmd run verify:profile-map-exact
   npm.cmd run verify:variety-map-web
   npm.cmd run verify:variety-map-precision
   npm.cmd run verify:variety-map-performance
   npm.cmd run verify:variety-map-transition
   npm.cmd run verify:variety-map-profile-return
   npm.cmd run audit:variety-map-coverage
   npm.cmd run build

Expected version: 2.13.44
