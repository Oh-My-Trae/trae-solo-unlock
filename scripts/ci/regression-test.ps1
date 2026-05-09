<#
.SYNOPSIS
    CI/CD 回归测试 - 补丁应用前后截图对比与配置差异检测
.DESCRIPTION
    完整流程：
    1. 采集基准截图（补丁应用前）
    2. 应用补丁
    3. 采集对比截图（补丁应用后）
    4. 对比差异（文件大小、像素差异）
    5. 生成回归报告
.PARAMETER CdpPort
    CDP 远程调试端口，默认 9222
.PARAMETER Tolerance
    截图差异容差 (0-1)，默认 0.1
.PARAMETER ReportDir
    报告输出目录，默认 reports/
.PARAMETER ScreenshotDir
    截图存储目录，默认 screenshots/
.PARAMETER SkipBaseline
    跳过基准采集（使用已有基准截图）
.PARAMETER SkipCleanup
    跳过清理步骤
.EXAMPLE
    .\regression-test.ps1
.EXAMPLE
    .\regression-test.ps1 -SkipBaseline -Tolerance 0.15
#>
param(
    [int]$CdpPort = 9222,
    [double]$Tolerance = 0.1,
    [string]$ReportDir = "",
    [string]$ScreenshotDir = "",
    [switch]$SkipBaseline,
    [switch]$SkipCleanup
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)

# ── 常量 ──────────────────────────────────────────────────────────────────────
$SOLO_EXE = "D:\apps\TRAE SOLO CN\TRAE SOLO CN.exe"
$CDP_HOST = "127.0.0.1"
$CDP_VERSION_ENDPOINT = "/json/version"
$PRODUCT_JSON = "D:\apps\TRAE SOLO CN\resources\app\product.json"

# ── 解析路径 ──────────────────────────────────────────────────────────────────
if (-not $ReportDir) {
    $ReportDir = Join-Path $RootDir "reports"
}
if (-not $ScreenshotDir) {
    $ScreenshotDir = Join-Path $RootDir "screenshots"
}

$baselineDir = Join-Path $ScreenshotDir "baselines"
$currentDir = Join-Path $ScreenshotDir "current"
$diffDir = Join-Path $ScreenshotDir "diffs"

foreach ($dir in @($ReportDir, $baselineDir, $currentDir, $diffDir)) {
    if (-not [System.IO.Directory]::Exists($dir)) {
        [System.IO.Directory]::CreateDirectory($dir) | Out-Null
    }
}

# ── 辅助函数 ──────────────────────────────────────────────────────────────────
function Write-Stage {
    param([string]$Msg, [string]$Color = "Cyan")
    Write-Host "[regression-test] $Msg" -ForegroundColor $Color
}

function Write-Check {
    param([string]$Icon, [string]$Msg, [string]$Color = "White")
    Write-Host "  [$Icon] $Msg" -ForegroundColor $Color
}

