CaneSprout v2.13.82 — Breeding Program Label + Research PDF Viewer + Editing

BASE VERSION
  v2.13.81

1. MAIN NAVIGATION
  Fixes the cut-off "Breeding Prog..." label.

  The navigation is forced to fit five primary cells:
    Germplasm | Pedigree | Map | Breeding Program | Tools

  Breeding Program receives extra width and may wrap naturally instead of
  showing an ellipsis. Tools remains visible as the fifth cell.

2. RESEARCH ARCHIVE
  Every historical workbook research entry is now clickable.

  Clicking a research entry opens a PDF-style viewer with:
    Year
    Title
    Authors
    Historical source
    Abstract / research text
    Source sheet/row
    Print / Save PDF
    Close

  The viewer is styled as an A4 research document.
  Print / Save PDF uses the browser print dialog and print-specific CSS.

3. ADMINISTRATOR EDITING
  Administrators now see Edit controls for:

  Historical Research Archive entries:
    Title
    Year
    Authors
    Abstract / research text

  Bundled SOP / Protocol entries:
    Title
    Description / summary

  Uploaded Research/SOP documents:
    Title
    SOP code (for uploaded protocols)
    Year / authors (research)
    Description / research text

4. SOURCE TRACEABILITY
  The six bundled protocol PDFs and the original historical research Excel file
  are NOT overwritten.

  Edits to bundled reference entries are stored as shared administrator
  metadata overrides in the existing Breeding Program Appwrite collection.

  Override categories:
    protocol_meta
    research_meta

  This means:
    - users see the edited display content
    - original source files remain preserved
    - edits are shared across connected CaneSprout users

5. APPWRITE
  This patch reuses the existing:
    breeding_program_documents collection
    breeding-program storage bucket

  No new Appwrite attributes are required.

  If Breeding Program shared storage has not been initialized yet, run:
    npm.cmd run setup:breeding-program

APPLY
  APPLY-BREEDING-PROGRAM-EDIT-VIEWER-v2.13.82.cmd

VERIFY
  npm.cmd pkg get version
  npm.cmd run verify:breeding-program-edit-viewer
  npm.cmd run build

EXPECTED VERSION
  "2.13.82"
