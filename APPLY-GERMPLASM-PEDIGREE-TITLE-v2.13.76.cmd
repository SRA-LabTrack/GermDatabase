@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.76 Germplasm Pedigree title update...
node scripts\apply-germplasm-pedigree-title-v2.13.76.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:germplasm-pedigree-title
echo   npm.cmd run build
endlocal