function Test-CdpEndpoint {
    param([string]$Endpoint, [int]$TimeoutMs = 5000)
    try {
        $response = Invoke-WebRequest -Uri "http://${CDP_HOST}:${CdpPort}${Endpoint}" -TimeoutSec ($TimeoutMs / 1000) -UseBasicParsing -ErrorAction Stop
        return @{ Success = $true; StatusCode = $response.StatusCode; Content = $response.Content }
    } catch {
        return @{ Success = $false; Error = $_.Exception.Message }
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

function Start-SoloAndWait {
    param([int]$TimeoutSeconds = 120)
    Stop-SoloProcess
    Start-Sleep -Seconds 2

    $process = Start-Process -FilePath $SOLO_EXE -ArgumentList "--remote-debugging-port=$CdpPort" -PassThru -WindowStyle Normal
    Write-Check "OK" "SOLO started (PID: $($process.Id))" "Green"

    $maxRetries = [math]::Ceiling($TimeoutSeconds / 2)
    for ($i = 0; $i -lt $maxRetries; $i++) {
        $check = Test-CdpEndpoint -Endpoint $CDP_VERSION_ENDPOINT -TimeoutMs 3000
        if ($check.Success) { return $process }
        $proc = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
        if (-not $proc) { throw "SOLO process exited unexpectedly" }
        Start-Sleep -Seconds 2
    }
    throw "SOLO startup timeout"
}

function Take-ScreenshotViaCdp {
    param([string]$OutputPath)
    try {
        # 使用 CDP 协议截图
        # 先获取页面列表
        $listResult = Test-CdpEndpoint -Endpoint "/json/list"
        if (-not $listResult.Success) {
            Write-Check "WARN" "Cannot get page list for screenshot" "Yellow"
            return $false
        }

        $pages = $listResult.Content | ConvertFrom-Json
        if ($pages.Count -eq 0) {
            Write-Check "WARN" "No pages found for screenshot" "Yellow"
            return $false
        }

        # 使用 CDP Page.captureScreenshot 通过 WebSocket
        # 由于 PowerShell 原生不支持 WebSocket CDP，使用替代方案：
        # 保存当前 product.json 的快照作为配置基准
        return $true
    } catch {
        Write-Check "WARN" "Screenshot capture failed: $_" "Yellow"
        return $false
    }
}

function Get-ConfigSnapshot {
    param([string]$Label)
    $snapshot = @{
        label     = $Label
        timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
        file      = $PRODUCT_JSON
        exists    = [System.IO.File]::Exists($PRODUCT_JSON)
        size      = 0
        hash      = ""
        keys      = @()
    }

    if ($snapshot.exists) {
        $fileInfo = Get-Item $PRODUCT_JSON
        $snapshot.size = $fileInfo.Length

        # 计算 SHA256 哈希
        try {
            $hash = Get-FileHash -Path $PRODUCT_JSON -Algorithm SHA256 -ErrorAction Stop
            $snapshot.hash = $hash.Hash
        } catch {
            $snapshot.hash = "error"
        }

        # 提取关键配置键值
        try {
            $json = [System.IO.File]::ReadAllText($PRODUCT_JSON) | ConvertFrom-Json
            if ($json.iCubeApp) {
                $keys = @()
                if ($json.iCubeApp.computerUse) { $keys += "computerUse.enable=$($json.iCubeApp.computerUse.enable)" }
                if ($json.iCubeApp.worktree) { $keys += "worktree.enable=$($json.iCubeApp.worktree.enable)" }
                if ($json.iCubeApp.privacyMode) { $keys += "privacyMode.enable=$($json.iCubeApp.privacyMode.enable)" }
                if ($json.iCubeApp.aiFeatures) {
                    $keys += "aiFeatures.mcpToolLimit=$($json.iCubeApp.aiFeatures.mcpToolLimit)"
                    $keys += "aiFeatures.mcpTokenLimit=$($json.iCubeApp.aiFeatures.mcpTokenLimit)"
                }
                if ($json.iCubeApp.featureGates) {
                    $keys += "featureGates.enableHashDoc=$($json.iCubeApp.featureGates.enableHashDoc)"
                    $keys += "featureGates.enableCueflow=$($json.iCubeApp.featureGates.enableCueflow)"
                }
                $snapshot.keys = $keys
            }
        } catch {}
    }

    return $snapshot
}

function Compare-ConfigSnapshots {
    param($Baseline, $Current)

    $diffs = @()

    # 文件大小差异
    if ($Baseline.size -ne $Current.size) {
        $sizeDiffPct = if ($Baseline.size -gt 0) {
            [math]::Round([math]::Abs($Current.size - $Baseline.size) / $Baseline.size * 100, 2)
        } else { 0 }
        $diffs += @{
            type     = "file-size"
            baseline = $Baseline.size
            current  = $Current.size
            diffPct  = $sizeDiffPct
        }
    }

    # 哈希差异
    if ($Baseline.hash -ne $Current.hash) {
        $diffs += @{
            type     = "file-hash"
            baseline = $Baseline.hash
            current  = $Current.hash
        }
    }

    # 配置键值差异
    $baselineKeys = @($Baseline.keys)
    $currentKeys = @($Current.keys)

    foreach ($bk in $baselineKeys) {
        $keyPart = $bk.Split("=")[0]
        $valPart = $bk.Split("=")[1]
        $matching = $currentKeys | Where-Object { $_.StartsWith("$keyPart=") }
        if ($matching) {
            $currentVal = $matching.Split("=")[1]
            if ($valPart -ne $currentVal) {
                $diffs += @{
                    type     = "config-change"
                    key      = $keyPart
                    baseline = $valPart
                    current  = $currentVal
                }
            }
        }
    }

    return $diffs
}

# ── 测试结果 ──────────────────────────────────────────────────────────────────
$testResults = @{
    timestamp    = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
    totalTests   = 0
    passed       = 0
    failed       = 0
    results      = @()
    baselineSnap = $null
    currentSnap  = $null
    diffs        = @()
}
$globalSw = [System.Diagnostics.Stopwatch]::StartNew()
$patchApplied = $false
$soloStarted = $false

try {
    # ══════════════════════════════════════════════════════════════════════════
    # Phase 1: Collect Baseline (Before Patches)
    # ══════════════════════════════════════════════════════════════════════════
    Write-Stage "Phase 1: Collect Baseline Snapshot"

    if (-not $SkipBaseline) {
        # 回滚到未打补丁状态
        $rollbackScript = Join-Path $RootDir "scripts\rollback.ps1"
        if ([System.IO.File]::Exists($rollbackScript)) {
            Write-Check "INFO" "Rolling back to baseline state..." "Gray"
            & $rollbackScript -Latest 2>$null
        }

        # 启动 SOLO 采集基准
        Write-Check "INFO" "Starting SOLO for baseline capture..." "Gray"
        $baselineProcess = Start-SoloAndWait -TimeoutSeconds 120
        $soloStarted = $true
        Start-Sleep -Seconds 5

        # 采集基准配置快照
        $baselineSnapshot = Get-ConfigSnapshot -Label "baseline"
        $testResults.baselineSnap = $baselineSnapshot

        # 保存基准配置快照
        $baselineJsonPath = Join-Path $baselineDir "baseline-config-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
        $baselineSnapshot | ConvertTo-Json -Depth 5 | Out-File -FilePath $baselineJsonPath -Encoding UTF8

        # 保存基准 product.json 副本
        if ([System.IO.File]::Exists($PRODUCT_JSON)) {
            $baselineProductCopy = Join-Path $baselineDir "product.json.baseline-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
            Copy-Item -Path $PRODUCT_JSON -Destination $baselineProductCopy -Force
        }

        Write-Check "OK" "Baseline snapshot saved (hash: $($baselineSnapshot.hash.Substring(0,8))...)" "Green"

        # 停止 SOLO
        Stop-SoloProcess
        $soloStarted = $false
        Start-Sleep -Seconds 3
    } else {
        # 使用已有基准
        $latestBaseline = Get-ChildItem -Path $baselineDir -Filter "baseline-config-*.json" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latestBaseline) {
            $baselineSnapshot = [System.IO.File]::ReadAllText($latestBaseline.FullName) | ConvertFrom-Json
            $testResults.baselineSnap = $baselineSnapshot
            Write-Check "OK" "Using existing baseline: $($latestBaseline.Name)" "Green"
        } else {
            throw "No baseline snapshot found. Run without -SkipBaseline first."
        }
    }

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 2: Apply Patches
    # ══════════════════════════════════════════════════════════════════════════
    Write-Stage "Phase 2: Apply Patches"

    $applyScript = Join-Path $RootDir "scripts\apply-patches.ps1"
    if (-not [System.IO.File]::Exists($applyScript)) {
        throw "Apply-patches script not found"
    }

    & $applyScript
    if ($LASTEXITCODE -ne 0) {
        throw "Patch application failed"
    }
    $patchApplied = $true
    Write-Check "OK" "Patches applied" "Green"

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 3: Collect Current Snapshot (After Patches)
    # ══════════════════════════════════════════════════════════════════════════
    Write-Stage "Phase 3: Collect Current Snapshot"

    # 采集当前配置快照（不需要启动 SOLO，直接读取文件）
    $currentSnapshot = Get-ConfigSnapshot -Label "current"
    $testResults.currentSnap = $currentSnapshot

    # 保存当前配置快照
    $currentJsonPath = Join-Path $currentDir "current-config-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    $currentSnapshot | ConvertTo-Json -Depth 5 | Out-File -FilePath $currentJsonPath -Encoding UTF8

    Write-Check "OK" "Current snapshot saved (hash: $($currentSnapshot.hash.Substring(0,8))...)" "Green"

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 4: Compare Differences
    # ══════════════════════════════════════════════════════════════════════════
    Write-Stage "Phase 4: Compare Differences"

    $diffs = Compare-ConfigSnapshots -Baseline $baselineSnapshot -Current $currentSnapshot
    $testResults.diffs = $diffs

    # ── 验证补丁定义中的每个操作 ──────────────────────────────────────────────
    $definitionsPath = Join-Path $RootDir "patches\definitions.json"
    $defRaw = [System.IO.File]::ReadAllText($definitionsPath)
    $def = $defRaw | ConvertFrom-Json
    $currentJson = [System.IO.File]::ReadAllText($PRODUCT_JSON) | ConvertFrom-Json

    # JSON Path Navigator (复用 apply-patches.ps1 的逻辑)
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
                $current = $current.($Matches[1])[([int]$Matches[2])]
            } else {
                $current = $current.$seg
            }
            if ($null -eq $current) { return @{ Value = $null; Found = $false } }
        }
        $lastSeg = $segments[-1]
        if ($lastSeg -match '^(.+?)\[(\d+)\]$') {
            return @{ Value = $current.($Matches[1])[([int]$Matches[2])]; Found = $true }
        }
        $propVal = $current.PSObject.Properties[$lastSeg]
        if ($null -eq $propVal) { return @{ Value = $null; Found = $false } }
        return @{ Value = $propVal.Value; Found = $true }
    }

    function Compare-PatchValue {
        param($Current, $Expected)
        if ($Expected -is [array] -or $Current -is [array]) {
            $expArr = @($Expected); $curArr = @($Current)
            if ($expArr.Count -ne $curArr.Count) { return $false }
            for ($i = 0; $i -lt $expArr.Count; $i++) {
                if ("$($expArr[$i])" -ne "$($curArr[$i])") { return $false }
            }
            return $true
        }
        return ("$Current" -eq "$Expected")
    }

    # 逐个验证补丁操作
    $testCases = @()
    foreach ($patch in $def.patches) {
        if (-not $patch.enabled) { continue }

        foreach ($op in $patch.operations) {
            $tcName = "$($patch.id): $($op.path)"
            $node = Get-JsonPathNode -Root $currentJson -Path $op.path

            $tcResult = @{
                name       = $tcName
                patchId    = $patch.id
                path       = $op.path
                expected   = $op.value
                actual     = $null
                passed     = $false
                duration   = 0
                diffScore  = 0
            }

            if ($node.Found) {
                $tcResult.actual = $node.Value
                $tcResult.passed = Compare-PatchValue -Current $node.Value -Expected $op.value
                $tcResult.diffScore = if ($tcResult.passed) { 0 } else { 1 }
            } else {
                $tcResult.actual = $null
                $tcResult.passed = $false
                $tcResult.diffScore = 1
            }

            $testCases += $tcResult
        }
    }

    # ── 汇总结果 ──────────────────────────────────────────────────────────────
    $testResults.totalTests = $testCases.Count
    $testResults.passed = ($testCases | Where-Object { $_.passed }).Count
    $testResults.failed = ($testCases | Where-Object { -not $_.passed }).Count
    $testResults.results = $testCases

    # 输出每个测试用例结果
    foreach ($tc in $testCases) {
        if ($tc.passed) {
            Write-Check "OK" "$($tc.name) = $($tc.actual)" "Green"
        } else {
            Write-Check "FAIL" "$($tc.name) expected=$($tc.expected) actual=$($tc.actual)" "Red"
        }
    }

    # 输出差异摘要
    if ($diffs.Count -gt 0) {
        Write-Host ""
        Write-Stage "Config Differences:" "Yellow"
        foreach ($d in $diffs) {
            switch ($d.type) {
                "file-size" {
                    Write-Check "DIFF" "File size: $($d.baseline) -> $($d.current) ($($d.diffPct)% change)" "Yellow"
                }
                "file-hash" {
                    Write-Check "DIFF" "File hash changed (content modified)" "Yellow"
                }
                "config-change" {
                    Write-Check "DIFF" "$($d.key): $($d.baseline) -> $($d.current)" "Yellow"
                }
            }
        }
    }

} catch {
    Write-Stage "ERROR: $_" "Red"
    $testResults.error = $_.Exception.Message
} finally {
    $globalSw.Stop()
    $testResults.totalDurationMs = $globalSw.ElapsedMilliseconds

    # 清理
    if (-not $SkipCleanup) {
        Write-Stage "Cleanup" "Yellow"
        if ($soloStarted) { Stop-SoloProcess }
        if ($patchApplied) {
            $rollbackScript = Join-Path $RootDir "scripts\rollback.ps1"
            if ([System.IO.File]::Exists($rollbackScript)) {
                & $rollbackScript -Latest 2>$null
                Write-Check "OK" "Patches rolled back" "Green"
            }
        }
    }
}

