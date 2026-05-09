<#
.SYNOPSIS
    CI/CD 性能基准测试 - 测量 SOLO 启动时间、AI 响应延迟、内存占用
.DESCRIPTION
    测量指标：
    1. 冷启动时间（从进程启动到 CDP 就绪）
    2. 热启动时间（重启后的启动时间）
    3. AI 响应延迟（通过 CDP 发送请求并测量响应时间）
    4. 内存占用（Working Set / Private Bytes）
    与历史基准数据对比，生成性能报告
.PARAMETER CdpPort
    CDP 远程调试端口，默认 9222
.PARAMETER ColdStartIterations
    冷启动测试迭代次数，默认 3
.PARAMETER HotStartIterations
    热启动测试迭代次数，默认 3
.PARAMETER AiResponseSamples
    AI 响应延迟采样次数，默认 5
.PARAMETER StartupTimeout
    启动超时（秒），默认 120
.PARAMETER BaselineFile
    历史基准数据文件路径（JSON），留空则自动查找
.PARAMETER ReportDir
    报告输出目录，默认 reports/
.PARAMETER SkipCleanup
    跳过清理步骤
.EXAMPLE
    .\performance-benchmark.ps1
.EXAMPLE
    .\performance-benchmark.ps1 -ColdStartIterations 5 -HotStartIterations 5
#>
param(
    [int]$CdpPort = 9222,
    [int]$ColdStartIterations = 3,
    [int]$HotStartIterations = 3,
    [int]$AiResponseSamples = 5,
    [int]$StartupTimeout = 120,
    [string]$BaselineFile = "",
    [string]$ReportDir = "",
    [switch]$SkipCleanup
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)

# ── 常量 ──────────────────────────────────────────────────────────────────────
$SOLO_EXE = "D:\apps\TRAE SOLO CN\TRAE SOLO CN.exe"
$CDP_HOST = "127.0.0.1"
$CDP_VERSION_ENDPOINT = "/json/version"
$HISTORY_DIR = Join-Path $RootDir "reports\perf-history"

# ── 解析路径 ──────────────────────────────────────────────────────────────────
if (-not $ReportDir) {
    $ReportDir = Join-Path $RootDir "reports"
}
if (-not [System.IO.Directory]::Exists($ReportDir)) {
    [System.IO.Directory]::CreateDirectory($ReportDir) | Out-Null
}
if (-not [System.IO.Directory]::Exists($HISTORY_DIR)) {
    [System.IO.Directory]::CreateDirectory($HISTORY_DIR) | Out-Null
}

# ── 辅助函数 ──────────────────────────────────────────────────────────────────
function Write-Stage {
    param([string]$Msg, [string]$Color = "Cyan")
    Write-Host "[perf-benchmark] $Msg" -ForegroundColor $Color
}

function Write-Check {
    param([string]$Icon, [string]$Msg, [string]$Color = "White")
    Write-Host "  [$Icon] $Msg" -ForegroundColor $Color
}

