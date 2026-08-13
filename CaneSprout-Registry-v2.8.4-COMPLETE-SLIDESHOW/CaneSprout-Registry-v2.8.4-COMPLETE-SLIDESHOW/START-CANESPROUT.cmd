@echo off
setlocal
title CaneSprout Registry Development Server

cd /d "%~dp0"

echo.
echo ============================================================
echo  CaneSprout Registry - Development Server
echo ============================================================
echo  Project: %CD%
echo.

if not exist "package.json" (
    echo ERROR: package.json was not found in:
    echo %CD%
    echo.
    echo This launcher must stay in the CaneSprout project root.
    echo.
    pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js was not found in PATH.
    echo Reinstall Node.js or reopen Command Prompt after installing it.
    echo.
    pause
    exit /b 1
)

echo Node:
node --version
echo.

if not exist "node_modules\vite\package.json" (
    echo Vite is not installed in this project yet.
    echo Running npm.cmd install...
    echo.
    call npm.cmd install --loglevel=info
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed.
        echo.
        pause
        exit /b 1
    )
)

echo Starting CaneSprout directly through Node...
echo.

node "scripts\start-dev.mjs"

set EXITCODE=%ERRORLEVEL%
echo.
if not "%EXITCODE%"=="0" (
    echo CaneSprout stopped with error code %EXITCODE%.
) else (
    echo CaneSprout server stopped.
)
echo.
pause
exit /b %EXITCODE%
