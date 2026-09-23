CaneSprout v2.13.54 — Persistent Breeding Reports Close Control

FIX
The Breeding Reports Close button remains available after a report is generated
and while scrolling through long monthly, quarterly, annual, or multi-year reports.

Changes:
- Sticky Breeding Reports header.
- Close button stays above generated report content.
- Sticky footer remains reachable.
- Escape key closes Breeding Reports from anywhere in the report.
- Added visible "Esc to close" hint on desktop.
- Mobile close control remains compact and reachable.

APPLY
1. Extract the ZIP directly into the CaneSprout project root.
2. Run:
   APPLY-BREEDING-REPORT-CLOSE-v2.13.54.cmd
3. Run:
   npm.cmd run verify:breeding-report-close
   npm.cmd run verify:breeding-report-exports
   npm.cmd run build
