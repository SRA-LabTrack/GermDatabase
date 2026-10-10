@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo CaneSprout v2.13.88 Germplasm Workbook Verification
echo ============================================================
echo.
node "scripts\upsert-germplasm-workbook-v2.13.88.mjs" --analyze-only
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo Running the project's registry audit if that npm script is available...
if exist "package.json" npm.cmd run audit:registry-full --if-present

echo.
echo Verification command finished.
pause
