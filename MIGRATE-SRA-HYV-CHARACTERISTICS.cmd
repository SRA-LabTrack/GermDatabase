@echo off
setlocal
cd /d "%~dp0"
echo.
echo CaneSprout v2.7.3 - SRA HYV characteristics migration
echo This updates matching existing varieties and adds SRA HYVs that are not yet in the registry.
echo A temporary APPWRITE_API_KEY with database document read/write permission must be present in .env.
echo.
call npm.cmd run migrate:sra-hyv
set EXITCODE=%ERRORLEVEL%
echo.
if not "%EXITCODE%"=="0" (
  echo Migration stopped with an error. It is safe to run this command again after fixing the problem.
) else (
  echo Migration completed. Revoke/delete the temporary APPWRITE_API_KEY now.
)
pause
exit /b %EXITCODE%
