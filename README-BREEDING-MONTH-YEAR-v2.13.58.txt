CaneSprout v2.13.58 — Explicit Month + Year for Monthly Breeding Reports

Monthly Breeding Reports no longer depend on the browser's native month picker.

Instead, Monthly shows:
- Month: January through December dropdown
- Year: separate numeric year input

Examples:
Month: March      Year: 2018
Month: September  Year: 2026
Month: December   Year: 2027

The generated report still resolves to the correct full calendar month:
September 2026 -> Sep 1, 2026 through Sep 30, 2026.

Old saved YYYY-MM monthly values remain supported as a fallback.

APPLY
1. Extract directly into the CaneSprout project root.
2. Run:
   APPLY-BREEDING-MONTH-YEAR-v2.13.58.cmd
3. Run:
   npm.cmd run verify:breeding-month-year
   npm.cmd run verify:breeding-report-portal-position
   npm.cmd run build
