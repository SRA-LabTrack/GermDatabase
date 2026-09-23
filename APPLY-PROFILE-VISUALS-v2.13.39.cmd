@echo off
setlocal
cd /d "%~dp0"
echo.
echo Applying CaneSprout v2.13.39 profile trait visualization patch...
echo.
node scripts\apply-profile-trait-visuals-v2.13.39.mjs
if errorlevel 1 goto :fail

echo.
echo Running source verification...
call npm.cmd run verify:profile-trait-visuals
if errorlevel 1 goto :fail

echo.
echo Patch applied and verified.
echo Run npm.cmd run build before committing.
echo.
exit /b 0

:fail
echo.
echo PATCH FAILED. Read the error above. No Git push was performed.
echo.
exit /b 1
