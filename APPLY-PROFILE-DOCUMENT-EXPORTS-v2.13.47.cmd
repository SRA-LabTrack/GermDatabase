@echo off
setlocal
cd /d "%~dp0"
echo.
echo Applying CaneSprout v2.13.47 native profile document exports...
echo.
node scripts\apply-profile-document-exports-v2.13.47.mjs
if errorlevel 1 goto :error
echo.
echo Patch applied successfully.
echo.
echo NEXT REQUIRED COMMAND:
echo   npm.cmd install
echo.
echo Then verify with:
echo   npm.cmd run verify:profile-document-exports
echo   npm.cmd run verify:profile-pdf-quality
echo   npm.cmd run verify:profile-card-print
echo   npm.cmd run build
echo.
goto :eof
:error
echo.
echo Patch failed. Review the error above. No Git commands were run.
exit /b 1
