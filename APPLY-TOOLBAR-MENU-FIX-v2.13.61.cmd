@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.61 toolbar menu and proportion fix...
node scripts\apply-toolbar-menu-fix-v2.13.61.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:toolbar-menu-fix
echo   npm.cmd run verify:toolbar-cleanup
echo   npm.cmd run build
endlocal
