@echo off
setlocal
cd /d "%~dp0"
echo CaneSprout Registry - first GitHub upload

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
git commit -m "CaneSprout Registry v2.1 characterization overhaul"
git push -u origin main
if errorlevel 1 (
  echo Push failed. Make sure you are signed in and have write access.
  pause
  exit /b 1
)

echo Uploaded. Vercel and the Windows release workflow can now run from main.
pause
