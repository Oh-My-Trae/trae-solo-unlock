<#
.SYNOPSIS
    Rollback TRAE SOLO CN patches by restoring from backup
.DESCRIPTION
    Lists available backups and restores the selected one to the target
    product.json file. Validates JSON format after restoration.
.PARAMETER ListOnly
    Only list available backups without restoring
.PARAMETER Latest
    Restore the most recent backup automatically
.PARAMETER BackupFile
    Restore a specific backup file (full path or filename)
.PARAMETER TargetPath
    Override the target product.json path
.EXAMPLE
    .\rollback.ps1 -ListOnly
.EXAMPLE
    .\rollback.ps1 -Latest
.EXAMPLE
    .\rollback.ps1 -BackupFile "product.json.20260510-143000.backup"
#>
param(
    [switch]$ListOnly,
    [switch]$Latest,
    [string]$BackupFile = "",
    [string]$TargetPath = "",
    [string]$TargetType = "auto"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$BackupDir = Join-Path $RootDir "backups"
$DefPath = Join-Path $RootDir "patches\definitions.json"

# ── Color Output ──────────────────────────────────────────────────────────────
function Write-Status {
    param([string]$Icon, [string]$Msg, [string]$Color = "White")
    Write-Host "  [$Icon] $Msg" -ForegroundColor $Color
}

# ── Resolve target path ───────────────────────────────────────────────────────
if (-not $TargetPath) {
    if ([System.IO.File]::Exists($DefPath)) {
        $def = [System.IO.File]::ReadAllText($DefPath) | ConvertFrom-Json
        $TargetPath = $def.targetPath
    } else {
        $TargetPath = "D:\apps\TRAE SOLO CN\resources\app\product.json"
    }
}

# ── Resolve target type and settings path ─────────────────────────────────────
$SettingsPath = ""
if ([System.IO.File]::Exists($DefPath)) {
    $def = [System.IO.File]::ReadAllText($DefPath) | ConvertFrom-Json
    $settingsTargetProp = $def.PSObject.Properties["settingsTargetPath"]
    if ($settingsTargetProp) { $SettingsPath = $settingsTargetProp.Value }
    if (-not $SettingsPath) {
        $SettingsPath = Join-Path $env:APPDATA "TRAE SOLO CN\User\settings.json"
    }
}

# ── Determine target file based on type ───────────────────────────────────────
if ($TargetType -eq "settings" -and $SettingsPath) {
    $TargetPath = $SettingsPath
    Write-Status "INFO" "Rollback target: settings.json" "Gray"
} elseif ($TargetType -eq "auto" -and $BackupFile) {
    # Auto-detect type from backup filename
    if ($BackupFile -match "settings\.json") {
        $TargetPath = $SettingsPath
        Write-Status "INFO" "Auto-detected rollback target: settings.json" "Gray"
    }
}

# ── Check backup directory ────────────────────────────────────────────────────
if (-not [System.IO.Directory]::Exists($BackupDir)) {
    Write-Status "ERROR" "Backup directory not found: $BackupDir" "Red"
    Write-Status "HINT" "Run apply-patches.ps1 first to create backups" "Yellow"
    exit 2
}

# ── List available backups ────────────────────────────────────────────────────
$backups = Get-ChildItem -Path $BackupDir -Filter "*.backup" | Sort-Object LastWriteTime -Descending

if ($backups.Count -eq 0) {
    Write-Status "ERROR" "No backup files found in: $BackupDir" "Red"
    exit 2
}

Write-Host "[solo-unlock] Available backups:" -ForegroundColor Cyan
Write-Host ""

$index = 0
foreach ($bk in $backups) {
    $index++
    $size = [math]::Round($bk.Length / 1KB, 1)
    $time = $bk.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
    Write-Host "  [$index] $($bk.Name)" -ForegroundColor White -NoNewline
    Write-Host "  ($size KB, $time)" -ForegroundColor Gray
}

Write-Host ""

if ($ListOnly) {
    exit 0
}

# ── Select backup to restore ──────────────────────────────────────────────────
$selectedBackup = $null

if ($Latest) {
    $selectedBackup = $backups[0]
    Write-Status "OK" "Selected latest backup: $($selectedBackup.Name)" "Green"
} elseif ($BackupFile) {
    # Check if it's a full path
    if ([System.IO.File]::Exists($BackupFile)) {
        $selectedBackup = Get-Item $BackupFile
    } else {
        # Try as filename in backup dir
        $fullPath = Join-Path $BackupDir $BackupFile
        if ([System.IO.File]::Exists($fullPath)) {
            $selectedBackup = Get-Item $fullPath
        } else {
            Write-Status "ERROR" "Backup file not found: $BackupFile" "Red"
            exit 2
        }
    }
    Write-Status "OK" "Selected backup: $($selectedBackup.Name)" "Green"
} else {
    # Interactive selection
    Write-Host "Enter backup number to restore (or 'q' to quit): " -ForegroundColor Yellow -NoNewline
    $choice = Read-Host

    if ($choice -eq "q" -or $choice -eq "Q") {
        Write-Status "INFO" "Rollback cancelled" "Yellow"
        exit 0
    }

    $choiceIdx = 0
    if ([int]::TryParse($choice, [ref]$choiceIdx) -and $choiceIdx -ge 1 -and $choiceIdx -le $backups.Count) {
        $selectedBackup = $backups[$choiceIdx - 1]
        Write-Status "OK" "Selected backup: $($selectedBackup.Name)" "Green"
    } else {
        Write-Status "ERROR" "Invalid selection: $choice" "Red"
        exit 2
    }
}

# ── Validate backup file ──────────────────────────────────────────────────────
Write-Status "INFO" "Validating backup file..." "Gray"
$backupContent = [System.IO.File]::ReadAllText($selectedBackup.FullName)

try {
    $null = $backupContent | ConvertFrom-Json
    Write-Status "OK" "Backup JSON format is valid" "Green"
} catch {
    Write-Status "ERROR" "Backup JSON is corrupted: $_" "Red"
    Write-Status "WARN" "Aborting rollback to prevent data loss" "Yellow"
    exit 1
}

# ── Check target file ─────────────────────────────────────────────────────────
if (-not [System.IO.File]::Exists($TargetPath)) {
    Write-Status "ERROR" "Target file not found: $TargetPath" "Red"
    exit 2
}

# ── Create pre-rollback backup ────────────────────────────────────────────────
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BaseName = [System.IO.Path]::GetFileName($TargetPath)
$PreRollbackFile = Join-Path $BackupDir "$BaseName.$Timestamp.pre-rollback"

[System.IO.File]::Copy($TargetPath, $PreRollbackFile, $true)
Write-Status "OK" "Pre-rollback snapshot saved: $([System.IO.Path]::GetFileName($PreRollbackFile))" "Green"

# ── Restore backup ────────────────────────────────────────────────────────────
[System.IO.File]::Copy($selectedBackup.FullName, $TargetPath, $true)
Write-Status "OK" "Restored: $($selectedBackup.Name) -> $TargetPath" "Green"

# ── Validate restored file ────────────────────────────────────────────────────
$restoredContent = [System.IO.File]::ReadAllText($TargetPath)
try {
    $null = $restoredContent | ConvertFrom-Json
    Write-Status "OK" "Restored file JSON format is valid" "Green"
} catch {
    Write-Status "ERROR" "Restored file JSON is corrupted!" "Red"
    Write-Status "WARN" "Restoring pre-rollback snapshot..." "Yellow"
    [System.IO.File]::Copy($PreRollbackFile, $TargetPath, $true)
    Write-Status "OK" "Pre-rollback snapshot restored" "Green"
    exit 1
}

# ── Cleanup old backups (keep latest 10) ──────────────────────────────────────
$allBackups = Get-ChildItem -Path $BackupDir -Filter "*.backup" | Sort-Object LastWriteTime -Descending
if ($allBackups.Count -gt 10) {
    $toRemove = $allBackups | Select-Object -Skip 10
    foreach ($old in $toRemove) {
        Remove-Item $old.FullName -Force
    }
    Write-Status "INFO" "Cleaned up $($toRemove.Count) old backup(s), keeping latest 10" "Gray"
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor White
Write-Host "  Rollback completed successfully" -ForegroundColor Green
Write-Host "  From: $($selectedBackup.Name)" -ForegroundColor Gray
Write-Host "  To:   $TargetPath" -ForegroundColor Gray
Write-Host "=========================================" -ForegroundColor White
Write-Host "  Restart TRAE SOLO CN to take effect." -ForegroundColor Cyan

exit 0
