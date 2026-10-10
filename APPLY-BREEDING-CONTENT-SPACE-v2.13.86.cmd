@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.86 Breeding Program content-space rebalance...
node scripts\apply-breeding-content-space-v2.13.86.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo.
echo Verify:
echo   npm.cmd run verify:breeding-content-space
echo   npm.cmd run build
echo.
endlocal
