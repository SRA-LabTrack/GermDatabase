@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title CaneSprout v2.13.3 - Build, GitHub, Vercel

set "REPO=https://github.com/SRA-LabTrack/GermDatabase.git"
set "MSG=CaneSprout v2.13.3 unified website and Electron login"

echo.
echo ============================================================
echo   CANESPROUT v2.13.3 FULL PUBLISH
echo   Verify + Web Build + Electron Build + GitHub + Vercel
echo ============================================================
echo Folder: %CD%
echo.

where node >nul 2>&1 || goto :node_missing
where npm.cmd >nul 2>&1 || goto :npm_missing
where git >nul 2>&1 || goto :git_missing

for /f "usebackq delims=" %%V in (`node -p "require('./package.json').version" 2^>nul`) do set "APPVER=%%V"
if not "%APPVER%"=="2.13.3" (
  echo [ERROR] This publish script expects CaneSprout v2.13.3.
  echo Detected: %APPVER%
  goto :fail
)

echo [1/9] Installing/updating dependencies...
call npm.cmd install || goto :fail

echo.
echo [2/9] Verifying Electron offline architecture...
call npm.cmd run desktop:verify || goto :fail

echo.
echo [3/9] Auditing registry integrity...
call npm.cmd run audit:registry-full || goto :fail

echo.
echo [4/9] Auditing combination duplicates...
call npm.cmd run audit:combination-duplicates || goto :fail

echo.
echo [5/9] Building production website for Vercel...
call npm.cmd run build || goto :fail

echo.
echo [6/9] Building Windows Electron installer...
call npm.cmd run desktop:build:win || goto :fail

echo.
echo [7/9] Preparing Git repository...
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto :new_repo

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
goto :push_repo

:new_repo
git init || goto :fail
git branch -M main || goto :fail
git remote add origin %REPO% || goto :fail
git add -A || goto :fail
git reset -- .env .env.local .env.production.local .env.development.local 2>nul
git commit -m "%MSG%" || goto :fail
git fetch origin main || goto :fail
git merge origin/main --allow-unrelated-histories -s ours -m "Merge GitHub history before CaneSprout v2.13.3" || goto :fail

:push_repo
echo.
echo [8/9] Pushing main to GitHub...
git push -u origin main || goto :fail

echo.
echo [9/9] Deploying production website to Vercel...
where npx.cmd >nul 2>&1 || goto :npx_missing
if not exist ".vercel\project.json" (
  echo.
  echo Vercel is not linked in this extracted folder yet.
  echo Select your EXISTING CaneSprout/GermDatabase project when prompted.
  call npx.cmd vercel link || goto :fail
)
call npx.cmd vercel deploy --prod || goto :fail

echo.
echo ============================================================
echo   SUCCESS - CANESPROUT v2.13.3 PUBLISHED
echo ============================================================
echo GitHub: %REPO%
echo Website production build: deployed through Vercel CLI
echo Electron installer: release\CaneSprout-Registry-Setup-2.13.3.exe
echo.
echo If GitHub is also connected to Vercel, it may create another deployment
 echo from the same main commit. That is harmless; use the newest Ready build.
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
:npx_missing
echo [ERROR] npx.cmd was not found in PATH.
goto :fail
:fail
echo.
echo ============================================================
echo   PUBLISH STOPPED
 echo Read the first error above. Nothing after that failed step was run.
echo ============================================================
pause
exit /b 1
