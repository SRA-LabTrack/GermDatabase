@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.60 clean collapsible toolbar...
node scripts\apply-toolbar-cleanup-v2.13.60.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:toolbar-cleanup
echo   npm.cmd run build
endlocal
