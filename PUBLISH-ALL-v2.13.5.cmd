@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title CaneSprout v2.13.5 - Build + GitHub + Vercel Auto Deploy

set "REPO=https://github.com/SRA-LabTrack/GermDatabase.git"
set "MSG=CaneSprout v2.13.5 web login larger login flow cards for web and electron"

echo.
echo ============================================================
echo   CANESPROUT v2.13.5 PUBLISH
echo   Verify + Web Build + Electron Build + GitHub Push
echo   Vercel deploys automatically from GitHub main
echo ============================================================
echo Folder: %CD%
echo.

where node >nul 2>&1 || goto :node_missing
where npm.cmd >nul 2>&1 || goto :npm_missing
where git >nul 2>&1 || goto :git_missing

for /f "usebackq delims=" %%V in (`node -p "require('./package.json').version" 2^>nul`) do set "APPVER=%%V"
if not "%APPVER%"=="2.13.5" (
  echo [ERROR] This publish script expects CaneSprout v2.13.5.
  echo Detected: %APPVER%
  goto :fail
)

echo [1/8] Installing/updating dependencies...
call npm.cmd install || goto :fail

echo.
echo [2/8] Verifying Electron offline architecture...
call npm.cmd run desktop:verify || goto :fail

echo.
echo [3/8] Auditing registry integrity...
call npm.cmd run audit:registry-full || goto :fail

echo.
echo [4/8] Auditing combination duplicates...
call npm.cmd run audit:combination-duplicates || goto :fail

echo.
echo [5/8] Building production website...
call npm.cmd run build || goto :fail

echo.
echo [6/8] Building Windows Electron installer...
call npm.cmd run desktop:build:win || goto :fail

echo.
echo [7/8] Preparing Git commit...
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  git init || goto :fail
  git branch -M main || goto :fail
  git remote add origin %REPO% || goto :fail
  git fetch origin main || goto :fail
  git add -A || goto :fail
  git reset -- .env .env.local .env.production.local .env.development.local 2>nul
  git commit -m "%MSG%" || goto :fail
  git merge origin/main --allow-unrelated-histories -s ours -m "Merge GitHub history before CaneSprout v2.13.5" || goto :fail
) else (
  git branch -M main || goto :fail
  git remote get-url origin >nul 2>&1
  if errorlevel 1 (
    git remote add origin %REPO% || goto :fail
  ) else (
    git remote set-url origin %REPO% || goto :fail
  )
  git fetch origin main || goto :fail
  git add -A || goto :fail
  git reset -- .env .env.local .env.production.local .env.development.local 2>nul
  git diff --cached --quiet
  if errorlevel 1 (
    git commit -m "%MSG%" || goto :fail
  ) else (
    echo No new source changes required for commit.
  )
  git merge origin/main --no-edit || goto :fail
)

echo.
echo [8/8] Pushing main to GitHub...
git push -u origin main || goto :fail

echo.
echo ============================================================
echo   SUCCESS - CANESPROUT v2.13.5 PUSHED
echo ============================================================
echo GitHub: %REPO%
echo Vercel: Git integration will deploy main automatically.
echo Electron installer: release\CaneSprout-Registry-Setup-2.13.5.exe
echo.
echo IMPORTANT: Do NOT run "npx vercel deploy --prod" afterward.
echo Your linked Vercel project already deploys from GitHub main.
echo.
echo After Vercel finishes, open the website and press Ctrl + Shift + R once.
echo.
pause
exit /b 0

:node_missing
echo [ERROR] Node.js was not found in PATH.
goto :fail
:npm_missing
echo [ERROR] npm.cmd was not found in PATH.
goto :fail
:git_missing
echo [ERROR] Git was not found in PATH.
goto :fail
:fail
echo.
echo ============================================================
echo   PUBLISH STOPPED
echo Read the first error above.
echo ============================================================
pause
exit /b 1
