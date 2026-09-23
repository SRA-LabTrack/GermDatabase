@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo   CANESPROUT v2.13.30 WEBSITE PUBLISH
echo ============================================================

call npm.cmd install || goto :fail
call npm.cmd run verify:pedigree-web || goto :fail
call npm.cmd run build || goto :fail

git add -A || goto :fail
git status
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "CaneSprout v2.13.30 clickable variety cards and clean parentage" || goto :fail
) else (
  echo No new files to commit.
)
git push origin main || goto :fail

echo.
echo Website source pushed to GitHub main. Vercel will deploy automatically.
exit /b 0

:fail
echo.
echo [ERROR] Publish stopped. Review the error above.
exit /b 1
