@echo off
setlocal
cd /d "%~dp0"
echo.
echo Applying CaneSprout v2.13.41 per-attribute coordinate patch...
echo.
node scripts\apply-origin-attribute-coordinates-v2.13.41.mjs
if errorlevel 1 goto :fail
npm.cmd run verify:origin-attribute-coordinates
if errorlevel 1 goto :fail
echo.
echo Patch applied and verified successfully.
echo Next run: npm.cmd run build
echo.
exit /b 0
:fail
echo.
echo Patch or verification failed. No Git commit should be made yet.
echo.
exit /b 1
