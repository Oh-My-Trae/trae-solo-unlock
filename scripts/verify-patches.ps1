<#
.SYNOPSIS
    Verify TRAE SOLO CN patch status
.DESCRIPTION
    Checks each patch defined in definitions.json against the current
    product.json to determine if patches are applied, pending, or
    have unexpected values. Generates a health status report.
.PARAMETER PatchId
    Verify only the specified patch ID (comma-separated for multiple)
.PARAMETER DefinitionsPath
    Override path to definitions.json
.PARAMETER JsonOutput
    Output results as JSON for programmatic consumption
.EXAMPLE
    .\verify-patches.ps1
.EXAMPLE
    .\verify-patches.ps1 -PatchId "p4-computer-use-enable"
.EXAMPLE
    .\verify-patches.ps1 -JsonOutput
#>
param(
    [string]$PatchId = "",
    [string]$DefinitionsPath = "",
    [switch]$JsonOutput
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

# ── Resolve definitions path ──────────────────────────────────────────────────
if (-not $DefinitionsPath) {
    $DefinitionsPath = Join-Path $RootDir "patches\definitions.json"
}

if (-not [System.IO.File]::Exists($DefinitionsPath)) {
    Write-Host "[ERROR] Definitions file not found: $DefinitionsPath" -ForegroundColor Red
    exit 2
}

# ── Read definitions ──────────────────────────────────────────────────────────
$defRaw = [System.IO.File]::ReadAllText($DefinitionsPath)
$def = $defRaw | ConvertFrom-Json
$TargetPath = $def.targetPath
$Patches = @($def.patches)

# ── Filter patches by ID ──────────────────────────────────────────────────────
if ($PatchId) {
    $FilterList = $PatchId.Split(",").Trim()
    $Patches = @($Patches | Where-Object { $FilterList -contains $_.id })
}

# ── Separate patches by type ──────────────────────────────────────────────────
$JsonPatches = @($Patches | Where-Object { $_.type -ne "settings" })
$SettingsPatches = @($Patches | Where-Object { $_.type -eq "settings" })

# ── Settings Path Value Getter ────────────────────────────────────────────────
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

# ── Compare Settings Values ───────────────────────────────────────────────────
function Compare-SettingsValue {
    param($Current, $Expected)

    if ($null -eq $Current -and $null -eq $Expected) { return $true }
    if ($null -eq $Current -or $null -eq $Expected) { return $false }

    if ($Current -is [PSCustomObject] -and $Expected -is [PSCustomObject]) {
        $curJson = $Current | ConvertTo-Json -Depth 50 -Compress
        $expJson = $Expected | ConvertTo-Json -Depth 50 -Compress
        return ($curJson -eq $expJson)
    }

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

# ── Verify settings patches ───────────────────────────────────────────────────
$settingsReport = @()
$settingsApplied = 0
$settingsPending = 0
$settingsConflict = 0
$settingsDisabled = 0
$settingsPathNotFound = 0

if ($SettingsPatches.Count -gt 0) {
    # Resolve settings file path
    $settingsTargetProp = $def.PSObject.Properties["settingsTargetPath"]
    if ($settingsTargetProp) { $settingsPath = $settingsTargetProp.Value }
    if (-not $settingsPath) {
        $settingsPath = Join-Path $env:APPDATA "TRAE SOLO CN\User\settings.json"
    }

    $settingsObj = $null
    if ([System.IO.File]::Exists($settingsPath)) {
        $settingsRaw = [System.IO.File]::ReadAllText($settingsPath)
        try {
            $settingsObj = $settingsRaw | ConvertFrom-Json
        } catch {
            Write-Host "[ERROR] Failed to parse settings JSON: $_" -ForegroundColor Red
        }
    }

    foreach ($patch in $SettingsPatches) {
        if (-not $patch.enabled) {
            $settingsReport += @{
                Id     = $patch.id
                Name   = $patch.name
                Status = "disabled"
                Detail = "Patch is disabled in definitions"
                Ops    = @()
            }
            $settingsDisabled++
            continue
        }

        if ($null -eq $settingsObj) {
            $settingsReport += @{
                Id     = $patch.id
                Name   = $patch.name
                Status = "path_not_found"
                Detail = "Settings file not found or not parseable: $settingsPath"
                Ops    = @()
            }
            $settingsPathNotFound++
            continue
        }

        $operations = @($patch.operations)
        $opsReport = @()
        $patchStatus = "applied"
        $hasPending = $false
        $hasConflict = $false
        $hasPathNotFound = $false

        foreach ($op in $operations) {
            $path = $op.path
            $expectedValue = $op.value

            $node = Get-SettingsPathValue -Root $settingsObj -Path $path

            if (-not $node.Found) {
                $opsReport += @{
                    Path     = $path
                    Status   = "pending"
                    Current  = $null
                    Expected = $expectedValue
                }
                $hasPending = $true
                continue
            }

            $currentValue = $node.Value

            if (Compare-SettingsValue -Current $currentValue -Expected $expectedValue) {
                $opsReport += @{
                    Path     = $path
                    Status   = "applied"
                    Current  = $currentValue
                    Expected = $expectedValue
                }
            } else {
                $opsReport += @{
                    Path     = $path
                    Status   = "conflict"
                    Current  = $currentValue
                    Expected = $expectedValue
                }
                $hasConflict = $true
            }
        }

        if ($hasConflict) {
            $patchStatus = "conflict"
            $settingsConflict++
        } elseif ($hasPending) {
            $patchStatus = "pending"
            $settingsPending++
        } else {
            $settingsApplied++
        }

        $settingsReport += @{
            Id     = $patch.id
            Name   = $patch.name
            Status = $patchStatus
            Ops    = $opsReport
        }
    }
}

# ── Check JSON target file ────────────────────────────────────────────────────
$jsonTargetExists = [System.IO.File]::Exists($TargetPath)

# ── JSON Path Navigator ───────────────────────────────────────────────────────
function Get-JsonPathNode {
    param(
        [PSCustomObject]$Root,
        [string]$Path
    )

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
            return @{ Value = $null; Found = $false }
        }
    }

    $lastSeg = $segments[-1]
    if ($lastSeg -match '^(.+?)\[(\d+)\]$') {
        $arrayName = $Matches[1]
        $arrayIdx = [int]$Matches[2]
        return @{ Value = $current.$arrayName[$arrayIdx]; Found = $true }
    }

    $propVal = $current.PSObject.Properties[$lastSeg]
    if ($null -eq $propVal) {
        return @{ Value = $null; Found = $false }
    }

    return @{ Value = $propVal.Value; Found = $true }
}

