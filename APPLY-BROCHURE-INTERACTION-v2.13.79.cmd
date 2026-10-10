@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.79 larger interactive brochure update...
node scripts\apply-brochure-interaction-v2.13.79.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo.
echo Verify:
echo   npm.cmd run verify:brochure-interaction
echo   npm.cmd run build
echo.
endlocal
