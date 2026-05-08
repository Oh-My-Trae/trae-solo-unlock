# 跨AI协作协议

## 核心原则

本项目的知识通过 **Memory MCP** 持久化，确保跨会话、跨AI协作时知识不丢失。

## 知识获取流程

任何AI在开始任务前，必须执行以下步骤：

### 1. 读取 AGENTS.md
获取项目基本信息和协作规则。

### 2. 查询 Memory MCP
根据任务需要，查询已持久化的知识：

```
# 获取完整知识图谱
mcp_Memory_read_graph()

# 按关键词搜索
mcp_Memory_search_nodes("TRAE SOLO CN")    → 架构全貌
mcp_Memory_search_nodes("product.json")     → 配置详情
mcp_Memory_search_nodes("AI Agent")         → 原生模块
mcp_Memory_search_nodes("sandbox")          → 沙箱安全
mcp_Memory_search_nodes("认证")             → 认证体系
mcp_Memory_search_nodes("MCP")              → 扩展系统

# 按名称精确读取
mcp_Memory_open_nodes(["TRAE SOLO CN", "product.json 核心配置"])
```

### 3. 按需读取详细文档
- `docs/git-conventions.md` — Git提交规范
- `docs/project-context.md` — 关键文件路径与架构
- `.trae/specs/research-solo-source/spec.md` — 完整研究规格

## 知识写入规则

完成任务后，必须将新发现持久化：

### 新实体
```
mcp_Memory_create_entities([{
  name: "实体名",
  entityType: "类型",
  observations: ["观察1", "观察2"]
}])
```

### 补充已有实体
```
mcp_Memory_add_observations([{
  entityName: "已有实体名",
  contents: ["新观察1", "新观察2"]
}])
```

### 建立关系
```
mcp_Memory_create_relations([{
  from: "实体A",
  to: "实体B",
  relationType: "关系类型"
}])
```

## 当前知识图谱实体

| 实体名 | 类型 | 内容概要 |
|--------|------|---------|
| TRAE SOLO CN | Application | 产品基本信息、版本、运行模式 |
| TRAE SOLO CN 架构 | Architecture | Electron架构、进程模型、关键文件 |
| AI Agent 模块 | Module | Rust原生，端口40005，通信协议 |
| CKG 模块 | Module | Rust原生，端口50000，代码知识图谱 |
| Sandbox 模块 | Module | 沙箱进程，文件系统控制 |
| product.json 核心配置 | Configuration | API端点、认证、遥测、AI限制 |
| 认证配置 | Configuration | OAuth体系、authConfig密钥 |
| 内置扩展系统 | Extension | MCP/Shell/集成扩展 |
| 安全与沙箱机制 | Security | 命令控制、沙箱RW/RO、扩展封禁 |
| AI功能配置 | Configuration | MCP限制、Hub配置、功能开关 |
| manifest.json 配置 | Configuration | 应用标识、网络配置、域名白名单 |

## 协作元信息

| 阶段 | 状态 | 说明 |
|------|------|------|
| 源码研究 | ✅ 完成 | 架构/配置/模块/安全模型已全部研究并持久化 |
| 魔改实施 | 🔜 待开始 | 基于研究结果进行改进 |

## Git 协作

- 完成任务后必须 git commit
- Git 路径: `D:\apps\Git\cmd\git.exe`（系统PATH中可能无git）
- Commit格式: `<type>(<scope>): <desc>`，详见 `docs/git-conventions.md`
