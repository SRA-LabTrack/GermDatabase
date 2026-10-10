@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.80 main Breeding Program navigation and brochure transitions...
node scripts\apply-brochure-main-nav-v2.13.80.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo.
echo Verify:
echo   npm.cmd run verify:brochure-main-nav
echo   npm.cmd run build
echo.
endlocal
