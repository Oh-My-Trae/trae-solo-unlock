/**
 * TRAE SOLO CN 原生模块工具包
 * ============================
 *
 * 提供对 TRAE SOLO CN 三大原生模块的深度分析和控制能力：
 *
 * 1. **AI Agent 模块** (model-switcher.ts)
 *    - API 端点切换（Trae/OpenAI/Ollama/LM Studio/Anthropic）
 *    - 代理服务器支持
 *    - 配置备份与恢复
 *
 * 2. **CKG 知识图谱模块** (knowledge-base.ts)
 *    - 自定义文档/代码注入
 *    - 知识库 CRUD 操作
 *    - 批量导入/导出
 *    - 索引管理
 *
 * 3. **Sandbox 沙箱模块** (sandbox-controller.ts)
 *    - RW 目录动态调整
 *    - 命令黑名单管理
 *    - 权限预设应用
 *    - 安全评估报告
 *
 * @module native-modules
 */

// AI Agent 分析结果和配置类型导出
export type { AIAgentConfig } from './types.js';
export { AIAgentAnalysisResult } from './types.js';

// CKG 分析结果和配置类型导出
export type { CKGConfig } from './ckg-analysis.js';
export { CKGAnalysisResult } from './ckg-analysis.js';

// Sandbox 分析结果和配置类型导出
export type { SandboxConfig } from './sandbox-analysis.js';
export { SandboxAnalysisResult } from './sandbox-analysis.js';

// Model Switcher 导出（包含类型）
export type {
  ModelEndpoint,
  SwitcherConfig,
  SwitchResult
} from './model-switcher.js';

export {
  ModelSwitcher,
  PRESET_ENDPOINTS,
  quickSwitch,
  createProxyServer
} from './model-switcher.js';

// Knowledge Base Manager 导出（包含类型）
export type {
  KnowledgeEntry,
  EntryMetadata,
  SearchQuery,
  SearchResult,
  ImportResult,
  ExportResult
} from './knowledge-base.js';

export {
  KnowledgeBaseManager,
  quickInject,
  importProject
} from './knowledge-base.js';

// Sandbox Controller 导出（包含类型）
export type {
  SandboxPolicy,
  PolicyMetadata,
  NetworkRule,
  PresetConfig,
  ControllerConfig
} from './sandbox-controller.js';

export {
  SandboxController,
  PRESET_CONFIGS,
  quickAddRW,
  quickApplyPreset,
  quickSecurityCheck
} from './sandbox-controller.js';
