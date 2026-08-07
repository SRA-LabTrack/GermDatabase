@echo off
setlocal
cd /d "%~dp0"
echo CaneSprout Registry v2.1.5 - Appwrite split-schema setup
echo.
call npm.cmd run setup:appwrite
if errorlevel 1 (
  echo.
  echo Setup failed. Review the error above.
  pause
  exit /b 1
)
echo.
echo Setup completed. Revoke the temporary APPWRITE_API_KEY now.
pause
