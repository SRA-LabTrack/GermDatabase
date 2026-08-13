@echo off
cd /d "%~dp0"
echo CaneSprout v2.5.4 administrator migration
echo.
echo This will:
echo   1. migrate Appwrite permissions to the valid label canesproutadmin
echo   2. grant that label to ncrowsboosting@gmail.com
echo.
echo Keep a temporary setup-level APPWRITE_API_KEY in .env while this runs.
echo Revoke the key after success.
echo.
npm.cmd run grant:bootstrap-admin
echo.
pause
