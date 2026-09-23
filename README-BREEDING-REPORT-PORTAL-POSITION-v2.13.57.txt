CaneSprout v2.13.57 — Breeding Reports Button / Portal Position Fix

SYMPTOM
Clicking "Breeding reports" appears to do nothing after v2.13.56.

ROOT CAUSE
An older v2.13.55 CSS rule used:
  inset: auto !important

The v2.13.56 portal tried to position itself with normal inline top/right/
bottom/left values. CSS !important overrides those inline values, so the
portal could render without a usable visible rectangle.

FIX
- Toolbar offset is now passed as CSS custom property --breeding-report-top.
- Final portal inset uses !important:
    inset: var(--breeding-report-top) 0 8px 0 !important
- Explicitly restores pointer events, visibility, opacity and body scrolling.
- Keeps React document.body portal architecture from v2.13.56.

APPLY
1. Extract this ZIP directly into the CaneSprout project root.
2. Run:
   APPLY-BREEDING-REPORT-PORTAL-POSITION-FIX-v2.13.57.cmd
3. Run:
   npm.cmd run verify:breeding-report-portal-position
   npm.cmd run verify:breeding-report-portal
   npm.cmd run build

TEST
- Open Combination Registry.
- Click Breeding reports.
- The Breeding Reports panel must appear immediately below CaneSprout's toolbar.
- Close must be visible.
- Generate a long report and verify mouse/touchpad scrolling.
