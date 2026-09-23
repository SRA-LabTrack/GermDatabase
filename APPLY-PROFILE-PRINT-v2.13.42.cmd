@echo off
setlocal
cd /d "%~dp0"
echo.
echo Applying CaneSprout v2.13.42 printable variety profile patch...
echo.
node scripts\apply-profile-print-v2.13.42.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Review the message above. No Git command was run.
  pause
  exit /b 1
)
echo.
echo Patch applied. Running printable profile verification...
call npm.cmd run verify:profile-print
if errorlevel 1 (
  echo.
  echo Verification failed. Do not commit yet.
  pause
  exit /b 1
)
echo.
echo v2.13.42 patch and verification completed successfully.
pause
