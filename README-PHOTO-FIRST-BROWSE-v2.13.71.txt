CaneSprout v2.13.71 — Photo-First Germplasm Collection

BEHAVIOR

The normal Germplasm Collection browse view now displays varieties with
uploaded germplasm photos before varieties that use the placeholder image.

Within each group, CaneSprout preserves the original record order.

Example:

Before:
  OO 2569       no photo
  AJAX          no photo
  Akoki green   no photo
  CP 72-2086    has photo
  Phil 56-226   has photo

After:
  CP 72-2086    has photo
  Phil 56-226   has photo
  OO 2569       no photo
  AJAX          no photo
  Akoki green   no photo

ORDERING SAFEGUARDS

- Normal browse: PHOTO FIRST
- Search: existing search/relevance order remains unchanged
- Recently added: newest-first order remains unchanged
- Load more: any photo-bearing varieties already loaded into the browse view
  move ahead of placeholder cards while preserving stable ordering

Photo availability uses thumbnail_file_id, which is the same field already
used by the germplasm cards to decide whether to show the actual photo.

APPLY

  APPLY-PHOTO-FIRST-BROWSE-v2.13.71.cmd

VERIFY

  npm.cmd run verify:photo-first-browse
  npm.cmd run build
