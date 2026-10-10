CaneSprout v2.13.86 — Breeding Program Content-Space Rebalance

BASE
  v2.13.85

GOAL
Give SOP & Protocols, Research Archive, and Variety Brochure more visible
working space while keeping their navigation obvious and readable.

DESKTOP BEFORE
  Large header: about 184 px
  Section tabs: about 96 px
  Total navigation/header: about 280 px

DESKTOP AFTER
  Header: 118 px
  Section tabs: 66 px
  Total navigation/header: 184 px

That returns about 96 px of vertical space to the actual section content.

OTHER CHANGES
  - Outer workspace padding reduced from 24 px to 16 px
  - Smaller X close control
  - Smaller but still prominent Breeding Program title
  - Tab labels remain visible
  - Tab subtitles remain visible on desktop
  - Summary cards reduced in height
  - Search controls reduced in height
  - Protocol cards become denser
  - Research cards become denser
  - Variety Brochure gets the same reclaimed workspace

PRESERVED
  - Map-style full workspace
  - SOP & Protocols
  - Research Archive
  - PDF-style research viewer
  - Administrator editing
  - Variety Brochure
  - Shared germ-media storage
  - Existing transitions
  - Main Tools navigation

APPLY
  APPLY-BREEDING-CONTENT-SPACE-v2.13.86.cmd

VERIFY
  npm.cmd pkg get version
  npm.cmd run verify:breeding-content-space
  npm.cmd run build

EXPECTED VERSION
  "2.13.86"
