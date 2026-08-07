@echo off
cd /d "%~dp0"
echo Starting CaneSprout Registry v2.1.2...
start "" "http://localhost:5174/?v=2.1.2"
call npm.cmd run dev
