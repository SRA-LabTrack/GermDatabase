$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host 'Installing GermDatabase packages...' -ForegroundColor Cyan
npm.cmd install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host ''
  Write-Host 'Created .env from .env.example.' -ForegroundColor Yellow
  Write-Host 'Add your temporary APPWRITE_API_KEY, then run: npm run setup:appwrite' -ForegroundColor Yellow
  exit 0
}
Write-Host 'Packages installed.' -ForegroundColor Green
Write-Host 'Run npm run setup:appwrite after placing a temporary Appwrite API key in .env.'
