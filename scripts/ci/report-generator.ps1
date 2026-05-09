<#
.SYNOPSIS
    CI/CD 报告生成器 - 合并测试结果并生成 Markdown 报告
.DESCRIPTION
    读取各测试阶段的 JSON 结果文件，合并生成综合 Markdown 报告。
    包含：变更摘要、冒烟测试结果、回归测试结果、性能基准数据。
.PARAMETER ReportDir
    报告输出目录，默认 reports/
.PARAMETER SmokeResult
    冒烟测试结果 JSON 文件路径
.PARAMETER RegressionResult
    回归测试结果 JSON 文件路径
.PARAMETER PerformanceResult
    性能测试结果 JSON 文件路径
.PARAMETER PipelineResult
    流水线元数据 JSON 文件路径
.EXAMPLE
    .\report-generator.ps1
.EXAMPLE
    .\report-generator.ps1 -SmokeResult "reports/smoke-result.json" -PerformanceResult "reports/perf-result.json"
#>
param(
    [string]$ReportDir = "",
    [string]$SmokeResult = "",
    [string]$RegressionResult = "",
    [string]$PerformanceResult = "",
    [string]$PipelineResult = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)

# ── 解析路径 ──────────────────────────────────────────────────────────────────
if (-not $ReportDir) {
    $ReportDir = Join-Path $RootDir "reports"
}

if (-not [System.IO.Directory]::Exists($ReportDir)) {
    [System.IO.Directory]::CreateDirectory($ReportDir) | Out-Null
}

# ── 辅助函数 ──────────────────────────────────────────────────────────────────
function Read-JsonFile {
    param([string]$Path)
    if ($Path -and [System.IO.File]::Exists($Path)) {
        $raw = [System.IO.File]::ReadAllText($Path)
        return $raw | ConvertFrom-Json
    }
    return $null
}

function Find-LatestResult {
    param([string]$Prefix)
    $files = Get-ChildItem -Path $ReportDir -Filter "$Prefix*.json" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending
    if ($files.Count -gt 0) { return $files[0].FullName }
    return ""
}

function Format-Duration {
    param([double]$Ms)
    if ($Ms -ge 60000) { return "{0:N1} min" -f ($Ms / 60000) }
    if ($Ms -ge 1000) { return "{0:N1} s" -f ($Ms / 1000) }
    return "{0:N0} ms" -f $Ms
}

function Format-StatusIcon {
    param([string]$Status)
    switch ($Status) {
        "passed" { return "PASS" }
        "failed" { return "FAIL" }
        "skipped" { return "SKIP" }
        "error"   { return "ERR!" }
        default   { return $Status.ToUpper() }
    }
}

# ── 自动发现结果文件 ──────────────────────────────────────────────────────────
if (-not $SmokeResult)       { $SmokeResult = Find-LatestResult "smoke-result" }
if (-not $RegressionResult)  { $RegressionResult = Find-LatestResult "regression-result" }
if (-not $PerformanceResult) { $PerformanceResult = Find-LatestResult "performance-result" }
if (-not $PipelineResult)    { $PipelineResult = Find-LatestResult "pipeline-meta" }

# ── 读取结果数据 ──────────────────────────────────────────────────────────────
$smokeData = Read-JsonFile $SmokeResult
$regressionData = Read-JsonFile $RegressionResult
$perfData = Read-JsonFile $PerformanceResult
$pipelineData = Read-JsonFile $PipelineResult

# ── 读取补丁定义获取变更摘要 ──────────────────────────────────────────────────
$definitionsPath = Join-Path $RootDir "patches\definitions.json"
$patchSummary = @()
if ([System.IO.File]::Exists($definitionsPath)) {
    $defRaw = [System.IO.File]::ReadAllText($definitionsPath)
    $def = $defRaw | ConvertFrom-Json
    foreach ($patch in $def.patches) {
        if ($patch.enabled) {
            $patchSummary += @{
                Id    = $patch.id
                Name  = $patch.name
                Desc  = $patch.description
                Ops   = @($patch.operations).Count
            }
        }
    }
}

# ── 生成 Markdown 报告 ────────────────────────────────────────────────────────
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$timestampFile = Get-Date -Format "yyyyMMdd-HHmmss"

$sb = [System.Text.StringBuilder]::new()

[void]$sb.AppendLine("# TRAE SOLO CN CI/CD Test Report")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("| Field | Value |")
[void]$sb.AppendLine("|-------|-------|")
[void]$sb.AppendLine("| Generated | $timestamp |")
[void]$sb.AppendLine("| Patch Version | $(if ($pipelineData) { $pipelineData.patchVersion } else { 'N/A' }) |")
[void]$sb.AppendLine("| Pipeline ID | $(if ($pipelineData) { $pipelineData.pipelineId } else { $timestampFile }) |")
[void]$sb.AppendLine("| Total Duration | $(if ($pipelineData) { Format-Duration $pipelineData.totalDurationMs } else { 'N/A' }) |")
[void]$sb.AppendLine("")

