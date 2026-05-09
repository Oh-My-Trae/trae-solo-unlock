/**
 * Agent-Browser 集成平台 - 进程管理器
 *
 * 功能: 启动/停止/重启 SOLO 进程，健康检查
 */

import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import http from 'http';
import type { ProcessInfo, ActionResult } from './types.js';
import { config } from './config.js';
import { logger } from './logger.js';

const execAsync = promisify(exec);

/** 进程管理器类 */
export class ProcessManager {
  private process: ChildProcess | null = null;
  private processInfo: ProcessInfo = {
    pid: null,
    running: false,
    cdpPort: 9222,
  };

  /**
   * 获取当前进程信息
   */
  getInfo(): ProcessInfo {
    return { ...this.processInfo };
  }

  /**
   * 检查 SOLO 进程是否正在运行
   */
  async isRunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq TRAE SOLO CN.exe" /NH', {
        timeout: 5000,
      });
      return stdout.includes('TRAE SOLO CN.exe');
    } catch {
      return false;
    }
  }

  /**
   * 检查 CDP 端口是否可用
   */
  async checkCdpPort(): Promise<ActionResult<boolean>> {
    const endTimer = logger.startTimer('ProcessManager', '检查 CDP 端口');

    try {
      const cdpConfig = config.get('cdp');
      const port = cdpConfig.port;

      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
          if (res.statusCode === 200) {
            res.resume();
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });

        req.on('error', reject);
        req.setTimeout(3000, () => {
          req.destroy();
          reject(new Error('端口检查超时'));
        });
      });

      endTimer();
      return {
        success: true,
        data: true,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      endTimer();

      return {
        success: true,
        data: false,
        duration: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 执行完整的健康检查
   */
  async healthCheck(): Promise<{
    processRunning: boolean;
    cdpReady: boolean;
    overall: boolean;
  }> {
    const [processRunning, cdpResult] = await Promise.all([
      this.isRunning(),
      this.checkCdpPort(),
    ]);

    const overall = processRunning && cdpResult.data;

    logger.info('ProcessManager', '健康检查完成', {
      processRunning,
      cdpReady: cdpResult.data,
      overall,
    });

    return {
      processRunning,
      cdpReady: cdpResult.data ?? false,
      overall,
    };
  }

  /**
   * 启动 SOLO 进程
   */
  async start(): Promise<ActionResult<ProcessInfo>> {
    const endTimer = logger.startTimer('ProcessManager', '启动 SOLO 进程');

    try {
      // 检查是否已在运行
      const alreadyRunning = await this.isRunning();

      if (alreadyRunning && this.process && !this.process.killed) {
        logger.warn('ProcessManager', 'SOLO 已在运行中');
        endTimer();

        return {
          success: true,
          data: this.processInfo,
          duration: 0,
          timestamp: new Date(),
        };
      }

      // 如果有残留进程，先终止
      if (alreadyRunning) {
        logger.info('ProcessManager', '发现残留进程，正在清理...');
        await this.killExistingProcesses();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // 获取配置
      const soloExePath = config.get('soloExePath');
      const cdpPort = config.get('cdp').port;

      logger.info('ProcessManager', `启动 SOLO: ${soloExePath}`, {
        cdpPort,
      });

      // 启动进程
      this.process = spawn(soloExePath, [`--remote-debugging-port=${cdpPort}`], {
        detached: false,
        stdio: 'ignore',
      });

      // 更新进程信息
      this.processInfo = {
        pid: this.process.pid || null,
        running: true,
        startTime: new Date(),
        cdpPort,
      };

      // 监听进程事件
      this.setupProcessHandlers();

      logger.info('ProcessManager', `SOLO 进程已启动 (PID: ${this.process.pid})`);

      // 等待就绪
      const ready = await this.waitForReady();

      if (!ready) {
        throw new Error('SOLO 启动超时或未就绪');
      }

      endTimer();

      return {
        success: true,
        data: { ...this.processInfo },
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('ProcessManager', `启动失败: ${errMsg}`);

      this.processInfo.running = false;
      this.process = null;

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
   * 停止 SOLO 进程
   */
  async stop(): Promise<ActionResult<void>> {
    const endTimer = logger.startTimer('ProcessManager', '停止 SOLO 进程');

    try {
      if (!this.processInfo.running) {
        logger.warn('ProcessManager', 'SOLO 未在运行');
        endTimer();

        return {
          success: true,
          duration: 0,
          timestamp: new Date(),
        };
      }

      // 先尝试优雅关闭
      if (this.process && !this.process.killed) {
        this.process.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // 强制杀死所有 SOLO 进程
      await this.killExistingProcesses();

      // 更新状态
      this.process = null;
      this.processInfo = {
        pid: null,
        running: false,
        cdpPort: 9222,
      };

      logger.info('ProcessManager', 'SOLO 进程已停止');
      endTimer();

      return {
        success: true,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('ProcessManager', `停止失败: ${errMsg}`);
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
   * 重启 SOLO 进程
   */
  async restart(): Promise<ActionResult<ProcessInfo>> {
    logger.info('ProcessManager', '正在重启 SOLO...');

    // 先停止
    const stopResult = await this.stop();

    if (!stopResult.success) {
      logger.warn('ProcessManager', '停止时出现问题，继续尝试启动...');
    }

    // 等待一下确保完全停止
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 再启动
    return this.start();
  }

  /**
   * 设置进程事件处理器
   */
  private setupProcessHandlers(): void {
    if (!this.process) return;

    this.process.on('error', (err) => {
      logger.error('ProcessManager', `进程错误: ${err.message}`);
      this.processInfo.running = false;
      this.process = null;
    });

    this.process.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        logger.warn('ProcessManager', `进程退出 (code: ${code}, signal: ${signal})`);
      } else {
        logger.info('ProcessManager', '进程正常退出');
      }
      this.processInfo.running = false;
      this.process = null;
    });
  }

  /**
   * 等待 SOLO 就绪
   */
  private async waitForReady(maxRetries = 30, interval = 2000): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      const cdpCheck = await this.checkCdpPort();

      if (cdpCheck.success && cdpCheck.data) {
        logger.info('ProcessManager', 'SOLO 已就绪');
        return true;
      }

      logger.debug('ProcessManager', `等待就绪... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    logger.error('ProcessManager', 'SOLO 启动超时');
    return false;
  }

  /**
   * 强制终止所有 SOLO 进程
   */
  private async killExistingProcesses(): Promise<void> {
    try {
      await execAsync('taskkill /F /IM "TRAE SOLO CN.exe"', {
        timeout: 10000,
      });
      logger.info('ProcessManager', '已终止现有 SOLO 进程');
    } catch (error) {
      // 忽略"进程不存在"的错误
      const errMsg = error instanceof Error ? error.message : String(error);
      if (!errMsg.includes('not found') && !errMsg.includes('没有找到')) {
        logger.warn('ProcessManager', `终止进程时出错: ${errMsg}`);
      }
    }
  }
}

// 导出单例实例
export const processManager = new ProcessManager();
export default processManager;
