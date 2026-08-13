@echo off
cd /d "%~dp0"
call npm.cmd run desktop:build:win
if errorlevel 1 pause
