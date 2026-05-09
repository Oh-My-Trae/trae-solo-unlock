<#
.SYNOPSIS
    Apply TRAE SOLO CN patches to product.json
.DESCRIPTION
    Reads patch definitions from patches/definitions.json and applies them
    to the target JSON file. Uses PowerShell native JSON operations.
    Auto-backups before modifying.
.PARAMETER DryRun
    Show what would be done without making any changes
.PARAMETER PatchId
    Apply only the specified patch ID (comma-separated for multiple)
.PARAMETER DefinitionsPath
    Override path to definitions.json
.EXAMPLE
    .\apply-patches.ps1
.EXAMPLE
    .\apply-patches.ps1 -DryRun
.EXAMPLE
    .\apply-patches.ps1 -PatchId "p4-computer-use-enable"
.EXAMPLE
    .\apply-patches.ps1 -PatchId "p4-computer-use-enable,p4-worktree-enable"
#>
param(
    [switch]$DryRun,
    [string]$PatchId = "",
    [string]$DefinitionsPath = ""
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
Write-Host "[solo-unlock] Loading patch definitions..." -ForegroundColor Cyan
$defRaw = [System.IO.File]::ReadAllText($DefinitionsPath)
$def = $defRaw | ConvertFrom-Json
$TargetPath = $def.targetPath
$Patches = @($def.patches)

Write-Status "INFO" "Target: $TargetPath" "Gray"
Write-Status "INFO" "Patches defined: $($Patches.Count)" "Gray"
Write-Status "INFO" "Format version: $($def.version)" "Gray"

# ── Separate patches by type ──────────────────────────────────────────────────
$JsonPatches = @($Patches | Where-Object { $_.type -ne "settings" })
$SettingsPatches = @($Patches | Where-Object { $_.type -eq "settings" })

Write-Status "INFO" "JSON patches: $($JsonPatches.Count), Settings patches: $($SettingsPatches.Count)" "Gray"

# ── Delegate settings patches ─────────────────────────────────────────────────
$settingsExitCode = 0
if ($SettingsPatches.Count -gt 0) {
    Write-Host ""
    Write-Host "[solo-unlock] Delegating $($SettingsPatches.Count) settings patch(es)..." -ForegroundColor Cyan

    $settingsScript = Join-Path $ScriptDir "apply-settings.ps1"
    if (-not [System.IO.File]::Exists($settingsScript)) {
        Write-Status "ERROR" "Settings script not found: $settingsScript" "Red"
        $settingsExitCode = 1
    } else {
        try {
            if ($DryRun) {
                & $settingsScript -DryRun
            } else {
                & $settingsScript
            }
            $settingsExitCode = $LASTEXITCODE
        } catch {
            Write-Status "ERROR" "Failed to run settings script: $_" "Red"
            $settingsExitCode = 1
        }
    }
}

# ── Filter JSON patches by ID ─────────────────────────────────────────────────
$Patches = $JsonPatches
if ($PatchId) {
    $FilterList = $PatchId.Split(",").Trim()
    $Patches = @($Patches | Where-Object { $FilterList -contains $_.id })
    Write-Status "INFO" "Filtered JSON patches to: $($Patches.Count) patch(es)" "Yellow"
}

if ($Patches.Count -eq 0) {
    Write-Status "WARN" "No JSON patches to apply" "Yellow"
    # If settings patches were handled, exit with settings exit code
    if ($SettingsPatches.Count -gt 0) {
        exit $settingsExitCode
    }
    exit 0
}

# ── Check JSON target file exists ──────────────────────────────────────────────
if (-not [System.IO.File]::Exists($TargetPath)) {
    Write-Status "ERROR" "Target file not found: $TargetPath" "Red"
    exit 2
}

# ── JSON Path Navigator ───────────────────────────────────────────────────────
# Navigates a PSCustomObject using dot-notation path like "$.iCubeApp.computerUse.enable"
# Returns: @{ Node = <parent object>; Property = <property name>; Value = <current value> }
function Get-JsonPathNode {
    param(
        [PSCustomObject]$Root,
        [string]$Path
    )

    # Strip leading "$." or "$"
    $cleanPath = $Path
    if ($cleanPath.StartsWith("$.")) { $cleanPath = $cleanPath.Substring(2) }
    elseif ($cleanPath.StartsWith("$")) { $cleanPath = $cleanPath.Substring(1) }

    $segments = $cleanPath.Split(".")
    $current = $Root

    # Navigate to parent, keeping the last segment as property name
    for ($i = 0; $i -lt $segments.Count - 1; $i++) {
        $seg = $segments[$i]

        # Handle array index: e.g. "items[0]"
        if ($seg -match '^(.+?)\[(\d+)\]$') {
            $arrayName = $Matches[1]
            $arrayIdx = [int]$Matches[2]
            $current = $current.$arrayName[$arrayIdx]
        } else {
            $current = $current.$seg
        }

        if ($null -eq $current) {
            return @{ Node = $null; Property = $null; Value = $null; Found = $false }
        }
    }

    $lastSeg = $segments[-1]
    if ($lastSeg -match '^(.+?)\[(\d+)\]$') {
        $arrayName = $Matches[1]
        $arrayIdx = [int]$Matches[2]
        $val = $current.$arrayName[$arrayIdx]
        return @{ Node = $current.$arrayName; Property = $arrayIdx; Value = $val; Found = $true }
    }

    $propVal = $current.PSObject.Properties[$lastSeg]
    if ($null -eq $propVal) {
        return @{ Node = $current; Property = $lastSeg; Value = $null; Found = $false }
    }

    return @{ Node = $current; Property = $lastSeg; Value = $propVal.Value; Found = $true }
}

# ── Set JSON Path Value ───────────────────────────────────────────────────────
function Set-JsonPathValue {
    param(
        [PSCustomObject]$Root,
        [string]$Path,
        $Value
    )

    $node = Get-JsonPathNode -Root $Root -Path $Path

    if (-not $node.Found) {
        # Property does not exist - try to create it on the parent
        $cleanPath = $Path
        if ($cleanPath.StartsWith("$.")) { $cleanPath = $cleanPath.Substring(2) }
        elseif ($cleanPath.StartsWith("$")) { $cleanPath = $cleanPath.Substring(1) }
        $segments = $cleanPath.Split(".")
        $lastSeg = $segments[-1]

        # Navigate to parent
        $parent = $Root
        for ($i = 0; $i -lt $segments.Count - 1; $i++) {
            $parent = $parent.($segments[$i])
            if ($null -eq $parent) { return $false }
        }

        $parent | Add-Member -NotePropertyName $lastSeg -NotePropertyValue $Value
        return $true
    }

    # Set value on existing property
    $node.Node.($node.Property) = $Value
    return $true
}

# ── Compare Values (handles arrays) ──────────────────────────────────────────
function Compare-PatchValue {
    param($Current, $Expected)

    # Handle array comparison
    if ($Expected -is [array] -or $Current -is [array]) {
        $expArr = @($Expected)
        $curArr = @($Current)
        if ($expArr.Count -ne $curArr.Count) { return $false }
        for ($i = 0; $i -lt $expArr.Count; $i++) {
            if ("$($expArr[$i])" -ne "$($curArr[$i])") { return $false }
        }
        return $true
    }

    # Scalar comparison (stringify to handle type mismatches)
    return ("$Current" -eq "$Expected")
}

# ── Create backup directory ───────────────────────────────────────────────────
if (-not [System.IO.Directory]::Exists($BackupDir)) {
    [System.IO.Directory]::CreateDirectory($BackupDir) | Out-Null
}

# ── Auto-backup ───────────────────────────────────────────────────────────────
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BaseName = [System.IO.Path]::GetFileName($TargetPath)
$BackupFile = Join-Path $BackupDir "$BaseName.$Timestamp.backup"

if (-not $DryRun) {
    [System.IO.File]::Copy($TargetPath, $BackupFile, $true)
    Write-Status "OK" "Backup created: $([System.IO.Path]::GetFileName($BackupFile))" "Green"
} else {
    Write-Status "DRY" "Would backup to: $([System.IO.Path]::GetFileName($BackupFile))" "DarkGray"
}

# ── Read and parse target JSON ────────────────────────────────────────────────
$jsonRaw = [System.IO.File]::ReadAllText($TargetPath)
try {
    $jsonObj = $jsonRaw | ConvertFrom-Json
} catch {
    Write-Status "ERROR" "Failed to parse target JSON: $_" "Red"
    exit 2
}

# ── Apply patches ─────────────────────────────────────────────────────────────
$appliedCount = 0
$skippedCount = 0
$failedCount = 0
$results = @()

foreach ($patch in $Patches) {
    if (-not $patch.enabled) {
        Write-Status "-" "$($patch.id): DISABLED, skipping" "DarkGray"
        $results += @{ Id = $patch.id; Status = "disabled"; Detail = "Patch is disabled" }
        continue
    }

    $patchApplied = $true
    $patchOps = @()
    $operations = @($patch.operations)

    foreach ($op in $operations) {
        $path = $op.path
        $expectedValue = $op.value

        # Navigate to current value
        $node = Get-JsonPathNode -Root $jsonObj -Path $path

        if (-not $node.Found) {
            Write-Status "!!" "$($patch.id): Path not found: $path" "Red"
            $patchApplied = $false
            $patchOps += @{ Path = $path; Status = "path_not_found"; Current = $null; Expected = $expectedValue }
            continue
        }

        $currentValue = $node.Value

        # Check if already applied
        if (Compare-PatchValue -Current $currentValue -Expected $expectedValue) {
            Write-Status "OK" "$($patch.id) ($($patch.name)): Already applied [$path]" "Green"
            $patchOps += @{ Path = $path; Status = "already_applied"; Current = $currentValue; Expected = $expectedValue }
            continue
        }

        # Apply the operation
        if (-not $DryRun) {
            $setOk = Set-JsonPathValue -Root $jsonObj -Path $path -Value $expectedValue
            if ($setOk) {
                Write-Status "OK" "$($patch.id) ($($patch.name)): Applied [$path] $currentValue -> $expectedValue" "Green"
                $patchOps += @{ Path = $path; Status = "applied"; Current = $currentValue; Expected = $expectedValue }
            } else {
                Write-Status "!!" "$($patch.id): Failed to set value at $path" "Red"
                $patchApplied = $false
                $patchOps += @{ Path = $path; Status = "set_failed"; Current = $currentValue; Expected = $expectedValue }
            }
        } else {
            Write-Status "DRY" "$($patch.id) ($($patch.name)): Would apply [$path] $currentValue -> $expectedValue" "DarkGreen"
            $patchOps += @{ Path = $path; Status = "would_apply"; Current = $currentValue; Expected = $expectedValue }
        }
    }

    # Determine patch-level status
    $hasFailure = $patchOps | Where-Object { $_.Status -eq "path_not_found" -or $_.Status -eq "set_failed" }
    $allAlreadyApplied = ($patchOps | Where-Object { $_.Status -ne "already_applied" -and $_.Status -ne "disabled" }).Count -eq 0

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
    # Serialize back to JSON with proper formatting
    # Use depth 100 to handle deeply nested structures
    $outputJson = $jsonObj | ConvertTo-Json -Depth 100

    # Validate JSON format
    try {
        $null = $outputJson | ConvertFrom-Json
        Write-Status "OK" "JSON format validation passed" "Green"
    } catch {
        Write-Status "ERROR" "JSON format validation FAILED! Aborting write." "Red"
        Write-Status "ERROR" "Error: $_" "Red"
        Write-Status "WARN" "Target file NOT modified. Original content preserved." "Yellow"
        exit 1
    }

    # Write the patched file
    [System.IO.File]::WriteAllText($TargetPath, $outputJson)
    Write-Host ""
    Write-Status "OK" "File written successfully: $TargetPath" "Cyan"
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=========================================" -ForegroundColor White
Write-Host "  Applied:  $appliedCount" -ForegroundColor $(if ($appliedCount -gt 0) { "Green" } else { "Gray" })
Write-Host "  Skipped:  $skippedCount (already applied)" -ForegroundColor Gray
Write-Host "  Failed:   $failedCount" -ForegroundColor $(if ($failedCount -gt 0) { "Red" } else { "Gray" })
Write-Host "=========================================" -ForegroundColor White

if ($DryRun) {
    Write-Host "  [DRY RUN] No files were modified." -ForegroundColor Yellow
} else {
    Write-Host "  Restart TRAE SOLO CN to take effect." -ForegroundColor Cyan
}

# ── Auto-commit (if in git repo) ─────────────────────────────────────────────
if ($appliedCount -gt 0 -and -not $DryRun -and $failedCount -eq 0) {
    Push-Location $RootDir
    try {
        $status = git status --porcelain 2>$null
        if ($status) {
            $ts = Get-Date -Format "yyyy-MM-dd HH:mm"
            $total = $appliedCount + $skippedCount
            git add -A 2>$null
            git commit -m "chore(patches): auto-snapshot [$ts] - $total patches OK" 2>$null
            $commitHash = git rev-parse --short HEAD 2>$null
            Write-Status "COMMIT" "$commitHash - $total patches, $(($status -split "`n").Count) files changed" "Green"
        }
    } catch {
        # Not a git repo or git not available - silently skip
    }
    Pop-Location
}

exit $(if ($failedCount -gt 0 -or $settingsExitCode -ne 0) { 1 } else { 0 })
