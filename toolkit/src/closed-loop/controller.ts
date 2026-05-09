/**
 * Closed-Loop Validation System - SOLO Runtime Controller (A1)
 *
 * 统一控制 SOLO 的完整生命周期：
 * - 启动/停止/重启
 * - 健康检查
 * - 心跳保活
 * - 自动重连
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import http from 'http';
import type {
  SoloState,
  SoloControllerOptions,
  HealthReport,
  HeartbeatResult,
  ControllerEvent,
  ControllerEventType,
  EventListener,
  StartResult,
  StopResult,
  ControllerResult,
  ProcessHealthInfo,
  CdpHealthInfo,
  ConnectionHealthInfo,
} from './types.js';
import { connector } from '../agent-browser/connector.js';
import { startSolo, fetchCdpVersionInfo, resetSoloProcess } from '../process/launcher.js';
import { killSolo } from '../process/killer.js';
import { actions } from '../agent-browser/actions.js';
import { logger } from '../agent-browser/logger.js';
import {
  DEFAULT_CDP_PORT,
  CDP_HOST,
  CDP_VERSION_ENDPOINT,
  STARTUP_TIMEOUT_MS,
} from '../constants.js';

const execAsync = promisify(exec);

/** 默认配置 */
const DEFAULT_OPTIONS: Required<SoloControllerOptions> = {
  cdpPort: DEFAULT_CDP_PORT,
  autoReconnect: true,
  reconnectMaxRetries: 10,
  heartbeatInterval: 30000,
  screenshotDir: path.join(process.cwd(), 'screenshots'),
  logDir: path.join(process.cwd(), 'logs'),
};

/** SOLO 运行时控制器 */
export class SoloController {
  private options: Required<SoloControllerOptions>;
  private state: SoloState;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectCount = 0;
  private listeners: Map<ControllerEventType, Set<EventListener<ControllerEvent>>> = new Map();
  private abortController: AbortController | null = null;
  private startTime: Date | null = null;

  constructor(options: SoloControllerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.state = { status: 'stopped' };

    // 确保目录存在
    this.ensureDirectories();
  }

  /**
   * 获取当前状态
   */
  getState(): SoloState {
    return { ...this.state };
  }

