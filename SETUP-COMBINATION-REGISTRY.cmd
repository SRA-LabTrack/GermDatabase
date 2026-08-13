@echo off
setlocal
cd /d "%~dp0"
title CaneSprout Combination Registry - Setup + Workbook Import
echo.
echo CaneSprout v2.11.0 Combination Registry
echo This creates/upgrades the collection and imports all verified records
echo extracted from Cross combination.xlsx.
echo.
echo IMPORTANT: Your .env must temporarily contain APPWRITE_API_KEY.
echo Revoke that key after this script completes successfully.
echo.
call npm.cmd run setup:combinations
set CODE=%ERRORLEVEL%
echo.
if not "%CODE%"=="0" (
  echo Combination Registry setup/import failed with exit code %CODE%.
) else (
  echo Combination Registry setup/import completed successfully.
)
pause
exit /b %CODE%
