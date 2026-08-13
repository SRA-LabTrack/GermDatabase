@echo off
setlocal
cd /d "%~dp0"
echo Copy these patch files over your CaneSprout project root and replace existing files.
echo Then run:
echo   npm.cmd install
echo   npm.cmd run audit:duplicates
echo Do NOT delete anything yet. Send the audit output for review.
pause
