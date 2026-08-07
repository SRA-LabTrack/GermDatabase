@echo off
setlocal
cd /d "%~dp0"

echo GermDatabase - publish update

git rev-parse --is-inside-work-tree >nul 2>&1 || (
  echo ERROR: This folder is not connected to Git yet. Run FIRST-UPLOAD-TO-GITHUB.cmd first.
  pause
  exit /b 1
)

set "MSG=Update GermDatabase"
set /p "CUSTOM=Commit message [Update GermDatabase]: "
if not "%CUSTOM%"=="" set "MSG=%CUSTOM%"

git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo No changed files to upload.
  pause
  exit /b 0
)

git commit -m "%MSG%"
if errorlevel 1 goto :fail
git push origin main
if errorlevel 1 goto :fail

echo.
echo Update pushed successfully.
echo - Vercel: new web deployment starts automatically.
echo - GitHub Actions: new Windows updater release starts automatically.
pause
exit /b 0

:fail
echo.
echo Upload failed. Review the Git error above.
pause
exit /b 1
