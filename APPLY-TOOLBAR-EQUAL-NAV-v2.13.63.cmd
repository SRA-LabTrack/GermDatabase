@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.63 equal four-way toolbar navigation...
node scripts\apply-toolbar-equal-nav-v2.13.63.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:toolbar-equal-nav
echo   npm.cmd run verify:toolbar-tools-portal
echo   npm.cmd run build
endlocal
