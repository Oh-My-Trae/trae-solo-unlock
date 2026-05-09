/**
 * 自定义模型端点切换工具 (Model Switcher)
 * ========================================
 *
 * 功能：
 * 1. 切换 AI 后端服务（默认 Trae API → 自定义 OpenAI 兼容 API）
 * 2. 支持多种端点类型：Trae、OpenAI、Ollama、LM Studio、Anthropic
 * 3. 提供代理服务器模式，支持协议转换
 * 4. 自动备份原始配置
 * 5. 配置验证和错误恢复
 */

import * as fs from 'fs';
import * as path from 'path';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import https from 'https';
import http from 'http';
import type { AIAgentConfig } from './types.js';

// ==================== 类型定义 ====================

export interface ModelEndpoint {
  id: string;
  name: string;
  type: 'trae' | 'openai' | 'ollama' | 'lmstudio' | 'anthropic' | 'custom';
  apiUrl: string;
  wsUrl?: string;
  apiKey?: string;
  apiKeyHeader?: string;  // Authorization, x-api-key, etc.
  models?: string[];
  description: string;
}

export interface SwitcherConfig {
  productJsonPath: string;
  backupDir: string;
  currentEndpoint: string;
  proxyPort: number;
  enableProxy: boolean;
  logFile: string;
}

export interface SwitchResult {
  success: boolean;
  previousEndpoint: string | null;
  newEndpoint: string;
  timestamp: Date;
  message: string;
  backupPath?: string;
}

// ==================== 预设端点配置 ====================

export const PRESET_ENDPOINTS: ModelEndpoint[] = [
  {
    id: 'trae-default',
    name: 'Trae Default API',
    type: 'trae',
    apiUrl: 'https://trae-api-cn.mchost.guru',
    wsUrl: 'wss://trae-ws-cn.mchost.guru/custom_model',
    description: 'TRAE SOLO CN 默认 API 端点'
  },
  {
    id: 'openai-official',
    name: 'OpenAI Official',
    type: 'openai',
    apiUrl: 'https://api.openai.com/v1',
    apiKeyHeader: 'Authorization',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o3-mini'],
    description: 'OpenAI 官方 API (需要 API Key)'
  },
  {
    id: 'ollama-local',
    name: 'Local Ollama',
    type: 'ollama',
    apiUrl: 'http://localhost:11434',
    models: ['llama3.2', 'qwen2.5', 'mistral', 'codellama'],
    description: '本地 Ollama 服务 (需先启动 ollama serve)'
  },
  {
    id: 'lmstudio-local',
    name: 'Local LM Studio',
    type: 'lmstudio',
    apiUrl: 'http://localhost:1234/v1',
    models: ['local-model'],
    description: '本地 LM Studio 服务 (需先启动 LM Studio)'
  },
  {
    id: 'anthropic-official',
    name: 'Anthropic Claude',
    type: 'anthropic',
    apiUrl: 'https://api.anthropic.com/v1',
    apiKeyHeader: 'x-api-key',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
    description: 'Anthropic Claude API (需要 API Key)'
  }
];

// ==================== 日志工具 ====================

class Logger {
  private logFile: string;

