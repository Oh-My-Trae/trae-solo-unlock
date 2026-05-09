# TRAE SOLO CN 特色爆改 Spec — 全方位增强与自动化生态

## Why

TRAE SOLO CN 是字节跳动基于 VSCode (1.107.1) 二次开发的 AI IDE 产品（solo-lite模式）。参考 trae-unlock 在 Trae IDE 上取得的成果（命令自动确认、思考上限续接、循环检测绕过、强制Max模式等），但 SOLO 具有独特的优势：
1. **agent-browser 原生支持**：可通过 CDP 协议对 Electron 应用进行完整 UI 自动化
2. **solo-lite 轻量模式**：更简洁的代码结构，更容易定位和修改关键逻辑
3. **三大原生模块**：AI Agent(端口40005)、CKG(端口50000)、Sandbox 可深度定制
4. **独立的数据存储**：ModularData 目录结构清晰，便于数据挖掘和增强

本 Spec 旨在利用这些独特优势，打造比 trae-unlock 更具特色的爆改方案，不仅解锁限制，更要构建完整的**自动化增强生态**。

## What Changes

### Phase 1: 核心能力解锁（参考 trae-unlock，适配 SOLO）
- [x] **P1: 命令自动确认系统** — 零弹窗执行所有 AI 命令（Copy/Remove/Move/Rename/Shell等）
- [ ] **P2: 思考上限自动续接** — L1+L2双层架构，解决后台标签页冻结问题
- [ ] **P3: 循环检测智能绕过** — 自动识别并恢复循环检测错误
- [ ] **P4: 权限限制解除** — 解锁 Max 模式、高级功能、配额限制
- [ ] **P5: 沙箱限制放宽** — 扩展可执行命令列表、RW目录、网络访问

### Phase 2: SOLO 特色增强（发挥独有优势）
- [ ] **S1: agent-browser 深度集成** — 构建 UI 自动化测试+操作+监控一体化平台
  - 自动登录/认证流程
  - 工作区批量管理
  - 技能(Skills)市场自动浏览/安装/测试
  - AI 对话自动化（批量提问、结果采集、性能基准测试）
  - 截图对比回归测试
- [ ] **S2: 原生模块魔改** — 深度定制三大原生模块
  - AI Agent 模块：自定义模型端点、增加本地模型支持、扩展工具调用
  - CKG 模块：增强代码索引、添加自定义知识库、优化嵌入质量
  - Sandbox 模块：完全控制文件系统/网络/进程隔离策略
- [ ] **S3: MCP 扩展生态增强** — 打造强大的 MCP 工具链
  - 开发新的 MCP 工具（数据库连接器、API客户端、文件批量处理）
  - 增强 Computer Use 功能（屏幕控制+OCR识别）
  - 集成第三方服务（Supabase/Vercel/Cloudflare 等）
- [ ] **S4: 数据洞察与分析面板** — 利用 ModularData 构建使用分析
  - AI 对话历史挖掘（查询模式、成功率、响应时间）
  - 代码修改轨迹追踪（哪些文件被频繁修改）
  - Token 消耗统计与优化建议
  - 自动生成周报/月报

### Phase 3: 自动化基础设施（构建开发工具链）
- [ ] **I1: 补丁管理系统** — 类似 trae-unlock 的 definitions.json + apply-patches.ps1
  - Anchor 短锚点匹配机制
  - 自动备份+回滚
  - 语法安全检查（node --check）
  - 版本兼容性检测
- [ ] **I2: 进程管理工具** — 一键启动/停止/重启/监控 SOLO
  - CDP 端口自动配置（--remote-debugging-port=9222）
  - 进程健康检查
  - 配置热重载（监听 product.json 变更）
- [ ] **I3: API Gateway 代理网关** — 拦截/转发/记录所有 API 请求
  - HTTP/HTTPS 代理（类似 local-stream-adapter）
  - OpenAI 兼容 API 转换（可将 SOLO AI 接口转为标准 OpenAI 格式）
  - 请求/响应日志记录与分析
  - Token 自动提取与缓存
- [ ] **I4: CI/CD 自动化流水线** — 补丁应用→测试→验证→发布全流程
  - agent-browser 冒烟测试
  - 回归测试套件
  - 性能基准测试
  - 自动生成变更报告

## Impact

- Affected specs:
  - `research-solo-source` (已完成的研究基础，提供架构认知)
  - `build-dev-toolkit` (未完成的工具包开发，将整合进本 Spec)
- Affected code:
  - `D:\apps\TRAE SOLO CN\resources\app\out\vs\workbench\workbench.desktop.main.solo-lite.js` (工作台主JS，~10MB+)
  - `D:\apps\TRAE SOLO CN\resources\app\out\vs\code\electron-browser\solo\workbench.js` (工作台入口)
  - `D:\apps\TRAE SOLO CN\resources\app\product.json` (核心配置，~2930行)
  - `D:\apps\TRAE SOLO CN\resources\app\out\vs\workbench\workbench.desktop.main.solo-lite.css` (样式表)
  - 三大原生模块的可执行文件和配置

