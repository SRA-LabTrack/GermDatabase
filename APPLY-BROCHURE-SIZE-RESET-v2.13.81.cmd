@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.81 original brochure size reset...
node scripts\apply-brochure-size-reset-v2.13.81.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo.
echo Verify:
echo   npm.cmd run verify:brochure-size-reset
echo   npm.cmd run build
echo.
endlocal
