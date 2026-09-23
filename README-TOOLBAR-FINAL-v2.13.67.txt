CaneSprout v2.13.67 — Final Toolbar Geometry + Verifier Fix

WHAT THE SCREENSHOT SHOWED
The v2.13.66 cleanup succeeded, but the fourth Tools cell was still inheriting
layout behavior that made it absorb the remaining navigation width. This
squeezed Germplasm, Pedigree, and Map and truncated their labels.

THIS PATCH
- Replaces the v2.13.66 toolbar block instead of appending another one.
- Locks the navigation into four explicit equal columns.
- Explicitly positions navigation children 1 through 4.
- Forces Tools to column 4 instead of allowing it to absorb extra width.
- Restores readable 13px desktop labels.
- Keeps Online and Account in their dedicated outer columns.
- Keeps the working body-level Tools portal.

VERIFIER FIX
The old verify:toolbar-tools-portal script was written for v2.13.62 and was
correctly reporting failures after the old v2.13.62 CSS marker was removed.
v2.13.67 replaces that verifier with a behavior-based test that works with the
current toolbar version.

APPLY
  APPLY-TOOLBAR-FINAL-v2.13.67.cmd

VERIFY
  npm.cmd run verify:toolbar-final
  npm.cmd run verify:toolbar-tools-portal
  npm.cmd run build
