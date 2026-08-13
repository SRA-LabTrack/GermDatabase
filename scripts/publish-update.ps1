param(
  [Parameter(Mandatory=$true)][string]$Version
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must look like 1.0.1' }
npm.cmd version $Version --no-git-tag-version
npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git add -A
git commit -m "Release v$Version"
git push origin HEAD
git tag "v$Version"
git push origin "v$Version"
Write-Host "Published source and tag v$Version. GitHub Actions will build the Windows installer." -ForegroundColor Green
