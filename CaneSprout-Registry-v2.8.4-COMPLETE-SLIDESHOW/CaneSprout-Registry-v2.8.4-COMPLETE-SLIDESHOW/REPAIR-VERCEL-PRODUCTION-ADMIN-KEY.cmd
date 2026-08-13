@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo CaneSprout v2.6.3 - Repair Vercel Production Account Management
echo ===============================================================
echo Project folder: %CD%
echo.
echo This verifies the Vercel Production environment connected to THIS folder.
echo It never prints your API key value.
echo Deployment is triggered through GitHub, NOT `vercel --prod`, so the
echo Vercel CLI Root Directory setting cannot break this repair.
echo.

call npx.cmd vercel@latest link
if errorlevel 1 goto :fail

echo.
echo --- Current Production Environment Variables ---
call npx.cmd vercel@latest env ls production
if errorlevel 1 goto :fail

echo.
echo Checking whether Production can actually inject a supported server key...
call npx.cmd vercel@latest env run -e production -- node scripts/check-production-admin-env.mjs
if not errorlevel 1 goto :gitdeploy

echo.
echo No supported server-only account-management key was found in Production.
echo APPWRITE_ADMIN_API_KEY is recommended.
echo You will now be asked for the Appwrite key value.
echo The value is entered directly into Vercel and is NOT written to this folder.
echo.
call npx.cmd vercel@latest env add APPWRITE_ADMIN_API_KEY production --sensitive --force
if errorlevel 1 goto :fail

echo.
echo Verifying Production again...
call npx.cmd vercel@latest env run -e production -- node scripts/check-production-admin-env.mjs
if errorlevel 1 goto :fail

:gitdeploy
echo.
echo Production secret verified.
echo.
echo Triggering a fresh Production deployment through GitHub...
where git >nul 2>&1
if errorlevel 1 (
  echo Git is not available in PATH.
  goto :fail
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo This folder is not a Git repository: %CD%
  echo Use your Git-connected CaneSprout folder, normally D:\Germ.
  goto :fail
)

echo.
echo Current Git status:
git status --short

git add -A
if errorlevel 1 goto :fail

git diff --cached --quiet
if errorlevel 1 (
  echo Committing CaneSprout v2.6.3 changes...
  git commit -m "CaneSprout v2.6.3 production account management repair"
  if errorlevel 1 goto :fail
) else (
  echo No changed files need committing. Creating a safe empty redeploy commit...
  git commit --allow-empty -m "Redeploy CaneSprout with Production admin environment"
  if errorlevel 1 goto :fail
)

echo.
echo Pushing main to GitHub...
git push origin main
if errorlevel 1 goto :fail

echo.
echo ===============================================================
echo SUCCESS.
echo GitHub has received the new commit.
echo Your linked Vercel project should now build a fresh Production deployment.
echo.
echo Wait for the Vercel deployment to show Ready, then open:
echo   https://germ-database.vercel.app/canesprout-admin-api
echo.
echo You want JSON containing:
echo   "configured": true
echo and one of these keySource values:
echo   APPWRITE_ADMIN_API_KEY
echo   APPWRITE_API_KEY

echo.
echo Then hard refresh the site once and open:
echo   Admin Center ^> Account Management
pause
exit /b 0

:fail
echo.
echo Repair did not complete.
echo.
echo Folder used: %CD%
echo Make sure D:\Germ is the Git repository linked to the same GitHub/Vercel project.
echo No Appwrite schema migration is required for this repair.
echo.
pause
exit /b 1
