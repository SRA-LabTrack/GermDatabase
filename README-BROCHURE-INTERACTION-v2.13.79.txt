CaneSprout v2.13.79 — Larger Interactive Variety Brochure

BASE VERSION
  v2.13.78

CHANGES
  • Brochure modal now uses almost the full browser window.
  • Brochure sheet is wider and easier to read.
  • Whole-variety photo is larger.
  • Stalk photo is larger.
  • Eye / Bud image is larger.
  • Any available brochure photo can be clicked to open a full-size image viewer.
  • Missing photos remain N/A and are not replaced by unrelated images.
  • Parentage is clickable.
  • Every Agronomic-Morphological Characteristics row is clickable.
  • Clicking a detail opens a large focused viewer so long values are easy to read.
  • Escape closes the photo/detail viewer first, then closes the brochure on the next Escape.
  • Expand Full Details remains available.

APPLY
  APPLY-BROCHURE-INTERACTION-v2.13.79.cmd

VERIFY
  npm.cmd pkg get version
  npm.cmd run verify:brochure-interaction
  npm.cmd run build

EXPECTED VERSION
  "2.13.79"