# ── 变更摘要 ──────────────────────────────────────────────────────────────────
[void]$sb.AppendLine("## Patch Summary")
[void]$sb.AppendLine("")
if ($patchSummary.Count -gt 0) {
    [void]$sb.AppendLine("| ID | Name | Operations |")
    [void]$sb.AppendLine("|----|------|------------|")
    foreach ($p in $patchSummary) {
        [void]$sb.AppendLine("| $($p.Id) | $($p.Name) | $($p.Ops) |")
    }
} else {
    [void]$sb.AppendLine("> No patch definitions found.")
}
[void]$sb.AppendLine("")

# ── 冒烟测试 ──────────────────────────────────────────────────────────────────
[void]$sb.AppendLine("## Smoke Test")
[void]$sb.AppendLine("")
if ($smokeData) {
    [void]$sb.AppendLine("| Metric | Value |")
    [void]$sb.AppendLine("|--------|-------|")
    [void]$sb.AppendLine("| Status | $(Format-StatusIcon $smokeData.overallStatus) |")
    [void]$sb.AppendLine("| Duration | $(Format-Duration $smokeData.totalDurationMs) |")
    [void]$sb.AppendLine("| CDP Port Reachable | $(if ($smokeData.checks.cdpPort) { 'Yes' } else { 'No' }) |")
    [void]$sb.AppendLine("| AI Panel Visible | $(if ($smokeData.checks.aiPanel) { 'Yes' } else { 'No' }) |")
    [void]$sb.AppendLine("| Basic Interaction | $(if ($smokeData.checks.basicInteraction) { 'Yes' } else { 'No' }) |")
    [void]$sb.AppendLine("")

    if ($smokeData.details -and $smokeData.details.Count -gt 0) {
        [void]$sb.AppendLine("### Check Details")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("| Check | Status | Duration | Detail |")
        [void]$sb.AppendLine("|-------|--------|----------|--------|")
        foreach ($d in $smokeData.details) {
            [void]$sb.AppendLine("| $($d.name) | $(Format-StatusIcon $d.status) | $(Format-Duration $d.durationMs) | $($d.detail) |")
        }
        [void]$sb.AppendLine("")
    }
} else {
    [void]$sb.AppendLine("> No smoke test results available.")
    [void]$sb.AppendLine("")
}

# ── 回归测试 ──────────────────────────────────────────────────────────────────
[void]$sb.AppendLine("## Regression Test")
[void]$sb.AppendLine("")
if ($regressionData) {
    $passRate = if ($regressionData.totalTests -gt 0) {
        [math]::Round(($regressionData.passed / $regressionData.totalTests) * 100, 1)
    } else { 0 }

    [void]$sb.AppendLine("| Metric | Value |")
    [void]$sb.AppendLine("|--------|-------|")
    [void]$sb.AppendLine("| Status | $(if ($regressionData.failed -eq 0) { 'PASS' } else { 'FAIL' }) |")
    [void]$sb.AppendLine("| Total Tests | $($regressionData.totalTests) |")
    [void]$sb.AppendLine("| Passed | $($regressionData.passed) |")
    [void]$sb.AppendLine("| Failed | $($regressionData.failed) |")
    [void]$sb.AppendLine("| Pass Rate | $passRate% |")
    [void]$sb.AppendLine("")

    if ($regressionData.results -and $regressionData.results.Count -gt 0) {
        [void]$sb.AppendLine("### Test Cases")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("| Name | Status | Diff Score | Duration |")
        [void]$sb.AppendLine("|------|--------|------------|----------|")
        foreach ($r in $regressionData.results) {
            $diffStr = if ($r.diffScore) { "{0:P2}" -f $r.diffScore } else { "N/A" }
            [void]$sb.AppendLine("| $($r.name) | $(Format-StatusIcon $(if ($r.passed) {'passed'} else {'failed'})) | $diffStr | $(Format-Duration $r.duration) |")
        }
        [void]$sb.AppendLine("")
    }
} else {
    [void]$sb.AppendLine("> No regression test results available.")
    [void]$sb.AppendLine("")
}

