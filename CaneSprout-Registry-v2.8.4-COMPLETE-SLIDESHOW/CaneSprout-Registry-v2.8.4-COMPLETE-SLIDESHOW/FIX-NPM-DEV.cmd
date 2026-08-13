@echo off
setlocal EnableExtensions
title CaneSprout - Repair npm run dev

cd /d "%~dp0"

echo.
echo ============================================================
echo  CaneSprout - Repair npm.cmd run dev
echo ============================================================
echo  Project: %CD%
echo.

if not exist "package.json" (
    echo ERROR: package.json was not found in this folder.
    echo Put this file directly beside package.json.
    echo.
    pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js was not found in PATH.
    pause
    exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
    echo Vite is missing. Running npm.cmd install first...
    echo.
    call npm.cmd install
    if errorlevel 1 (
        echo.
        echo ERROR: npm.cmd install failed.
        pause
        exit /b 1
    )
)

echo Backing up package.json...
copy /y "package.json" "package.json.before-dev-fix.bak" >nul

echo Repairing the dev script...
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.scripts=p.scripts||{}; p.scripts.dev='node node_modules/vite/bin/vite.js --host localhost --port 5174 --strictPort'; fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n'); console.log('dev = '+p.scripts.dev);"

if errorlevel 1 (
    echo.
    echo ERROR: Could not update package.json.
    echo Your backup is package.json.before-dev-fix.bak
    pause
    exit /b 1
)

echo.
echo Testing Vite directly first...
echo.
node "node_modules\vite\bin\vite.js" --host localhost --port 5174 --strictPort

set EXITCODE=%ERRORLEVEL%

echo.
echo ============================================================
if "%EXITCODE%"=="0" (
    echo Vite stopped normally.
) else (
    echo Vite exited with code %EXITCODE%.
)
echo ============================================================
echo.
echo Your repaired command is now:
echo   npm.cmd run dev
echo.
pause
exit /b %EXITCODE%
