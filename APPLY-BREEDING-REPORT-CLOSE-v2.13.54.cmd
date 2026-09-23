@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.54 persistent Breeding Reports close control...
node scripts\apply-breeding-report-close-v2.13.54.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:breeding-report-close
echo   npm.cmd run verify:breeding-report-exports
echo   npm.cmd run build
endlocal
