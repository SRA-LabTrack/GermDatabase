@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.55 Breeding Reports toolbar-overlap fix...
node scripts\apply-breeding-report-toolbar-offset-v2.13.55.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:breeding-report-toolbar-offset
echo   npm.cmd run verify:breeding-report-close
echo   npm.cmd run verify:breeding-report-exports
echo   npm.cmd run build
endlocal
