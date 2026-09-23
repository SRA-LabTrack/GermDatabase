@echo off
setlocal
cd /d "%~dp0"
echo.
echo Applying CaneSprout v2.13.46 sharp PDF and pagination patch...
echo.
node scripts\apply-profile-pdf-quality-v2.13.46.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above.
  exit /b 1
)
echo.
echo Patch applied successfully.
echo Next run:
echo   npm.cmd run verify:profile-pdf-quality
echo   npm.cmd run build
endlocal
