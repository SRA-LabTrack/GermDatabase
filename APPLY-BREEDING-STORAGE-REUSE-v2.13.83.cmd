@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.83 shared germ-media Breeding Program storage fix...
node scripts\apply-breeding-storage-reuse-v2.13.83.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo.
echo Next:
echo   npm.cmd run verify:breeding-storage-reuse
echo   npm.cmd run setup:breeding-program
echo   npm.cmd run build
echo.
endlocal
