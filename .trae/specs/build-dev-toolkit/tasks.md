# Tasks

- [ ] Task 1: 项目脚手架 — 初始化 toolkit 项目结构
  - [ ] SubTask 1.1: 创建 `toolkit/` 目录，初始化 package.json（TypeScript + Node.js）
  - [ ] SubTask 1.2: 配置 tsconfig.json、安装依赖（chokidar, tree-kill, cross-spawn, commander, chalk）
  - [ ] SubTask 1.3: 创建 CLI 入口 `toolkit/src/cli.ts`（commander 命令框架）
  - [ ] SubTask 1.4: 创建常量定义 `toolkit/src/constants.ts`（SOLO路径、端口、预设配置）

- [ ] Task 2: Config Manager — 配置管理器
  - [ ] SubTask 2.1: 实现 `toolkit/src/config/reader.ts` — 读取/解析 product.json
  - [ ] SubTask 2.2: 实现 `toolkit/src/config/writer.ts` — 安全写入 product.json（备份→修改→校验）
  - [ ] SubTask 2.3: 实现 `toolkit/src/config/presets.ts` — aggressive/conservative/custom 预设定义
  - [ ] SubTask 2.4: 实现 `toolkit/src/config/diff.ts` — 配置 diff 对比
  - [ ] SubTask 2.5: 实现 `toolkit/src/config/rollback.ts` — 从备份回滚
  - [ ] SubTask 2.6: 注册 CLI 命令：`config show`, `config apply <preset>`, `config rollback`, `config diff`

- [ ] Task 3: Process Manager — 进程管理器
  - [ ] SubTask 3.1: 实现 `toolkit/src/process/launcher.ts` — 启动 SOLO（--remote-debugging-port=9222）
  - [ ] SubTask 3.2: 实现 `toolkit/src/process/killer.ts` — 终止 SOLO 及所有子进程
  - [ ] SubTask 3.3: 实现 `toolkit/src/process/monitor.ts` — 进程状态监控（PID/端口/内存）
  - [ ] SubTask 3.4: 实现 `toolkit/src/process/watcher.ts` — product.json 变更监听（chokidar）
  - [ ] SubTask 3.5: 注册 CLI 命令：`solo start`, `solo stop`, `solo restart`, `solo status`

- [ ] Task 4: 一键魔改命令 — apply 闭环
  - [ ] SubTask 4.1: 实现 `toolkit/src/commands/apply.ts` — 备份→应用预设→停止→启动→等待就绪→验证
  - [ ] SubTask 4.2: 实现就绪检测 — 轮询 CDP 端口确认 SOLO 启动完成
  - [ ] SubTask 4.3: 实现失败回滚 — 验证失败时自动回滚配置并重启
  - [ ] SubTask 4.4: 注册 CLI 命令：`apply <preset>`, `apply --rollback`

- [ ] Task 5: Auto Tester — 自动化测试器（agent-browser）
  - [ ] SubTask 5.1: 实现 `toolkit/src/tester/connector.ts` — CDP 连接管理
  - [ ] SubTask 5.2: 实现 `toolkit/src/tester/screenshot.ts` — 截图采集与存档
  - [ ] SubTask 5.3: 实现 `toolkit/src/tester/validator.ts` — 功能验证（启动正常、AI面板可用）
  - [ ] SubTask 5.4: 实现 `toolkit/src/tester/regression.ts` — 回归测试套件
  - [ ] SubTask 5.5: 注册 CLI 命令：`test smoke`, `test regression`, `test screenshot`

- [ ] Task 6: API Gateway — API 网关
  - [ ] SubTask 6.1: 创建 `gateway/` 目录，初始化 package.json
  - [ ] SubTask 6.2: 实现 `gateway/src/proxy.ts` — HTTP/HTTPS 代理转发（http-proxy-middleware）
  - [ ] SubTask 6.3: 实现 `gateway/src/recorder.ts` — 请求/响应日志记录
  - [ ] SubTask 6.4: 实现 `gateway/src/openai-adapter.ts` — OpenAI 兼容 API 转换
  - [ ] SubTask 6.5: 实现 `gateway/src/token-manager.ts` — Token 自动提取与缓存
  - [ ] SubTask 6.6: 实现 `gateway/src/api-docs.ts` — API 发现与文档生成
  - [ ] SubTask 6.7: 注册 CLI 命令：`gateway start`, `gateway stop`, `gateway docs`

- [ ] Task 7: 集成测试与文档
  - [ ] SubTask 7.1: 端到端测试 — apply aggressive → 验证 SOLO 功能 → 回滚
  - [ ] SubTask 7.2: API Gateway 测试 — 代理转发 → OpenAI 兼容 API 调用
  - [ ] SubTask 7.3: 更新 Memory MCP 中的知识图谱

# Task Dependencies

- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 2, Task 3]
- [Task 5] depends on [Task 3]
- [Task 6] 独立于 [Task 2-5]，可与 Task 2-5 并行
- [Task 7] depends on [Task 4, Task 5, Task 6]