## ADDED Requirements

### Requirement: P1 - 命令自动确认系统

系统 SHALL 提供零弹窗的命令自动确认能力，支持所有高风险命令的自动执行：

#### Scenario: Shell 命令自动执行
- **WHEN** AI Agent 尝试执行 Shell 命令（RunCommand/WriteFile/DeleteFile 等）
- **THEN** 系统自动确认执行，无需用户手动点击确认弹窗
- **AND** 黑名单过滤保留（AskUserQuestion/ExitPlanMode 不自动确认）

#### Scenario: 文件操作自动确认
- **WHEN** AI Agent 尝试复制/移动/重命名/删除文件
- **THEN** 系统自动确认执行，不弹出权限确认对话框

#### Scenario: 沙箱命令自动放行
- **WHEN** 命令触发了沙箱安全检查（RedList/SandboxExecuteFailure 等）
- **THEN** 系统自动放行，返回 Default 分支继续执行

### Requirement: P2 - 思考上限自动续接

系统 SHALL 提供多层级的思考上限自动续接能力，确保长时间 AI 任务不被中断：

#### Scenario: L1 UI 层检测与展示
- **WHEN** 思考上限错误在 UI 层渲染（Alert 组件显示"继续"按钮）
- **THEN** L1 层检测到错误码（4000002/4000009/4000012 等），触发自动续接
- **AND** 续接动作通过 resumeChat 或 sendChatMessage 完成
- **AND** 冷却机制防止重复触发（window.__traeAC, 5000ms 间隔）

#### Scenario: L2 服务层数据驱动续接
- **WHEN** 思考上限错误通过 SSE 流传递到 ErrorStreamParser.parse()
- **THEN** L2 层在 parse 方法中同步检测错误码，调用 DI 服务续接
- **AND** 不受 React Scheduler 后台冻结影响（数据驱动模式）
- **AND** 失败时 fallback 到 sendChatMessage

#### Scenario: L3 Store 订阅层兜底
- **WHEN** currentSession 新增消息的 exception.code 匹配白名单
- **THEN** store.subscribe 监听器触发续接，完全绕过 React 渲染周期

### Requirement: P3 - 循环检测智能绕过

系统 SHALL 自动识别并恢复循环检测相关的错误：

#### Scenario: 重复工具调用恢复
- **WHEN** 错误码为 LLM_STOP_DUP_TOOL_CALL (4000009)
- **THEN** 系统自动调用 resumeChat 恢复执行

#### Scenario: 内容循环检测恢复
- **WHEN** 错误码为 LLM_STOP_CONTENT_LOOP (4000012)
- **THEN** 系统自动调用 resumeChat 恢复执行

#### Scenario: Guard Clause 放行
- **WHEN** stopStreaming() 将消息状态从 Warning 覆盖为 Canceled
- **THEN** 修改后的 guard clause (`if(!n||(!q&&!J)||et)`) 放行到 if(V&&J) 分支

### Requirement: P4 - 权限限制解除

系统 SHALL 解锁商业版功能和配额限制：

#### Scenario: Max 模式强制启用
- **WHEN** 用户选择 AI 模型或系统计算可用模式
- **THEN** 绕过 isOlderCommercialUser() 和 isSaas() 权限检查
- **AND** 强制使用 Max 模式（更长上下文、更多思考轮次、更高质量输出）

#### Scenario: 高级功能解锁
- **WHEN** 用户尝试使用 Computer Use、Worktree 等高级功能
- **THEN** 将 computerUse.enable / worktree.enable 设置为 true
- **AND** 相关 UI 元素可见且可交互

#### Scenario: 配额限制放宽
- **WHEN** AI Agent 达到 Token 限制或调用次数限制
- **THEN** 扩展 mcpToolLimit / mcpTokenLimit / customPromptTokenLimit 等阈值
- **AND** 移除或提高 chatMessageQueryLimit / historyQueryLimit

### Requirement: P5 - 沙箱限制放宽

系统 SHALL 提供灵活的沙箱策略配置：

#### Scenario: 命令黑名单精简
- **WHEN** AI Agent 尝试执行被 commandDenyList 禁止的命令
- **THEN** 可配置移除部分限制（如 rm/delete 的严格检查改为警告）
- **AND** 保留真正危险的操作（如 dd /dev/sda 格式化硬盘）

####Scenario: RW 目录扩展
- **WHEN** AI Agent 需要读写沙箱 RW 列表之外的目录
- **THEN** 可动态添加新目录到 sandboxRWList
- **AND** 支持通配符和环境变量扩展

