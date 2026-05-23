# Trae Solo Unlock

> 🌐 [Oh My Trae](https://github.com/oh-my-trae/oh-my-trae) 生态导航
>
> | 🔓 解密 | 💾 记忆 | 🛠️ 解锁 | 🤖 Solo |
> |---------|---------|----------|---------|
> | [trae-db-decrypt](https://github.com/oh-my-trae/trae-db-decrypt) | [trae-to-claude-mem](https://github.com/oh-my-trae/trae-to-claude-mem) | [trae-unlock](https://github.com/oh-my-trae/trae-unlock) | **trae-solo-unlock** |

> TRAE SOLO CN 魔改仓库 — Gateway 拦截、MCP Tools 扩展、源码研究工具链

## 项目结构

```
trae-solo-unlock/
├── gateway/              # SOLO API Gateway - OpenAI 兼容 API 拦截/转发
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
├── mcp-tools/            # MCP 工具扩展
│   ├── supabase-connector/
│   ├── computer-use-enhanced/
│   └── file-processor/
├── scripts/              # 自动化脚本
├── patches/              # 源码补丁
├── sub-agents/           # 子代理配置
├── docs/                 # 文档
│   ├── project-context.md
│   ├── git-conventions.md
│   └── ai-collaboration.md
└── AGENTS.md             # AI 协作指南
```

## 核心组件

### Gateway (`gateway/`)

SOLO API Gateway，拦截/转发/暴露 OpenAI 兼容 API。

```bash
cd gateway
npm install
npm run build
npm start
```

### MCP Tools (`mcp-tools/`)

- **supabase-connector**: Supabase 数据库连接
- **computer-use-enhanced**: 增强型计算机使用能力
- **file-processor**: 文件处理工具

## 源码研究

基于 TRAE SOLO CN（VSCode 1.107.1 二次开发）的源码分析：

- 版本: appVersion=0.1.7, tronBuildVersion=2.3.24253
- 运行模式: solo-lite
- 源码位置: `D:\apps\TRAE SOLO CN`

### 关键文件路径

| 组件 | 路径 |
|------|------|
| 主进程 | `resources/app/out/main.js` |
| 工作台 | `resources/app/out/vs/code/electron-browser/solo/workbench.js` |
| 产品配置 | `resources/app/product.json` |
| AI Agent 模块 | `resources/app/modules/ai-agent/` (端口 40005) |
| CKG 模块 | `resources/app/modules/ckg/` (端口 50000) |
| MCP 扩展 | `resources/app/extensions/byted-solo.builtin-mcp/` |

## 协作规则

1. 任务完成后必须 `git add -A && git commit`
2. Commit 格式: `<type>(<scope>): <desc>`
3. 新研究发现必须持久化到 Memory MCP

详细协议见 [AGENTS.md](AGENTS.md)。

## 许可证

MIT License
