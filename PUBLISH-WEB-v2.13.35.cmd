@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title CaneSprout v2.13.35 - Website Variety Map Publish

echo ============================================================
echo  CANESPROUT v2.13.35 WEBSITE MAP PUBLISH
echo ============================================================

call npm.cmd install || goto :fail
call npm.cmd run verify:variety-map-web || goto :fail
call npm.cmd run verify:pedigree-web || goto :fail
call npm.cmd run build || goto :fail

git add -A || goto :fail
git reset -- .env .env.local .env.production.local .env.development.local 2>nul
git diff --cached --quiet
if errorlevel 1 git commit -m "CaneSprout v2.13.35 smooth variety map pins and interaction" || goto :fail
git push origin main || goto :fail

echo.
echo Done. GitHub main was updated. Vercel will deploy main automatically.
exit /b 0

:fail
echo.
echo Publish stopped because a command failed.
exit /b 1
