@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.58 monthly Month + Year controls...
node scripts\apply-breeding-month-year-v2.13.58.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:breeding-month-year
echo   npm.cmd run verify:breeding-report-portal-position
echo   npm.cmd run build
endlocal
