CaneSprout v2.13.84 — Restore Tools as Main Navigation Section

BASE VERSION
  v2.13.83

MAIN NAVIGATION

The toolbar is permanently:

  Germplasm | Pedigree | Map | Breeding Program | Tools

The five sections share the available primary-navigation width equally.

TOOLS CONTENTS

Tools contains the previous utility actions:

  Excel Tools
    - Import / Export / spreadsheet editing workflow

  Add Record
    - Register a new sugarcane variety

  Combination Registry
    - Male × female breeding history and combinations

  Admin Center
    - Administrator-only approvals and account/administrative tools

Breeding Program is NOT inside Tools.

LAYOUT FIX

Older toolbar CSS could allow the fifth cell to be clipped when:
  - Breeding Program occupied more width
  - Online occupied its own utility column
  - Account controls occupied the right-side utility column

v2.13.84 explicitly pins:
  1 = Germplasm
  2 = Pedigree
  3 = Map
  4 = Breeding Program
  5 = Tools

The Tools cell is also explicitly forced to remain:
  visible
  clickable
  inside the primary navigation track

Breeding Program can wrap to two lines instead of stealing the Tools cell.

APPLY

  APPLY-MAIN-TOOLS-NAV-v2.13.84.cmd

VERIFY

  npm.cmd pkg get version
  npm.cmd run verify:main-tools-nav
  npm.cmd run build

EXPECTED VERSION

  "2.13.84"
