CaneSprout v2.13.64 — Stable Desktop Toolbar

ROOT CAUSE
The earlier desktop layout rules used:
  .reference-toolbar:not(:has(.mobile-toolbar-toggle))

CaneSprout keeps the mobile toolbar toggle in the DOM even when it is hidden on
desktop. That meant the desktop equal-width rules could fail to match entirely.

FIX
- Desktop detection now uses @media (min-width: 761px).
- No :has() dependency.
- Primary navigation consumes all remaining width.
- Germplasm, Pedigree, Map, and Tools each receive an equal quarter.
- Online and account blocks remain bounded.
- Portal-based Tools dropdown remains unchanged and functional.
- At narrow desktop widths labels hide before any overlap.

Apply:
  APPLY-TOOLBAR-STABLE-v2.13.64.cmd

Verify:
  npm.cmd run verify:toolbar-stable
  npm.cmd run verify:toolbar-tools-portal
  npm.cmd run build
