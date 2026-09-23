@echo off
setlocal
cd /d "%~dp0"
echo.
echo Applying CaneSprout v2.13.44 core-print fix and preview/download patch...
echo.
node scripts\apply-profile-print-preview-v2.13.44.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied. Recommended checks:
echo   npm.cmd run verify:profile-print-preview
echo   npm.cmd run verify:profile-card-print
echo   npm.cmd run verify:profile-print
echo   npm.cmd run build
endlocal
