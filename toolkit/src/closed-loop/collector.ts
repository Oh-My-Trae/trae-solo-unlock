/**
 * Closed-Loop Validation System - Data Collector (A2)
 *
 * 数据采集器，负责：
 * - 性能快照采集
 * - 基线数据收集
 * - 规范化截图
 * - 操作日志记录
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import http from 'http';
import type {
  PerformanceSnapshot,
  OperationLog,
  OperationType,
  ScreenshotMetadata,
  CollectorOptions,
} from './types.js';
import { soloController } from './controller.js';
import { actions } from '../agent-browser/actions.js';
import { connector } from '../agent-browser/connector.js';
import { logger } from '../agent-browser/logger.js';
import {
  CDP_HOST,
  CDP_VERSION_ENDPOINT,
} from '../constants.js';

const execAsync = promisify(exec);

/** 默认配置 */
const DEFAULT_OPTIONS: Required<CollectorOptions> = {
  screenshotDir: path.join(process.cwd(), 'screenshots'),
  logDir: path.join(process.cwd(), 'logs'),
  logPrefix: 'operation',
  verboseLogging: true,
};

/** 数据采集器 */
export class DataCollector {
  private options: Required<CollectorOptions>;
  private operationLogs: OperationLog[] = [];
  private logFilePath: string | null = null;
  private currentIteration = 0;

  constructor(options: CollectorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // 初始化日志文件路径
    this.initializeLogFile();

    // 确保目录存在
    this.ensureDirectories();
  }

  /**
   * 设置当前迭代编号
   */
  setIteration(iteration: number): void {
    this.currentIteration = iteration;
    logger.debug('DataCollector', `设置迭代编号: ${iteration}`);
  }

  /**
   * 获取当前迭代编号
   */
  getIteration(): number {
    return this.currentIteration;
  }

  /**
   * 采集一次性能快照
   *
   * 收集以下信息：
   * - 进程信息（PID、内存、CPU、线程数、句柄数）
   * - CDP 状态（可达性、延迟、页面数、WebSocket 状态）
   * - 控制器状态（状态、运行时长）
   */
  async collectPerformanceSnapshot(): Promise<PerformanceSnapshot> {
    const timestamp = new Date();
    const endTimer = logger.startTimer('DataCollector', '采集性能快照');

    try {
      // 并行采集所有数据
      const [processInfo, cdpInfo, controllerState] = await Promise.all([
        this.collectProcessInfo(),
        this.collectCdpInfo(),
        this.collectControllerState(),
      ]);

      const snapshot: PerformanceSnapshot = {
        timestamp,
        processInfo,
        cdpInfo,
        controllerState,
      };

      logger.info('DataCollector', '性能快照采集完成', {
        memoryMB: processInfo.memoryMB,
        cpuPercent: processInfo.cpuPercent,
        cdpLatencyMs: cdpInfo.latencyMs,
        uptimeMs: controllerState.uptimeMs,
      });

      endTimer();
      return snapshot;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('DataCollector', `性能快照采集失败: ${errMsg}`);
      endTimer();

      // 返回空快照
      return {
        timestamp,
        processInfo: {
          pid: 0,
          memoryMB: 0,
          cpuPercent: 0,
          threadCount: 0,
          handleCount: 0,
        },
        cdpInfo: {
          reachable: false,
          latencyMs: 0,
          pageCount: 0,
          websocketStatus: 'error',
        },
        controllerState: {
          status: 'unknown',
          uptimeMs: 0,
        },
      };
    }
  }

