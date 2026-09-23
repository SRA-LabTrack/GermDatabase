@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.57 Breeding Reports portal-position fix...
node scripts\apply-breeding-report-portal-position-v2.13.57.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:breeding-report-portal-position
echo   npm.cmd run verify:breeding-report-portal
echo   npm.cmd run build
endlocal
