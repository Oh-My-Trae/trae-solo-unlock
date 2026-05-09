/**
 * Agent-Browser 集成平台 - 类型定义
 */

/** CDP 连接配置 */
export interface CDPConnectionConfig {
  /** CDP HTTP 端点 (如 http://127.0.0.1:9222) */
  host: string;
  /** 调试端口 */
  port: number;
  /** 连接超时 (ms) */
  timeout?: number;
}

/** WebSocket 连接状态 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** 连接信息 */
export interface ConnectionInfo {
  status: ConnectionStatus;
  wsUrl?: string;
  connectedAt?: Date;
  error?: string;
}

/** 进程信息 */
export interface ProcessInfo {
  pid: number | null;
  running: boolean;
  startTime?: Date;
  cdpPort: number;
}

/** 页面快照元素 */
export interface SnapshotElement {
  ref: string;
  role: string;
  name: string;
  visible: boolean;
}

/** 页面快照 */
export interface PageSnapshot {
  timestamp: Date;
  url: string;
  title: string;
  elements: SnapshotElement[];
  rawText: string;
}

/** 操作结果 */
export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  timestamp: Date;
}

/** 工作区信息 */
export interface WorkspaceInfo {
  name: string;
  path?: string;
  isActive: boolean;
}

/** AI 响应 */
export interface AIResponse {
  content: string;
  timestamp: Date;
  duration: number;
  tokenCount?: number;
}

/** 批量测试结果 */
export interface BatchTestResult {
  prompt: string;
  response: AIResponse | null;
  success: boolean;
  error?: string;
}

/** 基准测试结果 */
export interface BenchmarkResult {
  prompt: string;
  responseTime: number;
  tokenCount?: number;
  success: boolean;
  error?: string;
}

/** 回归测试用例 */
export interface RegressionTestCase {
  name: string;
  action: () => Promise<ActionResult>;
  baselinePath: string;
  tolerance?: number;
}

/** 回归测试结果 */
export interface RegressionTestResult {
  name: string;
  passed: boolean;
  baselinePath: string;
  currentPath: string;
  diffScore: number;
  duration: number;
  error?: string;
}

/** 回归测试报告 */
export interface RegressionReport {
  runDate: Date;
  totalTests: number;
  passed: number;
  failed: number;
  results: RegressionTestResult[];
  summary: string;
}

/** Agent-Browser 平台配置 */
export interface AgentBrowserConfig {
  /** CDP 配置 */
  cdp: CDPConnectionConfig;
  /** SOLO 可执行文件路径 */
  soloExePath: string;
  /** 截图保存路径 */
  screenshotPath: string;
  /** 操作超时 (ms) */
  operationTimeout?: number;
  /** 重试次数 */
  maxRetries?: number;
  /** 重试间隔 (ms) */
  retryDelay?: number;
  /** 是否启用日志 */
  enableLogging?: boolean;
  /** 日志级别 */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
