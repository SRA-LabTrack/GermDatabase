CaneSprout v2.13.80 — Main Breeding Program + Brochure Transitions

BASE
  v2.13.79

MAIN NAVIGATION
  Before:
    Germplasm | Pedigree | Map | Tools
    Breeding Program was inside Tools.

  Now:
    Germplasm | Pedigree | Map | Breeding Program | Tools

  The five main sections share the primary navigation space evenly.

  Tools now contains:
    Excel Tools
    Add Record
    Combination Registry
    Admin Center (administrators)

BROCHURE
  • Uses almost the full browser viewport.
  • Brochure sheet is slightly larger than v2.13.79.
  • Whole-variety photo is larger.
  • Stalk photo is larger.
  • Eye / Bud photo is larger.

TRANSITIONS
  • Brochure opening: fade + gentle lift/scale.
  • Photo click: backdrop fade + image viewer zoom/fade.
  • Detail click: backdrop fade + focused detail card transition.
  • Expand Full Details: full profile fades/slides smoothly above brochure.
  • Breeding Program opening: fade/scale.
  • Switching SOP / Research Archive / Variety Brochure pages: smooth page-slide/fade.
  • Primary navigation and Breeding Program tabs get press/active transitions.
  • Reduced-motion operating-system preference disables nonessential animation.

APPLY
  APPLY-BROCHURE-MAIN-NAV-v2.13.80.cmd

VERIFY
  npm.cmd pkg get version
  npm.cmd run verify:brochure-main-nav
  npm.cmd run build

EXPECTED VERSION
  "2.13.80"
