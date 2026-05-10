<#
.SYNOPSIS
    TRAE SOLO CN - CDP 安全启动器
.DESCRIPTION
    以独立用户数据目录和指定 CDP 端口启动 SOLO 实例，
    用于 Playwright MCP / Agent-Browser 自动化测试。
    不影响已有的正常 SOLO 实例。
.PARAMETER CdpPort
    CDP 远程调试端口，默认 9222
.PARAMETER UserDataDir
    自定义用户数据目录路径（默认自动生成临时目录）
.PARAMETER NoWait
    启动后不等待 CDP 就绪就直接返回
.PARAMETER Timeout
    CDP 就绪等待超时（秒），默认 120
.EXAMPLE
    .\launch-cdp-solo.ps1
.EXAMPLE
    .\launch-cdp-solo.ps1 -CdpPort 9223
.EXAMPLE
    .\launch-cdp-solo.ps1 -CdpPort 9222 -NoWait
.NOTES
    ⚠️ 重要: 此脚本用于启动专供自动化测试的 SOLO 实例。
       正常使用的 SOLO 应该正常启动（不带此脚本）。
       两者使用不同的 user-data-dir，完全隔离。
#>

param(
    [int]$CdpPort = 9222,
    [string]$UserDataDir = "",
    [switch]$NoWait,
    [int]$Timeout = 120
)

$ErrorActionPreference = "Stop"

# ── 常量 ──────────────────────────────────────────────────────────────────────
$SOLO_EXE = "D:\apps\TRAE SOLO CN\TRAE SOLO CN.exe"
$CDP_HOST = "127.0.0.1"
$CDP_VERSION_ENDPOINT = "/json/version"
$CDP_LIST_ENDPOINT = "/json/list"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── 颜色输出 ──────────────────────────────────────────────────────────────────
function Write-Banner {
    param([string]$Msg, [string]$Color = "Cyan")
    Write-Host "[cdp-launcher] $Msg" -ForegroundColor $Color
}

function Write-Status {
    param([string]$Icon, [string]$Msg, [string]$Color = "White")
    Write-Host "  [$Icon] $Msg" -ForegroundColor $Color
}

# ══════════════════════════════════════════════════════════════════════════════
# Phase 0: 前置检查
# ══════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Banner "=========================================" "Yellow"
Write-Banner "  TRAE SOLO CN - CDP Safe Launcher" "Yellow"
Write-Banner "=========================================" "Yellow"
Write-Host ""

# 检查 exe
if (-not (Test-Path $SOLO_EXE)) {
    Write-Status "FATAL" "SOLO executable not found: $SOLO_EXE" "Red"
    exit 1
}
Write-Status "OK" "SOLO exe: $SOLO_EXE" "Gray"

# 用户数据目录
if (-not $UserDataDir) {
    $baseDir = Join-Path $ScriptDir "..\.solo-cdp-profiles"
    if (-not (Test-Path $baseDir)) { New-Item -ItemType Directory -Path $baseDir -Force | Out-Null }
    $UserDataDir = Join-Path $baseDir "profile-port${CdpPort}"
}
New-Item -ItemType Directory -Path $UserDataDir -Force | Out-Null
Write-Status "OK" "User data dir: $UserDataDir" "Gray"

# 检查端口占用
try {
    $testConn = Test-NetConnection -ComputerName $CDP_HOST -Port $CdpPort -WarningAction SilentlyContinue
    if ($testConn.TcpTestSucceeded) {
        Write-Status "WARN" "Port $CdpPort is already in use! Trying alternative ports..." "Yellow"
        for ($alt = $CdpPort + 1; $alt -lt $CdpPort + 20; $alt++) {
            $altTest = Test-NetConnection -ComputerName $CDP_HOST -Port $alt -WarningAction SilentlyContinue
            if (-not $altTest.TcpTestSucceeded) {
                $CdpPort = $alt
                Write-Status "OK" "Using alternative port: $CdpPort" "Green"
                break
            }
        }
    }
} catch {
    # 忽略网络检查错误
}

Write-Host ""
Write-Banner "Launch Configuration:" "White"
Write-Status ">>" "EXE:     $SOLO_EXE" "DarkGray"
Write-Status ">>" "CDP:     ${CDP_HOST}:${CdpPort}" "DarkGray"
Write-Status ">>" "Profile: $UserDataDir" "DarkGray"
Write-Status ">>" "Timeout: ${Timeout}s" "DarkGray"
Write-Host ""

# ══════════════════════════════════════════════════════════════════════════════
# Phase 1: 启动 SOLO
# ══════════════════════════════════════════════════════════════════════════════

Write-Banner "Phase 1: Launching SOLO..."

$proc = Start-Process -FilePath $SOLO_EXE `
    -ArgumentList (
        "--remote-debugging-port=$CdpPort",
        "--user-data-dir=`"$UserDataDir`""
    ) `
    -PassThru `
    -WindowStyle Normal

$pid = $proc.Id
Write-Status "OK" "Process started! PID: $pid" "Green"

# ══════════════════════════════════════════════════════════════════════════════
# Phase 2: 等待 CDP 就绪
# ══════════════════════════════════════════════════════════════════════════════

