CaneSprout v2.13.83 — Reuse Existing germ-media Bucket

WHY THIS PATCH EXISTS

Appwrite Free allows only one Storage bucket.
Your project already uses:

  Bucket name: Sugarcane Photos
  Bucket ID:   germ-media

The old Breeding Program setup attempted to create:

  breeding-program

and Appwrite rejected it with:

  403 additional_resource_not_allowed
  maximum number of buckets reached

YOUR SCREENSHOT CONFIRMED germ-media ALREADY ALLOWS:

  webp
  jpg
  png
  gif
  pdf
  doc
  docx
  xls
  xlsx
  zip
  mp4

So no second bucket is necessary.

WHAT v2.13.83 CHANGES

1. Breeding Program file storage now uses:
     germ-media

2. Existing sugarcane photos are NOT moved, deleted, renamed, or changed.

3. SOP and Research Archive document records still live in:
     breeding_program_documents

   The database metadata keeps documents logically separated from variety photos.

4. setup:breeding-program no longer creates a bucket.

   It now verifies:
     - breeding_program_documents exists
     - germ-media exists
     - PDF/DOC/DOCX/XLS/XLSX extensions are allowed

5. CSV was removed from the Research Archive upload picker because your
   current germ-media settings do not include csv.

   If you want CSV later, simply add:
     csv

   under:
     Appwrite > Storage > Sugarcane Photos > Settings > File extensions

   and it can be enabled in CaneSprout again.

APPLY

  APPLY-BREEDING-STORAGE-REUSE-v2.13.83.cmd

VERIFY

  npm.cmd pkg get version
  npm.cmd run verify:breeding-storage-reuse
  npm.cmd run setup:breeding-program
  npm.cmd run build

EXPECTED VERSION

  "2.13.83"

IMPORTANT

After installing v2.13.83, running:

  npm.cmd run setup:breeding-program

is safe. It will VERIFY/REUSE germ-media and will NOT attempt to create
a second Appwrite storage bucket.
