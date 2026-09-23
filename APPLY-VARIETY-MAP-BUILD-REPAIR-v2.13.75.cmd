@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.75 Germplasm Map build repair...
node scripts\apply-variety-map-build-repair-v2.13.75.mjs
if errorlevel 1 (
  echo.
  echo REPAIR FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Repair applied successfully.
echo Next run:
echo   npm.cmd run verify:variety-map-build-repair
echo   npm.cmd run verify:variety-map-first-redirect
echo   npm.cmd run verify:variety-map-smooth-redirect
echo   npm.cmd run build
endlocal