  constructor(logFile: string) {
    this.logFile = logFile;
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  info(message: string, data?: unknown): void {
    this.log('INFO', message, data);
  }

  error(message: string, error?: Error): void {
    this.log('ERROR', message, error?.message || error);
  }

  warn(message: string, data?: unknown): void {
    this.log('WARN', message, data);
  }

  private log(level: string, message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}${data ? ' | ' + JSON.stringify(data, null, 2) : ''}\n`;

    console.log(`[${level}] ${message}`, data || '');
    fs.appendFileSync(this.logFile, logEntry);
  }
}

// ==================== 主类：ModelSwitcher ====================

export class ModelSwitcher {
  private config: SwitcherConfig;
  private logger: Logger;
  private server?: http.Server;
  private currentEndpoint: ModelEndpoint | null = null;

  constructor(config?: Partial<SwitcherConfig>) {
    this.config = {
      productJsonPath: config?.productJsonPath ||
        'D:\\apps\\TRAE SOLO CN\\resources\\app\\product.json',
      backupDir: config?.backupDir ||
        path.join(process.cwd(), 'backups', 'model-switcher'),
      currentEndpoint: config?.currentEndpoint || 'trae-default',
      proxyPort: config?.proxyPort || 9876,
      enableProxy: config?.enableProxy ?? false,
      logFile: config?.logFile ||
        path.join(process.cwd(), 'logs', 'model-switcher.log')
    };

    this.logger = new Logger(this.config.logFile);
  }

  /**
   * 初始化切换器：加载当前配置并验证
   */
  async initialize(): Promise<void> {
    this.logger.info('ModelSwitcher 初始化开始');

    // 确保备份目录存在
    if (!fs.existsSync(this.config.backupDir)) {
      fs.mkdirSync(this.config.backupDir, { recursive: true });
    }

    // 验证 product.json 是否存在
    if (!fs.existsSync(this.config.productJsonPath)) {
      throw new Error(`产品配置文件不存在: ${this.config.productJsonPath}`);
    }

    this.logger.info('初始化完成', {
      productJsonPath: this.config.productJsonPath,
      backupDir: this.config.backupDir,
      proxyPort: this.config.proxyPort
    });
  }

  /**
   * 获取所有可用的预设端点
   */
  getAvailableEndpoints(): ModelEndpoint[] {
    return PRESET_ENDPOINTS;
  }

  /**
   * 获取当前活动的端点配置
   */
  async getCurrentEndpoint(): Promise<ModelEndpoint> {
    const productConfig = this.loadProductJson();
    const currentApiUrl = productConfig.bootConfig?.agent?.trae?.normal;

    const endpoint = PRESET_ENDPOINTS.find(e => e.apiUrl === currentApiUrl);
    if (endpoint) {
      this.currentEndpoint = endpoint;
      return endpoint;
    }

    // 如果不是预设端点，返回自定义配置
    return {
      id: 'custom',
      name: 'Custom Endpoint',
      type: 'custom',
      apiUrl: currentApiUrl || 'unknown',
      wsUrl: productConfig.bootConfig?.ws?.trae?.normal,
      description: '用户自定义端点'
    };
  }

  /**
   * 切换到指定的模型端点
   */
  async switchEndpoint(
    endpointIdOrConfig: string | ModelEndpoint,
    options?: { apiKey?: string; createBackup?: boolean }
  ): Promise<SwitchResult> {
    const createBackup = options?.createBackup !== false; // 默认创建备份

    try {
      // 解析目标端点
      let targetEndpoint: ModelEndpoint;
      if (typeof endpointIdOrConfig === 'string') {
        const preset = PRESET_ENDPOINTS.find(e => e.id === endpointIdOrConfig);
        if (!preset) {
          throw new Error(`未找到预设端点: ${endpointIdOrConfig}`);
        }
        targetEndpoint = { ...preset };
      } else {
        targetEndpoint = endpointIdOrConfig;
      }

      // 应用 API Key（如果提供）
      if (options?.apiKey) {
        targetEndpoint.apiKey = options.apiKey;
      }

      this.logger.info('开始切换端点', {
        from: this.currentEndpoint?.id || 'unknown',
        to: targetEndpoint.id,
        targetUrl: targetEndpoint.apiUrl
      });

      // 加载当前配置
      const productConfig = this.loadProductJson();
      const previousEndpoint = productConfig.bootConfig?.agent?.trae?.normal || null;

      // 创建备份
      let backupPath: string | undefined;
      if (createBackup) {
        backupPath = await this.createBackup(productConfig);
        this.logger.info('已创建配置备份', { backupPath });
      }

      // 修改配置
      const modifiedConfig = this.modifyProductConfig(productConfig, targetEndpoint);

      // 验证修改后的配置
      this.validateConfig(modifiedConfig);

      // 保存修改后的配置
      this.saveProductJson(modifiedConfig);

      // 更新当前端点状态
      this.currentEndpoint = targetEndpoint;

      const result: SwitchResult = {
        success: true,
        previousEndpoint,
        newEndpoint: targetEndpoint.apiUrl,
        timestamp: new Date(),
        message: `成功切换到 ${targetEndpoint.name} (${targetEndpoint.apiUrl})`,
        backupPath
      };

      this.logger.info('端点切换成功', result);
      return result;

    } catch (error) {
      this.logger.error('端点切换失败', error as Error);
      throw new Error(`端点切换失败: ${(error as Error).message}`);
    }
  }

  /**
   * 启动本地代理服务器
   */
  async startProxy(
    targetEndpoint: ModelEndpoint,
    options?: { port?: number }
  ): Promise<void> {
    const port = options?.port || this.config.proxyPort;

    if (this.server) {
      this.logger.warn('代理服务器已在运行');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        await this.handleProxyRequest(req, res, targetEndpoint);
      });

      this.server.on('error', (error) => {
        this.logger.error('代理服务器错误', error);
        reject(error);
      });

      this.server.listen(port, () => {
        this.logger.info(`代理服务器已启动`, {
          port,
          targetUrl: targetEndpoint.apiUrl,
          localUrl: `http://localhost:${port}`
        });
        resolve();
      });
    });
  }

  /**
   * 停止代理服务器
   */
  stopProxy(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
      this.logger.info('代理服务器已停止');
    }
  }

  /**
   * 恢复到默认 Trae 端点
   */
  async restoreToDefault(): Promise<SwitchResult> {
    return this.switchEndpoint('trae-default');
  }

  /**
   * 从备份恢复配置
   */
  async restoreFromBackup(backupPath?: string): Promise<SwitchResult> {
    try {
      // 如果没有指定备份路径，使用最新的备份
      if (!backupPath) {
        backupPath = this.getLatestBackupPath();
        if (!backupPath) {
          throw new Error('没有找到可用的备份文件');
        }
      }

      this.logger.info('从备份恢复', { backupPath });

      // 读取备份
      const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

      // 获取当前端点作为"前一个"
      const currentConfig = this.loadProductJson();
      const previousEndpoint = currentConfig.bootConfig?.agent?.trae?.normal || null;

      // 恢复配置
      this.saveProductJson(backupData);

      const result: SwitchResult = {
        success: true,
        previousEndpoint,
        newEndpoint: backupData.bootConfig?.agent?.trae?.normal || 'restored',
        timestamp: new Date(),
        message: `成功从备份恢复: ${path.basename(backupPath)}`
      };

      this.logger.info('恢复成功', result);
      return result;

    } catch (error) {
      this.logger.error('恢复失败', error as Error);
      throw new Error(`恢复失败: ${(error as Error).message}`);
    }
  }

  /**
   * 列出所有备份文件
   */
  listBackups(): Array<{ path: string; date: Date; size: number }> {
    if (!fs.existsSync(this.config.backupDir)) {
      return [];
    }

    const files = fs.readdirSync(this.config.backupDir)
      .filter(f => f.startsWith('product-backup-') && f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(this.config.backupDir, f);
        const stats = fs.statSync(filePath);
        return {
          path: filePath,
          date: stats.mtime,
          size: stats.size
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    return files;
  }

  // ==================== 私有方法 ====================

  /**
   * 加载 product.json
   */
  private loadProductJson(): Record<string, unknown> {
    const content = fs.readFileSync(this.config.productJsonPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * 保存 product.json
   */
  private saveProductJson(config: Record<string, unknown>): void {
    fs.writeFileSync(
      this.config.productJsonPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );
  }

  /**
   * 创建配置备份
   */
  private async createBackup(config: Record<string, unknown>): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `product-backup-${timestamp}.json`;
    const backupPath = path.join(this.config.backupDir, backupFilename);

    fs.writeFileSync(backupPath, JSON.stringify(config, null, 2), 'utf-8');

    return backupPath;
  }

  /**
   * 获取最新备份路径
   */
  private getLatestBackupPath(): string | null {
    const backups = this.listBackups();
    return backups.length > 0 ? backups[0].path : null;
  }

  /**
   * 修改 product.json 配置以切换端点
   */
  private modifyProductConfig(
    config: Record<string, unknown>,
    endpoint: ModelEndpoint
  ): Record<string, unknown> {
    const modified = { ...config };
    const bootConfig = { ...(modified.bootConfig as Record<string, unknown>) };

    // 修改 agent 端点
    if (!bootConfig.agent) {
      bootConfig.agent = {};
    }
    const agent = { ...bootConfig.agent as Record<string, unknown> };

    if (!agent.trae) {
      agent.trae = {};
    }
    (agent.trae as Record<string, unknown>).normal = endpoint.apiUrl;
    bootConfig.agent = agent;

    // 修改 ws 端点（如果提供）
    if (endpoint.wsUrl) {
      if (!bootConfig.ws) {
        bootConfig.ws = {};
      }
      const ws = { ...bootConfig.ws as Record<string, unknown> };
      if (!ws.trae) {
        ws.trae = {};
      }
      (ws.trae as Record<string, unknown>).normal = endpoint.wsUrl;
      bootConfig.ws = ws;
    }

    // 同步修改 ckg 和 cue 的端点（它们通常使用相同的后端）
    ['ckg', 'cue'].forEach(moduleName => {
      if (bootConfig[moduleName]) {
        const moduleConfig = { ...bootConfig[moduleName] as Record<string, unknown> };
        if (!moduleConfig.trae) {
          moduleConfig.trae = {};
        }
        (moduleConfig.trae as Record<string, unknown>).normal = endpoint.apiUrl;
        bootConfig[moduleName] = moduleConfig;
      }
    });

    modified.bootConfig = bootConfig;

    return modified;
  }

  /**
   * 验证配置的有效性
   */
  private validateConfig(config: Record<string, unknown>): void {
    const bootConfig = config.bootConfig as Record<string, unknown>;
    if (!bootConfig) {
      throw new Error('缺少 bootConfig 配置');
    }

    const agentConfig = bootConfig.agent as Record<string, unknown>;
    if (!agentConfig?.trae?.normal) {
      throw new Error('agent.trae.normal 配置无效');
    }

    try {
      new URL(agentConfig.trae.normal as string);
    } catch {
      throw new Error(`无效的 URL 格式: ${agentConfig.trae.normal}`);
    }

    this.logger.info('配置验证通过');
  }

  /**
   * 处理代理请求
   */
  private async handleProxyRequest(
    req: IncomingMessage,
    res: ServerResponse,
    targetEndpoint: ModelEndpoint
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // 收集请求数据
      const body = await this.collectRequestBody(req);

      // 构建目标 URL
      const targetUrl = new URL(req.url || '/', targetEndpoint.apiUrl);

      // 准备请求头
      const headers: Record<string, string> = { ...req.headers as Record<string, string> };

      // 添加或替换 API Key
      if (targetEndpoint.apiKey && targetEndpoint.apiKeyHeader) {
        if (targetEndpoint.apiKeyHeader.toLowerCase() === 'authorization') {
          headers['Authorization'] = `Bearer ${targetEndpoint.apiKey}`;
        } else {
          headers[targetEndpoint.apiKeyHeader] = targetEndpoint.apiKey;
        }
      }

      // 根据目标 URL 选择 HTTP 或 HTTPS
      const isHttps = targetUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const requestOptions: https.RequestOptions | http.RequestOptions = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers
      };

      // 发送代理请求
      const proxyReq = httpModule.request(requestOptions, (proxyRes) => {
        // 记录响应时间
        const duration = Date.now() - startTime;
        this.logger.info('代理请求完成', {
          method: req.method,
          url: req.url,
          status: proxyRes.statusCode,
          duration: `${duration}ms`
        });

        // 转发响应头
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (error) => {
        this.logger.error('代理请求失败', error);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Bad Gateway',
          message: error.message,
          target: targetEndpoint.apiUrl
        }));
      });

      // 发送请求体
      if (body) {
        proxyReq.write(body);
      }
      proxyReq.end();

    } catch (error) {
      this.logger.error('处理请求时出错', error as Error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal Server Error',
        message: (error as Error).message
      }));
    }
  }

  /**
   * 收集请求体
   */
  private collectRequestBody(req: IncomingMessage): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];

      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (chunks.length > 0) {
          resolve(Buffer.concat(chunks));
        } else {
          resolve(null);
        }
      });
    });
  }
}

// ==================== 导出工具函数 ====================

/**
 * 快速切换端点的便捷函数
 */
export async function quickSwitch(
  endpointId: string,
  options?: { apiKey?: string }
): Promise<SwitchResult> {
  const switcher = new ModelSwitcher();
  await switcher.initialize();
  return switcher.switchEndpoint(endpointId, options);
}

/**
 * 创建并启动完整代理服务器的便捷函数
 */
export async function createProxyServer(
  endpointId: string,
  options?: { apiKey?: number; port?: number }
): Promise<ModelSwitcher> {
  const switcher = new ModelSwitcher({ enableProxy: true });
  await switcher.initialize();

  const endpoint = PRESET_ENDPOINTS.find(e => e.id === endpointId);
  if (!endpoint) {
    throw new Error(`未知端点: ${endpointId}`);
  }

  if (options?.apiKey) {
    endpoint.apiKey = String(options.apiKey);
  }

  await switcher.startProxy(endpoint, { port: options?.port });
  return switcher;
}
