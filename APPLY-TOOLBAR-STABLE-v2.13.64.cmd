@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.64 stable desktop toolbar...
node scripts\apply-toolbar-stable-v2.13.64.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:toolbar-stable
echo   npm.cmd run verify:toolbar-tools-portal
echo   npm.cmd run build
endlocal
