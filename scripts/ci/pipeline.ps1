<#
.SYNOPSIS
    CI/CD 主流水线 - 编排补丁应用、冒烟测试、回归测试、性能测试全流程
.DESCRIPTION
    流水线阶段（按顺序执行）：
    1. apply     - 应用补丁
    2. smoke     - 冒烟测试（CDP 端口、AI 面板、基本交互）
    3. regression - 回归测试（配置快照对比、补丁验证）
    4. performance - 性能基准测试（启动时间、AI 延迟、内存占用）
    5. report    - 生成综合报告

    支持选择性执行 (-Stage)，失败时自动回滚
.PARAMETER Stage
    选择性执行阶段：all, apply, smoke, regression, performance, report
    可逗号分隔指定多个阶段，如 "smoke,regression"
    默认 all（执行全部阶段）
.PARAMETER CdpPort
    CDP 远程调试端口，默认 9222
.PARAMETER SkipRollback
    失败时不自动回滚补丁
.PARAMETER SkipReport
    跳过最终报告生成
.PARAMETER ContinueOnError
    阶段失败时继续执行后续阶段（默认遇错即停）
.PARAMETER ReportDir
    报告输出目录，默认 reports/
.EXAMPLE
    .\pipeline.ps1
.EXAMPLE
    .\pipeline.ps1 -Stage smoke
.EXAMPLE
    .\pipeline.ps1 -Stage "smoke,regression" -ContinueOnError
.EXAMPLE
    .\pipeline.ps1 -Stage performance -CdpPort 9223
