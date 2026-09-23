CaneSprout v2.13.62 — Toolbar Portal Menu + Full-Space Layout

ROOT CAUSE
The Tools button was toggling, but its options were still rendered inside the
toolbar hierarchy. Existing toolbar overflow/stacking rules could hide the
dropdown even though React considered it open.

FIX
- New ToolbarToolsMenu component.
- Dropdown is rendered with createPortal(..., document.body).
- Dropdown position is measured from the actual Tools button.
- Repositions on scroll/resize.
- Click outside closes it.
- Escape closes it.
- Clicking a menu item is protected from the outside-click handler.
- Portal uses fixed positioning with z-index 100000.

TOOL OPTIONS
- Excel Tools
- Add record
- Combination Registry
- Admin Center (administrators only)

PROPORTIONS
- Primary navigation is flex: 1 and consumes the previous blank space.
- Germplasm, Pedigree, and Map expand evenly.
- Tools gets one fixed segment.
- Online and account sections remain bounded.

APPLY
1. Extract this ZIP directly into the CaneSprout project root.
2. Run:
   APPLY-TOOLBAR-PORTAL-FIX-v2.13.62.cmd
3. Run:
   npm.cmd run verify:toolbar-tools-portal
   npm.cmd run build
