CaneSprout v2.13.73 — History-Aware Breeding Suggestions

WHY v2.13.72 SHOWED NO SUGGESTIONS

v2.13.72 interpreted the requested "5-year gap" as a difference between the
two varieties' COLLECTION YEARS.

That meant a variety such as Phil 99-1793, which has no collection year
recorded in CaneSprout, could not produce any verified suggestions.

v2.13.73 changes the 5-year rule to the actual COMBINATION HISTORY.

ROLE-AWARE RULE

If the selected variety is entered as MALE:
  - candidates are suggested as FEMALE parents
  - CaneSprout checks prior rows where the selected variety was MALE and the
    candidate was FEMALE

If the selected variety is entered as FEMALE:
  - candidates are suggested as MALE parents
  - CaneSprout checks prior rows where the selected variety was FEMALE and the
    candidate was MALE

A CANDIDATE IS ELIGIBLE WHEN

1. The same role pairing has NEVER been recorded, OR
2. Its most recent recorded same-role combination is at least 5 calendar
   years old.

AND

3. CaneSprout does not find a known direct parent/child relationship through
   three recorded generations.
4. CaneSprout does not find a known shared parent/grandparent/great-grandparent
   through three recorded generations.

CONSERVATIVE DATE HANDLING

- source_date_text from the audited workbook is preferred over normalized
  combination_date because some historic imported rows preserve the original
  breeding year only in source_date_text.
- If a prior cross exists but CaneSprout cannot determine its date, that
  candidate is excluded. The application will not assume the 5-year interval
  has passed.

DISPLAY

- First 20 eligible suggestions appear immediately.
- "Show 20 more" reveals additional eligible suggestions.
- "Show first 20" collapses an expanded list.
- Never-crossed pairings are shown first.
- Previously crossed candidates display their most recent cross date and
  number of years since that cross.
- Clicking a suggestion fills the opposite parent field.

PEDIGREE LIMITATION

Three-generation screening uses ancestry actually recorded in CaneSprout.
Unknown historic pedigree cannot be reconstructed automatically. Candidates
with a known recorded conflict are excluded; missing ancestry is identified
as limited evidence rather than falsely treated as a genetic guarantee.

APPLY

  APPLY-BREEDING-HISTORY-SUGGESTIONS-v2.13.73.cmd

VERIFY

  npm.cmd run verify:breeding-history-suggestions
  npm.cmd run build
