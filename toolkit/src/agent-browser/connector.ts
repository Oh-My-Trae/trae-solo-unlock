/**
 * Agent-Browser 集成平台 - CDP 连接器
 *
 * 功能: 建立/断开与 SOLO 的 CDP (Chrome DevTools Protocol) 连接
 */

import http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ConnectionInfo, ConnectionStatus, ActionResult } from './types.js';
import { config } from './config.js';
import { logger } from './logger.js';

const execAsync = promisify(exec);

/** CDP 连接器类 */
export class CDPConnector {
  private connectionInfo: ConnectionInfo;
  private wsUrl: string | null = null;

  constructor() {
    this.connectionInfo = {
      status: 'disconnected',
    };
  }

  /**
   * 获取当前连接状态
   */
  getStatus(): ConnectionInfo {
    return { ...this.connectionInfo };
  }

  /**
   * 检查 CDP 端点是否可用
   */
  async checkEndpoint(): Promise<ActionResult<boolean>> {
    const endTimer = logger.startTimer('CDPConnector', '检查 CDP 端点可用性');

    try {
      const cdpConfig = config.get('cdp');
      const endpointUrl = `http://${cdpConfig.host}:${cdpConfig.port}/json/version`;

      await new Promise<void>((resolve, reject) => {
        const req = http.get(endpointUrl, (res) => {
          if (res.statusCode === 200) {
            res.resume();
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });

        req.on('error', reject);
        req.setTimeout(cdpConfig.timeout || 10000, () => {
          req.destroy();
          reject(new Error('连接超时'));
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
        success: false,
        error: `CDP 端点不可用: ${errMsg}`,
        duration: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 获取 WebSocket Debugger URL
   */
  async getWebSocketUrl(): Promise<ActionResult<string>> {
    const endTimer = logger.startTimer('CDPConnector', '获取 WebSocket URL');

    try {
      const cdpConfig = config.get('cdp');
      const endpointUrl = `http://${cdpConfig.host}:${cdpConfig.port}/json/version`;
      const { stdout } = await execAsync(`curl -s "${endpointUrl}"`, {
        timeout: cdpConfig.timeout || 10000,
      });

      const versionInfo = JSON.parse(stdout);

      if (!versionInfo.webSocketDebuggerUrl) {
        throw new Error('WebSocket URL 不存在');
      }

      this.wsUrl = versionInfo.webSocketDebuggerUrl;

      logger.info('CDPConnector', '成功获取 WebSocket URL', { wsUrl: this.wsUrl });
      endTimer();

      return {
        success: true,
        data: this.wsUrl || undefined,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('CDPConnector', `获取 WebSocket URL 失败: ${errMsg}`);
      endTimer();

      return {
        success: false,
        error: `无法获取 WebSocket URL: ${errMsg}`,
        duration: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 通过 agent-browser CLI 建立连接
   */
  async connect(): Promise<ActionResult<ConnectionInfo>> {
    const endTimer = logger.startTimer('CDPConnector', '建立 CDP 连接');
    const maxRetries = config.get('maxRetries') || 3;
    const retryDelay = config.get('retryDelay') || 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info('CDPConnector', `尝试连接 (第 ${attempt}/${maxRetries} 次)`);

        // 更新状态为连接中
        this.connectionInfo = {
          status: 'connecting',
        };

        // 1. 先检查端点是否可用
        const endpointCheck = await this.checkEndpoint();
        if (!endpointCheck.success) {
          throw new Error(endpointCheck.error);
        }

        // 2. 获取 WebSocket URL
        const wsResult = await this.getWebSocketUrl();
        if (!wsResult.success || !wsResult.data) {
          throw new Error(wsResult.error || '无法获取 WebSocket URL');
        }

        // 3. 使用 agent-browser CLI 建立连接
        await execAsync(`agent-browser connect "${wsResult.data}"`, {
          timeout: config.get('operationTimeout') || 30000,
        });

        // 等待连接稳定
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 更新连接状态
        this.connectionInfo = {
          status: 'connected',
          wsUrl: wsResult.data,
          connectedAt: new Date(),
        };

        logger.info('CDPConnector', '成功建立 CDP 连接', {
          wsUrl: wsResult.data,
          connectedAt: this.connectionInfo.connectedAt,
        });

        endTimer();

        return {
          success: true,
          data: { ...this.connectionInfo },
          duration: 0,
          timestamp: new Date(),
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.warn('CDPConnector', `第 ${attempt} 次连接失败: ${errMsg}`);

        if (attempt < maxRetries) {
          logger.info('CDPConnector', `${retryDelay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          // 所有重试都失败
          this.connectionInfo = {
            status: 'error',
            error: errMsg,
          };

          logger.error('CDPConnector', `连接失败（已重试 ${maxRetries} 次）: ${errMsg}`);
          endTimer();

          return {
            success: false,
            error: `连接失败: ${errMsg}`,
            duration: 0,
            timestamp: new Date(),
          };
        }
      }
    }

    // 这行理论上不会执行，但 TypeScript 需要
    return {
      success: false,
      error: '未知错误',
      duration: 0,
      timestamp: new Date(),
    };
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<ActionResult<void>> {
    const endTimer = logger.startTimer('CDPConnector', '断开 CDP 连接');

    try {
      if (this.connectionInfo.status !== 'connected') {
        logger.warn('CDPConnector', '当前未连接状态');
        endTimer();
        return {
          success: true,
          duration: 0,
          timestamp: new Date(),
        };
      }

      // 使用 agent-browser 断开连接
      await execAsync('agent-browser disconnect', {
        timeout: 5000,
      });

      this.connectionInfo = {
        status: 'disconnected',
      };
      this.wsUrl = null;

      logger.info('CDPConnector', '成功断开连接');
      endTimer();

      return {
        success: true,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('CDPConnector', `断开连接失败: ${errMsg}`);

      // 即使断开失败，也标记为断开
      this.connectionInfo = {
        status: 'disconnected',
      };

      endTimer();

      return {
        success: false,
        error: `断开连接失败: ${errMsg}`,
        duration: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 验证连接是否仍然有效
   */
  async validateConnection(): Promise<ActionResult<boolean>> {
    const endTimer = logger.startTimer('CDPConnector', '验证连接有效性');

    try {
      if (this.connectionInfo.status !== 'connected') {
        return {
          success: true,
          data: false,
          duration: 0,
          timestamp: new Date(),
        };
      }

      // 尝试执行一个简单的 agent-browser 命令来验证连接
      const { stdout } = await execAsync('agent-browser snapshot -i', {
        timeout: 10000,
      });

      const isValid = stdout.includes('[ref=');

      endTimer();

      return {
        success: true,
        data: isValid,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('CDPConnector', `连接验证失败: ${errMsg}`);

      this.connectionInfo = {
        status: 'error',
        error: errMsg,
      };

      endTimer();

      return {
        success: false,
        data: false,
        error: errMsg,
        duration: 0,
        timestamp: new Date(),
      };
    }
  }
}

// 导出单例实例
export const connector = new CDPConnector();
export default connector;
