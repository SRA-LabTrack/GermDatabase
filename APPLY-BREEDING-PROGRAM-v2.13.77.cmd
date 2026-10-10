@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.77 Breeding Program...
node scripts\apply-breeding-program-v2.13.77.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo.
echo Required checks:
echo   npm.cmd run verify:breeding-program
echo   npm.cmd run build
echo.
echo Optional one-time shared upload setup:
echo   npm.cmd run setup:breeding-program
echo.
endlocal
