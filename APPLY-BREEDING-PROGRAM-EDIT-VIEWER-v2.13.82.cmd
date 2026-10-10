@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.82 Breeding Program display, PDF viewer, and edit controls...
node scripts\apply-breeding-program-edit-viewer-v2.13.82.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo.
echo Verify:
echo   npm.cmd run verify:breeding-program-edit-viewer
echo   npm.cmd run build
echo.
endlocal
