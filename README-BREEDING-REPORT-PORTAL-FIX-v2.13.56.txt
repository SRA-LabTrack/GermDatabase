CaneSprout v2.13.56 — Breeding Reports Portal + Scrolling Fix

ROOT CAUSE
BreedingReportsPanel was rendered inside CombinationRegistryModal. The parent
modal/backdrop creates its own clipping/overflow context, so a nested fixed
Breeding Reports overlay could still be cropped at the right edge and could
lose reliable wheel/scroll behavior.

FIX
- Breeding Reports now uses React createPortal(..., document.body).
- It is no longer a visual/layout child of Combination Registry.
- The overlay remains below CaneSprout's measured global toolbar.
- Header and footer are outside the scrolling region.
- Only the report body scrolls vertically.
- A visible scrollbar is reserved and styled.
- Close has a guaranteed width and cannot be cropped by the report body.
- Escape closes Breeding Reports in capture phase.
- Background page scrolling is locked while Breeding Reports is open and
  restored when it closes.

APPLY
1. Extract this ZIP directly into the CaneSprout project root.
2. Run:
   APPLY-BREEDING-REPORT-PORTAL-FIX-v2.13.56.cmd
3. Run:
   npm.cmd run verify:breeding-report-portal
   npm.cmd run verify:breeding-report-toolbar-offset
   npm.cmd run verify:breeding-report-close
   npm.cmd run build

TEST
- Open Combination Registry -> Breeding Reports.
- Confirm Close is fully visible before generating a report.
- Generate a long weekly multi-year report.
- Scroll using mouse wheel, scrollbar, PageDown, and touchpad.
- Confirm header and Close remain visible while only the report body scrolls.
- Click Close and confirm you return to Combination Registry.
