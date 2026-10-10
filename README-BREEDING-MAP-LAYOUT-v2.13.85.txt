CaneSprout v2.13.85 — Map-Style Breeding Program Workspace

BASE VERSION
  v2.13.84

GOAL

Make Breeding Program display with the same workspace feel as Variety Map.

BEFORE
  - Rounded floating panel
  - Main toolbar remained visible above it
  - Large curved corners
  - Dialog/card appearance

AFTER
  - Full application overlay like Variety Map
  - 24 px desktop perimeter
  - Crisp rectangular workspace
  - Large title header
  - Square X close control at the upper right
  - Three fixed Breeding Program section tabs
  - One internal scrolling content region
  - Background application is dimmed/blurred underneath

LAYOUT

  Header
    KNOWLEDGE, PROTOCOLS & STATION RESEARCH
    Breeding Program
    description
    [X]

  Navigation
    SOP & Protocols | Research Archive | Variety Brochure

  Workspace
    Scrollable content for the selected section

PRESERVED

  - SOP & Protocols
  - Research Archive
  - Research PDF-style viewer
  - Admin editing
  - SOP / Research uploads
  - Variety Brochure
  - Shared germ-media storage
  - Existing transitions
  - Main toolbar configuration
  - Tools main navigation

APPLY

  APPLY-BREEDING-MAP-LAYOUT-v2.13.85.cmd

VERIFY

  npm.cmd pkg get version
  npm.cmd run verify:breeding-map-layout
  npm.cmd run build

EXPECTED VERSION

  "2.13.85"
