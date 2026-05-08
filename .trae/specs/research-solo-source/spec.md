# TRAE SOLO CN 源码深度研究与魔改基础 Spec

## Why

TRAE SOLO CN 是字节跳动基于 VSCode (1.107.1) 二次开发的 AI IDE 产品，当前以 solo-lite 模式运行。为了对其进行大刀阔斧的改进和魔改，必须首先对源码进行系统性的深度研究，建立完整的架构认知，并将研究结果持久化，作为后续所有修改工作的前提和参考。

## What Changes

- 创建 AGENTS.md，定义 git commit 规范和项目上下文
- 对 TRAE SOLO CN 源码进行系统性深度研究，覆盖以下领域：
  - 核心启动流程与 Electron 主进程架构
  - 产品配置系统 (product.json / manifest.json)
  - AI Agent 模块（Rust 原生，端口 40005）
  - CKG 模块（代码知识图谱，Rust 原生，端口 50000）
  - Sandbox 沙箱模块（进程隔离与文件系统控制）
  - MCP (Model Context Protocol) 扩展系统
  - Shell 执行扩展（AI Agent 命令执行接口）
  - 集成扩展（Supabase/Vercel 等第三方服务）
  - 认证系统（Trae/字节跳动/GitHub/Google/Apple OAuth）
  - 遥测与监控（Tea/Slardar 引擎）
  - 工作台前端架构（Solo Lite 模式）
  - 安全模型（命令白名单、沙箱RW/RO列表、扩展控制）
- 将研究结果持久化到知识图谱（Memory MCP）
- 编写完整的研究报告文档

## Impact

- Affected specs: 无（纯研究阶段，不修改源码）
- Affected code: 无代码修改，仅创建文档和知识图谱条目

## ADDED Requirements

### Requirement: 源码架构全景认知

系统 SHALL 提供对 TRAE SOLO CN 源码的完整架构认知，包括：

#### Scenario: 架构层次理解
- **WHEN** 开发者需要了解 TRAE SOLO CN 的整体架构
- **THEN** 系统提供从 Electron 主进程到渲染进程、从原生模块到 JS 扩展的完整层次结构

#### Scenario: 模块间通信理解
- **WHEN** 开发者需要了解模块间如何通信
- **THEN** 系统提供 AI Agent (端口40005)、CKG (端口50000) 通过 socket 与主进程通信的完整链路

### Requirement: 关键配置文件解析

系统 SHALL 对以下关键配置文件进行完整解析：

1. **product.json** (~2930行) - 核心产品配置
   - API 端点配置 (iCube/Agent/Remote/CKG/CUE/Hub/WebSocket)
   - 认证配置 (authConfig, authDomain, authProviderId)
   - 遥测配置 (Tea appId/Slardar bid)
   - 扩展市场配置 (VSCode Marketplace + 自有市场)
   - AI 功能限制 (mcpToolLimit/mcpTokenLimit/customPromptTokenLimit)
   - 沙箱配置 (sandboxRWList/sandboxROList/commandDenyList)
   - 功能开关 (featureGates/computerUse/worktree/privacyMode)

2. **manifest.json** - 应用清单
   - 应用标识 (appId=931506, packageType=stable_cn)
   - 网络配置 (ahaNet ttnet 参数)
   - 域名白名单

3. **desktop.config.js** - 桌面场景配置
   - 工作台布局 (sideBar/panel/auxiliaryBar)
   - 默认设置 (主题/字体/遥测级别)

#### Scenario: 配置项定位
- **WHEN** 开发者需要修改某个特定配置
- **THEN** 能快速定位到 product.json 中的具体字段和行号

### Requirement: 原生模块架构理解

系统 SHALL 对三个原生模块提供完整的架构理解：

1. **AI Agent 模块**
   - Rust 编写，通过 ai-agent.exe / ai_agent.dll 运行
   - Socket 端口 40005 通信
   - 支持 desktop/plugin/desktop_ssh/cloudide 等多种环境
   - 包含 trae_vm.dll (VM 沙箱) 和 sbox_ipc.dll (沙箱IPC)

2. **CKG 模块 (Code Knowledge Graph)**
   - Rust 编写，通过 ckg_server_windows_x64.exe 运行
   - Socket 端口 50000 通信
   - 支持本地嵌入 (sqlite_vec)
   - CKG_APP_ID: 6eefa01c-1036-4c7e-9ca5-d891f63bfcd8