if ($NoWait) {
    Write-Banner "Phase 2: Skipped (-NoWait)"
    Write-Status "INFO" "CDP endpoint will be available at http://${CDP_HOST}:${CdpPort}" "Cyan"
    Write-Host ""
    Write-Banner "========================================= " "Green"
    Write-Banner "  LAUNCHED (PID: $pid) - Check port manually" "Green"
    Write-Banner "========================================= " "Green"
    exit 0
}

Write-Banner "Phase 2: Waiting for CDP on port $CdpPort (timeout: ${Timeout}s)..."

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$ready = $false
$maxRetries = [math]::Ceiling($Timeout / 2)

for ($i = 0; $i -lt $maxRetries; $i++) {
    # 检查进程是否还活着
    $pCheck = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if (-not $pCheck) {
        Write-Status "FATAL" "Process (PID: $pid) exited unexpectedly!" "Red"
        Write-Status "HINT" "Possible causes:" "Yellow"
        Write-Status "   1" "Another SOLO instance may be using single-instance lock" "Yellow"
        Write-Status "   2" "Try closing other SOLO instances first" "Yellow"
        Write-Status "   3" "Check Windows Event Viewer for crash details" "Yellow"
        exit 1
    }

    # 尝试连接 CDP
    try {
        $r = Invoke-WebRequest -Uri "http://${CDP_HOST}:${CdpPort}${CDP_VERSION_ENDPOINT}" `
            -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop

        $ready = $true
        $sw.Stop()

        Write-Status "OK" "CDP Ready in $($sw.ElapsedMilliseconds)ms!" "Green"

        # 解析版本信息
        try {
            $ver = $r.Content | ConvertFrom-Json
            Write-Status ">>" "Browser:     $($ver.Browser)" "DarkGray"
            Write-Status ">>" "Protocol:    $($ver.'Protocol-Version')" "DarkGray"
            Write-Status ">>" "WebSocket:  $($ver.webSocketDebuggerUrl)" "DarkGray"
            Write-Status ">>" "V8:          $($ver.'V8-Version')" "DarkGray"
        } catch {
            Write-Status ">>" "Version info: $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))" "DarkGray"
        }
        break
    } catch {
        if (($i % 10) -eq 9 -and $i -gt 0) {
            $elapsed = [math]::Round($sw.Elapsed.TotalSeconds, 1)
            Write-Host "  ... still waiting (${elapsed}s / ${Timeout}s)"
        } else {
            Write-Host -NoNewline "."
        }
    }

    Start-Sleep -Seconds 2
}

Write-Host ""

if (-not $ready) {
    $sw.Stop()
    Write-Status "FAIL" "CDP not ready after $($sw.ElapsedMilliseconds)ms" "Red"
    Write-Status "HINT" "Try increasing -Timeout or check if port $CdpPort is blocked by firewall" "Yellow"
    exit 1
}

# ══════════════════════════════════════════════════════════════════════════════
# Phase 3: 获取页面列表 & 输出连接信息
# ══════════════════════════════════════════════════════════════════════════════

Write-Banner "Phase 3: Fetching page list..."

try {
    $listR = Invoke-WebRequest -Uri "http://${CDP_HOST}:${CdpPort}${CDP_LIST_ENDPOINT}" `
        -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    $pages = $listR.Content | ConvertFrom-Json

    Write-Status "OK" "Found $($pages.Count) page(s):" "Green"
    foreach ($page in $pages) {
        $title = if ($page.title) { $page.title } else { "(untitled)" }
        $urlShort = if ($page.url.Length -gt 60) { $page.url.Substring(0, 60) + "..." } else { $page.url }
        Write-Status "  +" "[$title] $urlShort" "DarkGray"
    }
} catch {
    Write-Status "WARN" "Could not fetch page list: $_" "Yellow"
}

# ══════════════════════════════════════════════════════════════════════════════
# 完成!
# ══════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Banner "========================================= " "Green"
Write-Banner "  SUCCESS! SOLO CDP Instance Running" "Green"
Write-Banner "========================================= " "Green"
Write-Host ""
Write-Host "  Connection Info:" "Cyan"
Write-Host "    CDP HTTP:   http://${CDP_HOST}:${CdpPort}" "White"
Write-Host "    Version:    http://${CDP_HOST}:${CdpPort}${CDP_VERSION_ENDPOINT}" "White"
Write-Host "    Page List:  http://${CDP_HOST}:${CdpPort}${CDP_LIST_ENDPOINT}" "White"
Write-Host ""
Write-Host "  Playwright MCP connect command:" "Cyan"
Write-Host "    await playwright.chromium.connectOverCDP('http://${CDP_host}:${CdpPort}');" "White"
Write-Host ""
Write-Host "  Agent-Browser CLI command:" "Cyan"
Write-Host "    agent-browser connect ${CdpPort}" "White"
Write-Host ""
Write-Host "  To stop this instance:" "Cyan"
Write-Host "    Stop-Process -Id $pid -Force" "White"
Write-Host "    # Or just close the window normally" "DarkGray"
Write-Host ""

# 保存 PID 到文件，方便后续脚本引用
$pidFile = Join-Path (Split-Path $UserDataDir) "cdp-solo.pid"
Set-Content -Path $pidFile -Value "$pid|$CdpPort|$UserDataDir"
Write-Status "INFO" "PID saved to: $pidFile" "DarkGray"

exit 0