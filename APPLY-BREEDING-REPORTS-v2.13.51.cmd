@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.51 Breeding Reports...
node scripts\apply-breeding-reports-v2.13.51.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied. Next run:
echo   npm.cmd run verify:breeding-reports
echo   npm.cmd run build
endlocal
