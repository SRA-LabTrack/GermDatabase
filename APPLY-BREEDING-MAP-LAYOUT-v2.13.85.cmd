@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.85 map-style Breeding Program workspace...
node scripts\apply-breeding-map-layout-v2.13.85.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo.
echo Verify:
echo   npm.cmd run verify:breeding-map-layout
echo   npm.cmd run build
echo.
endlocal