#### Scenario: 网络访问控制
- **WHEN** AI Agent 需要访问外部 API 或服务
- **THEN** 可配置网络白名单，允许特定域名的访问
- **AND** 支持 WebSocket 和 HTTP/HTTPS 双协议

### Requirement: S1 - agent-browser 深度集成

系统 SHALL 提供 agent-browser 与 SOLO 应用的深度集成能力：

#### Scenario: 自动化登录流程
- **WHEN** SOLO 启动后需要认证
- **THEN** agent-browser 自动完成 OAuth 登录流程（Trae/GitHub/Google）
- **AND** 支持多种认证方式的自动切换

#### Scenario: 工作区批量管理
- **WHEN** 需要管理多个工作区
- **THEN** agent-browser 可自动创建/切换/删除工作区
- **AND** 支持批量导入项目文件夹

#### Scenario: AI 对话自动化
- **WHEN** 需要批量测试 AI 能力
- **THEN** agent-browser 可自动发送 Prompt、等待响应、采集结果
- **AND** 支持性能基准测试（响应时间、Token 消耗、成功率）

#### Scenario: 回归测试套件
- **WHEN** 应用补丁或更新后
- **THEN** agent-browser 自动执行预定义的测试用例
- **AND** 对比截图差异，生成测试报告

### Requirement: S2 - 原生模块魔改

系统 SHALL 提供对三大原生模块的深度定制能力：

#### Scenario: AI Agent 自定义模型端点
- **WHEN** 需要使用自部署的 LLM 服务
- **THEN** 可修改 AI Agent 模块的 API 端点配置
- **AND** 支持OpenAI兼容格式、Anthropic格式等多种后端

#### Scenario: CKG 自定义知识库
- **WHEN** 需要增强代码理解能力
- **THEN** 可向 CKG 模块注入自定义文档或知识库
- **AND** 优化嵌入模型和索引策略

#### Scenario: Sandbox 完全控制
- **WHEN** 需要精细控制进程隔离策略
- **THEN** 可配置 Sandbox 的文件系统/网络/进程权限矩阵
- **AND** 支持动态调整策略而不重启应用

### Requirement: S3 - MCP 扩展生态增强

系统 SHALL 提供丰富的 MCP 工具和集成能力：

#### Scenario: 新 MCP 工具开发
- **WHEN** 需要新的 AI 工具能力
- **THEN** 可快速开发并注册新的 MCP 工具
- **AND** 工具遵循标准的 MCP 协议规范

#### Scenario: Computer Use 增强
- **WHEN** AI 需要控制桌面应用
- **THEN** Computer Use 功能支持屏幕截图+OCR识别+鼠标键盘模拟
- **AND** 可跨应用操作（浏览器、IDE、终端等）

#### Scenario: 第三方服务集成
- **WHEN** 需要连接外部服务
- **THEN** 可通过 MCP 连接 Supabase/Vercel/Cloudflare 等平台
- **AND** 支持认证、CRUD 操作、Webhook 触发

### Requirement: S4 - 数据洞察与分析面板

系统 SHALL 提供基于 ModularData 的使用分析和洞察：

#### Scenario: 对话历史分析
- **WHEN** 需要了解 AI 使用情况
- **THEN** 从 ai-agent/database.db 提取对话历史
- **AND** 分析查询模式、成功率、平均响应时间等指标

#### Scenario: 代码修改追踪
- **WHEN** 需要了解代码变更热点
- **THEN** 从 CKG 数据库提取文件修改记录
- **AND** 生成热点文件排行榜和修改频率图表

#### Scenario: Token 消耗统计
- **WHEN** 需要优化成本
- **THEN** 统计每次对话的 Token 消耗
- **AND** 提供优化建议（缩短上下文、选择更便宜的模型等）

### Requirement: I1 - 补丁管理系统

系统 SHALL 提供类 trae-unlock 的补丁管理能力：

#### Scenario: 补丁定义与应用
- **WHEN** 定义了新的补丁（anchor/find_original/replace_with）
- **THEN** 系统可自动定位目标位置并应用补丁
- **AND** 支持 anchor 短锚点匹配和 offset_hint 定位

#### Scenario: 备份与回滚
- **WHEN** 应用补丁前
- **THEN** 系统自动创建时间戳备份
- **AND** 支持一键回滚到任意备份版本

#### Scenario: 语法安全检查
- **WHEN** 修改 JS 文件后
- **THEN** 系统自动运行 node --check 验证语法正确性
- **AND** 语法错误时拒绝写入并提示具体错误位置

### Requirement: I2 - 进程管理工具

系统 SHALL 提供完整的 SOLO 进程生命周期管理：

#### Scenario: 一键启动
- **WHEN** 需要启动 SOLO 应用
- **THEN** 工具自动终止已有进程、配置 CDP 端口、启动新实例
- **AND** 等待应用就绪后返回控制权

