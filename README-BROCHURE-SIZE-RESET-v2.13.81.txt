CaneSprout v2.13.81 — Restore Original Brochure Size

WHY
The v2.13.79 and v2.13.80 brochure size increases were requested while the
browser was displayed at 80% zoom. At normal 100% zoom, those increases make
the brochure unnecessarily large.

THIS PATCH RESTORES ONLY THE ON-SCREEN BROCHURE DIMENSIONS TO v2.13.78.

RESTORED DIMENSIONS
  Brochure modal:  max 1180px wide
  Brochure sheet:  max 860px wide
  Whole photo:     540px minimum height
  Stalk photo:     225px minimum height
  Eye/Bud photo:   250px maximum width
  Masthead:        original 220px scale

PRESERVED FROM LATER VERSIONS
  • Click photos to enlarge
  • Click parentage
  • Click characteristic rows
  • Full-size photo lightbox
  • Focused detail viewer
  • Expand Full Details
  • Brochure/photo/detail/full-profile transitions
  • Breeding Program in the MAIN navigation
  • Five-section primary navigation
  • Reduced-motion accessibility

APPLY
  APPLY-BROCHURE-SIZE-RESET-v2.13.81.cmd

VERIFY
  npm.cmd pkg get version
  npm.cmd run verify:brochure-size-reset
  npm.cmd run build

EXPECTED
  "2.13.81"
