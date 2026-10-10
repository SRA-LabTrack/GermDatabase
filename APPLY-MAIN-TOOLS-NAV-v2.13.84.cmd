@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.84 main Tools navigation restoration...
node scripts\apply-main-tools-nav-v2.13.84.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo.
echo Verify:
echo   npm.cmd run verify:main-tools-nav
echo   npm.cmd run build
echo.
endlocal
