@echo off
setlocal
cd /d "%~dp0"
echo Applying CaneSprout v2.13.50 installable website PWA patch...
if exist patch-source rmdir /s /q patch-source
mkdir patch-source\src\lib >nul 2>&1
mkdir patch-source\public >nul 2>&1
copy /y src\lib\pwaInstall.js patch-source\src\lib\pwaInstall.js >nul
copy /y public\manifest.webmanifest patch-source\public\manifest.webmanifest >nul
copy /y public\pwa-192.png patch-source\public\pwa-192.png >nul
copy /y public\pwa-512.png patch-source\public\pwa-512.png >nul
node scripts\apply-installable-pwa-v2.13.50.mjs
if errorlevel 1 (
  echo.
  echo PATCH FAILED. Read the error above. No Git commands were run.
  exit /b 1
)
npm.cmd run verify:pwa-install
if errorlevel 1 exit /b 1
rmdir /s /q patch-source >nul 2>&1
echo.
echo CaneSprout v2.13.50 is ready. Run npm.cmd run build next.
endlocal
