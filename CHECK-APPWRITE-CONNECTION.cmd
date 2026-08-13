@echo off
setlocal
cd /d "%~dp0"
set "APPWRITE_HOST=fra.cloud.appwrite.io"
set "APPWRITE_URL=https://fra.cloud.appwrite.io/v1"

echo ============================================================
echo CaneSprout Registry Appwrite connectivity check
echo ============================================================
echo.
echo [1/4] Testing Appwrite over Node HTTPS...
node -e "const u=process.env.APPWRITE_ENDPOINT||process.env.VITE_APPWRITE_ENDPOINT||'%APPWRITE_URL%'; const h={'X-Appwrite-Project':'6a744cda00030236187b'}; console.log('Testing:',u); fetch(u+'/health/version',{headers:h,signal:AbortSignal.timeout(15000)}).then(async r=>{console.log('HTTP status:',r.status); console.log((await r.text()).slice(0,500)); if(r.status>=500) process.exitCode=2;}).catch(e=>{console.error('FAILED:',e.message); console.error('CAUSE:',e.cause||'none'); process.exitCode=1;})"
echo.
echo [2/4] DNS lookup...
nslookup %APPWRITE_HOST%
echo.
echo [3/4] HTTPS port 443...
powershell -NoProfile -Command "Test-NetConnection %APPWRITE_HOST% -Port 443"
echo.
echo [4/4] Windows HTTPS request...
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri '%APPWRITE_URL%/health/version' -Headers @{'X-Appwrite-Project'='6a744cda00030236187b'} -TimeoutSec 15; Write-Host ('HTTP status: ' + [int]$r.StatusCode); Write-Host $r.Content } catch { Write-Host ('FAILED: ' + $_.Exception.Message) -ForegroundColor Red }"
echo.
echo If Node and PowerShell both connect but login says Failed to fetch,
echo make sure Appwrite Project ^> Platforms contains a Web platform with hostname: localhost
echo.
pause
