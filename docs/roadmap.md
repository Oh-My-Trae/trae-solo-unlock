The user wants me to provide inspiration for major modifications and improvements to TRAE SOLO CN, based on my comprehensive source code research. Let me first recall what I know from the Memory MCP, then provide creative and actionable ideas.

Let me think about this systematically based on what I've learned from the source code:

1. product.json - API endpoints, auth config, telemetry, feature gates
2. AI Agent module - Rust native, port 40005
3. CKG module - Code Knowledge Graph, port 50000
4. Sandbox - file system control, command whitelist
5. MCP extensions - Computer Use, connectors
6. Shell execution extension
7. Authentication system
8. Telemetry system
9. Desktop config - workbench layout

Let me think about what kinds of modifications would be most impactful and interesting.

基于我对源码的全面研究，以下是从**配置层、扩展层、安全层、架构层**四个维度梳理的魔改灵感，按影响力从大到小排列：

---

## 🔥 一级魔改：product.json 配置层（改一个字段就生效）

这是投入产出比最高的方向——`product.json` 是纯 JSON，改完即生效，无需编译。

### 1. 解锁 Computer Use（屏幕控制）
```json
"computerUse": { "enable": false }  →  true
```
当前 Computer Use 被禁用，但 MCP 扩展中已经内置了完整的屏幕控制代码。开启后 AI 可以直接操控你的桌面——截屏、点击、输入。这在 SOLO 模式下是革命性的。

### 2. 解锁 Worktree（多工作树并行开发）
```json
"worktree": { "enable": false }  →  true
```
允许 AI 同时在多个 git worktree 上工作，真正实现并行开发。

### 3. 放开 AI 功能限制
```json
"mcpToolLimit": 40,          →  200       // MCP工具数量上限
"mcpTokenLimit": 8000,       →  32000     // MCP token上限
"customPromptTokenLimit": 10000, → 50000  // 自定义提示词上限
"chatMessageQueryLimit": 400,    →  2000  // 聊天历史查询上限
```
当前限制非常保守，放开后可以使用更复杂的 MCP 工具链和更长的上下文。

### 4. 开启隐藏功能开关
```json
"featureGates": {
  "enableHashDoc": false,        →  true   // 文档哈希索引
  "enableCueflow": false,        →  true   // 代码流提示
  "enableTabCue": false,         →  true   // Tab补全提示
  "enableDefaultUseBuilder": false → true  // 默认使用Builder模式
}
```

### 5. API 端点劫持（最核心的魔改）
```json
"bootConfig": {
  "agent": { "trae": { "normal": "https://trae-api-cn.mchost.guru" } },
  "ckg":  { "trae": { "normal": "https://trae-api-cn.mchost.guru" } },
  "cue":  { "trae": { "normal": "https://trae-api-cn.mchost.guru" } },
  "hub":  { "trae": { "normal": "https://trae-api-cn.mchost.guru" } },
  "ws":   { "trae": { "normal": "wss://trae-ws-cn.mchost.guru/custom_model" } }
}
```
所有 AI 服务都指向 `mchost.guru`，这是中间代理。你可以：
- **指向自己的代理服务器**：拦截/审计/增强所有 AI 请求
- **指向 OpenAI/Claude 兼容 API**：绕过官方模型限制，使用任意模型
- **本地代理注入系统提示词**：在请求到达模型前注入自定义 system prompt

### 6. 遥测关闭/重定向
```json
"enableTelemetry": true  →  false
"tea": { "supportChangeAppId": false }  →  true  // 允许切换遥测appId
"slardar": { "supportChangeInstance": false }  →  true
```
或者把遥测重定向到自己的分析服务，了解 AI 的使用模式。

---

## ⚡ 二级魔改：安全层（解放 AI 的手脚）

### 7. 放开命令白名单
```json
"autoRunConfig": {
  "ideCommandMode": "whitelist",    →  "blacklist"
  "soloCommandMode": "whitelist",   →  "blacklist"
}
```
当前 AI 执行命令是白名单制（只允许明确许可的命令），改为黑名单制后 AI 可以自由执行大部分命令，只禁止危险操作。

