@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo CaneSprout v2.13.91 ^> v2.13.92
echo Brochure Full-Resolution Preview Fix
echo ============================================================
echo.

node scripts\apply-brochure-full-res-preview-v2.13.92.mjs
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
echo   npm.cmd run verify:brochure-full-res-preview
echo   npm.cmd run build
echo.
pause
endlocal
