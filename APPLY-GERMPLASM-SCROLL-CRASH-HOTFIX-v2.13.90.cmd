@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo CaneSprout v2.13.89 ^> v2.13.90
echo Germplasm Scroll Crash Hotfix
echo ============================================================
echo.

node scripts\apply-germplasm-scroll-crash-v2.13.90.mjs
if errorlevel 1 (
  echo.
  echo HOTFIX FAILED.
  pause
  exit /b 1
)

echo.
echo Hotfix applied successfully.
echo.
echo Next commands:
echo   npm.cmd pkg get version
echo   npm.cmd run verify:germplasm-scroll-crash
echo   npm.cmd run build
echo.
pause
endlocal
