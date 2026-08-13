param(
    [string]$ProjectPath = "D:\Germ\CaneSprout-Registry-v2.8.10"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host ""
Write-Host "Sugarcane Germplasm Resource Database v2.9.0 PATCH" -ForegroundColor Green
Write-Host "Target: $ProjectPath"
Write-Host ""

if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) {
    throw "Project folder not found: $ProjectPath"
}

$files = @(
    "index.html",
    "package.json",
    "public\icon.svg",
    "public\version.json",
    "src\App.jsx",
    "src\main.jsx",
    "src\styles.css",
    "src\components\SugarcaneIcon.jsx",
    "src\components\DetailModal.jsx",
    "src\components\RecordFormModal.jsx",
    "src\components\ImportModal.jsx",
    "src\lib\characterizationFields.js",
    "src\lib\registryApi.js"
)

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $env:TEMP "canesprout-v2.9.0-germplasm-backup-$stamp"
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
Write-Host "Preserved:" -ForegroundColor Cyan
Write-Host "  - Appwrite registry records"
Write-Host "  - 950-record bundled safety snapshot"
Write-Host "  - background image library"
Write-Host "  - 5-second slideshow interval"
Write-Host "  - 2.5-second cross-fade"
Write-Host "  - admin, import, approval, offline, and spreadsheet tools"
Write-Host ""
Write-Host "Run:" -ForegroundColor Yellow
Write-Host "  cd /d `"$ProjectPath`""
Write-Host "  npm.cmd run dev"
Write-Host ""
Write-Host "Then press Ctrl+Shift+R once in the browser."
Write-Host ""
