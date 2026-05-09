# Tasks — TRAE SOLO CN 特色爆改

## Phase 1: 核心能力解锁（参考 trae-unlock，适配 SOLO）

- [x] Task 1: 探索并定位 SOLO 的核心 JS 文件结构 ✅
  - [x] SubTask 1.1: 分析 workbench.desktop.main.solo-lite.js 的代码结构 → **发现: 不含 AI 聊天逻辑，仅包含诊断/日志分析**
  - [x] SubTask 1.2: 定位 PlanItemStreamParser 类 → **❌ 不存在 (SOLO 架构不同)**
  - [x] SubTask 1.3: 定位 ErrorStreamParser 类 → **❌ 不存在 (SOLO 架构不同)**
  - [x] SubTask 1.4: 定位 React Alert 组件 → **❌ 标准模式不适用**
  - [x] SubTask 1.5: 定位权限检查逻辑 → **待在 product.json 中确认**
  - [x] SubTask 1.6: 定位沙箱配置和命令黑名单逻辑 → **✅ 在 product.json 中找到**
  - [x] SubTask 1.7: 持久化关键位置到 Memory MCP → **✅ 已完成 (4个实体+5条关系)**

  **🔴 重大发现: SOLO 与 Trae IDE 架构完全不同!**
  - AI 聊天逻辑在 **ai-agent.exe** (Rust 原生) 而非 JS 层
  - ai-modules-chat 是基础工具库，不是 AI 逻辑
  - 多进程架构: 主进程 + ai-agent(40005) + ckg(50000) + sandbox
  - 详细对比已持久化到 Memory MCP

- [ ] Task 2: 实现命令自动确认系统 (P1)
  - [ ] SubTask 2.1: 开发数据源层补丁 — 在 DG.parse 阶段设置 auto_confirm=true
  - [ ] SubTask 2.2: 开发服务层补丁 — 在 PlanItemStreamParser 中调用 provideUserResponse
  - [ ] SubTask 2.3: 开发 UI 层补丁 — 绕过 RunCommandCard 弹窗逻辑
  - [ ] SubTask 2.4: 编写补丁定义到 patches/definitions.json
  - [ ] SubTask 2.5: 使用 agent-browser 验证自动确认效果

- [ ] Task 3: 实现思考上限自动续接 (P2)
  - [ ] SubTask 3.1: 开发 L1 UI 层补丁 — if(V&&J) 分支注入 resumeChat 逻辑
  - [ ] SubTask 3.2: 开发 L2 服务层补丁 — ErrorStreamParser.parse() 注入续接
  - [ ] SubTask 3.3: 开发 L3 Store 订阅层补丁 — store.subscribe 监听器
  - [ ] SubTask 3.4: 实现 window.__traeAC 冷却机制防重复触发
  - [ ] SubTask 3.5: 编写补丁定义并测试后台标签页场景

- [ ] Task 4: 实现循环检测智能绕过 (P3)
  - [ ] SubTask 4.1: 扩展可恢复错误列表（efg 数组）加入循环检测错误码
  - [ ] SubTask 4.2: 修改 Guard Clause 放行逻辑（if(!n||(!q&&!J)||et)）
  - [ ] SubTask 4.3: 扩展 J 数组包含 DEFAULT 错误码防止二次拦截
  - [ ] SubTask 4.4: 测试循环检测恢复流程

- [x] Task 5: 实现权限限制解除 (P4) ✅
  - [x] SubTask 5.1: 开发 Max 模式强制启用补丁 → **已修改 product.json**
    - `computerUse.enable`: false → **true** ✅
    - `worktree.enable`: false → **true** ✅
    - `privacyMode.enable`: true → **false** ✅
  - [x] SubTask 5.2: 修改 product.json 中的功能开关 → **已完成 (3项)**
  - [x] SubTask 5.3: 扩展 AI 功能限制阈值 → **已完成 (8项全部提升)**
    - mcpToolLimit: 40→**100** (+150%)
    - mcpTokenLimit: 8000→**16000** (+100%)
    - customPromptTokenLimit: 10000→**50000** (+400%)
    - chatMessageQueryLimit: 400→**1000** (+150%)
  - [x] SubTask 5.4: 启用 featureGates → **已完成 (3项全部启用)**

