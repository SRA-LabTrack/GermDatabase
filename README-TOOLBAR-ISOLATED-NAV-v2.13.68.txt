CaneSprout v2.13.68 — Isolated Primary Navigation

This patch stops trying to reuse the legacy toolbar item classes.

The complete center navigation is replaced by a new DesktopPrimaryNav component:

  Germplasm | Pedigree | Map | Tools
      1fr       1fr      1fr    1fr

WHY
The screenshot showed Tools still inheriting legacy toolbar sizing and absorbing
the rest of the navigation width. Because the old classes had years of layout
rules attached to them, another CSS override was not reliable.

FIX
- New DesktopPrimaryNav.jsx
- New cs-primary-nav / cs-primary-nav__item classes
- No toolbar-tile or toolbar-tools-drawer classes in the four center cells
- Exactly four equal CSS Grid columns
- Tools dropdown implemented inside the same component
- Tools dropdown portals directly to document.body
- Tools popover coordinates and z-index are inline, so old CSS cannot hide it
- Click outside and Escape close the Tools menu
- Tool-menu clicks remain clickable
- v2.13.67 toolbar block is replaced rather than stacked

APPLY
  APPLY-TOOLBAR-ISOLATED-NAV-v2.13.68.cmd

VERIFY
  npm.cmd run verify:toolbar-isolated-nav
  npm.cmd run verify:toolbar-tools-portal
  npm.cmd run build
