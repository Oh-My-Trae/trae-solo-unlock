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

# ── Check target file ─────────────────────────────────────────────────────────
if (-not [System.IO.File]::Exists($TargetPath)) {
    Write-Host "[ERROR] Target file not found: $TargetPath" -ForegroundColor Red
    exit 2
}

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
$jsonRaw = [System.IO.File]::ReadAllText($TargetPath)
try {
    $jsonObj = $jsonRaw | ConvertFrom-Json
} catch {
    Write-Host "[ERROR] Failed to parse target JSON: $_" -ForegroundColor Red
    exit 2
}

# ── Verify each patch ─────────────────────────────────────────────────────────
$report = @()
$appliedCount = 0
$pendingCount = 0
$conflictCount = 0
$disabledCount = 0
$pathNotFoundCount = 0

foreach ($patch in $Patches) {
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
if ($JsonOutput) {
    $report | ConvertTo-Json -Depth 5
    exit 0
}

# ── Console Report ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[solo-unlock] Patch Verification Report" -ForegroundColor Cyan
Write-Host "  Target: $TargetPath" -ForegroundColor Gray
Write-Host "  Checked: $($Patches.Count) patch(es)" -ForegroundColor Gray
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
Write-Host "  Applied:        $appliedCount" -ForegroundColor $(if ($appliedCount -gt 0) { "Green" } else { "Gray" })
Write-Host "  Pending:        $pendingCount" -ForegroundColor $(if ($pendingCount -gt 0) { "Yellow" } else { "Gray" })
Write-Host "  Conflict:       $conflictCount" -ForegroundColor $(if ($conflictCount -gt 0) { "Red" } else { "Gray" })
Write-Host "  Path Not Found: $pathNotFoundCount" -ForegroundColor $(if ($pathNotFoundCount -gt 0) { "Red" } else { "Gray" })
Write-Host "  Disabled:       $disabledCount" -ForegroundColor DarkGray
Write-Host "=========================================" -ForegroundColor White

if ($pendingCount -gt 0) {
    Write-Host "  Run apply-patches.ps1 to apply pending patches." -ForegroundColor Yellow
}

# ── Overall health ────────────────────────────────────────────────────────────
$totalActive = $appliedCount + $pendingCount + $conflictCount + $pathNotFoundCount
if ($totalActive -gt 0) {
    $healthPct = [math]::Round(($appliedCount / $totalActive) * 100)
} else {
    $healthPct = 100
}

Write-Host "  Health: $healthPct%" -ForegroundColor $(if ($healthPct -ge 100) { "Green" } elseif ($healthPct -ge 50) { "Yellow" } else { "Red" })

exit $(if ($conflictCount -gt 0 -or $pathNotFoundCount -gt 0) { 1 } else { 0 })