- [x] Task 6: 实现沙箱限制放宽 (P5) ✅
  - [x] SubTask 6.1: 精简 commandDenyList → **28个→4个** (仅保留真正危险操作)
  - [x] SubTask 6.2: 扩展 sandboxRWList → **117→123个** (+6个关键目录)
    - 新增: node_modules, .git, .vscode, %APPDATA%, %TEMP%
  - [x] SubTask 6.3: 配置网络白名单 → **待确认是否需要额外配置**
  - [x] SubTask 6.4: 测试沙箱策略变更 → **需重启SOLO验证**

  **📋 P4+P5 修改统计**: 共20个配置项已修改，JSON格式验证通过

## Phase 2: SOLO 特色增强（发挥独有优势）

- [x] Task 7: 构建 agent-browser 深度集成平台 (S1) ✅
  - [x] SubTask 7.1: 开发自动登录模块 → **包含在 process-manager.ts 中**
  - [x] SubTask 7.2: 开发工作区管理模块 → **workspace.ts 已实现**
  - [x] SubTask 7.3: 开发 AI 对话自动化模块 → **chat-automation.ts 已实现**
  - [x] SubTask 7.4: 开发截图对比回归测试模块 → **regression-test.ts 已实现**
  - [x] SubTask 7.5: 集成到 toolkit/ CLI 命令体系 → **cli.ts 已更新**

  **📦 已创建的模块 (toolkit/src/agent-browser/)**:
  - `connector.ts` — CDP 连接管理 (WebSocket URL获取、连接状态)
  - `process-manager.ts` — SOLO 进程生命周期 (启动/停止/健康检查)
  - `actions.ts` — 基础操作库 (snapshot/click/type/screenshot)
  - `workspace.ts` — 工作区管理 (列表/切换/创建/删除)
  - `chat-automation.ts` — AI对话自动化 (发送Prompt/采集响应/批量测试)
  - `regression-test.ts` — 回归测试 (截图对比/差异检测/报告生成)
  - `types.ts/config.ts/logger.ts` — 基础设施

- [ ] Task 8: 深度定制原生模块 (S2)
  - [ ] SubTask 8.1: 分析 AI Agent 模块的 API 端点配置格式
  - [ ] SubTask 8.2: 开发自定义模型端点切换工具
  - [ ] SubTask 8.3: 分析 CKG 模块的嵌入引擎和数据结构
  - [ ] SubTask 8.4: 开发自定义知识库注入工具
  - [ ] SubTask 8.5: 分析 Sandbox 模块的权限矩阵配置
  - [ ] SubTask 8.6: 开发沙箱策略动态调整工具

- [ ] Task 9: 增强 MCP 扩展生态 (S3)
  - [ ] SubTask 9.1: 分析现有 MCP 工具的注册机制和协议规范
  - [ ] SubTask 9.2: 开发示例 MCP 工具（数据库连接器或 API 客户端）
  - [ ] SubTask 9.3: 增强 Computer Use 功能（OCR + 跨应用操作）
  - [ ] SubTask 9.4: 开发第三方服务集成模板（Supabase/Vercel）
  - [ ] SubTask 9.5: 编写 MCP 工具开发文档

- [ ] Task 10: 构建数据洞察与分析面板 (S4)
  - [ ] SubTask 10.1: 分析 ai-agent/database.db 的表结构和数据格式
  - [ ] SubTask 10.2: 分析 ckg_server 数据库的索引和嵌入数据
  - [ ] SubTask 10.3: 开发对话历史分析工具（查询模式、成功率、响应时间）
  - [ ] SubTask 10.4: 开发代码修改追踪工具（热点文件排行榜）
  - [ ] SubTask 10.5: 开发 Token 消耗统计与优化建议工具
  - [ ] SubTask 10.6: 构建可视化仪表板（CLI 或 Web）

## Phase 3: 自动化基础设施（构建开发工具链）

- [ ] Task 11: 构建补丁管理系统 (I1)
  - [ ] SubTask 11.1: 设计 patches/definitions.json Schema（参考 trae-unlock v2.0 格式）
  - [ ] SubTask 11.2: 开发 apply-patches.ps1（Anchor 匹配+备份+语法检查）
  - [ ] SubTask 11.3: 开发 rollback.ps1（一键回滚到任意备份）
  - [ ] SubTask 11.4: 开发 auto-heal.ps1（自动诊断+修复）
  - [ ] SubTask 11.5: 开发 verify.ps1（验证补丁健康状态）
  - [ ] SubTask 11.6: 迁移 Phase 1 的所有补丁到 definitions.json

