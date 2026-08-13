@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo CaneSprout Registry - publish GitHub update
echo ============================================================

git rev-parse --is-inside-work-tree >nul 2>&1 || (
  echo ERROR: This folder is not the Git repository.
  echo Copy these project contents into C:\Users\kenshennn\Downloads\Germ first.
  pause
  exit /b 1
)

set "MSG=Update CaneSprout Registry"
set /p "CUSTOM=Commit message [Update CaneSprout Registry]: "
if not "%CUSTOM%"=="" set "MSG=%CUSTOM%"

git status
git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo No changed files to upload.
  pause
  exit /b 0
)

git commit -m "%MSG%" || goto :fail
git push origin main || goto :fail

echo.
echo SUCCESS.
echo GitHub has the new source.
echo Vercel will redeploy automatically.
echo GitHub Actions will build a new Windows updater release.
pause
exit /b 0

:fail
echo.
echo Upload failed. Read the Git error above.
pause
exit /b 1
