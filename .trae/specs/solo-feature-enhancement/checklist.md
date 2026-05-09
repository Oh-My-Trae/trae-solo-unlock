# Checklist — TRAE SOLO CN 特色爆改

## Phase 1: 核心能力解锁验证

### Task 1: 核心文件结构探索
- [x] 已完成 workbench.desktop.main.solo-lite.js 的代码结构分析 → **发现: 不含AI聊天逻辑**
- [x] 定位 PlanItemStreamParser 类 → **❌ 不存在 (SOLO使用Rust原生ai-agent)**
- [x] 定位 ErrorStreamParser 类 → **❌ 不存在 (同上)**
- [x] 定位 React Alert 组件 → **❌ 标准模式不适用**
- [x] 定位权限检查逻辑 → **✅ 在product.json中找到配置项**
- [x] 定位沙箱配置和命令黑名单逻辑 → **✅ commandDenyList/sandboxRWList**
- [x] 所有关键位置已持久化到 Memory MCP → **4个实体+5条关系**

### Task 2-4: JS层补丁系统 (⚠️ 需重新评估)
- [ ] ~~数据源层补丁~~ → **SOLO无DG.parse, 需寻找替代方案**
- [ ] ~~服务层补丁~~ → **SOLO无PlanItemStreamParser, AI逻辑在ai-agent.exe**
- [ ] ~~UI层补丁~~ → **需确认workbench中是否有类似组件**
- [ ] ~~补丁定义~~ → **待Task 11补丁管理系统搭建后重试**
- [ ] **建议**: 先完成Task 8(原生模块)或Task 10(数据分析)获取更多信息

### Task 5: 权限限制解除 (P4) ✅
- [x] product.json 功能开关已修改 → computerUse/worktree/privacyMode (3项)
- [x] AI 功能限制阈值已扩展 → mcpToolLimit/mcpTokenLimit等 (8项)
- [x] featureGates 已启用 → enableHashDoc/enableCueflow/enableTabCue (3项)
- [x] 共修改 **14项** 配置，JSON格式验证通过

### Task 6: 沙箱限制放宽 (P5) ✅
- [x] commandDenyList 已精简 → **28个→4个** (仅保留真正危险操作)
- [x] sandboxRWList 已扩展 → **117→123个** (+6关键目录)
- [x] 新增目录: node_modules/.git/.vscode/%APPDATA%/%TEMP%
- [x] 网络白名单 → **待确认是否需要额外配置**

## Phase 2: SOLO 特色增强验证

### Task 7: agent-browser 深度集成平台 (S1)
- [ ] 自动登录模块已完成 OAuth 流程自动化
- [ ] 工作区管理模块支持批量创建/切换/删除
- [ ] AI 对话自动化模块支持批量提问+结果采集
- [ ] 截图对比回归测试模块可检测 UI 回归
- [ ] 所有模块已集成到 toolkit/ CLI 命令体系
- [ ] 文档示例完整，新用户可快速上手

### Task 8: 原生模块深度定制 (S2)
- [ ] AI Agent 模块 API 端点配置格式已分析清楚
- [ ] 自定义模型端点切换工具可用（支持本地 Ollama 等）
- [ ] CKG 模块嵌入引擎和数据结构已分析清楚
- [ ] 自定义知识库注入工具可用
- [ ] Sandbox 模块权限矩阵配置已分析清楚
- [ ] 沙箱策略动态调整工具可用（无需重启）

### Task 9: MCP 扩展生态增强 (S3)
- [ ] 现有 MCP 工具注册机制和协议规范已文档化
- [ ] 示例 MCP 工具已开发并通过测试
- [ ] Computer Use 功能已增强（OCR + 跨应用操作）
- [ ] 第三方服务集成模板已开发（Supabase/Vercel）
- [ ] MCP 工具开发文档完整，第三方开发者可参考

### Task 10: 数据洞察与分析面板 (S4)
- [ ] ai-agent/database.db 表结构和数据格式已分析清楚
- [ ] ckg_server 数据库索引和嵌入数据已分析清楚
- [ ] 对话历史分析工具可用（查询模式/成功率/响应时间）
- [ ] 代码修改追踪工具可用（热点文件排行榜）
- [ ] Token 消耗统计与优化建议工具可用
- [ ] 可视化仪表板可用（CLI 或 Web 界面）