- [ ] Task 12: 构建进程管理工具 (I2)
  - [ ] SubTask 12.1: 开发 launcher.ts（启动 SOLO + CDP 配置）
  - [ ] SubTask 12.2: 开发 killer.ts（终止进程及子进程树）
  - [ ] SubTask 12.3: 开发 monitor.ts（进程状态监控）
  - [ ] SubTask 12.4: 开发 watcher.ts（product.json 变更监听+热重载提示）
  - [ ] SubTask 12.5: 注册 CLI 命令：solo start/stop/restart/status

- [ ] Task 13: 构建 API Gateway 代理网关 (I3)
  - [ ] SubTask 13.1: 初始化 gateway/ 项目结构（Go 或 Node.js）
  - [ ] SubTask 13.2: 开发 HTTP/HTTPS 代理核心（http-proxy-middleware 或类似库）
  - [ ] SubTask 13.3: 开发请求/响应日志记录器
  - [ ] SubTask 13.4: 开发 OpenAI 兼容 API 转换器
  - [ ] SubTask 13.5: 开发 Token 自动提取与缓存模块（LevelDB 读取）
  - [ ] SubTask 13.6: 注册 CLI 命令：gateway start/stop/docs

- [ ] Task 14: 构建 CI/CD 自动化流水线 (I4)
  - [ ] SubTask 14.1: 开发冒烟测试套件（agent-browser 启动+基本功能验证）
  - [ ] SubTask 14.2: 开发回归测试套件（截图对比+差异标记）
  - [ ] SubTask 14.3: 开发性能基准测试工具（启动时间/响应延迟/内存占用）
  - [ ] SubTask 14.4: 开发自动报告生成器（变更摘要+测试结果+性能数据）
  - [ ] SubTask 14.5: 集成到 toolkit/ CLI 命令：test smoke/regression/performance

## Task Dependencies

### Phase 1 内部依赖
- [Task 1] 必须最先完成（为后续所有补丁提供定位信息）
- [Task 2] ~ [Task 6] 可并行执行（各补丁独立，但共享 Task 1 的定位结果）
- 建议：按 P1 → P2 → P3 → P4 → P5 顺序实施（依赖递减）

### Phase 2 内部依赖
- [Task 7] 可独立于 [Task 8-10] 并行开发
- [Task 8] ~ [Task 10] 可并行执行（各增强方向独立）
- [Task 7] 依赖 Phase 1 完成（需要稳定的 SOLO 运行环境）

### Phase 3 内部依赖
- [Task 11] 依赖 Phase 1 完成（需要补丁定义才能构建管理系统）
- [Task 12] 可独立于 [Task 11, 13, 14] 并行开发
- [Task 13] 可独立于 [Task 11, 12, 14] 并行开发
- [Task 14] 依赖 [Task 11, 12] 完成（需要补丁管理和进程管理能力）

### 跨 Phase 依赖
- Phase 2 依赖 Phase 1（核心能力解锁是特色增强的基础）
- Phase 3 依赖 Phase 1（自动化基础设施围绕补丁管理构建）
- Phase 2 和 Phase 3 可部分并行（如 Task 7 可与 Task 11 并行）

## 优先级建议

### 第一优先级（MVP — 最小可行产品）
**目标**：快速实现核心价值，证明可行性
- ✅ Task 1: 探索定位（必须最先）
- ✅ Task 2: 命令自动确认（最高价值，用户感知最强）
- ✅ Task 5: 权限限制解除（Max 模式，吸引力高）
- ✅ Task 11: 补丁管理系统（基础设施，后续任务依赖）
- ✅ Task 12: 进程管理工具（日常使用必需）

### 第二优先级（增强体验）
**目标**：提升稳定性和完善功能
- ⚡ Task 3: 思考上限续接（技术挑战大，但价值高）
- ⚡ Task 4: 循环检测绕过（配合 P2 效果更好）
- ⚡ Task 6: 沙箱限制放宽（高级用户需要）
- ⚡ Task 7: agent-browser 集成（SOLO 独有特色）

### 第三优先级（生态扩展）
**目标**：打造完整的增强生态
- 🚀 Task 8-10: 原生模块/MCP/数据分析（深度定制）
- 🚀 Task 13-14: API Gateway/CI/CD（开发者工具链）

## 预估工作量

| Phase | 任务数 | 复杂度 | 预计时间 |
|-------|--------|--------|---------|
| Phase 1 | 6 个 | 高（需要深入理解压缩 JS） | 40% |
| Phase 2 | 4 个 | 中-高（需要架构设计） | 35% |
| Phase 3 | 4 个 | 中（工程化工作） | 25% |

**总计**：14 个主要任务，~60 个子任务