### 8. 扩展沙箱 RW 目录
```json
"sandboxRWList": [ ... ]  // 添加你需要的目录
```
当前沙箱只允许在特定目录写入，可以添加项目目录、Docker 目录等。

### 9. 解封 Pylance
```json
"icubeExtensionControl": [{
  "condition": { "id": "ms-python.vscode-pylance" },
  "actions": { "reason": "BANNED_BY_MS" }  // 删除此条
}]
```
Pylance 被封禁是因为微软许可限制，但如果你有合法许可，可以解封获得更好的 Python 智能提示。

---

## 🧩 三级魔改：扩展层（增强 AI 能力）

### 10. 自定义 MCP 工具
`byted-solo.builtin-mcp` 的架构非常清晰——连接器模式。你可以：
- **添加 Windows 连接器**：当前只有 macOS 连接器（Calendar/Mail/Notes），可以添加 Windows 原生的 Outlook/To Do/文件系统连接器
- **添加浏览器控制连接器**：通过 Playwright/Puppeteer 让 AI 直接操作浏览器
- **添加数据库连接器**：让 AI 直接查询/操作数据库

### 11. 增强 Shell 执行扩展
`icube-agent-shell-exec` 当前只支持基础命令执行，可以：
- **添加命令审批流**：危险命令需要用户确认
- **添加命令录制/回放**：记录 AI 的操作序列，一键重放
- **添加多 Shell 会话**：让 AI 同时在多个终端工作

### 12. 激活集成扩展
`byted-solo.integrations-extended` 中大量命令被 `enablement: false` 禁用，包括 Supabase 和 Vercel 集成。激活后 AI 可以直接：
- 创建/管理 Supabase 项目
- 部署到 Vercel
- 一键完成从开发到部署的全流程

---

## 🏗️ 四级魔改：架构层（深度改造）

### 13. 工作台布局重构
`desktop.config.js` 控制整个工作台布局：
```javascript
"workbench.panel.hidden": true,           // 底部面板隐藏
"workbench.auxiliaryBar.hidden.runtime": ...,  // AI侧边栏
"workbench.sideBar.hidden.runtime": ...,   // 文件浏览器
```
可以重新设计 SOLO 模式的布局——比如让 AI 面板占据更大空间，或者创建沉浸式全屏 AI 模式。

### 14. 自定义主题注入
`theme-icube` 已经有 9 个主题变体，你可以：
- 创建完全自定义的主题（比如赛博朋克风、纸质风）
- 修改编辑器字体为中文友好的等宽字体
- 调整 AI 对话区域的视觉设计

### 15. 启动脚本环境变量注入
`start.bat` 中可以注入自定义环境变量：
```batch
set "AI_NATIVE_ENV=desktop"
set "CKG_APP_ID=你的自定义ID"
set "ICUBE_MODULAR_DATA_DIR=自定义数据目录"
```
比如把数据目录指向 RAMDisk 加速 AI 响应，或者修改 CKG_APP_ID 连接不同的代码知识图谱实例。

### 16. manifest.json 域名白名单扩展
```json
"access_policy": { "domain_white_list": { ... } }
```
添加你自己的 API 服务器域名，让 AI 可以直接访问你的内部服务。

---

## 🎯 我的建议：优先级排序

| 优先级 | 魔改项 | 难度 | 影响 |
|--------|--------|------|------|
| 🥇 | API端点劫持（#5） | ⭐ | 让AI使用任意模型 |
| 🥇 | 解锁Computer Use（#1） | ⭐ | AI操控桌面 |
| 🥈 | 放开AI限制（#3） | ⭐ | 更长上下文/更多工具 |
| 🥈 | 放开命令白名单（#7） | ⭐ | AI自由执行命令 |
| 🥉 | 开启隐藏功能（#4） | ⭐ | 解锁未发布功能 |
| 🥉 | 自定义MCP工具（#10） | ⭐⭐⭐ | 扩展AI能力边界 |
| 4th | 遥测关闭/重定向（#6） | ⭐ | 隐私保护 |
| 4th | 工作台布局重构（#13） | ⭐⭐ | 体验优化 |

**最激进的组合**：API劫持 + Computer Use + 命令白名单放开 = 一个可以操控你整个电脑、使用任意模型的 AI 助手。

想从哪个方向开始？