## Phase 3: 自动化基础设施验证

### Task 11: 补丁管理系统 (I1)
- [ ] patches/definitions.json Schema 设计完成（v2.0 格式）
- [ ] apply-patches.ps1 可正确应用补丁（Anchor 匹配+备份+语法检查）
- [ ] rollback.ps1 可一键回滚到任意备份版本
- [ ] auto-heal.ps1 可自动诊断并修复常见问题
- [ ] verify.ps1 可验证所有补丁的健康状态
- [ ] Phase 1 的所有补丁已迁移到 definitions.json
- [ ] DryRun 模式正常工作（不实际修改文件）
- [ ] 版本兼容性检测可识别目标文件版本变化

### Task 12: 进程管理工具 (I2)
- [ ] launcher.ts 可正确启动 SOLO 并配置 CDP 端口
- [ ] killer.ts 可终止 SOLO 及所有子进程树
- [ ] monitor.ts 可监控进程状态（PID/端口/内存）
- [ ] watcher.ts 可监听 product.json 变更并提示热重载
- [ ] CLI 命令 solo start/stop/restart/status 全部可用
- [ ] 启动失败时可提供清晰的错误信息
- [ ] 进程僵死时自动检测并可强制重启

### Task 13: API Gateway 代理网关 (I3)
- [ ] gateway/ 项目结构已初始化（Go 或 Node.js）
- [ ] HTTP/HTTPS 代理核心可拦截和转发请求
- [ ] 请求/响应日志记录器可记录完整流量
- [ ] OpenAI 兼容 API 转换器可转换协议格式
- [ ] Token 自动提取与缓存模块可从 LevelDB 读取认证信息
- [ ] CLI 命令 gateway start/stop/docs 全部可用
- [ ] 代理性能开销可接受（延迟增加 <10ms）

### Task 14: CI/CD 自动化流水线 (I4)
- [ ] 冒烟测试套件可验证基本功能（启动/AI面板/交互）
- [ ] 回归测试套件可截图对比并标记差异
- [ ] 性能基准测试工具可测量启动时间/响应延迟/内存占用
- [ ] 自动报告生成器可生成完整报告（变更/测试/性能）
- [ ] CLI 命令 test smoke/regression/performance 全部可用
- [ ] 测试失败时可提供清晰的诊断信息

## 综合验收标准

### 功能完整性
- [ ] 所有 Phase 1 补丁均可独立启用/禁用
- [ ] 补丁应用后 SOLO 可正常启动和使用
- [ ] agent-browser 自动化测试全部通过
- [ ] 手动测试核心场景无明显回归问题

### 稳定性
- [ ] 连续运行 24 小时无崩溃或内存泄漏
- [ ] 后台标签页场景下所有功能正常
- [ ] 快速连续操作不导致竞态条件
- [ ] 异常输入不会导致应用卡死

### 性能
- [ ] 补丁应用后启动时间增加 <2 秒
- [ ] AI 响应延迟增加 <100ms
- [ ] 内存占用增加 <50MB
- [ ] agent-browser 操作响应时间 <500ms

### 可维护性
- [ ] 代码注释清晰，关键逻辑有说明
- [ ] 文档完整，新开发者可在 1 小时内上手
- [ ] 补丁定义格式统一，易于添加新补丁
- [ ] 错误日志详细，问题定位时间 <10 分钟

### 安全性
- [ ] 命令黑名单保留真正危险操作的拦截
- [ ] 沙箱策略放宽但未完全关闭
- [ ] Token 存储安全，不被明文写入日志
- [ ] 网络代理不泄露敏感信息

## 特殊场景测试

### 边界条件
- [ ] 极长对话（100+ 轮）不导致性能下降
- [ ] 大文件操作（>100MB）不导致卡死
- [ ] 并发多个 AI 任务不冲突
- [ ] 网络断开重连后功能恢复

### 兼容性
- [ ] Windows 10/11 不同版本可用
- [ ] 不同屏幕分辨率/DPI 下 UI 正常
- [ ] 中文路径和文件名处理正确
- [ ] 杀毒软件不误报（或提供白名单说明）

### 用户体验
- [ ] 一键应用补丁流程简单（<3 步）
- [ ] 失败回滚流程简单（<2 步）
- [ ] 状态反馈清晰（进度条/日志/颜色标识）
- [ ] 文档和帮助信息易于查找
