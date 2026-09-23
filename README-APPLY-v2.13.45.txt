CaneSprout v2.13.44 -> v2.13.45
Separate Print and Save PDF

WHAT CHANGES
- Preview toolbar becomes:
  Download HTML | Print | Save PDF | Close
- Print uses the browser/system printer dialog only.
- Save PDF is a separate action that downloads a real PDF file.
- Core and Complete preview modes both support the four actions.
- PDF generation is lazy-loaded only after Save PDF is clicked.

HOW TO APPLY
1. Extract this ZIP directly into your CaneSprout project root.
2. Run:
   APPLY-PROFILE-PRINT-ACTIONS-v2.13.45.cmd
3. Install the two PDF dependencies:
   npm.cmd install
4. Verify:
   npm.cmd pkg get version
   npm.cmd run verify:profile-print-actions
   npm.cmd run verify:profile-card-print
   npm.cmd run verify:profile-print
   npm.cmd run build

Expected version: 2.13.45

The Save PDF renderer uses html2canvas + jsPDF and is loaded dynamically, so it does not load with the normal registry screen.
