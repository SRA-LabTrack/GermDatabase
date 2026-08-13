@echo off
setlocal
cd /d "%~dp0"
echo CaneSprout full registry integrity audit v2.7.7
echo READ ONLY - no records will be changed.
echo.
call npm.cmd run audit:registry-full
pause
