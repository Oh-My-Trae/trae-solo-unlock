# Tasks — TRAE SOLO CN 闭环验证与优化

## Phase A: 闭环基础设施搭建

- [x] Task A1: 构建 SOLO 运行时控制器 ✅
  - [x] SubTask A1.1: 开发 `closed-loop/controller.ts` → **完整生命周期管理+事件系统**
  - [x] SubTask A1.2: 集成 process-manager + agent-browser connector → **一键启动+CDP连接**
  - [x] SubTask A1.3: 实现连接保活机制 → **心跳检测+指数退避重连(1s→60s)**
  - [x] SubTask A1.4: 实现安全停止流程 → **状态保存→断开→终止→清理**

- [x] Task A2: 构建数据采集器 ✅
  - [x] SubTask A2.1: 开发 `closed-loop/collector.ts` → **性能快照(进程/CDP/控制器)**
  - [x] SubTask A2.2: 开发截图采集模块 → **命名规范 `{iter}-{phase}-{test}-{timestamp}.png`**
  - [x] SubTask A2.3: 开发操作日志记录器 → **JSON格式+内存+文件双写**

- [ ] Task A3: 构建分析决策引擎
  - [ ] SubTask A3.1: 开发 `closed-loop/analyzer.ts` — 性能基线对比分析
  - [ ] SubTask A3.2: 开发 UI 回归检测器 — 像素差异对比（阈值可配置）
  - [ ] SubTask A3.3: 开发优化建议生成器 — 基于规则引擎+历史数据

- [ ] Task A4: 构建报告生成器
  - [ ] SubTask A4.1: 开发 `closed-loop/reporter.ts` — Markdown + HTML 双格式报告
  - [ ] SubTask A4.2: 报告内容：执行摘要/性能趋势图(ASCII)/问题清单/优化建议/截图证据链接

## Phase B: 自动化测试套件实现

- [ ] Task B1: 实现增强版冒烟测试
  - [ ] SubTask B1.1: 启动 SOLO → CDP 连接 → 截图(初始态)
  - [ ] SubTask B1.2: 检测 AI 面板可见性（通过 snapshot 查找关键元素）
  - [ ] SubTask B1.3: 检测基本交互（新建任务按钮、输入框、发送按钮）
  - [ ] SubTask B1.4: 截图(完成态) → 对比 → 输出通过/失败

- [ ] Task B2: 实现性能基准测试
  - [ ] SubTask B2.1: 冷启动基准（完全停止→启动→CDP就绪，迭代5次取平均）
  - [ ] SubTask B2.2: 热启动基准（快速重启，迭代5次取平均）
  - [ ] SubTask B2.3: 内存占用基线（启动后空闲状态，采集3次取稳定值）
  - [ ] SubTask B2.4: AI 面板响应时间（打开AI对话面板的耗时）

- [ ] Task B3: 实现回归测试套件
  - [ ] SubTask B3.1: 定义回归测试用例集（10个关键UI场景）
  - [ ] SubTask B3.2: 执行每个场景 → 截图 → 与基线对比
  - [ ] SubTask B3.3: 差异超过阈值则标记为回归失败
  - [ ] SubTask B3.4: 生成回归报告（含差异高亮截图）

- [ ] Task B4: 实现压力测试套件
  - [ ] SubTask B4.1: 长时间运行测试（SOLO 运行30分钟，每分钟采集性能快照）
  - [ ] SubTask B4.2: 高频操作测试（快速连续执行100次 snapshot/click 操作）
  - [ ] SubTask B4.3: 内存泄漏检测（对比首尾内存占用，增长>10%则警告）
  - [ ] SubTask B4.4: 并发多任务测试（同时打开多个工作区/AI对话）

## Phase C: 闭环执行与优化循环

- [ ] Task C1: 实现闭环主控制器
  - [ ] SubTask C1.1: 开发 `closed-loop/runner.ts` — 编排整个闭环流程
  - [ ] SubTask C1.2: 流程: 初始化→启动SOLO→PhaseA/B测试→分析→报告→停止SOLO
  - [ ] SubTask C1.3: 支持多轮迭代 (`--iterations N`，默认3轮)
  - [ ] SubTask C1.4: 支持选择性执行 (`--phase smoke/performance/regression/stress`)

- [ ] Task C2: 实现补丁自愈机制
  - [ ] SubTask C2.1: 每轮开始前自动运行 verify-patches.ps1
  - [ ] SubTask C2.2: 检测到失效补丁 → 自动重新应用 → 记录到修复日志
  - [ ] SubTask C2.3: 持续失效3轮 → 标记为问题并报警告

- [ ] Task C3: 实现趋势追踪与历史管理
  - [ ] SubTask C3.1: 维护 `reports/history/` 目录，每轮结果归档
  - [ ] SubTask C3.2: 生成趋势图（性能指标随迭代次数的变化）
  - [ ] SubTask C3.3: 问题追踪（哪些问题在后续迭代中修复/新增/持续存在）

- [ ] Task C4: CLI 集成
  - [ ] SubTask C4.1: 注册 `solo closed-loop` 命令
  - [ ] SubTask C4.2: 参数支持: `--iterations`, `--phase`, `--report-format`, `--screenshots`
  - [ ] SubTask C4.3: 实时进度输出（当前阶段/总进度/预计剩余时间）

## Task Dependencies

### Phase 内部依赖
- [A1] 必须最先完成（后续所有任务依赖 SOLO 运行时控制）
- [A2] 依赖 [A1]（需要 SOLO 运行才能采集数据）
- [A3] 依赖 [A2]（需要数据才能分析）
- [A4] 依赖 [A3]（需要分析结果才能生成报告）
- [B1-B4] 可并行开发（各测试套件独立），但都依赖 [A1+A2]
- [C1] 依赖 [A全部+B全部]
- [C2-C4] 依赖 [C1]

### 推荐实施顺序
**第一轮**: A1 → A2 → B1 (最小可用闭环: 启动+冒烟)
**第二轮**: A3 → A4 → B2 → C1+C4 (完整闭环: 性能测试+报告)
**第三轮**: B3 → B4 → C2 → C3 (高级闭环: 回归+压力+自愈+趋势)

## 预估工作量

| Phase | 任务数 | 复杂度 | 说明 |
|-------|--------|--------|------|
| A: 基础设施 | 4 | 中 | 核心框架 |
| B: 测试套件 | 4 | 中 | 测试逻辑 |
| C: 闭环执行 | 4 | 中 | 编排+集成 |
| **总计** | **12** | | **~40个子任务** |
