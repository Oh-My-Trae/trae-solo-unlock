<#
.SYNOPSIS
    Apply VSCode settings patches for TRAE SOLO CN
.DESCRIPTION
    Reads settings-type patch definitions from definitions.json and merges
    them into the SOLO user settings.json file. Supports add/replace operations
    with deep merge for nested objects. Auto-backups before modifying.
.PARAMETER DryRun
    Show what would be done without making any changes
.PARAMETER PatchId
    Apply only the specified patch ID (comma-separated for multiple)
.PARAMETER DefinitionsPath
    Override path to definitions.json
.PARAMETER SettingsPath
    Override path to the target settings.json
.EXAMPLE
    .\apply-settings.ps1
.EXAMPLE
    .\apply-settings.ps1 -DryRun
.EXAMPLE
    .\apply-settings.ps1 -PatchId "p1-auto-approve-commands"
#>
param(
    [switch]$DryRun,
    [string]$PatchId = "",
    [string]$DefinitionsPath = "",
    [string]$SettingsPath = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$BackupDir = Join-Path $RootDir "backups"

# ── Color Output ──────────────────────────────────────────────────────────────
function Write-Status {
    param([string]$Icon, [string]$Msg, [string]$Color = "White")
    Write-Host "  [$Icon] $Msg" -ForegroundColor $Color
}

# ── Resolve definitions path ──────────────────────────────────────────────────
if (-not $DefinitionsPath) {
    $DefinitionsPath = Join-Path $RootDir "patches\definitions.json"
}

if (-not [System.IO.File]::Exists($DefinitionsPath)) {
    Write-Status "ERROR" "Definitions file not found: $DefinitionsPath" "Red"
    exit 2
}

# ── Read definitions ──────────────────────────────────────────────────────────
Write-Host "[solo-settings] Loading patch definitions..." -ForegroundColor Cyan
$defRaw = [System.IO.File]::ReadAllText($DefinitionsPath)
$def = $defRaw | ConvertFrom-Json

# ── Resolve settings target path ──────────────────────────────────────────────
if (-not $SettingsPath) {
    # Try patch-level targetPath first, then definitions-level settingsTargetPath
    $settingsTargetProp = $def.PSObject.Properties["settingsTargetPath"]
    if ($settingsTargetProp) { $SettingsPath = $settingsTargetProp.Value }
    if (-not $SettingsPath) {
        $SettingsPath = Join-Path $env:APPDATA "TRAE SOLO CN\User\settings.json"
    }
}

Write-Status "INFO" "Settings target: $SettingsPath" "Gray"

# ── Filter settings-type patches ──────────────────────────────────────────────
$allPatches = @($def.patches)
$Patches = @($allPatches | Where-Object { $_.type -eq "settings" -and $_.enabled -eq $true })

Write-Status "INFO" "Settings patches found: $($Patches.Count)" "Gray"

if ($PatchId) {
    $FilterList = $PatchId.Split(",").Trim()
    $Patches = @($Patches | Where-Object { $FilterList -contains $_.id })
    Write-Status "INFO" "Filtered to: $($Patches.Count) patch(es)" "Yellow"
}

if ($Patches.Count -eq 0) {
    Write-Status "WARN" "No settings patches to apply" "Yellow"
    exit 0
}

# ── Check/create target settings file ─────────────────────────────────────────
$settingsDir = Split-Path -Parent $SettingsPath
if (-not [System.IO.Directory]::Exists($settingsDir)) {
    if (-not $DryRun) {
        [System.IO.Directory]::CreateDirectory($settingsDir) | Out-Null
        Write-Status "OK" "Created settings directory: $settingsDir" "Green"
    } else {
        Write-Status "DRY" "Would create directory: $settingsDir" "DarkGray"
    }
}

# ── Read existing settings or create empty ────────────────────────────────────
$settingsObj = $null
if ([System.IO.File]::Exists($SettingsPath)) {
    $settingsRaw = [System.IO.File]::ReadAllText($SettingsPath)
    try {
        $settingsObj = $settingsRaw | ConvertFrom-Json
    } catch {
        Write-Status "ERROR" "Failed to parse settings JSON: $_" "Red"
        exit 2
    }
} else {
    $settingsObj = [PSCustomObject]@{}
    Write-Status "INFO" "Settings file does not exist, will create new one" "Yellow"
}

# ── Deep Merge Helper ─────────────────────────────────────────────────────────
# Merges $Source into $Target recursively. For object values, deep-merges.
# For scalar/array values, overwrites.
function Merge-SettingsValue {
    param(
        [PSCustomObject]$Target,
        [string]$Property,
        $Value
    )

    $existing = $Target.PSObject.Properties[$Property]

    if ($null -eq $existing) {
        # Property does not exist - add it
        $Target | Add-Member -NotePropertyName $Property -NotePropertyValue $Value
        return @{ Action = "added"; OldValue = $null }
    }

    $currentVal = $existing.Value

    # If both are PSCustomObject (hashtable-like), deep merge
    if ($currentVal -is [PSCustomObject] -and $Value -is [PSCustomObject]) {
        $merged = $currentVal.PSObject.Copy()
        foreach ($prop in $Value.PSObject.Properties) {
            Merge-SettingsValue -Target $merged -Property $prop.Name -Value $prop.Value | Out-Null
        }
        $Target.$Property = $merged
        return @{ Action = "merged"; OldValue = $currentVal }
    }

    # Otherwise, replace
    if ("$currentVal" -eq "$Value") {
        return @{ Action = "unchanged"; OldValue = $currentVal }
    }

    $Target.$Property = $Value
    return @{ Action = "replaced"; OldValue = $currentVal }
}

# ── Navigate dot-path and set value ───────────────────────────────────────────
# Path like "chat.tools.terminal.autoApprove" navigates/creates intermediate
# objects and sets the leaf value.
function Set-SettingsPathValue {
    param(
        [PSCustomObject]$Root,
        [string]$Path,
        $Value
    )

    $segments = $Path.Split(".")
    $current = $Root

    # Navigate/create intermediate objects
    for ($i = 0; $i -lt $segments.Count - 1; $i++) {
        $seg = $segments[$i]
        $prop = $current.PSObject.Properties[$seg]

        if ($null -eq $prop) {
            # Create intermediate object
            $intermediate = [PSCustomObject]@{}
            $current | Add-Member -NotePropertyName $seg -NotePropertyValue $intermediate
            $current = $intermediate
        } elseif ($prop.Value -is [PSCustomObject]) {
            $current = $prop.Value
        } else {
            # Existing value is not an object, overwrite with new object
            $intermediate = [PSCustomObject]@{}
            $current.$seg = $intermediate
            $current = $intermediate
        }
    }

    # Set the leaf value
    $leafSeg = $segments[-1]
    $result = Merge-SettingsValue -Target $current -Property $leafSeg -Value $Value
    return $result
}

# ── Get value at dot-path ─────────────────────────────────────────────────────
function Get-SettingsPathValue {
    param(
        [PSCustomObject]$Root,
        [string]$Path
    )

    $segments = $Path.Split(".")
    $current = $Root

    for ($i = 0; $i -lt $segments.Count; $i++) {
        $seg = $segments[$i]
        $prop = $current.PSObject.Properties[$seg]

        if ($null -eq $prop) {
            return @{ Value = $null; Found = $false }
        }

        if ($i -eq $segments.Count - 1) {
            return @{ Value = $prop.Value; Found = $true }
        }

        $current = $prop.Value
        if ($null -eq $current -or -not ($current -is [PSCustomObject])) {
            return @{ Value = $null; Found = $false }
        }
    }

    return @{ Value = $null; Found = $false }
}

# ── Compare Values ────────────────────────────────────────────────────────────
function Compare-SettingsValue {
    param($Current, $Expected)

    if ($null -eq $Current -and $null -eq $Expected) { return $true }
    if ($null -eq $Current -or $null -eq $Expected) { return $false }

    # Both PSCustomObject - compare serialized
    if ($Current -is [PSCustomObject] -and $Expected -is [PSCustomObject]) {
        $curJson = $Current | ConvertTo-Json -Depth 50 -Compress
        $expJson = $Expected | ConvertTo-Json -Depth 50 -Compress
        return ($curJson -eq $expJson)
    }

    # Array comparison
    if ($Expected -is [array] -or $Current -is [array]) {
        $expArr = @($Expected)
        $curArr = @($Current)
        if ($expArr.Count -ne $curArr.Count) { return $false }
        for ($i = 0; $i -lt $expArr.Count; $i++) {
            if ("$($expArr[$i])" -ne "$($curArr[$i])") { return $false }
        }
        return $true
    }

    return ("$Current" -eq "$Expected")
}

# ── Create backup directory ───────────────────────────────────────────────────
if (-not [System.IO.Directory]::Exists($BackupDir)) {
    [System.IO.Directory]::CreateDirectory($BackupDir) | Out-Null
}

# ── Auto-backup ───────────────────────────────────────────────────────────────
if ([System.IO.File]::Exists($SettingsPath)) {
    $Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $BaseName = [System.IO.Path]::GetFileName($SettingsPath)
    $BackupFile = Join-Path $BackupDir "$BaseName.$Timestamp.backup"

    if (-not $DryRun) {
        [System.IO.File]::Copy($SettingsPath, $BackupFile, $true)
        Write-Status "OK" "Backup created: $([System.IO.Path]::GetFileName($BackupFile))" "Green"
    } else {
        Write-Status "DRY" "Would backup to: $([System.IO.Path]::GetFileName($BackupFile))" "DarkGray"
    }
}

# ── Apply patches ─────────────────────────────────────────────────────────────
$appliedCount = 0
$skippedCount = 0
$failedCount = 0
$results = @()

foreach ($patch in $Patches) {
    $patchApplied = $true
    $patchOps = @()
    $operations = @($patch.operations)
    $hasChange = $false

    foreach ($op in $operations) {
        $path = $op.path
        $expectedValue = $op.value

        # Check current value
        $current = Get-SettingsPathValue -Root $settingsObj -Path $path

        if ($current.Found -and (Compare-SettingsValue -Current $current.Value -Expected $expectedValue)) {
            Write-Status "OK" "$($patch.id): Already applied [$path]" "Green"
            $patchOps += @{ Path = $path; Status = "already_applied"; Current = $current.Value; Expected = $expectedValue }
            continue
        }

        # Apply the operation
        if (-not $DryRun) {
            $result = Set-SettingsPathValue -Root $settingsObj -Path $path -Value $expectedValue
            $actionLabel = switch ($result.Action) {
                "added"     { "Added" }
                "replaced"  { "Replaced" }
                "merged"    { "Merged" }
                "unchanged" { "Unchanged" }
                default     { $result.Action }
            }
            Write-Status "OK" "$($patch.id) ($($patch.name)): $actionLabel [$path]" "Green"
            $patchOps += @{ Path = $path; Status = "applied"; Action = $result.Action; OldValue = $result.OldValue; Expected = $expectedValue }
            $hasChange = $true
        } else {
            Write-Status "DRY" "$($patch.id) ($($patch.name)): Would apply [$path]" "DarkGreen"
            $patchOps += @{ Path = $path; Status = "would_apply"; Expected = $expectedValue }
        }
    }

    # Determine patch-level status
    $hasFailure = $patchOps | Where-Object { $_.Status -eq "failed" }
    $allAlreadyApplied = ($patchOps | Where-Object { $_.Status -ne "already_applied" }).Count -eq 0

    if ($hasFailure) {
        $failedCount++
        $results += @{ Id = $patch.id; Status = "failed"; Ops = $patchOps }
    } elseif ($allAlreadyApplied) {
        $skippedCount++
        $results += @{ Id = $patch.id; Status = "already_applied"; Ops = $patchOps }
    } else {
        $appliedCount++
        $results += @{ Id = $patch.id; Status = "applied"; Ops = $patchOps }
    }
}

# ── Validate and write result ─────────────────────────────────────────────────
if ($appliedCount -gt 0 -and -not $DryRun) {
    # Serialize back to JSON with proper formatting (4-space indent)
    $outputJson = $settingsObj | ConvertTo-Json -Depth 100

    # Validate JSON format
    try {
        $null = $outputJson | ConvertFrom-Json
        Write-Status "OK" "Settings JSON format validation passed" "Green"
    } catch {
        Write-Status "ERROR" "Settings JSON format validation FAILED! Aborting write." "Red"
        Write-Status "ERROR" "Error: $_" "Red"
        Write-Status "WARN" "Settings file NOT modified. Original content preserved." "Yellow"
        exit 1
    }

    # Write the patched settings file
    [System.IO.File]::WriteAllText($SettingsPath, $outputJson)
    Write-Host ""
    Write-Status "OK" "Settings file written successfully: $SettingsPath" "Cyan"
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=========================================" -ForegroundColor White
Write-Host "  [Settings] Applied:  $appliedCount" -ForegroundColor $(if ($appliedCount -gt 0) { "Green" } else { "Gray" })
Write-Host "  [Settings] Skipped:  $skippedCount (already applied)" -ForegroundColor Gray
Write-Host "  [Settings] Failed:   $failedCount" -ForegroundColor $(if ($failedCount -gt 0) { "Red" } else { "Gray" })
Write-Host "=========================================" -ForegroundColor White

if ($DryRun) {
    Write-Host "  [DRY RUN] No files were modified." -ForegroundColor Yellow
} else {
    Write-Host "  Restart TRAE SOLO CN to take effect." -ForegroundColor Cyan
}

exit $(if ($failedCount -gt 0) { 1 } else { 0 })
