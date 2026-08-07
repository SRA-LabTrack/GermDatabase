@echo off
cd /d "%~dp0"
echo Starting CaneSprout Registry v2.1.5...
start "" "http://localhost:5174/?v=2.1.5"
call npm.cmd run dev
