@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title CaneSprout v2.13.29 - Website Pedigree Publish

echo [1/5] Installing dependencies...
call npm.cmd install || goto :fail
echo [2/5] Verifying pedigree wiring...
call npm.cmd run verify:pedigree-web || goto :fail
echo [3/5] Auditing pedigree source...
call npm.cmd run audit:pedigree-source || goto :fail
echo [4/5] Building website...
call npm.cmd run build || goto :fail
echo [5/5] Committing and pushing GitHub main...
git add -A || goto :fail
git diff --cached --quiet
if errorlevel 1 git commit -m "CaneSprout v2.13.29 website pedigree toolbar hard fix" || goto :fail
git push origin main || goto :fail
echo.
echo SUCCESS. GitHub main pushed. Vercel Git integration will deploy automatically.
exit /b 0
:fail
echo.
echo FAILED. Review the error above.
exit /b 1
