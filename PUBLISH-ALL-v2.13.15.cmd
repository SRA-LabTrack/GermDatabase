@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title CaneSprout v2.13.15 - Red Traits + A:CH Excel Publish

set "REPO=https://github.com/SRA-LabTrack/GermDatabase.git"
set "MSG=CaneSprout v2.13.15 red traits and A-CH Excel format"

echo.
echo ============================================================
echo   CANESPROUT v2.13.15 PUBLISH
echo   Verify + Web Build + Electron Build + GitHub Push
echo   Vercel deploys automatically from GitHub main
echo ============================================================
echo Folder: %CD%
echo.

where node >nul 2>&1 || goto :node_missing
where npm.cmd >nul 2>&1 || goto :npm_missing
where git >nul 2>&1 || goto :git_missing

for /f "usebackq delims=" %%V in (`node -p "require('./package.json').version" 2^>nul`) do set "APPVER=%%V"
if not "%APPVER%"=="2.13.15" (
  echo [ERROR] This publish script expects CaneSprout v2.13.15.
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
echo [4/8] Auditing duplicate variety identities...
call npm.cmd run audit:duplicates || goto :fail

echo.
echo [5/8] Building production website...
call npm.cmd run build || goto :fail

echo.
echo [6/8] Building Windows Electron installer...
call npm.cmd run desktop:build:win || goto :fail

echo.
echo [7/8] Preparing Git commit...
git branch -M main || goto :fail
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin %REPO% || goto :fail
) else (
  git remote set-url origin %REPO% || goto :fail
)
git add -A || goto :fail
git reset -- .env .env.local .env.production.local .env.development.local 2>nul
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%MSG%" || goto :fail
) else (
  echo No new source changes required for commit.
)

echo.
echo [8/8] Pushing GitHub main...
git push origin main || goto :fail

echo.
echo ============================================================
echo   DONE

echo   Website: Vercel Git integration will deploy main automatically.
echo   Electron: newest installer is under release\
echo   Mobile web: refresh once after Vercel finishes deploying.
echo ============================================================
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
echo [FAILED] CaneSprout v2.13.15 publish stopped. Review the error above.
exit /b 1
