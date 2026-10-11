@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo CaneSprout v2.13.90 ^> v2.13.91
echo Germplasm / Registry Image Access Fix
echo ============================================================
echo.

node scripts\apply-germplasm-images-v2.13.91.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED.
  pause
  exit /b 1
)

echo.
echo Patch applied successfully.
echo.
echo Next commands:
echo   npm.cmd pkg get version
echo   npm.cmd run verify:germplasm-images
echo   npm.cmd run build
echo.
pause
endlocal
