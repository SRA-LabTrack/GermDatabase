@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.70 profile-card Print menu fix...
node scripts\apply-profile-card-print-menu-v2.13.70.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:profile-card-print-menu
echo   npm.cmd run build
endlocal
