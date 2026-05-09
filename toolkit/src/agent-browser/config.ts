/**
 * Agent-Browser 集成平台 - 配置管理
 */

import fs from 'fs';
import path from 'path';
import type { AgentBrowserConfig } from './types.js';

/** 默认配置 */
const DEFAULT_CONFIG: AgentBrowserConfig = {
  cdp: {
    host: '127.0.0.1',
    port: 9222,
    timeout: 10000,
  },
  soloExePath: 'D:\\apps\\TRAE SOLO CN\\TRAE SOLO CN.exe',
  screenshotPath: path.join(process.cwd(), 'screenshots'),
  operationTimeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  enableLogging: true,
  logLevel: 'info',
};

/** 配置管理器 */
class ConfigManager {
  private config: AgentBrowserConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), 'agent-browser-config.json');
    this.config = this.load();
  }

  /**
   * 加载配置
   */
  private load(): AgentBrowserConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const rawData = fs.readFileSync(this.configPath, 'utf-8');
        const userConfig = JSON.parse(rawData);
        return { ...DEFAULT_CONFIG, ...userConfig, cdp: { ...DEFAULT_CONFIG.cdp, ...userConfig.cdp } };
      }
    } catch (error) {
      console.warn(`[Config] 加载配置失败，使用默认配置: ${error}`);
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * 获取配置
   */
  get<T extends keyof AgentBrowserConfig>(key?: T): T extends undefined ? AgentBrowserConfig : AgentBrowserConfig[T] {
    if (!key) return this.config as any;
    return this.config[key] as any;
  }

  /**
   * 更新配置
   */
  update(partial: Partial<AgentBrowserConfig>): void {
    this.config = { ...this.config, ...partial };
    if (partial.cdp) {
      this.config.cdp = { ...this.config.cdp, ...partial.cdp };
    }
    this.save();
  }

  /**
   * 保存配置到文件
   */
  save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
      console.log(`[Config] 配置已保存到 ${this.configPath}`);
    } catch (error) {
      console.error(`[Config] 保存配置失败: ${error}`);
    }
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.save();
  }

  /**
   * 获取完整配置
   */
  getAll(): AgentBrowserConfig {
    return { ...this.config };
  }
}

// 导出单例实例
export const config = new ConfigManager();
export default config;
