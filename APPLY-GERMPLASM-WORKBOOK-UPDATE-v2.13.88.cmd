@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo CaneSprout v2.13.87 -^> v2.13.88
echo Germplasm Workbook UPSERT
echo ============================================================
echo.

if not exist "package.json" (
  echo ERROR: package.json was not found.
  echo Extract this TRUE-FLAT patch directly into your CaneSprout project root,
  echo then run this file again.
  pause
  exit /b 1
)

if not exist "scripts\upsert-germplasm-workbook-v2.13.88.mjs" (
  echo ERROR: Patch script is missing.
  pause
  exit /b 1
)

if not exist "patch-data\germplasm-workbook-v2.13.88.json" (
  echo ERROR: Patch data is missing.
  pause
  exit /b 1
)

echo [1/2] Preflight: checking the live registry and workbook matching...
node "scripts\upsert-germplasm-workbook-v2.13.88.mjs" --dry-run
if errorlevel 1 (
  echo.
  echo PRECHECK FAILED. No records were changed.
  echo Read the message above, fix the issue, then run this file again.
  pause
  exit /b 1
)

echo.
echo [2/2] Applying UPSERT to Appwrite and updating the local canonical workbook...
node "scripts\upsert-germplasm-workbook-v2.13.88.mjs"
if errorlevel 1 (
  echo.
  echo UPDATE STOPPED. Check reports\germplasm-workbook-update-v2.13.88.json if it exists.
  echo The importer is idempotent, so it is safe to rerun after the reported issue is fixed.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo SUCCESS - Germplasm workbook update v2.13.88 applied.
echo No existing records were deleted.
echo ============================================================
pause
exit /b 0
