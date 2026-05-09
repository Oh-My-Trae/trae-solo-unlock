/**
 * Agent-Browser 集成平台 - 日志工具
 */

import fs from 'fs';
import path from 'path';
import type { AgentBrowserConfig } from './types.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
  duration?: number;
}

/** 日志管理器 */
class Logger {
  private logLevel: LogLevel;
  private logFile: string | null;
  private entries: LogEntry[] = [];

  constructor(logLevel: LogLevel = 'info', logFile?: string) {
    this.logLevel = logLevel;
    this.logFile = logFile || null;
  }

  /**
   * 设置日志级别
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * 设置日志文件
   */
  setLogFile(filePath: string): void {
    this.logFile = filePath;
  }

  /**
   * 检查是否应该输出该级别的日志
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  /**
   * 格式化日志输出
   */
  private format(entry: LogEntry): string {
    const durationStr = entry.duration ? ` (${entry.duration}ms)` : '';
    const dataStr = entry.data ? ` | ${JSON.stringify(entry.data)}` : '';
    return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}${durationStr}${dataStr}`;
  }

  /**
   * 写入日志
   */
  private write(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    const formatted = this.format(entry);

    // 输出到控制台
    switch (entry.level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }

    // 保存到内存
    this.entries.push(entry);

    // 写入文件（如果配置了）
    if (this.logFile) {
      try {
        const dir = path.dirname(this.logFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.appendFileSync(this.logFile, formatted + '\n', 'utf-8');
      } catch (error) {
        console.error(`[Logger] 写入日志文件失败: ${error}`);
      }
    }
  }

  /**
   * 创建带计时的日志方法
   */
  private createTimedLog(level: LogLevel) {
    return (module: string, message: string, data?: unknown): (() => void) => {
      const startTime = Date.now();

      return () => {
        const duration = Date.now() - startTime;
        this.write({
          timestamp: new Date().toISOString(),
          level,
          module,
          message,
          data,
          duration,
        });
      };
    };
  }

  /** 调试日志 */
  debug(module: string, message: string, data?: unknown): void {
    this.write({ timestamp: new Date().toISOString(), level: 'debug', module, message, data });
  }

  /** 信息日志 */
  info(module: string, message: string, data?: unknown): void {
    this.write({ timestamp: new Date().toISOString(), level: 'info', module, message, data });
  }

  /** 警告日志 */
  warn(module: string, message: string, data?: unknown): void {
    this.write({ timestamp: new Date().toISOString(), level: 'warn', module, message, data });
  }

  /** 错误日志 */
  error(module: string, message: string, data?: unknown): void {
    this.write({ timestamp: new Date().toISOString(), level: 'error', module, message, data });
  }

  /** 开始计时 */
  startTimer(module: string, message: string, data?: unknown): () => void {
    return this.createTimedLog('info')(module, message, data);
  }

  /**
   * 获取所有日志条目
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * 清空日志
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * 导出日志为 JSON
   */
  exportToJson(): string {
    return JSON.stringify(this.entries, null, 2);
  }
}

// 导出单例实例
export const logger = new Logger();
export default logger;
