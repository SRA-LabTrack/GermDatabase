@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title CaneSprout v2.13.28 - Website Pedigree Publish

echo.
echo ============================================================
echo   CANESPROUT v2.13.28 WEBSITE PUBLISH

echo   Install + Audit + Web Build + GitHub Push

echo   Vercel deploys automatically from GitHub main

echo ============================================================
echo.

call npm.cmd install || goto :fail
call npm.cmd run audit:variety-identities-local || goto :fail
call npm.cmd run build || goto :fail

git add -A || goto :fail
git reset -- .env .env.local .env.production.local .env.development.local 2>nul
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "CaneSprout v2.13.28 source-verified website pedigree parentage" || goto :fail
) else (
  echo No new source changes required for commit.
)
git push origin main || goto :fail

echo.
echo SUCCESS: Website source pushed to GitHub main.
echo Vercel will deploy automatically from Git integration.
exit /b 0

:fail
echo.
echo [ERROR] Publish stopped. Review the command output above.
exit /b 1
