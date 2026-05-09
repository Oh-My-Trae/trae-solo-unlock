/**
 * Closed-Loop Validation System - Type Definitions
 *
 * 闭环验证系统核心类型定义
 */

// ==================== Controller Types ====================

/** SOLO 控制器状态枚举 */
export type SoloStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

/** SOLO 运行时状态 */
export interface SoloState {
  /** 当前状态 */
  status: SoloStatus;
  /** 进程 PID */
  pid?: number;
  /** CDP 端口 */
  cdpPort?: number;
  /** WebSocket URL */
  wsUrl?: string;
  /** 浏览器版本 */
  browserVersion?: string;
  /** 启动时间 */
  startTime?: Date;
  /** 运行时长 (ms) */
  uptime?: number;
  /** 错误信息 (当 status='error' 时) */
  error?: string;
}

/** SOLO 控制器配置选项 */
export interface SoloControllerOptions {
  /** CDP 端口 (默认 9222) */
  cdpPort?: number;
  /** 是否自动重连 (默认 true) */
  autoReconnect?: boolean;
  /** 最大重连次数 (默认 10) */
  reconnectMaxRetries?: number;
  /** 心跳间隔 ms (默认 30000) */
  heartbeatInterval?: number;
  /** 截图保存目录 */
  screenshotDir?: string;
  /** 日志保存目录 */
  logDir?: string;
}

/** 健康检查报告 */
export interface HealthReport {
  /** 检查时间戳 */
  timestamp: Date;
  /** 整体健康状态 */
  healthy: boolean;
  /** 进程是否运行中 */
  processRunning: boolean;
  /** CDP 是否就绪 */
  cdpReady: boolean;
  /** 连接是否有效 */
  connectionValid: boolean;
  /** 当前状态 */
  state: SoloState;
  /** 详细信息 */
  details: {
    /** 进程信息 */
    processInfo?: ProcessHealthInfo;
    /** CDP 信息 */
    cdpInfo?: CdpHealthInfo;
    /** 连接信息 */
    connectionInfo?: ConnectionHealthInfo;
  };
}

/** 进程健康信息 */
export interface ProcessHealthInfo {
  pid: number;
  memoryMB: number;
  cpuPercent: number;
  threadCount: number;
  handleCount: number;
  running: boolean;
}

/** CDP 健康信息 */
export interface CdpHealthInfo {
  port: number;
  reachable: boolean;
  latencyMs: number;
  browserVersion?: string;
}

/** 连接健康信息 */
export interface ConnectionHealthInfo {
  status: string;
  wsUrl?: string;
  connectedAt?: Date;
  lastHeartbeat?: Date;
}

/** 心跳结果 */
export interface HeartbeatResult {
  timestamp: Date;
  success: boolean;
  latencyMs: number;
  error?: string;
  reconnectAttempted: boolean;
  reconnectSuccess?: boolean;
}

// ==================== Collector Types ====================

/** 性能快照 */
export interface PerformanceSnapshot {
  /** 时间戳 */
  timestamp: Date;

  /** 进程信息 */
  processInfo: {
    pid: number;
    memoryMB: number;
    cpuPercent: number;
    threadCount: number;
    handleCount: number;
  };

  /** CDP 状态 */
  cdpInfo: {
    reachable: boolean;
    latencyMs: number;
    pageCount: number;
    websocketStatus: string;
  };

  /** 控制器状态 */
  controllerState: {
    status: string;
    uptimeMs: number;
  };
}

/** 操作日志类型 */
export type OperationType = 'snapshot' | 'click' | 'type' | 'navigate' | 'screenshot' | 'custom';

/** 操作日志条目 */
export interface OperationLog {
  /** 时间戳 */
  timestamp: Date;
  /** 迭代次数 */
  iteration: number;
  /** 阶段名称 */
  phase: string;
  /** 测试名称 */
  test: string;
  /** 操作类型 */
  type: OperationType;
  /** 输入数据 */
  input: any;
  /** 输出数据 */
  output: any;
  /** 执行耗时 (ms) */
  durationMs: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/** 数据采集器配置选项 */
export interface CollectorOptions {
  /** 截图保存目录 */
  screenshotDir?: string;
  /** 日志保存目录 */
  logDir?: string;
  /** 日志文件名前缀 */
  logPrefix?: string;
  /** 是否启用详细日志 */
  verboseLogging?: boolean;
}

/** 截图元数据 */
export interface ScreenshotMetadata {
  /** 文件路径 */
  path: string;
  /** 文件名 */
  filename: string;
  /** 拍摄时间 */
  timestamp: Date;
  /** 关联的测试名称 */
  testName: string;
  /** 阶段标识 */
  phase: string;
  /** 迭代编号 */
  iteration: number;
  /** 文件大小 (bytes) */
  sizeBytes?: number;
}

// ==================== Event Types ====================

/** 控制器事件类型 */
export type ControllerEventType =
  | 'state-change'
  | 'process-started'
  | 'process-stopped'
  | 'cdp-ready'
  | 'connection-established'
  | 'connection-lost'
  | 'reconnect-attempt'
  | 'reconnect-success'
  | 'reconnect-failed'
  | 'heartbeat-ok'
  | 'heartbeat-fail'
  | 'error'
  | 'screenshot-taken';

/** 控制器事件 */
export interface ControllerEvent {
  /** 事件类型 */
  type: ControllerEventType;
  /** 时间戳 */
  timestamp: Date;
  /** 事件数据 */
  data?: any;
  /** 错误信息 (仅 error 类型) */
  error?: string;
}

/** 事件监听器类型 */
export type EventListener<T = any> = (event: T) => void;

// ==================== Result Types ====================

/** 控制器操作结果 */
export interface ControllerResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  timestamp: Date;
}

/** 启动结果 */
export interface StartResult extends ControllerResult<SoloState> {
  pid: number;
  cdpPort: number;
  wsUrl?: string;
  browserVersion?: string;
}

/** 停止结果 */
export interface StopResult extends ControllerResult<void> {
  graceful: boolean;
  forceKilled: boolean;
}
