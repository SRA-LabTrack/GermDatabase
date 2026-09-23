@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.53 Breeding Report layout and native exports...
node scripts\apply-breeding-report-exports-v2.13.53.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd install
echo   npm.cmd run verify:breeding-report-exports
echo   npm.cmd run verify:breeding-report-ranges
echo   npm.cmd run verify:breeding-reports
echo   npm.cmd run build
endlocal
