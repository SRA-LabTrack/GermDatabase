@echo off
cd /d "%~dp0"
echo Starting GermDatabase v1.3.0 on a fresh localhost port...
start "GermDatabase Dev Server" cmd /k ""C:\Program Files\nodejs\npm.cmd" run dev"
timeout /t 2 /nobreak >nul
start "" "http://localhost:5174/?v=1.3.0"
exit /b
