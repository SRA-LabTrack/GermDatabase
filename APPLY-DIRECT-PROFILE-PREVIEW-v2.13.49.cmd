@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout direct v2.13.47+ to v2.13.49 in-app profile preview fix...
node scripts\apply-direct-profile-preview-v2.13.49.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
echo.
echo Patch applied. Run the verification commands listed in README-DIRECT-v2.13.49.txt.
endlocal
