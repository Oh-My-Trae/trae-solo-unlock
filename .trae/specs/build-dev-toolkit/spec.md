# SOLO Dev Toolkit 与激进魔改 Spec

## Why

TRAE SOLO CN 的 AI 能力被锁定在 IDE 内部，配置受限（命令白名单、AI限制、功能开关关闭），且每次修改 product.json 后需要手动重启验证。需要一个开发工具链实现"修改配置→自动重启→自动验证"的闭环，同时将 SOLO 内部的 AI 能力通过 API Gateway 暴露给外部程序使用。

## What Changes

- 创建 dev-toolkit CLI 工具，提供配置管理、进程管理、自动化测试能力
- 修改 product.json 解锁 Computer Use、放开命令白名单、放开 AI 限制、开启隐藏功能
- 创建本地 API Gateway 代理，拦截 SOLO 通信并暴露 OpenAI 兼容 API
- 集成 agent-browser 实现自动化 UI 验证

## Impact

- Affected specs: research-solo-source（前置研究，已完成）
- Affected code:
  - `D:\apps\TRAE SOLO CN\resources\app\product.json` — 配置解锁修改
  - `d:\Test\trae-solo-unlock\toolkit\` — 新增 dev-toolkit 代码
  - `d:\Test\trae-solo-unlock\gateway\` — 新增 API Gateway 代码

## ADDED Requirements

### Requirement: Config Manager（配置管理器）

系统 SHALL 提供对 product.json 的安全管理能力：

#### Scenario: 备份与修改
- **WHEN** 用户执行配置修改命令
- **THEN** 系统自动备份当前 product.json 到 `backups/` 目录（带时间戳），然后写入新配置

#### Scenario: 配置预设
- **WHEN** 用户选择 `aggressive` 预设
- **THEN** 系统一次性应用以下修改：
  - computerUse.enable → true
  - ideCommandMode → blacklist
  - soloCommandMode → blacklist
  - mcpToolLimit → 200
  - mcpTokenLimit → 32000
  - customPromptTokenLimit → 50000
  - enableHashDoc → true
  - enableCueflow → true
  - enableTabCue → true
  - worktree.enable → true

#### Scenario: 配置回滚
- **WHEN** 用户执行回滚命令
- **THEN** 系统从 `backups/` 目录恢复最近的备份

#### Scenario: 配置 Diff
- **WHEN** 用户查看配置差异
- **THEN** 系统显示当前 product.json 与备份之间的 diff

### Requirement: Process Manager（进程管理器）

系统 SHALL 提供对 SOLO 进程的生命周期管理：

#### Scenario: 启动 SOLO
- **WHEN** 用户执行启动命令
- **THEN** 系统以 `--remote-debugging-port=9222` 参数启动 SOLO，并等待进程就绪

#### Scenario: 停止 SOLO
- **WHEN** 用户执行停止命令
- **THEN** 系统优雅终止 SOLO 主进程及所有子进程（ai-agent、ckg_server、trae-sandbox）

#### Scenario: 自动重启
- **WHEN** Config Manager 修改了 product.json
- **THEN** Process Manager 自动停止当前 SOLO 进程，等待 2 秒后重新启动

#### Scenario: 进程状态监控
- **WHEN** 用户查询进程状态
- **THEN** 系统返回 SOLO 主进程及各子模块的运行状态（PID、端口、内存占用）

### Requirement: Auto Tester（自动化测试器）

系统 SHALL 提供基于 agent-browser 的自动化验证：

#### Scenario: 启动验证
- **WHEN** SOLO 重启完成后
- **THEN** Auto Tester 通过 CDP 连接 SOLO，截图确认 IDE 正常加载

#### Scenario: 功能验证
- **WHEN** 用户执行验证命令
- **THEN** Auto Tester 检查指定功能是否生效（如 Computer Use 按钮可见性），截图存档到 `screenshots/`

#### Scenario: 回归测试
- **WHEN** 配置变更触发自动重启后
- **THEN** Auto Tester 自动运行基础回归测试（启动正常、AI面板可用、终端可用）

### Requirement: API Gateway（API 网关）

系统 SHALL 将 SOLO 内部的 AI 能力暴露为 OpenAI 兼容 API：

#### Scenario: 代理转发
- **WHEN** SOLO 向 API 端点发送请求
- **THEN** Gateway 将请求透传到真实后端，同时记录请求/响应日志

#### Scenario: OpenAI 兼容 API
- **WHEN** 外部程序调用 `POST http://localhost:18080/v1/chat/completions`
- **THEN** Gateway 将请求转换为 SOLO 格式，转发到后端，并将响应转换为 OpenAI 格式返回

#### Scenario: Token 管理
- **WHEN** Gateway 拦截到 SOLO 的认证请求
- **THEN** 自动提取并缓存 auth token，供外部 API 调用使用

#### Scenario: API 发现
- **WHEN** Gateway 运行期间
- **THEN** 自动记录所有经过的 API 端点、请求格式、响应格式，生成 API 文档到 `api-docs/`

### Requirement: 开发-测试闭环

系统 SHALL 实现从修改到验证的自动化闭环：

#### Scenario: 一键魔改
- **WHEN** 用户执行 `toolkit apply aggressive`
- **THEN** 系统自动执行：备份配置 → 应用预设 → 停止 SOLO → 启动 SOLO → 等待就绪 → 自动验证 → 输出结果

#### Scenario: 失败回滚
- **WHEN** 自动验证失败（SOLO 无法启动或功能异常）
- **THEN** 系统自动回滚到备份配置并重启 SOLO

## MODIFIED Requirements

无（不修改已有功能，仅新增工具链和修改外部配置文件）

## REMOVED Requirements

无