  /**
   * 采集基线数据（多次取平均）
   *
   * @param iterations 采样次数 (默认 5)
   * @param interval 采样间隔 ms (默认 1000)
   */
  async collectBaseline(
    iterations: number = 5,
    interval: number = 1000
  ): Promise<PerformanceSnapshot[]> {
    logger.info('DataCollector', `开始采集基线数据 (${iterations} 次, 间隔 ${interval}ms)`);

    const snapshots: PerformanceSnapshot[] = [];

    for (let i = 0; i < iterations; i++) {
      logger.debug('DataCollector', `基线采样 ${i + 1}/${iterations}`);

      const snapshot = await this.collectPerformanceSnapshot();
      snapshots.push(snapshot);

      // 等待下次采样（最后一次不需要等待）
      if (i < iterations - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    logger.info('DataCollector', `基线数据采集完成 (${snapshots.length} 个样本)`);
    return snapshots;
  }

  /**
   * 计算基线平均值
   */
  calculateBaselineAverage(snapshots: PerformanceSnapshot[]): PerformanceSnapshot {
    if (snapshots.length === 0) {
      throw new Error('没有可用的快照数据');
    }

    const sum = snapshots.reduce(
      (acc, snap) => ({
        memoryMB: acc.memoryMB + snap.processInfo.memoryMB,
        cpuPercent: acc.cpuPercent + snap.processInfo.cpuPercent,
        threadCount: acc.threadCount + snap.processInfo.threadCount,
        handleCount: acc.handleCount + snap.processInfo.handleCount,
        latencyMs: acc.latencyMs + snap.cdpInfo.latencyMs,
        pageCount: acc.pageCount + snap.cdpInfo.pageCount,
        uptimeMs: acc.uptimeMs + snap.controllerState.uptimeMs,
      }),
      { memoryMB: 0, cpuPercent: 0, threadCount: 0, handleCount: 0, latencyMs: 0, pageCount: 0, uptimeMs: 0 }
    );

    const count = snapshots.length;

    return {
      timestamp: new Date(),
      processInfo: {
        pid: snapshots[0].processInfo.pid,
        memoryMB: Math.round(sum.memoryMB / count),
        cpuPercent: Math.round((sum.cpuPercent / count) * 100) / 100,
        threadCount: Math.round(sum.threadCount / count),
        handleCount: Math.round(sum.handleCount / count),
      },
      cdpInfo: {
        reachable: snapshots.every(s => s.cdpInfo.reachable),
        latencyMs: Math.round(sum.latencyMs / count),
        pageCount: Math.round(sum.pageCount / count),
        websocketStatus: snapshots[snapshots.length - 1].cdpInfo.websocketStatus,
      },
      controllerState: {
        status: snapshots[snapshots.length - 1].controllerState.status,
        uptimeMs: Math.round(sum.uptimeMs / count),
      },
    };
  }

  /**
   * 规范化截图
   *
   * 命名规范: {iteration}-{phase}-{testname}-{timestamp}.png
   * 示例: 001-smoke-initial-20260509T183045.png
   *
   * @param testName 测试名称
   * @param phase 阶段标识 (initial, during, final 等)
   */
  async takeScreenshot(testName: string, phase: string): Promise<ScreenshotMetadata> {
    const timestamp = new Date();
    const endTimer = logger.startTimer('DataCollector', `截图 [${testName}-${phase}]`);

    try {
      // 生成规范化的文件名
      const iterationStr = String(this.currentIteration).padStart(3, '0');
      const timeStr = timestamp.toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const filename = `${iterationStr}-${phase}-${testName}-${timeStr}.png`;

      const fullPath = path.join(this.options.screenshotDir, filename);

      // 执行截图
      const result = await actions.screenshot(filename, fullPath);

      if (!result.success || !result.data) {
        throw new Error(result.error || '截图失败');
      }

      // 获取文件大小
      let sizeBytes: number | undefined;
      try {
        const stats = fs.statSync(result.data);
        sizeBytes = stats.size;
      } catch {
        // 忽略获取文件大小失败
      }

      const metadata: ScreenshotMetadata = {
        path: result.data,
        filename,
        timestamp,
        testName,
        phase,
        iteration: this.currentIteration,
        sizeBytes,
      };

      // 记录操作日志
      this.logOperation({
        timestamp,
        iteration: this.currentIteration,
        phase,
        test: testName,
        type: 'screenshot',
        input: { testName, phase },
        output: metadata,
        durationMs: Date.now() - timestamp.getTime(),
        success: true,
      });

      logger.info('DataCollector', `截图已保存`, {
        filename,
        path: result.data,
        sizeKB: sizeBytes ? Math.round(sizeBytes / 1024) : undefined,
      });

      endTimer();
      return metadata;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      // 记录失败日志
      this.logOperation({
        timestamp,
        iteration: this.currentIteration,
        phase,
        test: testName,
        type: 'screenshot',
        input: { testName, phase },
        output: null,
        durationMs: Date.now() - timestamp.getTime(),
        success: false,
        error: errMsg,
      });

      logger.error('DataCollector', `截图失败 [${testName}-${phase}]: ${errMsg}`);
      endTimer();

      throw error;
    }
  }

  /**
   * 记录操作日志
   */
  logOperation(operation: OperationLog): void {
    // 添加到内存列表
    this.operationLogs.push(operation);

    // 写入日志文件
    if (this.logFilePath && this.options.verboseLogging) {
      try {
        const logLine = JSON.stringify(operation) + '\n';
        fs.appendFileSync(this.logFilePath, logLine, 'utf-8');
      } catch (error) {
        logger.error('DataCollector', `写入操作日志失败: ${error}`);
      }
    }

    // 输出到控制台
    if (this.options.verboseLogging) {
      const statusIcon = operation.success ? '[OK]' : '[FAIL]';
      const errorStr = operation.error ? ` | Error: ${operation.error}` : '';
      logger.info('DataCollector', `${statusIcon} ${operation.type} | ${operation.test}/${operation.phase} | ${operation.durationMs}ms${errorStr}`);
    }
  }

  /**
   * 创建操作日志辅助方法（带自动计时）
   */
  createTimedLog(
    type: OperationType,
    phase: string,
    test: string,
    input: any
  ): (output: any, success?: boolean, error?: string) => void {
    const startTime = Date.now();
    const timestamp = new Date();

    return (output: any, success: boolean = true, error?: string) => {
      const durationMs = Date.now() - startTime;

      this.logOperation({
        timestamp,
        iteration: this.currentIteration,
        phase,
        test,
        type,
        input,
        output,
        durationMs,
        success,
        error,
      });
    };
  }

  /**
   * 获取所有操作日志
   */
  getOperationLogs(): OperationLog[] {
    return [...this.operationLogs];
  }

  /**
   * 按条件过滤操作日志
   */
  filterOperationLogs(filter: {
    type?: OperationType;
    test?: string;
    phase?: string;
    iteration?: number;
    success?: boolean;
  }): OperationLog[] {
    return this.operationLogs.filter(log => {
      if (filter.type && log.type !== filter.type) return false;
      if (filter.test && log.test !== filter.test) return false;
      if (filter.phase && log.phase !== filter.phase) return false;
      if (filter.iteration !== undefined && log.iteration !== filter.iteration) return false;
      if (filter.success !== undefined && log.success !== filter.success) return false;
      return true;
    });
  }

  /**
   * 清空操作日志
   */
  clearOperationLogs(): void {
    this.operationLogs = [];
    logger.debug('DataCollector', '操作日志已清空');
  }

  /**
   * 导出操作日志为 JSON
   */
  exportLogsToJson(): string {
    return JSON.stringify(this.operationLogs, null, 2);
  }

  /**
   * 导出操作日志到文件
   */
  async exportLogsToFile(filePath?: string): Promise<string> {
    const exportPath = filePath || path.join(
      this.options.logDir,
      `${this.options.logPrefix}-logs-${Date.now()}.json`
    );

    const json = this.exportLogsToJson();
    fs.writeFileSync(exportPath, json, 'utf-8');

    logger.info('DataCollector', `操作日志已导出: ${exportPath}`);
    return exportPath;
  }

  /**
   * 获取统计摘要
   */
  getSummary(): {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageDuration: number;
    operationsByType: Record<OperationType, number>;
    totalDuration: number;
  } {
    const totalOperations = this.operationLogs.length;
    const successfulOperations = this.operationLogs.filter(l => l.success).length;
    const failedOperations = totalOperations - successfulOperations;
    const totalDuration = this.operationLogs.reduce((acc, l) => acc + l.durationMs, 0);
    const averageDuration = totalOperations > 0 ? Math.round(totalDuration / totalOperations) : 0;

    const operationsByType = {} as Record<OperationType, number>;
    for (const log of this.operationLogs) {
      operationsByType[log.type] = (operationsByType[log.type] || 0) + 1;
    }

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      averageDuration,
      operationsByType,
      totalDuration,
    };
  }

  // ==================== Private Methods ====================

  /**
   * 初始化日志文件
   */
  private initializeLogFile(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.logFilePath = path.join(
      this.options.logDir,
      `${this.options.logPrefix}-${timestamp}.jsonl`
    );
  }

  /**
   * 确保目录存在
   */
  private ensureDirectories(): void {
    const dirs = [this.options.screenshotDir, this.options.logDir];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.debug('DataCollector', `创建目录: ${dir}`);
      }
    }
  }

  /**
   * 采集进程信息
   */
  private async collectProcessInfo(): Promise<PerformanceSnapshot['processInfo']> {
    const defaultInfo = {
      pid: 0,
      memoryMB: 0,
      cpuPercent: 0,
      threadCount: 0,
      handleCount: 0,
    };

    const state = soloController.getState();

    if (!state.pid || state.status !== 'running') {
      return { ...defaultInfo, pid: state.pid || 0 };
    }

    try {
      // 使用 WMIC 获取详细进程信息
      const { stdout } = await execAsync(
        `wmic process where "ProcessId=${state.pid}" get WorkingSetSize,PercentProcessorTime,ThreadCount,HandleCount /format:csv`,
        { timeout: 5000 }
      );

      const lines = stdout.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].split(',');
        const memoryKB = parseInt(values[1] || '0', 10);
        const cpuPercent = parseFloat(values[2] || '0');
        const threadCount = parseInt(values[3] || '0', 10);
        const handleCount = parseInt(values[4] || '0', 10);

        return {
          pid: state.pid,
          memoryMB: Math.round(memoryKB / 1024),
          cpuPercent: Math.round(cpuPercent * 100) / 100,
          threadCount,
          handleCount,
        };
      }

      return { ...defaultInfo, pid: state.pid };
    } catch (error) {
      logger.debug('DataCollector', '进程信息采集失败', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { ...defaultInfo, pid: state.pid };
    }
  }

  /**
   * 采集 CDP 信息
   */
  private async collectCdpInfo(): Promise<PerformanceSnapshot['cdpInfo']> {
    const state = soloController.getState();
    const port = state.cdpPort || 9222;

    const info: PerformanceSnapshot['cdpInfo'] = {
      reachable: false,
      latencyMs: 0,
      pageCount: 0,
      websocketStatus: connector.getStatus().status,
    };

    const startTime = Date.now();

    try {
      // 检查 CDP 端点
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://${CDP_HOST}:${port}${CDP_VERSION_ENDPOINT}`, (res) => {
          if (res.statusCode === 200) {
            res.resume();
            info.reachable = true;
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });

        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('CDP 超时'));
        });
      });

      info.latencyMs = Date.now() - startTime;

      // 获取页面列表
      if (info.reachable) {
        try {
          const { stdout } = await execAsync(
            `curl -s "http://${CDP_HOST}:${port}/json/list"`,
            { timeout: 5000 }
          );

          const pages = JSON.parse(stdout);
          info.pageCount = Array.isArray(pages) ? pages.length : 0;
        } catch {
          // 页面数获取失败不影响整体结果
        }
      }
    } catch (error) {
      info.latencyMs = Date.now() - startTime;
      info.reachable = false;
    }

    return info;
  }

  /**
   * 采集控制器状态
   */
  private collectControllerState(): PerformanceSnapshot['controllerState'] {
    const state = soloController.getState();

    return {
      status: state.status,
      uptimeMs: state.uptime || 0,
    };
  }
}

// 导出单例实例
export const dataCollector = new DataCollector();
export default dataCollector;
