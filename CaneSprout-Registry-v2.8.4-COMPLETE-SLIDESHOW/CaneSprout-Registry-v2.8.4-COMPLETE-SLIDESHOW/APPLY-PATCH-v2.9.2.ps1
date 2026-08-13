param(
    [string]$ProjectPath = "D:\Germ\CaneSprout-Registry-v2.9.1"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host ""
Write-Host "CaneSprout v2.9.1 -> v2.9.2 EXCEL TOOLS PATCH" -ForegroundColor Green
Write-Host "Target: $ProjectPath"
Write-Host ""

if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) {
    throw "Project folder not found: $ProjectPath"
}

$files = @(
    "src\App.jsx",
    "src\styles.css",
    "public\version.json",
    "package.json"
)

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $env:TEMP "canesprout-v2.9.2-excel-tools-backup-$stamp"
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

Write-Host ""
Write-Host "Patch applied successfully." -ForegroundColor Green
Write-Host "Backup: $backupRoot"
Write-Host ""
Write-Host "Excel toolbar now contains:" -ForegroundColor Cyan
Write-Host "  - Import Excel"
Write-Host "  - Export Excel (.xlsx)"
Write-Host "  - Edit in Excel format"
Write-Host ""
Write-Host "The redundant hero button/pill section has been removed."
Write-Host "Background timing remains 5 seconds / 2.5 second cross-fade."
Write-Host ""
Write-Host "Run npm.cmd run dev, then Ctrl+Shift+R once."
Write-Host ""
