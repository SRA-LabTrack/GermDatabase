@echo off
setlocal
cd /d "%~dp0"
echo.
echo CaneSprout v2.7.8 safe registry repair
 echo Step 1 of 3: dry-run repair plan...
call npm.cmd run repair:registry-safe
if errorlevel 1 goto :fail
echo.
choice /M "Apply ONLY the verified core/detail alias repairs shown above"
if errorlevel 2 goto :cancel
call npm.cmd run repair:registry-safe -- --apply
if errorlevel 1 goto :fail
echo.
echo Step 3 of 3: running full read-only verification audit...
call npm.cmd run audit:registry-full
if errorlevel 1 goto :fail
echo.
echo Finished. The blank source row and conflicting scientific observations were not deleted.
pause
exit /b 0
:cancel
echo Cancelled. No repair writes were made.
pause
exit /b 0
:fail
echo.
echo A command failed. No automatic destructive cleanup is performed by this script.
pause
exit /b 1
