@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.73 history-aware breeding suggestions...
node scripts\apply-breeding-history-suggestions-v2.13.73.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:breeding-history-suggestions
echo   npm.cmd run build
endlocal
