@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo CaneSprout - Force Production redeploy through GitHub
echo Folder: %CD%
echo.
git rev-parse --is-inside-work-tree >nul 2>&1 || goto :fail
git add -A || goto :fail
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "CaneSprout production update" || goto :fail
) else (
  git commit --allow-empty -m "Force CaneSprout Production redeploy" || goto :fail
)
git push origin main || goto :fail
echo.
echo Done. Wait for the Vercel Production deployment to become Ready.
pause
exit /b 0
:fail
echo.
echo Git redeploy failed. Confirm this is your Git-connected folder and branch main exists.
pause
exit /b 1
