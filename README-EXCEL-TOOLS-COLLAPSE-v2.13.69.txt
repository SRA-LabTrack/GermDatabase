CaneSprout v2.13.69 — Excel Tools Collapse Control

FIX
The expanded Excel Tools strip previously stayed open until another Excel
action was selected. There was no direct way to dismiss it.

This patch adds a visible "Collapse" button inside the left Excel Tools header
cell.

Behavior:
- Click Tools -> Excel Tools to open the strip.
- Click Collapse to immediately run setShowExcelMenu(false).
- The complete Excel Tools strip disappears.
- No extra expansion column is created.
- Import Excel / Export Excel / Edit in Excel format remain unchanged.
- On smaller desktop widths, the Collapse label hides but its arrow button
  remains available.

APPLY
  APPLY-EXCEL-TOOLS-COLLAPSE-v2.13.69.cmd

VERIFY
  npm.cmd run verify:excel-tools-collapse
  npm.cmd run verify:toolbar-isolated-nav
  npm.cmd run verify:toolbar-tools-portal
  npm.cmd run build