# ── 性能基准 ──────────────────────────────────────────────────────────────────
[void]$sb.AppendLine("## Performance Benchmark")
[void]$sb.AppendLine("")
if ($perfData) {
    [void]$sb.AppendLine("| Metric | Value | Baseline | Delta |")
    [void]$sb.AppendLine("|--------|-------|----------|-------|")

    # Cold start
    if ($perfData.coldStart) {
        $cs = $perfData.coldStart
        $delta = if ($cs.baselineMs -and $cs.baselineMs -gt 0) {
            $d = [math]::Round((($cs.durationMs - $cs.baselineMs) / $cs.baselineMs) * 100, 1)
            "$d%"
        } else { "N/A" }
        [void]$sb.AppendLine("| Cold Start | $(Format-Duration $cs.durationMs) | $(if ($cs.baselineMs) { Format-Duration $cs.baselineMs } else { 'N/A' }) | $delta |")
    }

    # Hot start
    if ($perfData.hotStart) {
        $hs = $perfData.hotStart
        $delta = if ($hs.baselineMs -and $hs.baselineMs -gt 0) {
            $d = [math]::Round((($hs.durationMs - $hs.baselineMs) / $hs.baselineMs) * 100, 1)
            "$d%"
        } else { "N/A" }
        [void]$sb.AppendLine("| Hot Start | $(Format-Duration $hs.durationMs) | $(if ($hs.baselineMs) { Format-Duration $hs.baselineMs } else { 'N/A' }) | $delta |")
    }

    # AI Response
    if ($perfData.aiResponse) {
        $ar = $perfData.aiResponse
        $delta = if ($ar.baselineMs -and $ar.baselineMs -gt 0) {
            $d = [math]::Round((($ar.avgDurationMs - $ar.baselineMs) / $ar.baselineMs) * 100, 1)
            "$d%"
        } else { "N/A" }
        [void]$sb.AppendLine("| AI Response (avg) | $(Format-Duration $ar.avgDurationMs) | $(if ($ar.baselineMs) { Format-Duration $ar.baselineMs } else { 'N/A' }) | $delta |")
    }

    # Memory
    if ($perfData.memory) {
        $mem = $perfData.memory
        $memMB = [math]::Round($mem.workingSetBytes / 1MB, 1)
        $baseMB = if ($mem.baselineBytes -and $mem.baselineBytes -gt 0) { [math]::Round($mem.baselineBytes / 1MB, 1) } else { "N/A" }
        $delta = if ($mem.baselineBytes -and $mem.baselineBytes -gt 0) {
            $d = [math]::Round((($mem.workingSetBytes - $mem.baselineBytes) / $mem.baselineBytes) * 100, 1)
            "$d%"
        } else { "N/A" }
        [void]$sb.AppendLine("| Memory (Working Set) | ${memMB} MB | ${baseMB} MB | $delta |")
    }

    [void]$sb.AppendLine("")
} else {
    [void]$sb.AppendLine("> No performance benchmark results available.")
    [void]$sb.AppendLine("")
}

# ── 综合结论 ──────────────────────────────────────────────────────────────────
[void]$sb.AppendLine("## Overall Conclusion")
[void]$sb.AppendLine("")

$allPassed = $true
$conclusionItems = @()

if ($smokeData) {
    if ($smokeData.overallStatus -ne "passed") {
        $allPassed = $false
        $conclusionItems += "- Smoke test: FAILED"
    } else {
        $conclusionItems += "- Smoke test: PASSED"
    }
} else {
    $conclusionItems += "- Smoke test: SKIPPED"
}

if ($regressionData) {
    if ($regressionData.failed -gt 0) {
        $allPassed = $false
        $conclusionItems += "- Regression test: FAILED ($($regressionData.failed) failures)"
    } else {
        $conclusionItems += "- Regression test: PASSED ($($regressionData.passed)/$($regressionData.totalTests))"
    }
} else {
    $conclusionItems += "- Regression test: SKIPPED"
}

if ($perfData) {
    $conclusionItems += "- Performance benchmark: COMPLETED"
} else {
    $conclusionItems += "- Performance benchmark: SKIPPED"
}

if ($allPassed) {
    [void]$sb.AppendLine("**Result: ALL PASSED** - Patches are safe to release.")
} else {
    [void]$sb.AppendLine("**Result: FAILED** - Issues detected, review details above before releasing.")
}
[void]$sb.AppendLine("")
foreach ($item in $conclusionItems) {
    [void]$sb.AppendLine($item)
}
[void]$sb.AppendLine("")

# ── 写入报告文件 ──────────────────────────────────────────────────────────────
$reportPath = Join-Path $ReportDir "ci-report-$timestampFile.md"
[System.IO.File]::WriteAllText($reportPath, $sb.ToString(), [System.Text.Encoding]::UTF8)

# 同时保存 JSON 格式
$reportJson = @{
    pipelineId       = if ($pipelineData) { $pipelineData.pipelineId } else { $timestampFile }
    generatedAt      = $timestamp
    overallPassed    = $allPassed
    smokePassed      = $(if ($smokeData) { $smokeData.overallStatus -eq "passed" } else { $null })
    regressionPassed = $(if ($regressionData) { $regressionData.failed -eq 0 } else { $null })
    perfCompleted    = $(if ($perfData) { $true } else { $null })
    patchCount       = $patchSummary.Count
    reportPath       = $reportPath
} | ConvertTo-Json -Depth 5

$reportJsonPath = Join-Path $ReportDir "ci-report-$timestampFile.json"
[System.IO.File]::WriteAllText($reportJsonPath, $reportJson, [System.Text.Encoding]::UTF8)

# ── 输出摘要 ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[report-generator] Report generated successfully" -ForegroundColor Green
Write-Host "  Markdown: $reportPath" -ForegroundColor Gray
Write-Host "  JSON:     $reportJsonPath" -ForegroundColor Gray
Write-Host "  Overall:  $(if ($allPassed) { 'PASSED' } else { 'FAILED' })" -ForegroundColor $(if ($allPassed) { "Green" } else { "Red" })

exit $(if ($allPassed) { 0 } else { 1 })
