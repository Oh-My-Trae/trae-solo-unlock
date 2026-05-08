# AGENTS.md

## Git Commit 规则

每次完成任务后，必须执行 git commit。遵循以下规范：

### Commit Message 格式

```
<type>(<scope>): <description>
```

### Type 类型

- `feat`: 新功能
- `fix`: 修复bug
- `refactor`: 重构（不改变功能）
- `docs`: 文档变更
- `style`: 代码格式调整（不影响逻辑）
- `chore`: 构建/工具/配置变更
- `perf`: 性能优化
- `test`: 测试相关
- `ci`: CI/CD 相关
- `revert`: 回滚

### Scope 范围

- `core`: 核心架构/主进程
- `agent`: AI Agent 模块
- `ckg`: CKG 模块
- `sandbox`: 沙箱模块
- `mcp`: MCP 扩展
- `shell`: Shell 执行扩展
- `config`: 产品配置 (product.json 等)
- `auth`: 认证系统
- `ui`: 工作台/前端
- `ext`: 扩展系统
- `telemetry`: 遥测/监控
- `i18n`: 国际化

### 示例

```
feat(config): 添加自定义 API 端点配置
fix(agent): 修复 AI Agent 端口冲突问题
refactor(sandbox): 重构沙箱权限检查逻辑
chore(core): 初始化项目仓库
```

### 执行流程

1. 完成任务后，运行 `git add -A`
2. 运行 `git commit -m "<type>(<scope>): <description>"`
3. 如果有多个逻辑变更，分别提交

## 项目上下文

本项目是 TRAE SOLO CN 的魔改仓库，源码位于 `D:\apps\TRAE SOLO CN`。

### 关键文件路径

- 产品配置: `D:\apps\TRAE SOLO CN\resources\app\product.json`
- 应用清单: `D:\apps\TRAE SOLO CN\manifest.json`
- 主进程: `D:\apps\TRAE SOLO CN\resources\app\out\main.js`
- 工作台: `D:\apps\TRAE SOLO CN\resources\app\out\vs\code\electron-browser\solo\workbench.js`
- 桌面配置: `D:\apps\TRAE SOLO CN\resources\app\out\vs\code\electron-browser\scenes\desktop.config.js`
- AI Agent: `D:\apps\TRAE SOLO CN\resources\app\modules\ai-agent\`
- CKG: `D:\apps\TRAE SOLO CN\resources\app\modules\ckg\`
- Sandbox: `D:\apps\TRAE SOLO CN\resources\app\modules\sandbox\`
- MCP 扩展: `D:\apps\TRAE SOLO CN\resources\app\extensions\byted-solo.builtin-mcp\`
- Shell 扩展: `D:\apps\TRAE SOLO CN\resources\app\extensions\cloudide.icube-agent-shell-exec\`
