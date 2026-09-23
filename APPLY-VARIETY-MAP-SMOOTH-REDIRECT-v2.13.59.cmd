@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.59 smoother Germplasm Map redirect...
node scripts\apply-variety-map-smooth-redirect-v2.13.59.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:variety-map-smooth-redirect
echo   npm.cmd run verify:variety-map-performance
echo   npm.cmd run verify:variety-map-transition
echo   npm.cmd run build
endlocal
