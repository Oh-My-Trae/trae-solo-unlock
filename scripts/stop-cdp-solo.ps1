<#
.SYNOPSIS
    停止 CDP 模式启动的 SOLO 实例
.DESCRIPTION
    安全停止由 launch-cdp-solo.ps1 启动的 SOLO CDP 测试实例。
    不会影响正常使用的 SOLO 实例。
.PARAMETER Pid
    指定要停止的进程 PID（可选，默认从 pid 文件读取）
.PARAMETER Force
    强制终止（/F）
.EXAMPLE
    .\stop-cdp-solo.ps1
.EXAMPLE
    .\stop-cdp-solo.ps1 -Force
#>

param(
    [int]$Pid = 0,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Status {
    param([string]$Icon, [string]$Msg, [string]$Color = "White")
    Write-Host "  [$Icon] $Msg" -ForegroundColor $Color
}

Write-Host ""
Write-Host "[cdp-stopper] Stopping SOLO CDP instance..." -ForegroundColor Cyan

if ($Pid -eq 0) {
    # 尝试从 PID 文件读取
    $pidFiles = @(
        Join-Path $ScriptDir "..\.solo-cdp-profiles\cdp-solo.pid"
    )
    foreach ($pf in $pidFiles) {
        if (Test-Path $pf) {
            $pidData = Get-Content $pf -Raw
            $parts = $pidData.Trim().Split('|')
            $Pid = [int]$parts[0]
            Write-Status "INFO" "Read PID from file: $Pid (port: $($parts[1]))" "Gray"
            break
        }
    }
}

if ($Pid -eq 0) {
    Write-Status "WARN" "No PID specified or found. Use -Pid <pid> to specify." "Yellow"

    # 列出所有 SOLO 进程供用户选择
    Write-Host ""
    Write-Status "INFO" "Running SOLO processes:" "Cyan"
    $procs = Get-Process "*TRAE SOLO CN*" -ErrorAction SilentlyContinue |
        Select-Object Name, Id, StartTime |
        Sort-Object StartTime

    if ($procs) {
        $procs | Format-Table -AutoSize
    } else {
        Write-Status "OK" "No SOLO processes found" "Green"
    }
    exit 0
}

$proc = Get-Process -Id $Pid -ErrorAction SilentlyContinue
if (-not $proc) {
    Write-Status "OK" "Process $Pid already stopped" "Green"
    exit 0
}

Write-Status "INFO" "Stopping process $Pid (Name: $($proc.Name))..." "Gray"

if ($Force) {
    Stop-Process -Id $Pid -Force -ErrorAction SilentlyContinue
} else {
    # 先尝试优雅关闭
    $proc.CloseMainWindow() | Out-Null
    Start-Sleep -Seconds 3

    # 检查是否还在运行
    $stillRunning = Get-Process -Id $Pid -ErrorAction SilentlyContinue
    if ($stillRunning) {
        Stop-Process -Id $Pid -Force -ErrorAction SilentlyContinue
        Write-Status "OK" "Force-closed after graceful attempt" "Yellow"
    } else {
        Write-Status "OK" "Gracefully closed" "Green"
    }
}

Start-Sleep -Seconds 1
$finalCheck = Get-Process -Id $Pid -ErrorAction SilentlyContinue
if (-not $finalCheck) {
    Write-Status "OK" "Process $Pid confirmed stopped" "Green"
} else {
    Write-Status "WARN" "Process may still be running" "Red"
}

# 清理 PID 文件
foreach ($pf in @(Join-Path $ScriptDir "..\.solo-cdp-profiles\cdp-solo.pid")) {
    if (Test-Path $pf) { Remove-Item $pf -Force -ErrorAction SilentlyContinue }
}

Write-Host ""