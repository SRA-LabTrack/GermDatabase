@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if "%~1"=="" (
  echo.
  echo Drag the source Excel workbook onto this CMD file, or run:
  echo AUDIT-SOURCE-WORKBOOK.cmd "D:\path\Characterization and other attributes.xlsx"
  echo.
  set /p "SOURCE=Excel workbook path: "
) else (
  set "SOURCE=%~1"
)

if not exist "%SOURCE%" (
  echo.
  echo [ERROR] Workbook not found:
  echo %SOURCE%
  echo.
  pause
  exit /b 1
)

echo.
echo [1] Bundled/offline registry only
echo [2] Live Appwrite only ^(requires APPWRITE_API_KEY^)
echo [3] Both bundled + live Appwrite ^(requires APPWRITE_API_KEY^)
set /p "MODE=Choose 1, 2, or 3: "

if "%MODE%"=="2" (
  call npm.cmd run audit:source-match -- "%SOURCE%" --live
) else if "%MODE%"=="3" (
  call npm.cmd run audit:source-match -- "%SOURCE%" --both
) else (
  call npm.cmd run audit:source-match -- "%SOURCE%"
)

echo.
pause
