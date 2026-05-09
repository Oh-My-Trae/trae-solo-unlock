/**
 * Closed-Loop Validation System - Unified Exports
 *
 * 闭环验证系统统一导出入口
 *
 * 模块说明:
 * - Controller (A1): SOLO 运行时控制器，负责生命周期管理、健康检查、心跳保活
 * - Collector (A2): 数据采集器，负责性能监控、截图采集、操作日志记录
 */

// ==================== Core Classes ====================

export { SoloController, soloController } from './controller.js';
export { DataCollector, dataCollector } from './collector.js';

// ==================== Type Definitions ====================

export type {
  // Controller Types
  SoloStatus,
  SoloState,
  SoloControllerOptions,
  HealthReport,
  HeartbeatResult,

  // Collector Types
  PerformanceSnapshot,
  OperationLog,
  OperationType,
  ScreenshotMetadata,
  CollectorOptions,

  // Event Types
  ControllerEventType,
  ControllerEvent,
  EventListener,

  // Result Types
  ControllerResult,
  StartResult,
  StopResult,

  // Health Info Types
  ProcessHealthInfo,
  CdpHealthInfo,
  ConnectionHealthInfo,
} from './types.js';
