CaneSprout v2.13.65 — Classic-Proportion Updated Toolbar

REFERENCE STYLE
This restores the same clean placement rhythm as the supplied older toolbar,
but keeps the current navigation setup.

Desktop layout:

  Brand | Germplasm | Pedigree | Map | Tools | Online | Account

The four navigation cells are equal inside the middle navigation region.

- No large blank middle strip
- No collapsed tiny navigation cells
- No section overlap
- Readable labels on normal desktop widths
- Labels hide only on genuinely narrow desktop widths
- Online and account sections retain their own clean cells
- Tools keeps the working body-level portal dropdown

Apply:
  APPLY-TOOLBAR-CLASSIC-LAYOUT-v2.13.65.cmd

Verify:
  npm.cmd run verify:toolbar-classic-layout
  npm.cmd run verify:toolbar-tools-portal
  npm.cmd run build