3. **Sandbox 模块**
   - 通过 trae-sandbox.exe 运行
   - trae_sbox.dll / sbox_sdk.dll 提供沙箱能力
   - 文件系统 RW/RO 控制
   - 网络访问控制

#### Scenario: 模块魔改可行性评估
- **WHEN** 开发者需要评估对某个原生模块的魔改可行性
- **THEN** 提供该模块的通信协议、配置入口和可修改点的分析

### Requirement: 扩展系统理解

系统 SHALL 对内置扩展系统提供完整理解：

1. **byted-solo.builtin-mcp** - MCP 工具扩展
   - macOS 连接器 (Calendar/Mail/Notes/Reminders/Contacts)
   - Computer Use 功能 (屏幕控制)
   - JXA (JavaScript for Automation) 执行
   - 权限管理 / 会话锁 / 清理机制

2. **cloudide.icube-agent-shell-exec** - Shell 执行扩展
   - Shell 初始化 (zsh/bash/PowerShell)
   - 命令执行/终止/状态查询
   - 输出缓冲区管理
   - 协议定义 (commands/types)

3. **byted-solo.integrations-extended** - 集成扩展
   - Supabase/Vercel 集成
   - 大部分命令默认禁用 (enablement: false)

4. **solo-lite** - Solo Lite 语言贡献
   - 基础语言支持 (bat/clojure/coffeescript/json/c/cpp/css/go等)

#### Scenario: 扩展魔改点识别
- **WHEN** 开发者需要添加新的 MCP 工具或修改 Shell 执行行为
- **THEN** 提供扩展注册机制、命令定义和激活事件的完整说明

### Requirement: API 端点与认证体系理解

系统 SHALL 对 API 端点和认证体系提供完整理解：

1. **API 端点矩阵**
   - iCube API: https://api.trae.com.cn
   - Agent/Remote/CKG/CUE/Hub API: https://trae-api-cn.mchost.guru
   - WebSocket: wss://trae-ws-cn.mchost.guru/custom_model
   - Frontier: wss://frontier.zijieapi.com/ws/v2
   - ASR: volcengine (wss://openspeech.bytedance.com)
   - 字节跳动内部: https://copilot-cn.bytedance.net

2. **认证体系**
   - Trae 认证: www.trae.cn (authProviderId: icube.cloudide)
   - 字节跳动 SSO: sso.bytedance.com / accounts.feishu.cn
   - GitHub/Google/Apple OAuth
   - authConfig 密钥 (TRAE/SOLO 各环境)

#### Scenario: API 端点重定向
- **WHEN** 开发者需要将 API 请求重定向到自定义服务器
- **THEN** 提供所有需要修改的端点配置位置

### Requirement: 安全模型理解

系统 SHALL 对安全模型提供完整理解：

1. **命令执行控制**
   - 命令黑名单 (commandDenyList): rm/delete/kill/chmod/dd等
   - IDE/Solo 命令模式: whitelist
   - 自动运行配置版本: v2

2. **文件系统沙箱**
   - RW 目录: ~/.npm, ~/.cargo, ~/.pyenv, $GOPATH 等
   - RO 目录: $WORKSPACE_FOLDER/.vscode, $WORKSPACE_FOLDER/.trae/mcp.json

3. **扩展控制**
   - 封禁扩展: ms-python.vscode-pylance (BANNED_BY_MS)
   - 替代扩展: detachhead.basedpyright

4. **功能开关**
   - computerUse.enable: false
   - privacyMode.enable: true
   - worktree.enable: false

#### Scenario: 安全策略调整
- **WHEN** 开发者需要放宽或收紧安全策略
- **THEN** 提供所有安全相关配置的位置和修改方法

### Requirement: 研究结果持久化

系统 SHALL 将所有研究结果持久化到知识图谱（Memory MCP），确保跨会话可用：

#### Scenario: 跨会话知识复用
- **WHEN** 新的开发会话需要了解 TRAE SOLO CN 架构
- **THEN** 通过知识图谱查询即可获取完整的架构、配置、模块、安全模型信息

## MODIFIED Requirements

无（纯研究阶段）

## REMOVED Requirements

无（纯研究阶段）
