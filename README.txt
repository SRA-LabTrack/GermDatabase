CaneSprout v2.13.15 Source Workbook Match Audit

READ ONLY. This audit never edits Appwrite or the bundled seed.

1. Extract this patch into the CaneSprout project root and replace package.json.
2. Run npm.cmd install if dependencies are not already installed.
3. Local bundled comparison:
   npm.cmd run audit:source-match -- "D:\path\Characterization and other attributes.xlsx"
4. Live Appwrite comparison:
   set APPWRITE_API_KEY=YOUR_TEMPORARY_READ_ONLY_KEY
   npm.cmd run audit:source-match -- "D:\path\Characterization and other attributes.xlsx" --live
5. Both:
   npm.cmd run audit:source-match -- "D:\path\Characterization and other attributes.xlsx" --both

Reports are written to reports\source-workbook-match-local.json/.csv and/or reports\source-workbook-match-live.json/.csv.
