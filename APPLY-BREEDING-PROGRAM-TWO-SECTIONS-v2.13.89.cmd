@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo CaneSprout v2.13.88 ^> v2.13.89
echo Breeding Program Two-Section Cleanup
echo ============================================================
echo.

node scripts\apply-breeding-program-two-sections-v2.13.89.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. No success message was produced.
  pause
  exit /b 1
)

echo.
echo Patch files were updated successfully.
echo.
echo Next commands:
echo   npm.cmd pkg get version
echo   npm.cmd run verify:breeding-program-two-sections
echo   npm.cmd run build
echo.
pause
endlocal
