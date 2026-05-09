# TRAE SOLO CN 闭环验证与优化 Spec

## Why

TRAE SOLO CN 爆改项目的 Phase 1-3 已全部完成（14个任务），静态验证通过率 **75% (17/23)**，但剩余 **16 个检查点标记为"需实际运行验证"**（稳定性/性能/兼容性/边界条件）。需要构建**自动化闭环系统**：启动 SOLO → 执行测试 → 收集数据 → 分析结果 → 优化补丁 → 再验证，形成持续改进循环。

## What Changes

### 新增: 闭环验证基础设施
- **L1 实际运行层**: 启动 SOLO + agent-browser 连接 + 自动化操作
- **L2 数据采集层**: 性能指标收集 + 截图对比 + 日志记录
- **L3 分析决策层**: 数据分析 + 问题检测 + 优化建议生成
- **L4 反馈执行层**: 自动修复 + 补丁调整 + 报告输出

### 新增: 端到端自动化测试套件
- 冒烟测试增强版 (带截图)
- 性能基准测试 (启动时间/内存/AI延迟)
- 回归测试 (UI 截图对比)
- 压力测试 (长时间运行/高频操作)

## Impact
- Affected specs: `solo-feature-enhancement` (本 spec 依赖其成果)
- Affected code:
  - `scripts/ci/` — 增强 CI 脚本支持实际运行验证
  - `toolkit/src/agent-browser/` — 用于 UI 自动化操作
  - `toolkit/src/process/` — 用于进程管理
  - `toolkit/src/analytics/` — 用于数据分析

## ADDED Requirements

### Requirement: L1-SOLO 实际运行控制
系统 SHALL 提供完整的 SOLO 启动、连接、操作、停止能力。

#### Scenario: 冷启动验证
- **WHEN** 用户执行闭环验证
- **THEN** 系统自动终止已有 SOLO 进程 → 启动新实例(带 CDP) → 等待就绪 → 返回连接信息

#### Scenario: CDP 连接保持
- **WHEN** SOLO 运行中
- **THEN** CDP 连接保持活跃，定期心跳检测，断开时自动重连

### Requirement: L2-数据采集与记录
系统 SHALL 在每次验证运行中自动采集关键指标。

#### Scenario: 性能快照采集
- **WHEN** SOLO 启动完成或每个测试阶段结束
- **THEN** 系统采集：进程 PID/内存占用/CPU 使用率/CDP 延迟/窗口响应时间

#### Scenario: UI 状态记录
- **WHEN** 每个测试用例执行前后
- **THEN** 系统自动截图保存到 `reports/screenshots/{timestamp}-{test-name}.png`

#### Scenario: 操作日志持久化
- **WHEN** 任何自动化操作执行
- **THEN** 记录操作类型/输入/输出/耗时/成功失败状态到 JSON 日志

### Requirement: L3-分析与决策
系统 SHALL 对采集的数据进行自动分析和问题检测。

#### Scenario: 性能基线对比
- **WHEN** 性能快照采集完成
- **THEN** 与历史基线对比，标记异常指标（超出阈值的项目）

#### Scenario: UI 回归检测
- **WHEN** 测试前后截图采集完成
- **THEN** 自动对比像素差异，差异超过阈值则标记为回归问题

#### Scenario: 优化建议生成
- **WHEN** 所有测试阶段完成
- **THEN** 综合分析所有数据，生成优化建议清单（优先级排序）

### Requirement: L4-反馈与执行
系统 SHALL 根据分析结果自动执行优化动作。

#### Scenario: 自动报告输出
- **WHEN** 闭环验证完成一轮
- **THEN** 生成完整报告包含：执行摘要/性能数据/问题列表/优化建议/截图证据

#### Scenario: 补丁健康自愈
- **WHEN** 检测到补丁被意外修改或失效
- **THEN** 自动重新应用对应补丁并记录

#### Scenario: 迭代计数与趋势追踪
- **WHEN** 多轮闭环验证完成
- **THEN** 维护迭代历史，追踪性能趋势和问题修复情况

## MODIFIED Requirements

### Requirement: CI/CD 流水线增强
原有 `scripts/ci/pipeline.ps1` 增加 `--live` 模式：
- 启动实际 SOLO 进程（而非仅文件对比）
- 通过 agent-browser 执行 UI 测试
- 采集性能数据和截图
- 生成更丰富的报告

### Requirement: Agent-Browser 集成增强
原有 `toolkit/src/agent-browser/` 增加：
- 长时间运行的连接保活机制
- 自动重连策略（指数退避）
- 截图命名规范（含迭代编号）

## REMOVED REQUIREMENTS
无
