@echo off
setlocal
cd /d "%~dp0"
echo.
echo Applying CaneSprout v2.13.45 separate Print and Save PDF patch...
node scripts\apply-profile-print-actions-v2.13.45.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the message above.
  exit /b 1
)
echo.
echo Patch files applied.
echo NEXT: npm.cmd install
echo THEN: npm.cmd run verify:profile-print-actions
echo THEN: npm.cmd run build
endlocal
