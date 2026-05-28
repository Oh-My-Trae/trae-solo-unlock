# Trae Solo Unlock

> 🌐 [Oh My Trae](https://github.com/Oh-My-Trae/oh-my-trae) 生态导航
>
> | 🔓 解密 | 💾 记忆 | 🛠️ 解锁 | 🤖 Solo |
> |---------|---------|----------|---------|
> | [trae-db-decrypt](https://github.com/Oh-My-Trae/trae-db-decrypt) | [trae-to-claude-mem](https://github.com/Oh-My-Trae/trae-to-claude-mem) | [trae-unlock](https://github.com/Oh-My-Trae/trae-unlock) | **trae-solo-unlock** |

> TRAE SOLO CN 魔改仓库 — SOLO API Gateway、MCP Tools 扩展、源码研究

## SOLO API Gateway

把 SOLO 的 13 个免费模型（DeepSeek V4、Kimi K2.6、通义千问 3.6 等）通过 OpenAI / Anthropic 兼容 API 暴露出来，可用于 Claude Code 及其他兼容工具。

### 快速开始

```bash
cd gateway
npm install
npm run build
npm start
```

启动后：
- API: `http://localhost:18080`
- 登录页: `http://localhost:18081`（用于获取 JWT Token）

### 接入 Claude Code

在项目的 `.claude/settings.json` 中添加：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:18080",
    "ANTHROPIC_AUTH_TOKEN": "sk-solo-gateway",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "kimi-k2.6",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "DeepSeek-V4-Flash",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "DeepSeek-V4-Pro"
  }
}
```

### 可用模型

| 模型名 | 说明 |
|--------|------|
| `Doubao_1_6` | 豆包 Seed Code（默认） |
| `Doubao-Seed-2.0-Code` | 豆包 Seed 2.0 |
| `DeepSeek-V4-Pro` | DeepSeek V4 Pro |
| `DeepSeek-V4-Flash` | DeepSeek V4 Flash |
| `kimi-k2.6` | Kimi K2.6 |
| `kimi-k2.5` | Kimi K2.5 |
| `qwen-3.6-plus` | 通义千问 3.6 Plus |
| `qwen-3.5` | 通义千问 3.5 |
| `glm-5.1` | 智谱 GLM-5.1 |
| `glm-5` | 智谱 GLM-5 |
| `glm-5v-turbo` | 智谱 GLM-5V Turbo |
| `minimax-m2.7` | MiniMax M2.7 |
| `minimax-m2.5` | MiniMax M2.5 |

### 已知限制

SOLO 模型运行在云端沙箱中，**无法读写本地文件**。适合智能问答、代码审查、文本生成，不适合直接用于本地项目开发。详见 [docs/solo-gateway-story.md](docs/solo-gateway-story.md)。

### Docker 部署

```bash
cd gateway
docker compose up -d
```

## 项目结构

```
trae-solo-unlock/
├── gateway/              # SOLO API Gateway
│   ├── src/              # TypeScript 源码
│   ├── bin/              # npx 入口
│   ├── Dockerfile
│   └── docker-compose.yml
├── mcp-tools/            # MCP 工具扩展
│   ├── supabase-connector/
│   ├── computer-use-enhanced/
│   └── file-processor/
├── scripts/              # 自动化脚本
├── patches/              # 源码补丁
├── sub-agents/           # 子代理配置
├── docs/                 # 文档
│   ├── project-context.md
│   ├── solo-gateway-story.md
│   └── ...
└── AGENTS.md             # AI 协作指南
```

## 源码研究

基于 TRAE SOLO CN（VSCode 1.107.1 二次开发）的源码分析：

- 版本: appVersion=0.1.7, tronBuildVersion=2.3.24253
- 运行模式: solo-lite
- 源码位置: `D:\apps\TRAE SOLO CN`

## 协作规则

1. 任务完成后必须 `git add -A && git commit`
2. Commit 格式: `<type>(<scope>): <desc>`
3. 新研究发现必须持久化到 Memory MCP

详细协议见 [AGENTS.md](AGENTS.md)。

## 许可证

MIT License
