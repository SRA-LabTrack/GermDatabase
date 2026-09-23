CaneSprout v2.13.55 — Breeding Reports Toolbar-Overlap Fix

ROOT CAUSE
The Breeding Reports backdrop was fixed to inset: 0 and centered against the
entire browser viewport. CaneSprout's global toolbar is also fixed above the page.
As a result, the upper portion of Breeding Reports could begin behind that
toolbar before any report was generated.

THIS PATCH FIXES THE GEOMETRY
- Combination Registry passes CaneSprout's already-measured toolbarBottom value
  into Breeding Reports.
- Breeding Reports begins toolbarBottom + 8px from the top.
- The overlay ends 8px above the bottom of the viewport.
- The modal uses 100% of only that remaining visible area.
- The report header/title/Close control can no longer begin under the top toolbar.
- Only the report body scrolls.
- Close remains visible in the report header.
- Escape still closes the report.
- Removes the previous lower-right "Esc to close" pseudo overlay so it cannot
  cover report/export controls.

APPLY
1. Extract this ZIP directly into the CaneSprout project root.
2. Run:
   APPLY-BREEDING-REPORT-TOOLBAR-FIX-v2.13.55.cmd
3. Run:
   npm.cmd run verify:breeding-report-toolbar-offset
   npm.cmd run verify:breeding-report-close
   npm.cmd run verify:breeding-report-exports
   npm.cmd run build
