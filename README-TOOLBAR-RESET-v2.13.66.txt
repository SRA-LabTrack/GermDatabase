CaneSprout v2.13.66 — Clean Toolbar Reset

WHY THIS PATCH IS DIFFERENT
The toolbar had accumulated six successive CSS override blocks from v2.13.60
through v2.13.65. Because they all used !important heavily, newer toolbar rules
were fighting older rules. The result was disappearing labels, narrow cells,
and unexplained blank space.

This patch REMOVES those six toolbar override blocks instead of adding a
seventh layer.

ONE CLEAN DESKTOP LAYOUT
  Brand | Germplasm | Pedigree | Map | Tools | Online | Account

- Four equal navigation cells
- Visible desktop labels
- No negative middle strip
- Online in its own bounded cell
- Account in its own bounded cell
- Working body-level Tools portal preserved
- Narrow desktop scales text/spacing without hiding all navigation labels

APPLY
1. Extract directly into the CaneSprout project root.
2. Run:
   APPLY-TOOLBAR-RESET-v2.13.66.cmd
3. Run:
   npm.cmd run verify:toolbar-reset
   npm.cmd run verify:toolbar-tools-portal
   npm.cmd run build
