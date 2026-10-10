@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.78 brochure-first Germplasm Collection...
node scripts\apply-brochure-first-v2.13.78.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo.
echo Verify:
echo   npm.cmd run verify:brochure-first
echo   npm.cmd run build
echo.
endlocal