# ── Compare Values ────────────────────────────────────────────────────────────
function Compare-PatchValue {
    param($Current, $Expected)

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

# ── Read and parse target JSON ────────────────────────────────────────────────
$jsonObj = $null
if ($jsonTargetExists) {
    $jsonRaw = [System.IO.File]::ReadAllText($TargetPath)
    try {
        $jsonObj = $jsonRaw | ConvertFrom-Json
    } catch {
        Write-Host "[ERROR] Failed to parse target JSON: $_" -ForegroundColor Red
    }
} else {
    Write-Host "[WARN] JSON target file not found: $TargetPath" -ForegroundColor Yellow
}

# ── Verify JSON patches ───────────────────────────────────────────────────────
$report = @()
$appliedCount = 0
$pendingCount = 0
$conflictCount = 0
$disabledCount = 0
$pathNotFoundCount = 0

foreach ($patch in $JsonPatches) {
    if (-not $patch.enabled) {
        $report += @{
            Id       = $patch.id
            Name     = $patch.name
            Status   = "disabled"
            Detail   = "Patch is disabled in definitions"
            Ops      = @()
        }
        $disabledCount++
        continue
    }

    if ($null -eq $jsonObj) {
        $report += @{
            Id     = $patch.id
            Name   = $patch.name
            Status = "path_not_found"
            Detail = "JSON target file not available"
            Ops    = @()
        }
        $pathNotFoundCount++
        continue
    }

    $operations = @($patch.operations)
    $opsReport = @()
    $patchStatus = "applied"
    $hasConflict = $false
    $hasPending = $false
    $hasPathNotFound = $false

    foreach ($op in $operations) {
        $path = $op.path
        $expectedValue = $op.value
        $originalValue = $null
        if ($op.PSObject.Properties.Name -contains "originalValue") {
            $originalValue = $op.originalValue
        }

        $node = Get-JsonPathNode -Root $jsonObj -Path $path

        if (-not $node.Found) {
            $opsReport += @{
                Path     = $path
                Status   = "path_not_found"
                Current  = $null
                Expected = $expectedValue
            }
            $hasPathNotFound = $true
            continue
        }

        $currentValue = $node.Value

        if (Compare-PatchValue -Current $currentValue -Expected $expectedValue) {
            $opsReport += @{
                Path     = $path
                Status   = "applied"
                Current  = $currentValue
                Expected = $expectedValue
            }
        } elseif ($null -ne $originalValue -and (Compare-PatchValue -Current $currentValue -Expected $originalValue)) {
            $opsReport += @{
                Path     = $path
                Status   = "pending"
                Current  = $currentValue
                Expected = $expectedValue
            }
            $hasPending = $true
        } else {
            $opsReport += @{
                Path     = $path
                Status   = "conflict"
                Current  = $currentValue
                Expected = $expectedValue
            }
            $hasConflict = $true
        }
    }

    if ($hasPathNotFound) {
        $patchStatus = "path_not_found"
        $pathNotFoundCount++
    } elseif ($hasConflict) {
        $patchStatus = "conflict"
        $conflictCount++
    } elseif ($hasPending) {
        $patchStatus = "pending"
        $pendingCount++
    } else {
        $appliedCount++
    }

    $report += @{
        Id     = $patch.id
        Name   = $patch.name
        Status = $patchStatus
        Ops    = $opsReport
    }
}

# ── Output ────────────────────────────────────────────────────────────────────
# Merge JSON and Settings reports
$report += $settingsReport

$totalApplied = $appliedCount + $settingsApplied
$totalPending = $pendingCount + $settingsPending
$totalConflict = $conflictCount + $settingsConflict
$totalDisabled = $disabledCount + $settingsDisabled
$totalPathNotFound = $pathNotFoundCount + $settingsPathNotFound

if ($JsonOutput) {
    $report | ConvertTo-Json -Depth 5
    exit 0
}

# ── Console Report ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[solo-unlock] Patch Verification Report" -ForegroundColor Cyan
Write-Host "  Target: $TargetPath" -ForegroundColor Gray
if ($SettingsPatches.Count -gt 0) {
    $settingsTargetProp2 = $def.PSObject.Properties["settingsTargetPath"]
    if ($settingsTargetProp2) { $settingsPath = $settingsTargetProp2.Value }
    if (-not $settingsPath) {
        $settingsPath = Join-Path $env:APPDATA "TRAE SOLO CN\User\settings.json"
    }
    Write-Host "  Settings: $settingsPath" -ForegroundColor Gray
}
Write-Host "  Checked: $($Patches.Count) patch(es) (JSON: $($JsonPatches.Count), Settings: $($SettingsPatches.Count))" -ForegroundColor Gray
Write-Host ""

$statusIcons = @{
    applied        = @("OK", "Green")
    pending        = @("!!", "Yellow")
    conflict       = @("XX", "Red")
    disabled       = @("--", "DarkGray")
    path_not_found = @("??", "Red")
}

foreach ($entry in $report) {
    $icon, $color = $statusIcons[$entry.Status]
    Write-Host "  [$icon] $($entry.Id) ($($entry.Name)): $($entry.Status.ToUpper())" -ForegroundColor $color

    foreach ($op in $entry.Ops) {
        switch ($op.Status) {
            "applied" {
                Write-Host "       $($op.Path) = $($op.Current)" -ForegroundColor DarkGreen
            }
            "pending" {
                Write-Host "       $($op.Path) = $($op.Current) (expected: $($op.Expected))" -ForegroundColor Yellow
            }
            "conflict" {
                Write-Host "       $($op.Path) = $($op.Current) (expected: $($op.Expected))" -ForegroundColor Red
            }
            "path_not_found" {
                Write-Host "       $($op.Path) NOT FOUND" -ForegroundColor Red
            }
        }
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=========================================" -ForegroundColor White
Write-Host "  Applied:        $totalApplied" -ForegroundColor $(if ($totalApplied -gt 0) { "Green" } else { "Gray" })
Write-Host "  Pending:        $totalPending" -ForegroundColor $(if ($totalPending -gt 0) { "Yellow" } else { "Gray" })
Write-Host "  Conflict:       $totalConflict" -ForegroundColor $(if ($totalConflict -gt 0) { "Red" } else { "Gray" })
Write-Host "  Path Not Found: $totalPathNotFound" -ForegroundColor $(if ($totalPathNotFound -gt 0) { "Red" } else { "Gray" })
Write-Host "  Disabled:       $totalDisabled" -ForegroundColor DarkGray
Write-Host "=========================================" -ForegroundColor White

if ($totalPending -gt 0) {
    Write-Host "  Run apply-patches.ps1 to apply pending patches." -ForegroundColor Yellow
}

# ── Overall health ────────────────────────────────────────────────────────────
$totalActive = $totalApplied + $totalPending + $totalConflict + $totalPathNotFound
if ($totalActive -gt 0) {
    $healthPct = [math]::Round(($totalApplied / $totalActive) * 100)
} else {
    $healthPct = 100
}

Write-Host "  Health: $healthPct%" -ForegroundColor $(if ($healthPct -ge 100) { "Green" } elseif ($healthPct -ge 50) { "Yellow" } else { "Red" })

exit $(if ($totalConflict -gt 0 -or $totalPathNotFound -gt 0) { 1 } else { 0 })