#>
param(
    [string]$Stage = "all",
    [int]$CdpPort = 9222,
    [switch]$SkipRollback,
    [switch]$SkipReport,
    [switch]$ContinueOnError,
    [string]$ReportDir = ""
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

# ── 常量 ──────────────────────────────────────────────────────────────────────
$PIPELINE_ID = "pipeline-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# ── 辅助函数 ──────────────────────────────────────────────────────────────────
function Write-PipelineHeader {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "  TRAE SOLO CN CI/CD Pipeline" -ForegroundColor Cyan
    Write-Host "  ID: $PIPELINE_ID" -ForegroundColor Gray
    Write-Host "  Time: $TIMESTAMP" -ForegroundColor Gray
    Write-Host "  Stages: $Stage" -ForegroundColor Gray
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-StageHeader {
    param([string]$Name, [int]$Current, [int]$Total)
    Write-Host ""
    Write-Host "-------------------------------------------" -ForegroundColor Yellow
    Write-Host "  Stage [$Current/$Total]: $Name" -ForegroundColor Yellow
    Write-Host "-------------------------------------------" -ForegroundColor Yellow
}

function Write-StageResult {
    param([string]$Name, [string]$Status, [string]$Duration, [string]$Detail = "")
    $color = switch ($Status) {
        "PASSED"  { "Green" }
        "FAILED"  { "Red" }
        "SKIPPED" { "DarkGray" }
        default   { "White" }
    }
    $icon = switch ($Status) {
        "PASSED"  { "OK" }
        "FAILED"  { "FAIL" }
        "SKIPPED" { "SKIP" }
        default   { "??" }
    }
    Write-Host "  [$icon] $Name : $Status ($Duration)" -ForegroundColor $color
    if ($Detail) {
        Write-Host "       $Detail" -ForegroundColor Gray
    }
}

function Stop-SoloProcess {
    try {
        $procs = Get-Process -Name "TRAE SOLO CN" -ErrorAction SilentlyContinue
        if ($procs) {
            $procs | ForEach-Object { $_.CloseMainWindow() | Out-Null }
            Start-Sleep -Seconds 3
            $stillRunning = Get-Process -Name "TRAE SOLO CN" -ErrorAction SilentlyContinue
            if ($stillRunning) {
                Stop-Process -Name "TRAE SOLO CN" -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 2
            }
        }
        @("ai-agent", "ckg_server_windows_x64", "trae-sandbox") | ForEach-Object {
            try { Stop-Process -Name $_ -Force -ErrorAction SilentlyContinue } catch {}
        }
    } catch {}
}

function Invoke-Rollback {
    if ($SkipRollback) {
        Write-Host "[pipeline] Rollback skipped (-SkipRollback)" -ForegroundColor DarkGray
        return
    }
    Write-Host "[pipeline] Rolling back patches..." -ForegroundColor Yellow
    try {
        $rollbackScript = Join-Path $RootDir "scripts\rollback.ps1"
        if ([System.IO.File]::Exists($rollbackScript)) {
            & $rollbackScript -Latest
            Write-Host "[pipeline] Patches rolled back" -ForegroundColor Green
        }
    } catch {
        Write-Host "[pipeline] Rollback failed: $_" -ForegroundColor Red
    }
}

# ── 解析阶段 ──────────────────────────────────────────────────────────────────
$requestedStages = if ($Stage -eq "all") {
    @("apply", "smoke", "regression", "performance", "report")
} else {
    $Stage.Split(",").Trim() | Where-Object { $_ }
}

# 验证阶段名称
$validStages = @("apply", "smoke", "regression", "performance", "report")
foreach ($s in $requestedStages) {
    if ($validStages -notcontains $s) {
        Write-Host "[pipeline] ERROR: Invalid stage '$s'. Valid stages: $($validStages -join ', ')" -ForegroundColor Red
        exit 1
    }
}

# ── 流水线状态 ────────────────────────────────────────────────────────────────
$pipelineState = @{
    pipelineId       = $PIPELINE_ID
    startTime        = $TIMESTAMP
    patchVersion     = ""
    stages           = @()
    totalDurationMs  = 0
    overallStatus    = "running"
    rollbackNeeded   = $false
    smokeResultPath  = ""
    regressionResultPath = ""
    performanceResultPath = ""
}

# 读取补丁版本
$definitionsPath = Join-Path $RootDir "patches\definitions.json"
if ([System.IO.File]::Exists($definitionsPath)) {
    $def = [System.IO.File]::ReadAllText($definitionsPath) | ConvertFrom-Json
    $pipelineState.patchVersion = "$($def.target)-v$($def.targetVersion)"
}

$globalSw = [System.Diagnostics.Stopwatch]::StartNew()
$patchAppliedByPipeline = $false

Write-PipelineHeader

# ══════════════════════════════════════════════════════════════════════════════
# Stage: Apply Patches
# ══════════════════════════════════════════════════════════════════════════════
$stageIdx = 0
$totalStages = $requestedStages.Count

if ($requestedStages -contains "apply") {
    $stageIdx++
    Write-StageHeader "Apply Patches" $stageIdx $totalStages

    $stageSw = [System.Diagnostics.Stopwatch]::StartNew()
    $stageStatus = "PASSED"
    $stageDetail = ""

    try {
        $applyScript = Join-Path $RootDir "scripts\apply-patches.ps1"
        if (-not [System.IO.File]::Exists($applyScript)) {
            throw "Apply-patches script not found"
        }

        & $applyScript
        $applyExit = $LASTEXITCODE

        if ($applyExit -ne 0) {
            $stageStatus = "FAILED"
            $stageDetail = "Exit code: $applyExit"
            $pipelineState.rollbackNeeded = $true
        } else {
            $patchAppliedByPipeline = $true
            $stageDetail = "All patches applied"
        }
    } catch {
        $stageStatus = "FAILED"
        $stageDetail = $_.Exception.Message
        $pipelineState.rollbackNeeded = $true
    }

    $stageSw.Stop()
    Write-StageResult "Apply Patches" $stageStatus "$($stageSw.ElapsedMilliseconds)ms" $stageDetail

    $pipelineState.stages += @{
        name       = "apply"
        status     = $stageStatus.ToLower()
        durationMs = $stageSw.ElapsedMilliseconds
        detail     = $stageDetail
    }

    if ($stageStatus -eq "FAILED" -and -not $ContinueOnError) {
        Write-Host "[pipeline] Pipeline stopped: apply stage failed" -ForegroundColor Red
        Invoke-Rollback
        $globalSw.Stop()
        $pipelineState.totalDurationMs = $globalSw.ElapsedMilliseconds
        $pipelineState.overallStatus = "failed"
        $pipelineState | ConvertTo-Json -Depth 5 | Out-File -FilePath (Join-Path $ReportDir "pipeline-meta-$PIPELINE_ID.json") -Encoding UTF8
        exit 1
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# Stage: Smoke Test
# ══════════════════════════════════════════════════════════════════════════════
if ($requestedStages -contains "smoke") {
    $stageIdx++
    Write-StageHeader "Smoke Test" $stageIdx $totalStages

    $stageSw = [System.Diagnostics.Stopwatch]::StartNew()
    $stageStatus = "PASSED"
    $stageDetail = ""

    try {
        $smokeScript = Join-Path $ScriptDir "smoke-test.ps1"
        if (-not [System.IO.File]::Exists($smokeScript)) {
            throw "Smoke test script not found"
        }

        # 冒烟测试自带补丁应用和清理，使用 -NoApply 如果流水线已应用补丁
        $smokeArgs = @("-CdpPort", $CdpPort, "-ReportDir", $ReportDir)
        if ($patchAppliedByPipeline) {
            $smokeArgs += "-NoApply"
        }

        & $smokeScript @smokeArgs
        $smokeExit = $LASTEXITCODE

        if ($smokeExit -ne 0) {
            $stageStatus = "FAILED"
            $stageDetail = "Smoke test failed (exit: $smokeExit)"
            $pipelineState.rollbackNeeded = $true
        } else {
            $stageDetail = "All checks passed"
        }

        # 查找最新的冒烟测试结果
        $latestSmoke = Get-ChildItem -Path $ReportDir -Filter "smoke-result-*.json" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latestSmoke) {
            $pipelineState.smokeResultPath = $latestSmoke.FullName
        }
    } catch {
        $stageStatus = "FAILED"
        $stageDetail = $_.Exception.Message
        $pipelineState.rollbackNeeded = $true
    }

    $stageSw.Stop()
    Write-StageResult "Smoke Test" $stageStatus "$($stageSw.ElapsedMilliseconds)ms" $stageDetail

    $pipelineState.stages += @{
        name       = "smoke"
        status     = $stageStatus.ToLower()
        durationMs = $stageSw.ElapsedMilliseconds
        detail     = $stageDetail
    }

    if ($stageStatus -eq "FAILED" -and -not $ContinueOnError) {
        Write-Host "[pipeline] Pipeline stopped: smoke test failed" -ForegroundColor Red
        # 冒烟测试自带清理，但需要回滚补丁
        if ($patchAppliedByPipeline) { Invoke-Rollback }
        $globalSw.Stop()
        $pipelineState.totalDurationMs = $globalSw.ElapsedMilliseconds
        $pipelineState.overallStatus = "failed"
        $pipelineState | ConvertTo-Json -Depth 5 | Out-File -FilePath (Join-Path $ReportDir "pipeline-meta-$PIPELINE_ID.json") -Encoding UTF8
        exit 1
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# Stage: Regression Test
# ══════════════════════════════════════════════════════════════════════════════
if ($requestedStages -contains "regression") {
    $stageIdx++
    Write-StageHeader "Regression Test" $stageIdx $totalStages

    $stageSw = [System.Diagnostics.Stopwatch]::StartNew()
    $stageStatus = "PASSED"
    $stageDetail = ""

    try {
        $regressionScript = Join-Path $ScriptDir "regression-test.ps1"
        if (-not [System.IO.File]::Exists($regressionScript)) {
            throw "Regression test script not found"
        }

        $regressionArgs = @("-CdpPort", $CdpPort, "-ReportDir", $ReportDir, "-SkipBaseline")

        & $regressionScript @regressionArgs
        $regressionExit = $LASTEXITCODE

        if ($regressionExit -ne 0) {
            $stageStatus = "FAILED"
            $stageDetail = "Regression test failed (exit: $regressionExit)"
            if (-not $ContinueOnError) { $pipelineState.rollbackNeeded = $true }
        } else {
            $stageDetail = "All regression tests passed"
        }

        # 查找最新的回归测试结果
        $latestRegression = Get-ChildItem -Path $ReportDir -Filter "regression-result-*.json" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latestRegression) {
            $pipelineState.regressionResultPath = $latestRegression.FullName
        }
    } catch {
        $stageStatus = "FAILED"
        $stageDetail = $_.Exception.Message
    }

    $stageSw.Stop()
    Write-StageResult "Regression Test" $stageStatus "$($stageSw.ElapsedMilliseconds)ms" $stageDetail

    $pipelineState.stages += @{
        name       = "regression"
        status     = $stageStatus.ToLower()
        durationMs = $stageSw.ElapsedMilliseconds
        detail     = $stageDetail
    }

    if ($stageStatus -eq "FAILED" -and -not $ContinueOnError) {
        Write-Host "[pipeline] Pipeline stopped: regression test failed" -ForegroundColor Red
        if ($patchAppliedByPipeline) { Invoke-Rollback }
        $globalSw.Stop()
        $pipelineState.totalDurationMs = $globalSw.ElapsedMilliseconds
        $pipelineState.overallStatus = "failed"
        $pipelineState | ConvertTo-Json -Depth 5 | Out-File -FilePath (Join-Path $ReportDir "pipeline-meta-$PIPELINE_ID.json") -Encoding UTF8
        exit 1
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# Stage: Performance Benchmark
# ══════════════════════════════════════════════════════════════════════════════
if ($requestedStages -contains "performance") {
    $stageIdx++
    Write-StageHeader "Performance Benchmark" $stageIdx $totalStages

    $stageSw = [System.Diagnostics.Stopwatch]::StartNew()
    $stageStatus = "PASSED"
    $stageDetail = ""

    try {
        $perfScript = Join-Path $ScriptDir "performance-benchmark.ps1"
        if (-not [System.IO.File]::Exists($perfScript)) {
            throw "Performance benchmark script not found"
        }

        $perfArgs = @("-CdpPort", $CdpPort, "-ReportDir", $ReportDir)

        & $perfScript @perfArgs
        $perfExit = $LASTEXITCODE

        if ($perfExit -ne 0) {
            $stageStatus = "FAILED"
            $stageDetail = "Performance benchmark failed (exit: $perfExit)"
        } else {
            $stageDetail = "Benchmark completed"
        }

        # 查找最新的性能测试结果
        $latestPerf = Get-ChildItem -Path $ReportDir -Filter "performance-result-*.json" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latestPerf) {
            $pipelineState.performanceResultPath = $latestPerf.FullName
        }
    } catch {
        $stageStatus = "FAILED"
        $stageDetail = $_.Exception.Message
    }

    $stageSw.Stop()
    Write-StageResult "Performance Benchmark" $stageStatus "$($stageSw.ElapsedMilliseconds)ms" $stageDetail

    $pipelineState.stages += @{
        name       = "performance"
        status     = $stageStatus.ToLower()
        durationMs = $stageSw.ElapsedMilliseconds
        detail     = $stageDetail
    }

    # 性能测试失败通常不需要回滚
}

# ══════════════════════════════════════════════════════════════════════════════
# Stage: Report Generation
# ══════════════════════════════════════════════════════════════════════════════
if ($requestedStages -contains "report" -and -not $SkipReport) {
    $stageIdx++
    Write-StageHeader "Report Generation" $stageIdx $totalStages

    $stageSw = [System.Diagnostics.Stopwatch]::StartNew()
    $stageStatus = "PASSED"
    $stageDetail = ""

    try {
        # 先保存流水线元数据
        $globalSw.Stop()
        $pipelineState.totalDurationMs = $globalSw.ElapsedMilliseconds

        $hasFailedStage = ($pipelineState.stages | Where-Object { $_.status -eq "failed" }).Count -gt 0
        $pipelineState.overallStatus = if ($hasFailedStage) { "failed" } else { "passed" }

        $metaPath = Join-Path $ReportDir "pipeline-meta-$PIPELINE_ID.json"
        $pipelineState | ConvertTo-Json -Depth 5 | Out-File -FilePath $metaPath -Encoding UTF8

        # 调用报告生成器
        $reportScript = Join-Path $ScriptDir "report-generator.ps1"
        if ([System.IO.File]::Exists($reportScript)) {
            $reportArgs = @("-ReportDir", $ReportDir, "-PipelineResult", $metaPath)
            if ($pipelineState.smokeResultPath) { $reportArgs += @("-SmokeResult", $pipelineState.smokeResultPath) }
            if ($pipelineState.regressionResultPath) { $reportArgs += @("-RegressionResult", $pipelineState.regressionResultPath) }
            if ($pipelineState.performanceResultPath) { $reportArgs += @("-PerformanceResult", $pipelineState.performanceResultPath) }

            & $reportScript @reportArgs
            $reportExit = $LASTEXITCODE

            if ($reportExit -ne 0) {
                $stageStatus = "FAILED"
                $stageDetail = "Report generation indicated failures"
            } else {
                $stageDetail = "Report generated"
            }
        } else {
            $stageStatus = "FAILED"
            $stageDetail = "Report generator script not found"
        }
    } catch {
        $stageStatus = "FAILED"
        $stageDetail = $_.Exception.Message
    }

    $stageSw.Stop()
    Write-StageResult "Report Generation" $stageStatus "$($stageSw.ElapsedMilliseconds)ms" $stageDetail

    $pipelineState.stages += @{
        name       = "report"
        status     = $stageStatus.ToLower()
        durationMs = $stageSw.ElapsedMilliseconds
        detail     = $stageDetail
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# Finalize
# ══════════════════════════════════════════════════════════════════════════════
$globalSw.Stop()

# 确保停止 SOLO
Stop-SoloProcess

# 判定最终状态
$hasFailedStage = ($pipelineState.stages | Where-Object { $_.status -eq "failed" }).Count -gt 0
$pipelineState.overallStatus = if ($hasFailedStage) { "failed" } else { "passed" }
$pipelineState.totalDurationMs = $globalSw.ElapsedMilliseconds

# 如果有失败且需要回滚
if ($pipelineState.overallStatus -eq "failed" -and $pipelineState.rollbackNeeded -and $patchAppliedByPipeline) {
    Invoke-Rollback
}

# 保存流水线元数据（最终版本）
$metaPath = Join-Path $ReportDir "pipeline-meta-$PIPELINE_ID.json"
$pipelineState | ConvertTo-Json -Depth 5 | Out-File -FilePath $metaPath -Encoding UTF8

# ── 输出最终摘要 ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=============================================" -ForegroundColor $(if ($pipelineState.overallStatus -eq "passed") { "Green" } else { "Red" })
Write-Host "  Pipeline Result: $($pipelineState.overallStatus.ToUpper())" -ForegroundColor $(if ($pipelineState.overallStatus -eq "passed") { "Green" } else { "Red" })
Write-Host "  ID: $PIPELINE_ID" -ForegroundColor Gray
Write-Host "  Duration: $($pipelineState.totalDurationMs)ms" -ForegroundColor Gray
Write-Host "---------------------------------------------" -ForegroundColor White

foreach ($s in $pipelineState.stages) {
    $icon = switch ($s.status) {
        "passed"  { "OK" }
        "failed"  { "FAIL" }
        "skipped" { "SKIP" }
        default   { "??" }
    }
    $color = switch ($s.status) {
        "passed"  { "Green" }
        "failed"  { "Red" }
        "skipped" { "DarkGray" }
        default   { "White" }
    }
    Write-Host "  [$icon] $($s.name): $($s.status.ToUpper()) ($($s.durationMs)ms)" -ForegroundColor $color
    if ($s.detail) {
        Write-Host "       $($s.detail)" -ForegroundColor Gray
    }
}

Write-Host "---------------------------------------------" -ForegroundColor White
Write-Host "  Metadata: $metaPath" -ForegroundColor Gray
Write-Host "  Reports:  $ReportDir" -ForegroundColor Gray
Write-Host "=============================================" -ForegroundColor $(if ($pipelineState.overallStatus -eq "passed") { "Green" } else { "Red" })

exit $(if ($pipelineState.overallStatus -eq "passed") { 0 } else { 1 })
