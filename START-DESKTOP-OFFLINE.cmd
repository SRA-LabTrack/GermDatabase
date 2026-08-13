@echo off
setlocal
cd /d "%~dp0"
title CaneSprout Registry v2.13.0 Desktop Offline

echo.
echo ============================================================
echo   CANESPROUT REGISTRY v2.13.0 - DESKTOP OFFLINE
echo ============================================================
echo.

if not exist "node_modules\electron\dist\electron.exe" (
  echo First source run: installing desktop dependencies...
  call npm.cmd install
  if errorlevel 1 goto :error
)

call npm.cmd run desktop:dev
exit /b %ERRORLEVEL%

:error
echo.
echo Could not prepare the desktop development build.
pause
exit /b 1
