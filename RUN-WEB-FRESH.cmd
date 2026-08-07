@echo off
cd /d "%~dp0"
echo Starting CaneSprout Registry v2.2.1...
start "" "http://localhost:5174/?v=2.2.0"
call npm.cmd run dev
