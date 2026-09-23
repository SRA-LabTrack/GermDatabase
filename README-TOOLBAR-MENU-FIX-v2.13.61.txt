CaneSprout v2.13.61 — Toolbar Menu + Proportion Fix

FIXES
- Replaces native <details> Tools menu with a controlled React button/menu.
- Tools reliably opens and closes.
- Clicking outside closes Tools.
- Escape closes Tools.
- Menu item clicks close Tools before opening the selected feature.
- Removes the huge blank middle strip caused by the v2.13.60 grid.
- Uses flex widths for Brand / Primary navigation / Online / Account.
- Prevents account and Online sections from overlapping.
- Keeps responsive narrow-desktop behavior.

APPLY
1. Extract directly into the CaneSprout project root.
2. Run:
   APPLY-TOOLBAR-MENU-FIX-v2.13.61.cmd
3. Run:
   npm.cmd run verify:toolbar-menu-fix
   npm.cmd run verify:toolbar-cleanup
   npm.cmd run build
