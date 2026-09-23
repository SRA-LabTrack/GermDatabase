@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.74 first Germplasm Map redirect fix...
node scripts\apply-variety-map-first-redirect-v2.13.74.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:variety-map-first-redirect
echo   npm.cmd run verify:variety-map-smooth-redirect
echo   npm.cmd run build
endlocal
