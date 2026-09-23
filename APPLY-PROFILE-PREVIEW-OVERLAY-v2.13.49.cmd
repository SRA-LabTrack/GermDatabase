@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.49 in-app profile preview fix...
node scripts\apply-profile-preview-overlay-v2.13.49.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied. Now run:
echo   npm.cmd run verify:profile-preview-actions
echo   npm.cmd run verify:profile-document-exports
echo   npm.cmd run verify:profile-pdf-quality
echo   npm.cmd run build
endlocal
