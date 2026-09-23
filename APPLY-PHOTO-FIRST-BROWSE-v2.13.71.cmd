@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.71 photo-first Germplasm Collection browse...
node scripts\apply-photo-first-browse-v2.13.71.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:photo-first-browse
echo   npm.cmd run build
endlocal
