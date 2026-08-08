@echo off
setlocal
cd /d "%~dp0"
echo.
echo CaneSprout - Configure Vercel Account Management Key
echo =====================================================
echo.
echo Before continuing, create a dedicated Appwrite API key with ONLY:
echo   users.read
echo   users.write
echo.
echo Vercel CLI will securely prompt you for the value.
echo The secret is NOT written into this script.
echo.
pause
call npx.cmd vercel@latest link
if errorlevel 1 goto :fail
call npx.cmd vercel@latest env add APPWRITE_ADMIN_API_KEY production --sensitive
if errorlevel 1 goto :fail
echo.
echo Added APPWRITE_ADMIN_API_KEY to Production.
echo IMPORTANT: redeploy the project so the new environment variable is used.
echo You can push a new commit or redeploy from the Vercel dashboard.
echo.
pause
exit /b 0
:fail
echo.
echo Vercel configuration did not complete. You can instead add the variable manually:
echo Vercel ^> GermDatabase ^> Settings ^> Environment Variables
pause
exit /b 1