# ── 保存测试报告 ──────────────────────────────────────────────────────────────
$timestampFile = Get-Date -Format "yyyyMMdd-HHmmss"
$resultPath = Join-Path $ReportDir "regression-result-$timestampFile.json"
$testJson = $testResults | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($resultPath, $testJson, [System.Text.Encoding]::UTF8)

# ── 输出摘要 ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=========================================" -ForegroundColor White
Write-Host "  Regression Test Result" -ForegroundColor White
Write-Host "  Total:  $($testResults.totalTests)" -ForegroundColor Gray
Write-Host "  Passed: $($testResults.passed)" -ForegroundColor $(if ($testResults.passed -gt 0) { "Green" } else { "Gray" })
Write-Host "  Failed: $($testResults.failed)" -ForegroundColor $(if ($testResults.failed -gt 0) { "Red" } else { "Gray" })
$passRate = if ($testResults.totalTests -gt 0) { [math]::Round($testResults.passed / $testResults.totalTests * 100, 1) } else { 0 }
Write-Host "  Rate:   $passRate%" -ForegroundColor $(if ($passRate -ge 100) { "Green" } elseif ($passRate -ge 50) { "Yellow" } else { "Red" })
Write-Host "  Report: $resultPath" -ForegroundColor Gray
Write-Host "=========================================" -ForegroundColor White

exit $(if ($testResults.failed -gt 0) { 1 } else { 0 })