#### Scenario: 健康监控
- **WHEN** SOLO 运行中
- **THEN** 工具定期检查进程状态、CDP 端口连通性、内存占用
- **AND** 异常时自动告警或重启

#### Scenario: 配置热重载
- **WHEN** product.json 或其他配置文件被修改
- **THEN** 工具自动检测变更并提示重启或热重载
- **AND** 支持选择性重载（仅重载特定模块配置）

### Requirement: I3 - API Gateway 代理网关

系统 SHALL 提供完整的 API 代理和转换能力：

#### Scenario: HTTP/HTTPS 代理
- **WHEN** SOLO 发送 API 请求到远程服务器
- **THEN** Gateway 拦截请求并可转发到自定义服务器
- **AND** 支持请求/响应修改、日志记录、流量统计

#### Scenario: OpenAI 兼容转换
- **WHEN** 外部工具需要调用 SOLO 的 AI 接口
- **THEN** Gateway 将 SOLO 专有协议转换为 OpenAI 兼容格式
- **AND** 支持 /v1/chat/completions 等标准端点

#### Scenario: Token 自动提取
- **WHEN** 需要在代理中使用认证信息
- **THEN** Gateway 自动从 Local Storage/LevelDB 提取 Token
- **AND** 安全缓存并定期刷新

### Requirement: I4 - CI/CD 自动化流水线

系统 SHALL 提供从补丁应用到测试验证的全流程自动化：

#### Scenario: 冒烟测试
- **WHEN** 补丁应用完成后
- **THEN** agent-browser 自动启动 SOLO 并执行基本功能测试
- **AND** 验证启动正常、AI 面板可用、基本交互正常

#### Scenario: 回归测试
- **WHEN** 代码发生变更
- **THEN** 自动执行完整的回归测试套件
- **AND** 对比前后截图，标记 UI 回归问题

#### Scenario: 性能基准
- **WHEN** 需要评估性能影响
- **THEN** 自动执行性能基准测试（启动时间、响应延迟、内存占用）
- **AND** 生成性能报告并与历史数据对比

## MODIFIED Requirements

无（全新 Spec，基于 research-solo-source 的研究成果）

## REMOVED Requirements

无（全新 Spec）

---

## 技术架构参考

### 目标文件清单（待探索确认）

| 文件 | 大小估计 | 用途 | 修改频率 |
|------|---------|------|---------|
| workbench.desktop.main.solo-lite.js | ~10MB+ | 工作台主逻辑（AI聊天、技能、自动化） | 高 |
| workbench.js | ~500KB | 工作台初始化、窗口管理 | 中 |
| product.json | ~2930行 | 核心配置（API端点、认证、功能开关） | 高 |
| desktop.config.js | ~200行 | 桌面场景配置 | 低 |
| solo-lite.html | ~100行 | Solo Lite HTML 结构 | 低 |

### 关键差异点（vs trae-unlock）

| 维度 | trae-unlock (Trae IDE) | trae-solo-unlock (SOLO) |
|------|------------------------|------------------------|
| 目标文件 | ai-modules-chat/dist/index.mjs (~12.3MB) | workbench.desktop.main.solo-lite.js (~10MB+) |
| 代码复杂度 | 单体压缩 JS，变量名混淆 | 同样压缩，但 solo-lite 更轻量 |
| UI 框架 | React (完整版) | React (Lite版) |
| 自动化能力 | 无原生支持 | **agent-browser 原生支持** ⭐ |
| 原生模块 | 无独立模块 | **AI Agent/CKG/Sandbox 三大模块** ⭐ |
| 数据存储 | 内嵌 SQLite | **ModularData 独立目录** ⭐ |
| 补丁系统 | 成熟（16个补丁） | 待构建（参考 trae-unlock） |
| 测试能力 | agent-browser 手动集 | **深度集成** ⭐ |

### 爆改特色方向（SOLO 独有）

1. **🤖 自动化优先**：利用 agent-browser 构建"无人值守"的 AI 工作站
   - 批量任务队列
   - 定时任务调度
   - 结果自动采集与报告

2. **🔌 模块化魔改**：三大原生模块可独立升级/替换
   - AI Agent → 接入本地 Ollama/LM Studio
   - CKG → 接入自定义 RAG 知识库
   - Sandbox → 容器化隔离

3. **📊 数据驱动**：ModularData 提供丰富的分析素材
   - 使用模式挖掘
   - 性能瓶颈定位
   - 成本优化建议

4. **🛠️ 开发者体验**：构建完整的开发者工具链
   - CLI 工具包（类似 trae-unlock 的 scripts/）
   - GUI 管理面板（可选）
   - VSCode 扩展（调试补丁、查看日志）
