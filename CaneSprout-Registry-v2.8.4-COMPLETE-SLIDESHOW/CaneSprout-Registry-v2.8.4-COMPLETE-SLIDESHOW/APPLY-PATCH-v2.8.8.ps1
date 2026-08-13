param(
    [string]$ProjectPath = "D:\Germ\CaneSprout-Registry-v2.8.7"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host ""
Write-Host "CaneSprout v2.8.7 -> v2.8.8 CINEMATIC CROSS-FADE PATCH" -ForegroundColor Green
Write-Host "Target: $ProjectPath"
Write-Host ""

if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) {
    throw "Project folder not found: $ProjectPath"
}

$files = @(
    "src\backgroundSlideshow.js",
    "src\backgroundSlideshow.css",
    "public\version.json"
)

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $env:TEMP "canesprout-v2.8.8-patch-backup-$stamp"
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

foreach ($relative in $files) {
    $source = Join-Path $PSScriptRoot $relative
    $target = Join-Path $ProjectPath $relative

    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Patch file missing: $relative"
    }

    if (Test-Path -LiteralPath $target -PathType Leaf) {
        $backup = Join-Path $backupRoot $relative
        $backupParent = Split-Path -Parent $backup
        New-Item -ItemType Directory -Force -Path $backupParent | Out-Null
        Copy-Item -LiteralPath $target -Destination $backup -Force
    }

    $targetParent = Split-Path -Parent $target
    New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Force

    Write-Host "  updated: $relative"
}

$packagePath = Join-Path $ProjectPath "package.json"
if (Test-Path -LiteralPath $packagePath -PathType Leaf) {
    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    if ($package.PSObject.Properties.Name -contains "version") {
        $package.version = "2.8.8"
        $encoding = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText(
            $packagePath,
            (($package | ConvertTo-Json -Depth 100) + "`n"),
            $encoding
        )
        Write-Host "  updated: package.json version -> 2.8.8"
    }
}

Write-Host ""
Write-Host "Patch applied successfully." -ForegroundColor Green
Write-Host "Backup: $backupRoot"
Write-Host ""
Write-Host "New slideshow timing:" -ForegroundColor Cyan
Write-Host "  - 7 seconds per image"
Write-Host "  - 3.4 second cinematic cross-fade"
Write-Host "  - gentler, slower zoom motion"
Write-Host ""
Write-Host "Now run:" -ForegroundColor Yellow
Write-Host "  cd /d `"$ProjectPath`""
Write-Host "  npm.cmd run dev"
Write-Host ""
Write-Host "Then press Ctrl+Shift+R once in the browser."
Write-Host ""
