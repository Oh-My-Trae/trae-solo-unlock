<#
.SYNOPSIS
    清理 Electron 自动化相关文件和目录
.DESCRIPTION
    仅删除 agent-browser / CDP 启动器 / Electron UI 自动化 相关的代码。
    保留：源码研究、补丁系统、API Gateway、MCP 工具、路线图文档等核心资产。
.NOTES
    执行前会列出所有将要删除的文件/目录供确认。
#>

$ErrorActionPreference = "Stop"
# 项目根目录 = scripts/ 的上级目录
$RootDir = Split-Path (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Write-Header { param([string]$Msg) Write-Host "`n=== $Msg ===" -ForegroundColor Cyan }
function Write-OK   { param([string]$Msg) Write-Host "  [+] $Msg" -ForegroundColor Green }
function Write-Del  { param([string]$Msg) Write-Host "  [-] $Msg" -ForegroundColor Red }
function Write-Skip { param([string]$Msg) Write-Host "  [~] $Msg (skipped)" -ForegroundColor DarkGray }

$ToDelete = @(
    @{ Path = "toolkit";                         Type = "Directory"; Reason = "Agent-Browser 自动化平台整套 SDK (~50个TS文件)" },
    @{ Path = "scripts\launch-cdp-solo.ps1";      Type = "File";     Reason = "CDP SOLO 启动器 (Electron 实例启动)" },
    @{ Path = "scripts\stop-cdp-solo.ps1";        Type = "File";     Reason = "CDP SOLO 停止器" },
    @{ Path = "skills\agent-browser-electron";     Type = "Directory"; Reason = "agent-browser-electron Skill (Electron 自动化操作手册)" },
    @{ Path = ".trae\specs\redesign-automation";   Type = "Directory"; Reason = "自动化平台设计规格 (spec/tasks/checklist/report)" },
    @{ Path = ".trae\specs\build-dev-toolkit";      Type = "Directory"; Reason = "开发工具链 spec (依赖 toolkit，含 agent-browser 集成)" },
    @{ Path = ".playwright-mcp";                   Type = "Directory"; Reason = "Playwright MCP 测试产物 (截图/日志/快照)" },
    @{ Path = "scripts\ci\smoke-test.ps1";         Type = "File";     Reason = "CI 冒烟测试 (依赖 CDP 端口 + agent-browser)" },
    @{ Path = "scripts\ci\regression-test.ps1";     Type = "File";     Reason = "CI 回归测试 (截图对比/基准管理)" },
    @{ Path = "scripts\ci\performance-benchmark.ps1"; Type = "File";  Reason = "CI 性能基准测试 (响应时间/Token测量)" },
    @{ Path = "scripts\ci\pipeline.ps1";            Type = "File";     Reason = "CI 流水线编排 (编排上述自动化测试)" },
    @{ Path = "scripts\ci\report-generator.ps1";    Type = "File";     Reason = "CI 报告生成器 (自动化测试报告)" },
    @{ Path = "test_mcp.db";                       Type = "File";     Reason = "MCP 测试数据库" },
    @{ Path = "solo-error.log";                    Type = "File";     Reason = "SOLO 错误日志(测试产物)" }
)

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║     TRAE SOLO CN - Electron 自动化清理脚本               ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Yellow

Write-Header "Phase 0: 清理范围统计"
$totalDelFiles = 0
$totalDelDirs = 0

foreach ($item in $ToDelete) {
    $fullPath = Join-Path $RootDir $item.Path
    if ($item.Type -eq "Directory") {
        if (Test-Path $fullPath) {
            $count = (Get-ChildItem -Path $fullPath -Recurse -File -ErrorAction SilentlyContinue).Count
            Write-Del "[DIR]  $($item.Path)  ($count files) — $($item.Reason)"
            $totalDelDirs++
            $totalDelFiles += $count
        } else {
            Write-Skip "[DIR]  $($item.Path) (不存在)"
        }
    } else {
        if (Test-Path $fullPath) {
            Write-Del "[FILE] $($item.Path) — $($item.Reason)"
            $totalDelFiles++
        } else {
            Write-Skip "[FILE] $($item.Path) (不存在)"
        }
    }
}

Write-Host ""
Write-Host "  总计删除: $totalDelDirs 个目录, 约 $totalDelFiles 个文件" -ForegroundColor Red

Write-Header "Phase 1: 执行清理"
$removedDirs = @()
$removedFiles = @()
$failedItems = @()

foreach ($item in $ToDelete) {
    $fullPath = Join-Path $RootDir $item.Path
    if (-not (Test-Path $fullPath)) { continue }
    try {
        if ($item.Type -eq "Directory") {
            Remove-Item -Path $fullPath -Recurse -Force -ErrorAction Stop
            $removedDirs += $item.Path
            Write-OK "已删除目录: $($item.Path)"
        } else {
            Remove-Item -Path $fullPath -Force -ErrorAction Stop
            $removedFiles += $item.Path
            Write-OK "已删除文件: $($item.Path)"
        }
    } catch {
        $failedItems += $item.Path
        Write-Host "  [!] 删除失败: $($item.Path) - $_" -ForegroundColor Magenta
    }
}

Write-Header "Phase 2: 清理残留空目录"
$emptyDirs = @("scripts\ci", "skills")
foreach ($dir in $emptyDirs) {
    $fullPath = Join-Path $RootDir $dir
    if ((Test-Path $fullPath) -and (Get-ChildItem -Path $fullPath -ErrorAction SilentlyContinue).Count -eq 0) {
        try {
            Remove-Item -Path $fullPath -Force -ErrorAction Stop
            Write-OK "已删除空目录: $dir"
        } catch { Write-Skip "无法删除空目录: $dir" }
    }
}

Write-Header "Phase 3: 结果汇总"
if ($failedItems.Count -gt 0) {
    Write-Host "  失败: $($failedItems.Count) 项" -ForegroundColor Red
    foreach ($f in $failedItems) { Write-Host "    - $f" -ForegroundColor Red }
}
Write-Host ""
Write-Host "  已删除目录: $($removedDirs.Count) 个" -ForegroundColor $(if ($removedDirs.Count -gt 0) { 'Green' } else { 'DarkGray' })
Write-Host "  已删除文件: $($removedFiles.Count) 个" -ForegroundColor $(if ($removedFiles.Count -gt 0) { 'Green' } else { 'DarkGray' })

Write-Header "清理后项目结构"
Get-ChildItem -Path $RootDir -Depth 1 -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne $RootDir } |
    ForEach-Object {
        $indent = if ($_.PSIsContainer) { "📁 " } else { "📄 " }
        $rel = $_.FullName.Substring($RootDir.Length + 1)
        Write-Host "  ${indent}${rel}" -ForegroundColor White
    }

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  清理完成! 项目现在只保留:                         ║" -ForegroundColor Green
Write-Host "║  • 源码研究 + 功能增强路线图                          ║" -ForegroundColor Green
Write-Host "║  • 衍丁系统 (definitions.json + 应用/回滚/验证脚本)       ║" -ForegroundColor Green
Write-Host "║  • API Gateway + MCP 工具                              ║" -ForegroundColor Green
Write-Host "║  • 项目文档 + AI 协作规范                              ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""