  /**
   * 启动 SOLO 实例
   *
   * 流程:
   * 1. 终止已有进程
   * 2. 启动新实例
   * 3. 等待 CDP 就绪
   * 4. 建立 CDP 连接
   * 5. 开始心跳
   */
  async start(signal?: AbortSignal): Promise<StartResult> {
    const endTimer = logger.startTimer('SoloController', '启动 SOLO');
    this.abortController = new AbortController();

    // 监听外部取消信号
    if (signal) {
      signal.addEventListener('abort', () => this.abortController?.abort(), { once: true });
    }

    try {
      // 更新状态为 starting
      this.updateState({ status: 'starting' });
      this.emit('state-change', { status: 'starting' });

      logger.info('SoloController', '开始启动 SOLO...', {
        cdpPort: this.options.cdpPort,
        autoReconnect: this.options.autoReconnect,
      });

      // 1. 启动 SOLO 进程（launcher 会自动终止已有进程）
      const launchResult = await startSolo({
        cdpPort: this.options.cdpPort,
        timeout: STARTUP_TIMEOUT_MS,
      });

      if (!launchResult.ready) {
        throw new Error('SOLO 启动超时或未就绪');
      }

      logger.info('SoloController', `SOLO 进程已启动 (PID: ${launchResult.pid})`);

      // 2. 等待一小段时间确保完全就绪
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 3. 获取 CDP 版本信息并建立连接
      let wsUrl = launchResult.wsUrl;
      let browserVersion = launchResult.browserVersion;

      if (!wsUrl) {
        try {
          const versionInfo = await fetchCdpVersionInfo(this.options.cdpPort);
          wsUrl = versionInfo.webSocketDebuggerUrl;
          browserVersion = versionInfo.Browser;
        } catch (err: any) {
          logger.warn('SoloController', `获取 WebSocket URL 失败: ${err.message}`);
        }
      }

      // 4. 尝试建立 CDP 连接
      if (wsUrl) {
        const connectResult = await connector.connect();
        if (!connectResult.success) {
          logger.warn('SoloController', `CDP 连接失败: ${connectResult.error}`);
        }
      }

      // 5. 记录启动时间
      this.startTime = new Date();

      // 6. 更新状态为 running
      this.updateState({
        status: 'running',
        pid: launchResult.pid,
        cdpPort: launchResult.cdpPort,
        wsUrl: wsUrl || undefined,
        browserVersion: browserVersion || undefined,
        startTime: this.startTime,
      });

      logger.info('SoloController', 'SOLO 已成功启动', {
        pid: launchResult.pid,
        cdpPort: launchResult.cdpPort,
        wsUrl: wsUrl || '(未获取)',
        browserVersion: browserVersion || '(未获取)',
      });

      // 7. 触发事件
      this.emit('process-started', { pid: launchResult.pid });
      this.emit('cdp-ready', { port: launchResult.cdpPort });
      if (wsUrl) {
        this.emit('connection-established', { wsUrl });
      }
      this.emit('state-change', { status: 'running' });

      // 8. 开始心跳
      this.startHeartbeat();

      endTimer();

      return {
        success: true,
        data: this.getState(),
        duration: 0,
        timestamp: new Date(),
        pid: launchResult.pid,
        cdpPort: launchResult.cdpPort,
        wsUrl: wsUrl || undefined,
        browserVersion: browserVersion || undefined,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      this.updateState({ status: 'error', error: errMsg });
      this.emit('error', { error: errMsg });
      this.emit('state-change', { status: 'error' });

      logger.error('SoloController', `启动失败: ${errMsg}`);
      endTimer();

      return {
        success: false,
        error: errMsg,
        duration: 0,
        timestamp: new Date(),
        pid: 0,
        cdpPort: this.options.cdpPort,
      };
    }
  }

  /**
   * 停止 SOLO 实例
   *
   * 流程:
   * 1. 保存当前状态
   * 2. 停止心跳
   * 3. 断开连接
   * 4. 终止进程
   * 5. 清理临时文件
   */
  async stop(force: boolean = false, signal?: AbortSignal): Promise<StopResult> {
    const endTimer = logger.startTimer('SoloController', '停止 SOLO');

    // 监听外部取消信号
    if (signal) {
      if (this.abortController) {
        signal.addEventListener('abort', () => this.abortController?.abort(), { once: true });
      }
    }

    try {
      const previousState = { ...this.state };

      // 如果已经停止，直接返回
      if (this.state.status === 'stopped') {
        logger.info('SoloController', 'SOLO 已经处于停止状态');
        endTimer();
        return {
          success: true,
          duration: 0,
          timestamp: new Date(),
          graceful: true,
          forceKilled: false,
        };
      }

      // 更新状态为 stopping
      this.updateState({ status: 'stopping' });
      this.emit('state-change', { status: 'stopping' });

      logger.info('SoloController', '正在停止 SOLO...', { force });

      // 1. 停止心跳
      this.stopHeartbeat();

      // 2. 断开 CDP 连接
      try {
        await connector.disconnect();
        logger.info('SoloController', 'CDP 连接已断开');
      } catch (disconnectErr: any) {
        logger.warn('SoloController', `断开连接失败: ${disconnectErr.message}`);
      }

      // 3. 终止进程
      let forceKilled = false;
      try {
        const killResult = await killSolo(force);
        forceKilled = force || killResult.timedOut;
        logger.info('SoloController', 'SOLO 进程已终止', { forceKilled });
      } catch (killErr: any) {
        logger.error('SoloController', `终止进程失败: ${killErr.message}`);
        forceKilled = true;
      }

      // 4. 重置内部状态
      resetSoloProcess();

      // 5. 更新状态
      this.updateState({ status: 'stopped' });
      this.reconnectCount = 0;
      this.startTime = null;

      // 6. 触发事件
      this.emit('process-stopped', { previousState, forceKilled });
      this.emit('state-change', { status: 'stopped' });

      endTimer();

      return {
        success: true,
        duration: 0,
        timestamp: new Date(),
        graceful: !forceKilled,
        forceKilled,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      this.updateState({ status: 'error', error: errMsg });
      this.emit('error', { error: errMsg });

      logger.error('SoloController', `停止失败: ${errMsg}`);
      endTimer();

      return {
        success: false,
        error: errMsg,
        duration: 0,
        timestamp: new Date(),
        graceful: false,
        forceKilled: true,
      };
    }
  }

  /**
   * 重启 SOLO 实例
   */
  async restart(signal?: AbortSignal): Promise<StartResult> {
    logger.info('SoloController', '正在重启 SOLO...');

    // 先停止
    const stopResult = await this.stop(false, signal);

    if (!stopResult.success && !stopResult.forceKilled) {
      logger.warn('SoloController', '停止时出现问题，继续尝试启动...');
    }

    // 等待一下确保完全停止
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 再启动
    return this.start(signal);
  }

  /**
   * 执行健康检查
   */
  async healthCheck(): Promise<HealthReport> {
    const timestamp = new Date();
    const endTimer = logger.startTimer('SoloController', '执行健康检查');

    try {
      // 并行检查进程和 CDP
      const [processHealth, cdpHealth, connectionValid] = await Promise.all([
        this.checkProcessHealth(),
        this.checkCdpHealth(),
        this.checkConnectionValidity(),
      ]);

      const healthy = processHealth.running && cdpHealth.reachable && connectionValid;

      const report: HealthReport = {
        timestamp,
        healthy,
        processRunning: processHealth.running,
        cdpReady: cdpHealth.reachable,
        connectionValid,
        state: this.getState(),
        details: {
          processInfo: processHealth,
          cdpInfo: cdpHealth,
          connectionInfo: this.getConnectionHealthInfo(),
        },
      };

      logger.info('SoloController', '健康检查完成', {
        healthy,
        processRunning: processHealth.running,
        cdpReady: cdpHealth.reachable,
        connectionValid,
      });

      endTimer();
      return report;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('SoloController', `健康检查失败: ${errMsg}`);
      endTimer();

      return {
        timestamp,
        healthy: false,
        processRunning: false,
        cdpReady: false,
        connectionValid: false,
        state: this.getState(),
        details: {},
      };
    }
  }

  /**
   * 获取当前 agent-browser snapshot
   */
  async getSnapshot(): Promise<ControllerResult<any>> {
    const endTimer = logger.startTimer('SoloController', '获取页面快照');

    try {
      const result = await actions.takeSnapshot();

      if (result.success) {
        logger.info('SoloController', '快照获取成功', {
          elementCount: result.data?.elements?.length || 0,
        });
      }

      endTimer();
      return {
        success: result.success,
        data: result.data,
        error: result.error,
        duration: result.duration,
        timestamp: result.timestamp,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('SoloController', `获取快照失败: ${errMsg}`);
      endTimer();

      return {
        success: false,
        error: errMsg,
        duration: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 截图并按规范命名
   */
  async takeScreenshot(name?: string): Promise<ControllerResult<string>> {
    const endTimer = logger.startTimer('SoloController', '截图');

    try {
      const timestamp = new Date();
      const filename = name || `solo-${timestamp.toISOString().replace(/[:.]/g, '-')}.png`;

      const result = await actions.screenshot(filename);

      if (result.success && result.data) {
        this.emit('screenshot-taken', { path: result.data, name: filename });
        logger.info('SoloController', `截图已保存: ${result.data}`);
      }

      endTimer();
      return {
        success: result.success,
        data: result.data,
        error: result.error,
        duration: result.duration,
        timestamp: result.timestamp,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('SoloController', `截图失败: ${errMsg}`);
      endTimer();

      return {
        success: false,
        error: errMsg,
        duration: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 注册事件监听器
   */
  on(event: ControllerEventType, listener: EventListener<ControllerEvent>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * 移除事件监听器
   */
  off(event: ControllerEventType, listener: EventListener<ControllerEvent>): void {
    this.listeners.get(event)?.delete(listener);
  }

  /**
   * 销毁控制器，释放所有资源
   */
  async destroy(): Promise<void> {
    logger.info('SoloController', '正在销毁控制器...');

    // 停止心跳
    this.stopHeartbeat();

    // 停止 SOLO
    if (this.state.status === 'running' || this.state.status === 'starting') {
      await this.stop(true);
    }

    // 清理监听器
    this.listeners.clear();

    // 取消 abort controller
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    logger.info('SoloController', '控制器已销毁');
  }

  // ==================== Private Methods ====================

  /**
   * 更新内部状态
   */
  private updateState(partial: Partial<SoloState>): void {
    this.state = {
      ...this.state,
      ...partial,
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
    };
  }

  /**
   * 开始心跳保活
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    logger.info('SoloController', `开始心跳 (间隔: ${this.options.heartbeatInterval}ms)`);

    this.heartbeatTimer = setInterval(async () => {
      await this.performHeartbeat();
    }, this.options.heartbeatInterval);

    // 防止定时器阻止进程退出
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger.debug('SoloController', '心跳已停止');
    }
  }

  /**
   * 执行一次心跳检查
   */
  private async performHeartbeat(): Promise<HeartbeatResult> {
    const timestamp = new Date();
    const startTime = Date.now();

    try {
      // 使用 connector.validateConnection 验证连接
      const validation = await connector.validateConnection();

      const latencyMs = Date.now() - startTime;
      const success = validation.success && validation.data === true;

      const result: HeartbeatResult = {
        timestamp,
        success,
        latencyMs,
        reconnectAttempted: false,
      };

      if (success) {
        this.reconnectCount = 0;
        this.emit('heartbeat-ok', { latencyMs });
        logger.debug('SoloController', '心跳正常', { latencyMs });
      } else {
        logger.warn('SoloController', '心跳失败', { latencyMs, error: validation.error });
        this.emit('heartbeat-fail', { latencyMs, error: validation.error });

        // 尝试重连
        if (this.options.autoReconnect) {
          result.reconnectAttempted = true;
          result.reconnectSuccess = await this.attemptReconnect();
        }
      }

      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const latencyMs = Date.now() - startTime;

      logger.error('SoloController', `心跳异常: ${errMsg}`);
      this.emit('heartbeat-fail', { latencyMs, error: errMsg });

      // 尝试重连
      let reconnectSuccess = false;
      if (this.options.autoReconnect) {
        reconnectSuccess = await this.attemptReconnect();
      }

      return {
        timestamp,
        success: false,
        latencyMs,
        error: errMsg,
        reconnectAttempted: this.options.autoReconnect,
        reconnectSuccess,
      };
    }
  }

  /**
   * 尝试重新连接（带指数退避）
   */
  private async attemptReconnect(): Promise<boolean> {
    if (this.reconnectCount >= this.options.reconnectMaxRetries) {
      logger.error('SoloController', `重连次数已达上限 (${this.options.reconnectMaxRetries})`);
      this.emit('reconnect-failed', { retries: this.reconnectCount });

      // 标记为断开状态
      if (this.state.status === 'running') {
        this.updateState({ status: 'error', error: '重连失败次数超限' });
        this.emit('connection-lost', {});
        this.emit('state-change', { status: 'error' });
      }

      return false;
    }

    this.reconnectCount++;

    // 指数退避：1s, 2s, 4s, 8s... 最大 60s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectCount - 1), 60000);

    logger.info('SoloController', `尝试重连 (第 ${this.reconnectCount}/${this.options.reconnectMaxRetries} 次)，${delay}ms 后执行`);
    this.emit('reconnect-attempt', { attempt: this.reconnectCount, delay });

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const connectResult = await connector.connect();

      if (connectResult.success) {
        logger.info('SoloController', '重连成功');
        this.reconnectCount = 0;
        this.emit('reconnect-success', { attempt: this.reconnectCount });

        // 恢复 running 状态
        if (this.state.status === 'error') {
          this.updateState({ status: 'running', error: undefined });
          this.emit('state-change', { status: 'running' });
        }

        return true;
      } else {
        logger.warn('SoloController', `重连失败: ${connectResult.error}`);
        return false;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn('SoloController', `重连异常: ${errMsg}`);
      return false;
    }
  }

  /**
   * 检查进程健康状态
   */
  private async checkProcessHealth(): Promise<ProcessHealthInfo> {
    const defaultInfo: ProcessHealthInfo = {
      pid: this.state.pid || 0,
      memoryMB: 0,
      cpuPercent: 0,
      threadCount: 0,
      handleCount: 0,
      running: false,
    };

    if (!this.state.pid) {
      return defaultInfo;
    }

    try {
      // 检查进程是否在运行
      const { stdout } = await execAsync(
        `tasklist /FI "PID eq ${this.state.pid}" /FO CSV /NH`,
        { timeout: 5000 }
      );

      const running = stdout.includes(String(this.state.pid));

      if (!running) {
        return { ...defaultInfo, running: false };
      }

      // 获取详细的进程信息（内存、CPU 等）
      try {
        const { stdout: wmicOutput } = await execAsync(
          `wmic process where "ProcessId=${this.state.pid}" get WorkingSetSize,PercentProcessorTime,ThreadCount,HandleCount /format:csv`,
          { timeout: 5000 }
        );

        const lines = wmicOutput.trim().split('\n');
        if (lines.length >= 2) {
          const values = lines[1].split(',');
          const memoryKB = parseInt(values[1] || '0', 10);
          const cpuPercent = parseFloat(values[2] || '0');
          const threadCount = parseInt(values[3] || '0', 10);
          const handleCount = parseInt(values[4] || '0', 10);

          return {
            pid: this.state.pid,
            memoryMB: Math.round(memoryKB / 1024),
            cpuPercent: Math.round(cpuPercent * 100) / 100,
            threadCount,
            handleCount,
            running: true,
          };
        }
      } catch {
        // WMIC 可能失败，使用默认值
      }

      return {
        pid: this.state.pid,
        memoryMB: 0,
        cpuPercent: 0,
        threadCount: 0,
        handleCount: 0,
        running: true,
      };
    } catch (error) {
      logger.debug('SoloController', '进程健康检查失败', {
        error: error instanceof Error ? error.message : String(error),
      });
      return defaultInfo;
    }
  }

  /**
   * 检查 CDP 健康状态
   */
  private async checkCdpHealth(): Promise<CdpHealthInfo> {
    const port = this.state.cdpPort || this.options.cdpPort;

    const info: CdpHealthInfo = {
      port,
      reachable: false,
      latencyMs: 0,
    };

    const startTime = Date.now();

    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://${CDP_HOST}:${port}${CDP_VERSION_ENDPOINT}`, (res) => {
          if (res.statusCode === 200) {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              try {
                const versionInfo = JSON.parse(data);
                info.browserVersion = versionInfo.Browser;
              } catch {
                // 忽略解析错误
              }
              info.latencyMs = Date.now() - startTime;
              info.reachable = true;
              resolve();
            });
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });

        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('CDP 检查超时'));
        });
      });
    } catch (error) {
      info.latencyMs = Date.now() - startTime;
      info.reachable = false;
    }

    return info;
  }

  /**
   * 检查连接有效性
   */
  private async checkConnectionValidity(): Promise<boolean> {
    try {
      const validation = await connector.validateConnection();
      return validation.success && validation.data === true;
    } catch {
      return false;
    }
  }

  /**
   * 获取连接健康信息
   */
  private getConnectionHealthInfo(): ConnectionHealthInfo {
    const connStatus = connector.getStatus();

    return {
      status: connStatus.status,
      wsUrl: connStatus.wsUrl,
      connectedAt: connStatus.connectedAt,
    };
  }

  /**
   * 触发事件
   */
  private emit(type: ControllerEventType, data?: any): void {
    const event: ControllerEvent = {
      type,
      timestamp: new Date(),
      data,
    };

    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          logger.error('SoloController', `事件处理器异常`, {
            eventType: type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }
  }

  /**
   * 确保目录存在
   */
  private ensureDirectories(): void {
    const dirs = [this.options.screenshotDir, this.options.logDir];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.debug('SoloController', `创建目录: ${dir}`);
      }
    }
  }
}

// 导出单例实例
export const soloController = new SoloController();
export default soloController;
