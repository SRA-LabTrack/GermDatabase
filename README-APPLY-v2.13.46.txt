CaneSprout v2.13.46 - Sharp Vector PDF + Pagination Fix

WHAT THIS FIXES
- Removes the soft/blurry Save PDF output caused by screenshot/JPEG capture.
- Save PDF now draws selectable vector text, borders, headings and RHS color swatches directly in jsPDF.
- Prevents field cards from being sliced at page boundaries.
- Repeats a section heading with "continued" when a long section spans pages.
- Adds a compact variety header to continuation pages.
- Corrects header spacing around "Complete Information" and the generated date.
- Adds Page X of Y footers.
- Keeps Download HTML, Print, Save PDF and Close as separate actions.

HOW TO APPLY
1. Extract this ZIP directly into your CaneSprout project root.
2. Choose Replace files if Windows asks.
3. From the project root run:

   APPLY-PROFILE-PDF-QUALITY-v2.13.46.cmd

4. Verify:

   npm.cmd pkg get version
   npm.cmd run verify:profile-pdf-quality
   npm.cmd run verify:profile-card-print
   npm.cmd run verify:profile-print
   npm.cmd run build

Expected version: 2.13.46