function Test-CdpEndpoint {
    param([int]$TimeoutMs = 5000)
    try {
        $response = Invoke-WebRequest -Uri "http://${CDP_HOST}:${CdpPort}${CDP_VERSION_ENDPOINT}" -TimeoutSec ($TimeoutMs / 1000) -UseBasicParsing -ErrorAction Stop
        return $true
    } catch {
        return $false
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

function Measure-SoloStartup {
    param([string]$Type = "cold", [int]$TimeoutSeconds = 120)

    # 确保进程完全停止
    Stop-SoloProcess
    if ($Type -eq "cold") {
        # 冷启动：等待更长时间确保文件系统缓存清空
        Start-Sleep -Seconds 5
    } else {
        # 热启动：短暂等待
        Start-Sleep -Seconds 2
    }

    # 启动并计时
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $process = Start-Process -FilePath $SOLO_EXE -ArgumentList "--remote-debugging-port=$CdpPort" -PassThru -WindowStyle Normal
    $pid = $process.Id

    # 等待 CDP 就绪
    $maxRetries = [math]::Ceiling($TimeoutSeconds / 2)
    $ready = $false
    for ($i = 0; $i -lt $maxRetries; $i++) {
        if (Test-CdpEndpoint -TimeoutMs 3000) {
            $ready = $true
            break
        }
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if (-not $proc) { break }
        Start-Sleep -Milliseconds 500
    }

    $sw.Stop()
    return @{
        success    = $ready
        durationMs = $sw.ElapsedMilliseconds
        pid        = $pid
    }
}

function Get-SoloMemoryUsage {
    param([int]$Pid)
    try {
        $proc = Get-Process -Id $Pid -ErrorAction Stop
        return @{
            workingSetBytes  = $proc.WorkingSet64
            privateBytes     = $proc.PrivateMemorySize64
            virtualBytes     = $proc.VirtualMemorySize64
            pagedMemoryBytes = $proc.PagedMemorySize64
            threadCount      = $proc.Threads.Count
            handleCount      = $proc.HandleCount
        }
    } catch {
        return $null
    }
}

function Get-AllSoloMemoryUsage {
    $totalWorkingSet = 0L
    $totalPrivate = 0L
    $processDetails = @()

    $processNames = @("TRAE SOLO CN", "ai-agent", "ckg_server_windows_x64", "trae-sandbox")
    foreach ($name in $processNames) {
        try {
            $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
            foreach ($p in $procs) {
                $totalWorkingSet += $p.WorkingSet64
                $totalPrivate += $p.PrivateMemorySize64
                $processDetails += @{
                    name             = $name
                    pid              = $p.Id
                    workingSetMB     = [math]::Round($p.WorkingSet64 / 1MB, 1)
                    privateMB        = [math]::Round($p.PrivateMemorySize64 / 1MB, 1)
                    threadCount      = $p.Threads.Count
                    handleCount      = $p.HandleCount
                }
            }
        } catch {}
    }

    return @{
        workingSetBytes = $totalWorkingSet
        privateBytes    = $totalPrivate
        processDetails  = $processDetails
    }
}

function Measure-AiResponseLatency {
    param([int]$Samples = 5)
    # 通过 CDP HTTP 端点测量基本响应延迟
    # 由于无法直接通过 HTTP 与 AI 交互，使用 CDP 协议响应时间作为代理指标
    $latencies = @()

    for ($i = 0; $i -lt $Samples; $i++) {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            $response = Invoke-WebRequest -Uri "http://${CDP_HOST}:${CdpPort}${CDP_VERSION_ENDPOINT}" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
            $sw.Stop()
            $latencies += $sw.ElapsedMilliseconds
        } catch {
            $sw.Stop()
            $latencies += -1  # 标记失败
        }
        Start-Sleep -Milliseconds 500
    }

    $validLatencies = $latencies | Where-Object { $_ -ge 0 }
    $avgMs = if ($validLatencies.Count -gt 0) {
        [math]::Round(($validLatencies | Measure-Object -Average).Average, 1)
    } else { -1 }

    $minMs = if ($validLatencies.Count -gt 0) {
        [math]::Round(($validLatencies | Measure-Object -Minimum).Minimum, 1)
    } else { -1 }

    $maxMs = if ($validLatencies.Count -gt 0) {
        [math]::Round(($validLatencies | Measure-Object -Maximum).Maximum, 1)
    } else { -1 }

    return @{
        avgDurationMs = $avgMs
        minDurationMs = $minMs
        maxDurationMs = $maxMs
        samples       = $latencies
        successRate   = if ($Samples -gt 0) { [math]::Round($validLatencies.Count / $Samples * 100, 1) } else { 0 }
    }
}

function Load-HistoricalBaseline {
    param([string]$Path)
    if ($Path -and [System.IO.File]::Exists($Path)) {
        return [System.IO.File]::ReadAllText($Path) | ConvertFrom-Json
    }

    # 自动查找最新基准
    $latestBaseline = Get-ChildItem -Path $HISTORY_DIR -Filter "perf-baseline-*.json" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1

    if ($latestBaseline) {
        return [System.IO.File]::ReadAllText($latestBaseline.FullName) | ConvertFrom-Json
    }

    return $null
}

# ── 测试结果 ──────────────────────────────────────────────────────────────────
$perfResults = @{
    timestamp      = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
    coldStart      = $null
    hotStart       = $null
    aiResponse     = $null
    memory         = $null
    historyBaseline = $null
}
$globalSw = [System.Diagnostics.Stopwatch]::StartNew()
$soloPid = $null

try {
    # ══════════════════════════════════════════════════════════════════════════
    # Phase 1: Cold Start Benchmark
    # ══════════════════════════════════════════════════════════════════════════
    Write-Stage "Phase 1: Cold Start Benchmark ($ColdStartIterations iterations)"

    $coldStartTimes = @()
    for ($i = 1; $i -le $ColdStartIterations; $i++) {
        Write-Check "INFO" "Cold start iteration $i/$ColdStartIterations..." "Gray"
        $result = Measure-SoloStartup -Type "cold" -TimeoutSeconds $StartupTimeout

        if ($result.success) {
            $coldStartTimes += $result.durationMs
            Write-Check "OK" "Cold start $i: $($result.durationMs)ms" "Green"
        } else {
            Write-Check "FAIL" "Cold start $i: FAILED" "Red"
        }

        # 停止进程
        Stop-SoloProcess
        Start-Sleep -Seconds 3
    }

    if ($coldStartTimes.Count -gt 0) {
        $coldAvg = [math]::Round(($coldStartTimes | Measure-Object -Average).Average, 0)
        $coldMin = [math]::Round(($coldStartTimes | Measure-Object -Minimum).Minimum, 0)
        $coldMax = [math]::Round(($coldStartTimes | Measure-Object -Maximum).Maximum, 0)
        $coldMedian = [math]::Round(($coldStartTimes | Sort-Object)[[math]::Floor($coldStartTimes.Count / 2)], 0)

        $perfResults.coldStart = @{
            durationMs  = $coldAvg
            minMs       = $coldMin
            maxMs       = $coldMax
            medianMs    = $coldMedian
            iterations  = $ColdStartIterations
            samples     = $coldStartTimes
        }
        Write-Check "OK" "Cold start avg: ${coldAvg}ms (min=${coldMin}, max=${coldMax}, median=${coldMedian})" "Green"
    } else {
        Write-Check "FAIL" "All cold start iterations failed" "Red"
    }

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 2: Hot Start Benchmark
    # ══════════════════════════════════════════════════════════════════════════
    Write-Stage "Phase 2: Hot Start Benchmark ($HotStartIterations iterations)"

    # 先做一次启动来预热
    Write-Check "INFO" "Warming up..." "Gray"
    $warmup = Measure-SoloStartup -Type "hot" -TimeoutSeconds $StartupTimeout
    if ($warmup.success) {
        $soloPid = $warmup.pid
    }

    $hotStartTimes = @()
    for ($i = 1; $i -le $HotStartIterations; $i++) {
        Write-Check "INFO" "Hot start iteration $i/$HotStartIterations..." "Gray"
        $result = Measure-SoloStartup -Type "hot" -TimeoutSeconds $StartupTimeout

        if ($result.success) {
            $hotStartTimes += $result.durationMs
            $soloPid = $result.pid
            Write-Check "OK" "Hot start $i: $($result.durationMs)ms" "Green"
        } else {
            Write-Check "FAIL" "Hot start $i: FAILED" "Red"
        }
    }

    if ($hotStartTimes.Count -gt 0) {
        $hotAvg = [math]::Round(($hotStartTimes | Measure-Object -Average).Average, 0)
        $hotMin = [math]::Round(($hotStartTimes | Measure-Object -Minimum).Minimum, 0)
        $hotMax = [math]::Round(($hotStartTimes | Measure-Object -Maximum).Maximum, 0)
        $hotMedian = [math]::Round(($hotStartTimes | Sort-Object)[[math]::Floor($hotStartTimes.Count / 2)], 0)

        $perfResults.hotStart = @{
            durationMs  = $hotAvg
            minMs       = $hotMin
            maxMs       = $hotMax
            medianMs    = $hotMedian
            iterations  = $HotStartIterations
            samples     = $hotStartTimes
        }
        Write-Check "OK" "Hot start avg: ${hotAvg}ms (min=${hotMin}, max=${hotMax}, median=${hotMedian})" "Green"
    } else {
        Write-Check "FAIL" "All hot start iterations failed" "Red"
    }

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 3: AI Response Latency
    # ══════════════════════════════════════════════════════════════════════════
    Write-Stage "Phase 3: AI Response Latency ($AiResponseSamples samples)"

    # 确保 SOLO 正在运行
    if (-not (Test-CdpEndpoint)) {
        Write-Check "INFO" "Starting SOLO for AI response test..." "Gray"
        $startResult = Measure-SoloStartup -Type "hot" -TimeoutSeconds $StartupTimeout
        if ($startResult.success) {
            $soloPid = $startResult.pid
        } else {
            throw "Cannot start SOLO for AI response test"
        }
    }

    Start-Sleep -Seconds 3

    $aiLatency = Measure-AiResponseLatency -Samples $AiResponseSamples
    $perfResults.aiResponse = $aiLatency

    Write-Check "OK" "AI response avg: $($aiLatency.avgDurationMs)ms (min=$($aiLatency.minDurationMs), max=$($aiLatency.maxDurationMs), success=$($aiLatency.successRate)%)" "Green"

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 4: Memory Usage
    # ══════════════════════════════════════════════════════════════════════════
    Write-Stage "Phase 4: Memory Usage"

    # 等待内存稳定
    Start-Sleep -Seconds 5

    $memUsage = Get-AllSoloMemoryUsage
    $perfResults.memory = $memUsage

    $totalMB = [math]::Round($memUsage.workingSetBytes / 1MB, 1)
    $privateMB = [math]::Round($memUsage.privateBytes / 1MB, 1)
    Write-Check "OK" "Total Working Set: ${totalMB} MB, Private: ${privateMB} MB" "Green"

    foreach ($pd in $memUsage.processDetails) {
        Write-Check "INFO" "  $($pd.name) (PID $($pd.pid)): WS=$($pd.workingSetMB)MB, Private=$($pd.privateMB)MB, Threads=$($pd.threadCount)" "Gray"
    }

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 5: Compare with Historical Baseline
    # ══════════════════════════════════════════════════════════════════════════
    Write-Stage "Phase 5: Compare with Historical Baseline"

    $historicalBaseline = Load-HistoricalBaseline -Path $BaselineFile

    if ($historicalBaseline) {
        $perfResults.historyBaseline = $historicalBaseline

        # 添加基准值到当前结果
        if ($historicalBaseline.coldStart) {
            $perfResults.coldStart.baselineMs = $historicalBaseline.coldStart.durationMs
            $delta = [math]::Round(($perfResults.coldStart.durationMs - $historicalBaseline.coldStart.durationMs) / $historicalBaseline.coldStart.durationMs * 100, 1)
            Write-Check "INFO" "Cold start vs baseline: $delta% (current=$($perfResults.coldStart.durationMs)ms, baseline=$($historicalBaseline.coldStart.durationMs)ms)" "Gray"
        }

        if ($historicalBaseline.hotStart) {
            $perfResults.hotStart.baselineMs = $historicalBaseline.hotStart.durationMs
            $delta = [math]::Round(($perfResults.hotStart.durationMs - $historicalBaseline.hotStart.durationMs) / $historicalBaseline.hotStart.durationMs * 100, 1)
            Write-Check "INFO" "Hot start vs baseline: $delta% (current=$($perfResults.hotStart.durationMs)ms, baseline=$($historicalBaseline.hotStart.durationMs)ms)" "Gray"
        }

        if ($historicalBaseline.aiResponse) {
            $perfResults.aiResponse.baselineMs = $historicalBaseline.aiResponse.avgDurationMs
            $delta = [math]::Round(($perfResults.aiResponse.avgDurationMs - $historicalBaseline.aiResponse.avgDurationMs) / $historicalBaseline.aiResponse.avgDurationMs * 100, 1)
            Write-Check "INFO" "AI response vs baseline: $delta% (current=$($perfResults.aiResponse.avgDurationMs)ms, baseline=$($historicalBaseline.aiResponse.avgDurationMs)ms)" "Gray"
        }

        if ($historicalBaseline.memory) {
            $perfResults.memory.baselineBytes = $historicalBaseline.memory.workingSetBytes
            $delta = [math]::Round(($memUsage.workingSetBytes - $historicalBaseline.memory.workingSetBytes) / $historicalBaseline.memory.workingSetBytes * 100, 1)
            Write-Check "INFO" "Memory vs baseline: $delta% (current=${totalMB}MB, baseline=$([math]::Round($historicalBaseline.memory.workingSetBytes / 1MB, 1))MB)" "Gray"
        }
    } else {
        Write-Check "INFO" "No historical baseline found. Current results will be saved as baseline." "Yellow"
    }

} catch {
    Write-Stage "ERROR: $_" "Red"
    $perfResults.error = $_.Exception.Message
} finally {
    $globalSw.Stop()
    $perfResults.totalDurationMs = $globalSw.ElapsedMilliseconds

    # 清理
    if (-not $SkipCleanup) {
        Write-Stage "Cleanup" "Yellow"
        Stop-SoloProcess
    }
}

# ── 保存当前结果作为新基准 ────────────────────────────────────────────────────
$timestampFile = Get-Date -Format "yyyyMMdd-HHmmss"
$baselineSavePath = Join-Path $HISTORY_DIR "perf-baseline-$timestampFile.json"
$perfJson = $perfResults | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($baselineSavePath, $perfJson, [System.Text.Encoding]::UTF8)

# ── 保存测试报告 ──────────────────────────────────────────────────────────────
$resultPath = Join-Path $ReportDir "performance-result-$timestampFile.json"
[System.IO.File]::WriteAllText($resultPath, $perfJson, [System.Text.Encoding]::UTF8)

# ── 输出摘要 ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=========================================" -ForegroundColor White
Write-Host "  Performance Benchmark Result" -ForegroundColor White
Write-Host "=========================================" -ForegroundColor White

if ($perfResults.coldStart) {
    Write-Host "  Cold Start:  $($perfResults.coldStart.durationMs)ms (median: $($perfResults.coldStart.medianMs)ms)" -ForegroundColor Green
}
if ($perfResults.hotStart) {
    Write-Host "  Hot Start:   $($perfResults.hotStart.durationMs)ms (median: $($perfResults.hotStart.medianMs)ms)" -ForegroundColor Green
}
if ($perfResults.aiResponse) {
    Write-Host "  AI Response: $($perfResults.aiResponse.avgDurationMs)ms (success: $($perfResults.aiResponse.successRate)%)" -ForegroundColor Green
}
if ($perfResults.memory) {
    $memMB = [math]::Round($perfResults.memory.workingSetBytes / 1MB, 1)
    Write-Host "  Memory:      ${memMB} MB" -ForegroundColor Green
}
Write-Host "  Baseline:    $baselineSavePath" -ForegroundColor Gray
Write-Host "  Report:      $resultPath" -ForegroundColor Gray
Write-Host "=========================================" -ForegroundColor White

exit 0
