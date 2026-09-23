@echo off
setlocal
cd /d "%~dp0"
echo.
echo CaneSprout v2.13.40 - Clickable Color Preview + Exact GPS Map
echo ================================================================
node scripts\apply-profile-map-exact-v2.13.40.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git command was run.
  exit /b 1
)
echo.
echo Running verification...
call npm.cmd run verify:profile-map-exact
if errorlevel 1 exit /b 1
echo.
echo Patch and verification completed.
endlocal
