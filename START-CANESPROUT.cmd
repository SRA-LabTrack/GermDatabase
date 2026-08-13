@echo off
setlocal
cd /d "%~dp0"
title CaneSprout Registry v2.9.14

if not exist "package.json" (
  echo ERROR: package.json not found.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo npm.cmd install failed.
    pause
    exit /b 1
  )
)

call npm.cmd run dev
set CODE=%ERRORLEVEL%
echo.
if not "%CODE%"=="0" pause
exit /b %CODE%
