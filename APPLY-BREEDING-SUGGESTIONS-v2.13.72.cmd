@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.72 role-aware breeding suggestions...
node scripts\apply-breeding-suggestions-v2.13.72.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:breeding-suggestions
echo   npm.cmd run build
endlocal
