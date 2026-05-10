<#
.SYNOPSIS
    Emergency reset — restore TRAE SOLO CN to original official state
.DESCRIPTION
    Reads patch definitions and reverses ALL applied patches by restoring
    originalValue for product.json patches, and restoring settings.json
    from backup. This is the nuclear option — one command to go fully clean.
.PARAMETER DryRun
    Show what would be done without making any changes
.PARAMETER SkipSettings
    Skip settings.json rollback (only reset product.json)
.PARAMETER SkipProduct
    Skip product.json rollback (only reset settings.json)
.EXAMPLE
    .\emergency-reset.ps1
.EXAMPLE
    .\emergency-reset.ps1 -DryRun
.EXAMPLE
    .\emergency-reset.ps1 -SkipSettings
#>
param(
    [switch]$DryRun,
    [switch]$SkipSettings,
    [switch]$SkipProduct
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$BackupDir = Join-Path $RootDir "backups"
$DefPath = Join-Path $RootDir "patches\definitions.json"

function Write-Status {
    param([string]$Icon, [string]$Msg, [string]$Color = "White")
    Write-Host "  [$Icon] $Msg" -ForegroundColor $Color
}

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Red
Write-Host "  ║   TRAE SOLO CN — EMERGENCY RESET        ║" -ForegroundColor Red
Write-Host "  ║   Restore to original official state     ║" -ForegroundColor Red
Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Red
Write-Host ""

if (-not [System.IO.File]::Exists($DefPath)) {
    Write-Status "ERROR" "Definitions file not found: $DefPath" "Red"
    exit 2
}

$defRaw = [System.IO.File]::ReadAllText($DefPath)
$def = $defRaw | ConvertFrom-Json
$ProductPath = $def.targetPath
$SettingsPath = ""
$settingsTargetProp = $def.PSObject.Properties["settingsTargetPath"]
if ($settingsTargetProp) { $SettingsPath = $settingsTargetProp.Value }
if (-not $SettingsPath) {
    $SettingsPath = Join-Path $env:APPDATA "TRAE SOLO CN\User\settings.json"
}

$Patches = @($def.patches)
$JsonPatches = @($Patches | Where-Object { $_.type -ne "settings" -and $_.enabled -eq $true })
$SettingsPatches = @($Patches | Where-Object { $_.type -eq "settings" -and $_.enabled -eq $true })

Write-Status "INFO" "Product.json: $ProductPath" "Gray"
Write-Status "INFO" "Settings.json: $SettingsPath" "Gray"
Write-Status "INFO" "Patches to reverse: $($JsonPatches.Count) JSON + $($SettingsPatches.Count) Settings" "Gray"
Write-Host ""

if (-not $DryRun) {
    Write-Host "  This will REVERSE all patches and restore original values." -ForegroundColor Yellow
    Write-Host "  Press Ctrl+C to cancel, or wait 3 seconds..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
}

# ═══════════════════════════════════════════════════════════════════════════════
# PART 1: Reverse product.json patches
# ═══════════════════════════════════════════════════════════════════════════════

$productReversed = 0
$productSkipped = 0
$productFailed = 0

if (-not $SkipProduct -and $JsonPatches.Count -gt 0) {
    Write-Host "── product.json ──────────────────────────────────" -ForegroundColor Cyan

    if (-not [System.IO.File]::Exists($ProductPath)) {
        Write-Status "ERROR" "product.json not found: $ProductPath" "Red"
        $productFailed = $JsonPatches.Count
    } else {
        $jsonRaw = [System.IO.File]::ReadAllText($ProductPath)
        try {
            $jsonObj = $jsonRaw | ConvertFrom-Json
        } catch {
            Write-Status "ERROR" "Failed to parse product.json: $_" "Red"
            $productFailed = $JsonPatches.Count
            $jsonObj = $null
        }

        if ($null -ne $jsonObj) {
            if (-not $DryRun) {
                if (-not [System.IO.Directory]::Exists($BackupDir)) {
                    [System.IO.Directory]::CreateDirectory($BackupDir) | Out-Null
                }
                $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
                $BkFile = Join-Path $BackupDir "product.json.$Timestamp.pre-reset"
                [System.IO.File]::Copy($ProductPath, $BkFile, $true)
                Write-Status "OK" "Pre-reset backup: $([System.IO.Path]::GetFileName($BkFile))" "Green"
            }

            function Get-JsonPathNode {
                param([PSCustomObject]$Root, [string]$Path)
                $cleanPath = $Path
                if ($cleanPath.StartsWith("$.")) { $cleanPath = $cleanPath.Substring(2) }
                elseif ($cleanPath.StartsWith("$")) { $cleanPath = $cleanPath.Substring(1) }
                $segments = $cleanPath.Split(".")
                $current = $Root
                for ($i = 0; $i -lt $segments.Count - 1; $i++) {
                    $seg = $segments[$i]
                    if ($seg -match '^(.+?)\[(\d+)\]$') {
                        $arrayName = $Matches[1]
                        $arrayIdx = [int]$Matches[2]
                        $current = $current.$arrayName[$arrayIdx]
                    } else {
                        $current = $current.$seg
                    }
                    if ($null -eq $current) {
                        return @{ Value = $null; Found = $false; Parent = $null; LeafName = $null }
                    }
                }
                $lastSeg = $segments[-1]
                if ($lastSeg -match '^(.+?)\[(\d+)\]$') {
                    $arrayName = $Matches[1]
                    $arrayIdx = [int]$Matches[2]
                    return @{ Value = $current.$arrayName[$arrayIdx]; Found = $true; Parent = $current; LeafName = $lastSeg }
                }
                $propVal = $current.PSObject.Properties[$lastSeg]
                if ($null -eq $propVal) {
                    return @{ Value = $null; Found = $false; Parent = $current; LeafName = $lastSeg }
                }
                return @{ Value = $propVal.Value; Found = $true; Parent = $current; LeafName = $lastSeg }
            }

            function Set-JsonPathValue {
                param([PSCustomObject]$Root, [string]$Path, $Value)
                $cleanPath = $Path
                if ($cleanPath.StartsWith("$.")) { $cleanPath = $cleanPath.Substring(2) }
                elseif ($cleanPath.StartsWith("$")) { $cleanPath = $cleanPath.Substring(1) }
                $segments = $cleanPath.Split(".")
                $current = $Root
                for ($i = 0; $i -lt $segments.Count - 1; $i++) {
                    $seg = $segments[$i]
                    if ($seg -match '^(.+?)\[(\d+)\]$') {
                        $arrayName = $Matches[1]
                        $arrayIdx = [int]$Matches[2]
                        $current = $current.$arrayName[$arrayIdx]
                    } else {
                        $current = $current.$seg
                    }
                    if ($null -eq $current) { return $false }
                }
                $lastSeg = $segments[-1]
                if ($lastSeg -match '^(.+?)\[(\d+)\]$') {
                    $arrayName = $Matches[1]
                    $arrayIdx = [int]$Matches[2]
                    $current.$arrayName[$arrayIdx] = $Value
                    return $true
                }
                $current.$lastSeg = $Value
                return $true
            }

            foreach ($patch in $JsonPatches) {
                $operations = @($patch.operations)
                $patchHasChange = $false

                foreach ($op in $operations) {
                    $path = $op.path
                    $originalValue = $null
                    if ($op.PSObject.Properties.Name -contains "originalValue") {
                        $originalValue = $op.originalValue
                    }

                    if ($null -eq $originalValue) {
                        Write-Status "WARN" "$($patch.id): No originalValue recorded for [$path] — skipping" "Yellow"
                        $productSkipped++
                        continue
                    }

                    $node = Get-JsonPathNode -Root $jsonObj -Path $path
                    if (-not $node.Found) {
                        Write-Status "WARN" "$($patch.id): Path not found in current file [$path] — skipping" "Yellow"
                        $productSkipped++
                        continue
                    }

                    if ("$($node.Value)" -eq "$originalValue") {
                        Write-Status "OK" "$($patch.id): Already original [$path]" "DarkGray"
                        continue
                    }

                    if ($DryRun) {
                        Write-Status "DRY" "$($patch.id): Would restore [$path] from '$($node.Value)' to '$originalValue'" "DarkYellow"
                    } else {
                        $setOk = Set-JsonPathValue -Root $jsonObj -Path $path -Value $originalValue
                        if ($setOk) {
                            Write-Status "OK" "$($patch.id): Restored [$path] -> $originalValue" "Green"
                            $patchHasChange = $true
                        } else {
                            Write-Status "ERROR" "$($patch.id): Failed to set [$path]" "Red"
                            $productFailed++
                        }
                    }
                }

                if ($patchHasChange) { $productReversed++ }
            }

            if ($productReversed -gt 0 -and -not $DryRun) {
                $outputJson = $jsonObj | ConvertTo-Json -Depth 100
                try {
                    $null = $outputJson | ConvertFrom-Json
                    Write-Status "OK" "product.json JSON validation passed" "Green"
                } catch {
                    Write-Status "ERROR" "product.json JSON validation FAILED! Aborting write." "Red"
                    Write-Status "WARN" "Restoring from pre-reset backup..." "Yellow"
                    [System.IO.File]::Copy($BkFile, $ProductPath, $true)
                    Write-Status "OK" "Pre-reset backup restored" "Green"
                    exit 1
                }
                [System.IO.File]::WriteAllText($ProductPath, $outputJson)
                Write-Status "OK" "product.json written successfully" "Cyan"
            }
        }
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# PART 2: Reverse settings.json patches
# ═══════════════════════════════════════════════════════════════════════════════

$settingsReversed = 0
$settingsSkipped = 0
$settingsFailed = 0

if (-not $SkipSettings -and $SettingsPatches.Count -gt 0) {
    Write-Host ""
    Write-Host "── settings.json ─────────────────────────────────" -ForegroundColor Cyan

    $backupFiles = @()
    if ([System.IO.Directory]::Exists($BackupDir)) {
        $backupFiles = @(Get-ChildItem -Path $BackupDir -Filter "settings.json.*.backup" | Sort-Object LastWriteTime -Descending)
    }

    $preResetFiles = @()
    if ([System.IO.Directory]::Exists($BackupDir)) {
        $preResetFiles = @(Get-ChildItem -Path $BackupDir -Filter "settings.json.*.pre-reset" | Sort-Object LastWriteTime -Descending)
    }

    $allSettingsBackups = @($backupFiles) + @($preResetFiles) | Sort-Object LastWriteTime -Descending

    if ($allSettingsBackups.Count -gt 0) {
        $selectedBackup = $allSettingsBackups[0]
        Write-Status "OK" "Found settings backup: $($selectedBackup.Name)" "Green"

        if (-not $DryRun) {
            if ([System.IO.File]::Exists($SettingsPath)) {
                $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
                $PreResetFile = Join-Path $BackupDir "settings.json.$Timestamp.pre-reset"
                [System.IO.File]::Copy($SettingsPath, $PreResetFile, $true)
                Write-Status "OK" "Pre-reset snapshot: $([System.IO.Path]::GetFileName($PreResetFile))" "Green"
            }

            $backupContent = [System.IO.File]::ReadAllText($selectedBackup.FullName)
            try {
                $null = $backupContent | ConvertFrom-Json
                Write-Status "OK" "Backup JSON validation passed" "Green"
            } catch {
                Write-Status "ERROR" "Backup JSON is corrupted: $_" "Red"
                Write-Status "WARN" "Aborting settings rollback" "Yellow"
                $settingsFailed = $SettingsPatches.Count
                $backupContent = $null
            }

            if ($null -ne $backupContent) {
                [System.IO.File]::Copy($selectedBackup.FullName, $SettingsPath, $true)
                Write-Status "OK" "settings.json restored from backup" "Cyan"
                $settingsReversed = $SettingsPatches.Count
            }
        } else {
            Write-Status "DRY" "Would restore settings.json from: $($selectedBackup.Name)" "DarkYellow"
        }
    } else {
        Write-Status "WARN" "No settings.json backup found — will remove patched keys manually" "Yellow"

        if ([System.IO.File]::Exists($SettingsPath)) {
            $settingsRaw = [System.IO.File]::ReadAllText($SettingsPath)
            try {
                $settingsObj = $settingsRaw | ConvertFrom-Json
            } catch {
                Write-Status "ERROR" "Failed to parse settings.json: $_" "Red"
                $settingsObj = $null
            }

            if ($null -ne $settingsObj) {
                if (-not $DryRun) {
                    $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
                    $PreResetFile = Join-Path $BackupDir "settings.json.$Timestamp.pre-reset"
                    [System.IO.File]::Copy($SettingsPath, $PreResetFile, $true)
                    Write-Status "OK" "Pre-reset snapshot saved" "Green"
                }

                foreach ($patch in $SettingsPatches) {
                    $operations = @($patch.operations)
                    foreach ($op in $operations) {
                        $path = $op.path
                        $segments = $path.Split(".")
                        $current = $settingsObj
                        $navigated = $true

                        for ($i = 0; $i -lt $segments.Count - 1; $i++) {
                            $seg = $segments[$i]
                            $prop = $current.PSObject.Properties[$seg]
                            if ($null -eq $prop -or -not ($prop.Value -is [PSCustomObject])) {
                                $navigated = $false
                                break
                            }
                            $current = $prop.Value
                        }

                        if ($navigated) {
                            $leafSeg = $segments[-1]
                            $leafProp = $current.PSObject.Properties[$leafSeg]
                            if ($null -ne $leafProp) {
                                if ($DryRun) {
                                    Write-Status "DRY" "$($patch.id): Would remove [$path]" "DarkYellow"
                                } else {
                                    $current.PSObject.Properties.Remove($leafSeg) | Out-Null
                                    Write-Status "OK" "$($patch.id): Removed [$path]" "Green"
                                    $settingsReversed++
                                }
                            } else {
                                Write-Status "OK" "$($patch.id): Key not present [$path] — already clean" "DarkGray"
                            }
                        }
                    }
                }

                if ($settingsReversed -gt 0 -and -not $DryRun) {
                    $outputJson = $settingsObj | ConvertTo-Json -Depth 100
                    try {
                        $null = $outputJson | ConvertFrom-Json
                        Write-Status "OK" "settings.json JSON validation passed" "Green"
                    } catch {
                        Write-Status "ERROR" "settings.json JSON validation FAILED!" "Red"
                        exit 1
                    }
                    [System.IO.File]::WriteAllText($SettingsPath, $outputJson)
                    Write-Status "OK" "settings.json written successfully" "Cyan"
                }
            }
        } else {
            Write-Status "INFO" "settings.json does not exist — nothing to reset" "Gray"
        }
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "══════════════════════════════════════════════════" -ForegroundColor White
Write-Host "  EMERGENCY RESET SUMMARY" -ForegroundColor White
Write-Host "══════════════════════════════════════════════════" -ForegroundColor White
Write-Host "  product.json  — Reversed: $productReversed  Skipped: $productSkipped  Failed: $productFailed" -ForegroundColor $(if ($productFailed -gt 0) { "Red" } elseif ($productReversed -gt 0) { "Green" } else { "Gray" })
Write-Host "  settings.json — Reversed: $settingsReversed  Skipped: $settingsSkipped  Failed: $settingsFailed" -ForegroundColor $(if ($settingsFailed -gt 0) { "Red" } elseif ($settingsReversed -gt 0) { "Green" } else { "Gray" })
Write-Host "══════════════════════════════════════════════════" -ForegroundColor White

if ($DryRun) {
    Write-Host "  [DRY RUN] No files were modified." -ForegroundColor Yellow
    Write-Host "  Run without -DryRun to execute the reset." -ForegroundColor Yellow
} else {
    $totalFailed = $productFailed + $settingsFailed
    if ($totalFailed -eq 0) {
        Write-Host "  Reset completed successfully." -ForegroundColor Green
        Write-Host "  Restart TRAE SOLO CN to take effect." -ForegroundColor Cyan
    } else {
        Write-Host "  Some operations failed — check logs above." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "  Re-apply patches later with:" -ForegroundColor Gray
Write-Host "    .\scripts\apply-patches.ps1" -ForegroundColor Gray
Write-Host "    .\scripts\apply-settings.ps1" -ForegroundColor Gray

if ($productSkipped -gt 0 -or $productFailed -gt 0) {
    Write-Host ""
    Write-Host "  ┌─────────────────────────────────────────────┐" -ForegroundColor Yellow
    Write-Host "  │  NUCLEAR OPTION: Full Reinstall              │" -ForegroundColor Yellow
    Write-Host "  └─────────────────────────────────────────────┘" -ForegroundColor Yellow
    Write-Host "  If some patches could not be reversed, the most" -ForegroundColor Gray
    Write-Host "  reliable way to restore the official state is:" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  1. Uninstall TRAE SOLO CN:" -ForegroundColor White
    Write-Host "     D:\apps\TRAE SOLO CN\unins000.exe" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  2. Re-download and install from:" -ForegroundColor White
    Write-Host "     https://www.trae.cn/ide/download" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  3. Or keep current install and reset settings:" -ForegroundColor White
    Write-Host "     Remove-Item '$SettingsPath' -Backup" -ForegroundColor Cyan
    Write-Host "     (SOLO will recreate it on next launch)" -ForegroundColor Gray
}

exit $(if (($productFailed + $settingsFailed) -gt 0) { 1 } else { 0 })
