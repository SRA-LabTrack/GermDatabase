@echo off
cd /d "%~dp0"
echo Installing dependencies...
call npm.cmd install
if errorlevel 1 goto :error
echo.
echo Starting GermDatabase web app...
call npm.cmd run dev
exit /b
:error
echo.
echo Installation failed. Make sure Node.js is installed and you have internet access.
pause
