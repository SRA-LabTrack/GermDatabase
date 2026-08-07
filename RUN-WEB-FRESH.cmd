@echo off
cd /d "%~dp0"
echo Starting CaneSprout Registry v2.1.0...
start "" "http://localhost:5174/?v=2.1.0"
call npm.cmd run dev
