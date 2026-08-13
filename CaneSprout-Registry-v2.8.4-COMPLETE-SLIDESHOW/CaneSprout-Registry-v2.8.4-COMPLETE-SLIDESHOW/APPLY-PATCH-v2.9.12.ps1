param(
    [string]$ProjectPath = "D:\Germ\CaneSprout-Registry-v2.8.4-COMPLETE-SLIDESHOW\CaneSprout-Registry-v2.8.4-COMPLETE-SLIDESHOW"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host ""
Write-Host "CaneSprout v2.9.12 DEV LAUNCHER FIX" -ForegroundColor Green
Write-Host "Target: $ProjectPath"
Write-Host ""

if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) {
    throw "Project folder not found: $ProjectPath"
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath "package.json") -PathType Leaf)) {
    throw "package.json not found in target. Choose the INNER CaneSprout project folder."
}

$files = @(
    "scripts\start-dev.mjs",
    "START-CANESPROUT.cmd"
)

foreach ($relative in $files) {
    $source = Join-Path $PSScriptRoot $relative
    $target = Join-Path $ProjectPath $relative
    $parent = Split-Path -Parent $target
    if ($parent) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    Copy-Item -LiteralPath $source -Destination $target -Force
    Write-Host "  installed: $relative"
}

$packagePath = Join-Path $ProjectPath "package.json"
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json

if (-not ($package.PSObject.Properties.Name -contains "scripts")) {
    $package | Add-Member -MemberType NoteProperty -Name scripts -Value ([pscustomobject]@{})
}

if ($package.scripts.PSObject.Properties.Name -contains "dev") {
    $package.scripts.dev = "node scripts/start-dev.mjs"
} else {
    $package.scripts | Add-Member -MemberType NoteProperty -Name dev -Value "node scripts/start-dev.mjs"
}

if ($package.PSObject.Properties.Name -contains "version") {
    $package.version = "2.9.12"
}

$encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText(
    $packagePath,
    (($package | ConvertTo-Json -Depth 100) + "`n"),
    $encoding
)

Write-Host "  repaired: package.json dev script -> node scripts/start-dev.mjs"
Write-Host ""
Write-Host "Patch applied." -ForegroundColor Green
Write-Host ""
Write-Host "Recommended start command:" -ForegroundColor Cyan
Write-Host "  START-CANESPROUT.cmd"
Write-Host ""
Write-Host "npm.cmd run dev will also use the repaired launcher."
Write-Host ""
