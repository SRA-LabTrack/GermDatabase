CaneSprout v2.13.72 — Role-Aware Breeding Partner Suggestions

WHAT IT DOES

Inside Record combination:

1. Select/type a MALE variety.
   CaneSprout suggests FEMALE breeding partners.

2. Select/type a FEMALE variety.
   CaneSprout suggests MALE breeding partners.

ELIGIBILITY RULES

A suggestion is only included when all of these local registry checks pass:

- Candidate is not the selected variety.
- Candidate has a recorded collection year.
- Absolute collection-year difference is at least 5 years.
- Candidate is not a recorded parent, grandparent, or great-grandparent of
  the selected variety.
- Selected variety is not a recorded parent, grandparent, or
  great-grandparent of the candidate.
- They do not share a recorded parent, grandparent, or great-grandparent.

This screens out recorded sibling/cousin-type relationships through three
generations of stored pedigree data.

IMPORTANT DATA NOTE

The pedigree screen can only evaluate ancestry that CaneSprout actually has
recorded. Historical or missing parentage cannot be inferred. The interface
states this clearly and does not describe the result as a genetic guarantee.

DISPLAY

- First 20 eligible candidates appear by default.
- Show 20 more reveals the next group.
- Show first 20 collapses an expanded list.
- Candidates with more recorded pedigree evidence are ranked first.
- Clicking a suggestion fills the opposite parent field automatically.

APPLY

  APPLY-BREEDING-SUGGESTIONS-v2.13.72.cmd

VERIFY

  npm.cmd run verify:breeding-suggestions
  npm.cmd run build
