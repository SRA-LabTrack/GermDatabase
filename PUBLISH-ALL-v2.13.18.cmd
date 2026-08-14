@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title CaneSprout v2.13.18 - Dynamic Germplasm Counters Publish

echo.
echo ============================================================
echo   CANESPROUT v2.13.18 PUBLISH
echo   Verify + Web + Electron + GitHub
echo ============================================================
echo.

call npm.cmd install || goto :fail
call npm.cmd run audit:germplasm-counters || goto :fail
call npm.cmd run desktop:verify || goto :fail
call npm.cmd run build || goto :fail
call npm.cmd run desktop:build:win || goto :fail

git add -A || goto :fail
git reset -- .env .env.local .env.production.local .env.development.local 2>nul
git status
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "CaneSprout v2.13.18 dynamic germplasm collection counters" || goto :fail
) else (
  echo No source changes to commit.
)
git push origin main || goto :fail

echo.
echo SUCCESS. GitHub main pushed; connected Vercel deployment can update automatically.
exit /b 0

:fail
echo.
echo FAILED. Review the command output above.
exit /b 1
