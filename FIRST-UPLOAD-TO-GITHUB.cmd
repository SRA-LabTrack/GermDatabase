@echo off
setlocal
cd /d "%~dp0"

echo GermDatabase - first GitHub upload
echo Repository: https://github.com/SRA-LabTrack/GermDatabase

git --version >nul 2>&1 || (
  echo ERROR: Git is not installed or is not on PATH.
  pause
  exit /b 1
)

if not exist .git git init
git branch -M main
git remote remove origin >nul 2>&1
git remote add origin https://github.com/SRA-LabTrack/GermDatabase.git
git add -A
git commit -m "GermDatabase v1.5 optimized deployment"
if errorlevel 1 (
  echo If Git says there is nothing to commit, that is okay. Continuing to push...
)
git push -u origin main
if errorlevel 1 (
  echo.
  echo Push failed. Make sure you are signed in to GitHub and have write access to SRA-LabTrack/GermDatabase.
  pause
  exit /b 1
)

echo.
echo Uploaded. GitHub Actions will build a Windows update and Vercel will redeploy automatically once the repo is connected there.
pause
