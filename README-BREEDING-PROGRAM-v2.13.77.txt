CaneSprout v2.13.77 — Breeding Program

NEW SECTION
Tools -> Breeding Program

TABS
1. SOP & Protocols
   - Six reference SOP PDFs from the provided files are bundled directly into CaneSprout.
   - All signed-in users can open/download the bundled PDFs, including offline desktop/PWA builds.
   - Administrators can upload additional protocol PDF/DOC/DOCX files to the shared Appwrite library after one-time setup.

2. Research Archive
   - Bundles the provided "Research archiving_ Abstract as of Feb 9 2018 rachel 1980-2017.xlsx".
   - The website reads the workbook with the already-installed SheetJS/xlsx library.
   - Historical research is indexed by sheet/year and exposed through search, year filtering, expandable abstracts, and the original Excel download.
   - Administrators can upload additional PDF/DOC/DOCX/XLS/XLSX/CSV research files to the shared library.

3. Variety Brochure
   - Search any registered CaneSprout variety.
   - Loads its full current registry record.
   - Presents core information in a more visual brochure layout:
       photo
       accession
       country/origin
       collection year
       species
       male/female parentage
       TC/Ha and LKg/TC
       recommended/tested locations
       disease reaction
   - "Open printable brochure" provides an isolated printable A4 preview.
   - Browser Print can print directly or Save as PDF.
   - Download HTML is also available from the printable brochure preview.

SHARED UPLOAD SETUP
Bundled files work immediately without Appwrite changes.

For shared administrator uploads, run once:

  npm.cmd run setup:breeding-program

This uses:
  Collection: breeding_program_documents
  Storage bucket: breeding-program

Permissions:
  Read: signed-in users
  Create/Update/Delete: canesproutadmin

The setup command requires the same temporary APPWRITE_API_KEY workflow used by CaneSprout setup scripts. Revoke the temporary key after setup.

APPLY
  APPLY-BREEDING-PROGRAM-v2.13.77.cmd

VERIFY
  npm.cmd run verify:breeding-program
  npm.cmd run build

NOTE ABOUT THE BROCHURE REFERENCE
The files received for this patch contained six SOP PDFs and one Research Archive Excel workbook. A separate sample variety brochure file was not present in the uploaded files available to the patch. The new brochure therefore improves the current CaneSprout core-data presentation without inventing content from an unavailable reference file. Its layout can be tuned further once the intended brochure sample is uploaded.
