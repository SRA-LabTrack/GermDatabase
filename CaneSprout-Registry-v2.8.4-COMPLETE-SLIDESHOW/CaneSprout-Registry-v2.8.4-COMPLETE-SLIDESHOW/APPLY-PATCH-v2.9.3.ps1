param(
    [string]$ProjectPath = "D:\Germ\CaneSprout-Registry-v2.9.2"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host ""
Write-Host "CaneSprout v2.9.2 -> v2.9.3 EXCEL POPOVER FIX" -ForegroundColor Green
Write-Host "Target: $ProjectPath"
Write-Host ""

if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) {
    throw "Project folder not found: $ProjectPath"
}

$files = @(
    "src\App.jsx",
    "src\styles.css",
    "public\version.json"
)

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $env:TEMP "canesprout-v2.9.3-excel-popover-backup-$stamp"
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
        if ($backupParent) {
            New-Item -ItemType Directory -Force -Path $backupParent | Out-Null
        }
        Copy-Item -LiteralPath $target -Destination $backup -Force
    }

    $targetParent = Split-Path -Parent $target
    if ($targetParent) {
        New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
    }

    Copy-Item -LiteralPath $source -Destination $target -Force
    Write-Host "  updated: $relative"
}

$packagePath = Join-Path $ProjectPath "package.json"
if (Test-Path -LiteralPath $packagePath -PathType Leaf) {
    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    if ($package.PSObject.Properties.Name -contains "version") {
        $package.version = "2.9.3"
        $encoding = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText(
            $packagePath,
            (($package | ConvertTo-Json -Depth 100) + "`n"),
            $encoding
        )
        Write-Host "  updated: package.json version -> 2.9.3"
    }
}

Write-Host ""
Write-Host "Patch applied successfully." -ForegroundColor Green
Write-Host "Backup: $backupRoot"
Write-Host ""
Write-Host "Fixed:" -ForegroundColor Cyan
Write-Host "  - Excel dropdown can no longer be clipped by the toolbar"
Write-Host "  - Import Excel / Export Excel / Edit in Excel format are clickable"
Write-Host "  - brand title no longer truncates on normal desktop widths"
Write-Host "  - Excel menu stays anchored during resize/scroll"
Write-Host ""
Write-Host "Run npm.cmd run dev, then Ctrl+Shift+R once."
Write-Host ""
