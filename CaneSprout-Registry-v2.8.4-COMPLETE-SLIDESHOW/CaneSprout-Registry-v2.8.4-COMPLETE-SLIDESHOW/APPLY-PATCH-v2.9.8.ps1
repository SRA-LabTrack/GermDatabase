param(
    [string]$ProjectPath = "D:\Germ\CaneSprout-Registry-v2.9.7"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host ""
Write-Host "CaneSprout v2.9.7 -> v2.9.8 EDITOR / MULTI-EXPORT / ICON PATCH" -ForegroundColor Green
Write-Host "Target: $ProjectPath"
Write-Host ""

if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) {
    throw "Project folder not found: $ProjectPath"
}

$files = @(
    "src\App.jsx",
    "src\components\SpreadsheetEditorModal.jsx",
    "src\components\ExportExcelModal.jsx",
    "src\components\SugarcaneIcon.jsx",
    "src\styles.css",
    "public\icon.svg",
    "public\version.json"
)

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $env:TEMP "canesprout-v2.9.8-backup-$stamp"
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
        $package.version = "2.9.8"
        $encoding = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText(
            $packagePath,
            (($package | ConvertTo-Json -Depth 100) + "`n"),
            $encoding
        )
    }
}

Write-Host ""
Write-Host "Patch applied successfully." -ForegroundColor Green
Write-Host "Backup: $backupRoot"
Write-Host ""
Write-Host "Fixed:" -ForegroundColor Cyan
Write-Host "  - Spreadsheet editor has an always-visible Close editor button"
Write-Host "  - Spreadsheet editor now sits above toolbar/background controls"
Write-Host "  - Background button is hidden while spreadsheet editor is open"
Write-Host "  - Spreadsheet workspace fills the device cleanly"
Write-Host "  - Export Selected varieties supports multiple selections"
Write-Host "  - Multiple selected records are loaded in parallel batches"
Write-Host "  - Sugarcane icon redrawn with 3 segmented stalks + long leaves"
Write-Host "  - Browser/app icon updated to match"
Write-Host ""
Write-Host "Run npm.cmd run dev, then Ctrl+Shift+R once."
Write-Host ""
