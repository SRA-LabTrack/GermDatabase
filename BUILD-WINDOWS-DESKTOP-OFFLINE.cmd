@echo off
setlocal
cd /d "%~dp0"
title Build CaneSprout Registry v2.13.0 Windows Installer

echo.
echo ============================================================
echo   BUILD CANESPROUT OFFLINE DESKTOP INSTALLER
echo ============================================================
echo.

echo [1/4] Installing/verifying dependencies...
call npm.cmd install
if errorlevel 1 goto :error

echo.
echo [2/4] Verifying offline desktop architecture and bundled data...
call npm.cmd run desktop:verify
if errorlevel 1 goto :error

echo.
echo [3/4] Building local Vite application...
call npm.cmd run build
if errorlevel 1 goto :error

echo.
echo [4/4] Building Windows x64 NSIS installer...
call npx.cmd electron-builder --win nsis --x64
if errorlevel 1 goto :error

echo.
echo ============================================================
echo BUILD COMPLETE
echo Installer is in:
echo   %CD%\release
echo ============================================================
start "" "%CD%\release"
pause
exit /b 0

:error
echo.
echo ============================================================
echo BUILD FAILED. Review the error above.
echo ============================================================
pause
exit /b 1
