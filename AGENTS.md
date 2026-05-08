# AGENTS.md — AI 启动引导

## 项目
TRAE SOLO CN 魔改仓库。源码: `D:\apps\TRAE SOLO CN`

## 知识获取（必读）
**开始任何任务前，必须先查询 Memory MCP 获取已持久化的研究知识：**
- `mcp_Memory_search_nodes("TRAE SOLO CN")` → 获取架构/模块/配置/安全模型全貌
- `mcp_Memory_search_nodes("product.json")` → API端点/认证/遥测/沙箱配置
- `mcp_Memory_search_nodes("AI Agent")` → 原生模块通信协议
- `mcp_Memory_read_graph()` → 读取完整知识图谱

## 协作规则
1. 任务完成后必须 `git add -A && git commit`
2. Commit格式: `<type>(<scope>): <desc>` → 详见 `docs/git-conventions.md`
3. 新研究发现必须持久化到 Memory MCP（create_entities/add_observations）

## 详细文档（按需读取）
- `docs/git-conventions.md` — Git提交规范
- `docs/project-context.md` — 关键文件路径与架构
- `docs/ai-collaboration.md` — 跨AI协作协议
- `.trae/specs/research-solo-source/` — 源码研究规格文档
