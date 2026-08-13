@echo off
setlocal EnableExtensions EnableDelayedExpansion
title CaneSprout - Repair npm.cmd run dev

set "PROJECT=D:\Germ\CaneSprout-Registry-v2.8.4-COMPLETE-SLIDESHOW\CaneSprout-Registry-v2.8.4-COMPLETE-SLIDESHOW"

echo.
echo ============================================================
echo  CaneSprout npm.cmd run dev REPAIR
echo ============================================================
echo.
echo Target:
echo %PROJECT%
echo.

if not exist "%PROJECT%\package.json" (
    echo ERROR: package.json was not found at the target path.
    echo.
    pause
    exit /b 1
)

cd /d "%PROJECT%"

echo [1/6] Checking for a local npm.cmd that may be shadowing Node npm...
if exist "%PROJECT%\npm.cmd" (
    echo Found local npm.cmd:
    echo   %PROJECT%\npm.cmd
    echo.
    echo Renaming it because Command Prompt checks the current folder before PATH.
    if exist "%PROJECT%\npm-project-shadow-backup.cmd" del /q "%PROJECT%\npm-project-shadow-backup.cmd" >nul 2>nul
    ren "%PROJECT%\npm.cmd" "npm-project-shadow-backup.cmd"
    if errorlevel 1 (
        echo ERROR: Could not rename the local npm.cmd.
        echo Close programs using the file and run this repair again.
        pause
        exit /b 1
    )
    echo Renamed to:
    echo   npm-project-shadow-backup.cmd
) else (
    echo No local npm.cmd found. Good.
)

echo.
echo [2/6] Locating the real npm.cmd...

set "REALNPM="

if exist "C:\Program Files\nodejs\npm.cmd" (
    set "REALNPM=C:\Program Files\nodejs\npm.cmd"
)

if not defined REALNPM (
    for /f "delims=" %%I in ('where npm.cmd 2^>nul') do (
        if not defined REALNPM set "REALNPM=%%I"
    )
)

if not defined REALNPM (
    echo ERROR: Could not find the real npm.cmd.
    echo Reinstall Node.js, then reopen Command Prompt.
    pause
    exit /b 1
)

echo Real npm:
echo   !REALNPM!

echo.
echo [3/6] Verifying Node and npm...

where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: node.exe was not found in PATH.
    pause
    exit /b 1
)

node --version
call "!REALNPM!" --version

if errorlevel 1 (
    echo.
    echo ERROR: The real npm.cmd did not run correctly.
    pause
    exit /b 1
)

echo.
echo [4/6] Backing up and repairing package.json...

copy /y "package.json" "package.json.before-npm-dev-repair.bak" >nul

node -e "const fs=require('fs'); const f='package.json'; const p=JSON.parse(fs.readFileSync(f,'utf8')); p.scripts=p.scripts||{}; p.scripts.dev='node node_modules/vite/bin/vite.js --host localhost --port 5174 --strictPort'; fs.writeFileSync(f, JSON.stringify(p,null,2)+'\n'); console.log('dev script repaired: '+p.scripts.dev);"

if errorlevel 1 (
    echo.
    echo ERROR: Could not repair package.json.
    echo Backup:
    echo   package.json.before-npm-dev-repair.bak
    pause
    exit /b 1
)

echo.
echo [5/6] Checking Vite dependency...

if not exist "node_modules\vite\bin\vite.js" (
    echo Vite is missing. Installing project dependencies...
    echo.
    call "!REALNPM!" install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
) else (
    echo Vite is present.
)

if not exist "node_modules\vite\bin\vite.js" (
    echo.
    echo ERROR: Vite is still missing after installation.
    echo Expected:
    echo   %PROJECT%\node_modules\vite\bin\vite.js
    pause
    exit /b 1
)

echo.
echo [6/6] Verifying npm resolves correctly from this folder...
echo.

where npm.cmd

echo.
echo ============================================================
echo  REPAIR COMPLETE
echo ============================================================
echo.
echo Close this window, open a NEW Command Prompt, then run:
echo.
echo   cd /d "%PROJECT%"
echo   npm.cmd run dev
echo.
echo Expected:
echo   Local: http://localhost:5174/
echo.
echo If port 5174 is already occupied, close the old Vite window first.
echo.
pause
exit /b 0
