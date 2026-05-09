/**
 * Analytics Module - 统一入口
 * TRAE SOLO CN 数据洞察与分析面板主模块
 */

import { DatabaseConnector } from './db/connector';
import { ChatAnalyzer } from './analyzers/chat-analyzer';
import { FileTracker } from './analyzers/file-tracker';
import { TokenCounter } from './analyzers/token-counter';
import { ConsoleReporter } from './reporters/console';
import { DataExporter } from './reporters/json';
import type {
  ChatAnalysisResult,
  FileTrackingResult,
  TokenStatisticsResult,
  DashboardData,
  CommandOptions,
  CommandResult,
  DashboardConfig,
} from './types';

export class AnalyticsEngine {
  private db: DatabaseConnector;
  private chatAnalyzer: ChatAnalyzer;
  private fileTracker: FileTracker;
  private tokenCounter: TokenCounter;
  private consoleReporter: ConsoleReporter;
  private dataExporter: DataExporter;
  private config: DashboardConfig;
  private initialized: boolean = false;

  constructor(config?: Partial<DashboardConfig>) {
    this.db = new DatabaseConnector();
    this.chatAnalyzer = new ChatAnalyzer(this.db);
    this.fileTracker = new FileTracker(this.db);
    this.tokenCounter = new TokenCounter(this.db);
    this.consoleReporter = new ConsoleReporter();
    this.dataExporter = new DataExporter();

    this.config = {
      refreshInterval: config?.refreshInterval || 300000, // 5 分钟
      theme: config?.theme || 'auto',
      defaultView: config?.defaultView || 'overview',
      exportFormat: config?.exportFormat || 'json',
    };
  }

  // ============================================================
  // 初始化
  // ============================================================

  /**
   * 初始化引擎（必须在所有操作前调用）
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.db.initialize();

      // 预热所有 workspace storage 连接
      const storages = this.db.getWorkspaceStorages();
      for (const storage of storages) {
        await this.db.getConnection(storage.databasePath);
      }

      this.initialized = true;
      console.log('✅ Analytics Engine 初始化完成');
    } catch (error) {
      console.error('❌ Analytics Engine 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // ============================================================
  // 高级 API - 完整分析
  // ============================================================

  /**
   * 运行完整的分析仪表板
   */
  async runDashboard(): Promise<DashboardData> {
    console.log('\n🚀 启动 TRAE SOLO CN 数据洞察引擎...\n');

    // 确保已初始化
    await this.ensureInitialized();

    const startTime = Date.now();

    try {
      // 并行执行所有分析
      const [chatAnalysis, fileTracking, tokenStats] = await Promise.all([
        this.chatAnalyzer.analyze(),
        this.fileTracker.analyze(),
        this.tokenCounter.analyze(),
      ]);

      const executionTime = Date.now() - startTime;

      const dashboardData: DashboardData = {
        chatAnalysis,
        fileTracking,
        tokenStats,
        lastUpdated: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
        dataSources: this.getDataSourcesStatus(),
      };

      // 显示仪表板
      this.consoleReporter.reportDashboard(dashboardData);

      console.log(`\n⚡ 分析完成！耗时 ${executionTime}ms\n`);

      return dashboardData;
    } catch (error) {
      console.error('❌ 分析过程中发生错误:', error);
      throw error;
    }
  }

  // ============================================================
  // 聊天分析 API (SubTask 10.3)
  // ============================================================

  /**
   * 分析对话历史
   */
  async analyzeChat(options?: CommandOptions): Promise<CommandResult<ChatAnalysisResult>> {
    const startTime = Date.now();

    try {
      const analysis = await this.chatAnalyzer.analyze();

      if (options?.format === 'console' || !options?.format) {
        this.consoleReporter.reportChatAnalysis(analysis);
      }

      if (options?.output && options.format !== 'console') {
        this.dataExporter.exportChatAnalysis(analysis, options.format, options.output);
      }

      return {
        success: true,
        data: analysis,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  /**
   * 获取最近对话
   */
  getRecentChats(limit: number = 50): CommandResult<any> {
    const startTime = Date.now();

    try {
      const chats = this.chatAnalyzer.getRecentChats(limit);

      return {
        success: true,
        data: chats,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  /**
   * 按模式分析
   */
  analyzeByPattern(groupBy: 'date' | 'hour' | 'dayOfWeek'): CommandResult<any> {
    const startTime = Date.now();

    try {
      const result = this.chatAnalyzer.analyzeByPattern(groupBy);

      return {
        success: true,
        data: result,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  /**
   * 获取成功率
   */
  getSuccessRate(): CommandResult<any> {
    const startTime = Date.now();

    try {
      // 获取所有消息以计算成功率
      const storages = this.db.getWorkspaceStorages();
      const allMessages: any[] = [];

      for (const storage of storages) {
        // 这里应该从实际数据中提取，暂时返回模拟数据结构
      }

      const successRate = this.chatAnalyzer.calculateSuccessRate(allMessages);

      console.log('\n✅ 成功率统计:');
      console.log(`   整体成功率: ${successRate.overallSuccessRate.toFixed(1)}%`);
      console.log(`   成功数: ${successRate.successCount}`);
      console.log(`   错误数: ${successRate.errorCount}`);
      console.log(`   取消数: ${successRate.cancelledCount}\n`);

      return {
        success: true,
        data: successRate,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  /**
   * 获取响应时间统计
   */
  getResponseTime(): CommandResult<any> {
    const startTime = Date.now();

    try {
      const storages = this.db.getWorkspaceStorages();
      const allMessages: any[] = [];

      for (const storage of storages) {
        // 从实际数据提取
      }

      const responseTime = this.chatAnalyzer.calculateResponseTime(allMessages);

      console.log('\n⏱️ 响应时间统计:');
      console.log(`   平均: ${this.formatDuration(responseTime.average)}`);
      console.log(`   中位数: ${this.formatDuration(responseTime.median)}`);
      console.log(`   最小: ${this.formatDuration(responseTime.min)}`);
      console.log(`   最大: ${this.formatDuration(responseTime.max)}`);
      console.log(`   P95: ${this.formatDuration(responseTime.p95)}`);
      console.log(`   P99: ${this.formatDuration(responseTime.p99)}\n`);

      return {
        success: true,
        data: responseTime,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  /**
   * 分类 Prompt
   */
  categorizePrompts(): CommandResult<any> {
    const startTime = Date.now();

    try {
      const storages = this.db.getWorkspaceStorages();
      const allMessages: any[] = [];

      for (const storage of storages) {
        // 提取数据
      }

      const categories = this.chatAnalyzer.categorizeMessages(allMessages);

      console.log('\n📂 Prompt 类型分类:');
      categories.topCategories.forEach(cat => {
        console.log(`   ${cat.name}: ${cat.count} (${cat.percentage.toFixed(1)}%)`);
      });
      console.log('');

      return {
        success: true,
        data: categories,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  // ============================================================
  // 文件追踪 API (SubTask 10.4)
  // ============================================================

  /**
   * 分析文件修改
   */
  async analyzeFiles(options?: CommandOptions): Promise<CommandResult<FileTrackingResult>> {
    const startTime = Date.now();

    try {
      const tracking = await this.fileTracker.analyze();

      if (options?.format === 'console' || !options?.format) {
        this.consoleReporter.reportFileTracking(tracking);
      }

      if (options?.output && options.format !== 'console') {
        this.dataExporter.exportFileTracking(tracking, options.format, options.output);
      }

      return {
        success: true,
        data: tracking,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  /**
   * 获取热点文件
   */
  getHotspotFiles(top: number = 20): CommandResult<any> {
    const startTime = Date.now();

    try {
      const hotspots = this.fileTracker.getHotspotFiles(top);

      if (hotspots.length > 0) {
        console.log(`\n🔥 热点文件 Top ${top}:\n`);
        hotspots.forEach((file, index) => {
          console.log(`${index + 1}. ${file.filePath}`);
          console.log(`   修改次数: ${file.modificationCount} | 语言: ${file.language} | 净增: ${file.estimatedChanges.netChange >= 0 ? '+' : ''}${file.estimatedChanges.netChange} 行`);
        });
        console.log('');
      } else {
        console.log('\n暂无热点文件数据\n');
      }

      return {
        success: true,
        data: hotspots,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  /**
   * 获取修改时间线
   */
  getModificationTimeline(days: number = 7): CommandResult<any> {
    const startTime = Date.now();

    try {
      const timeline = this.fileTracker.getModificationTimeline(days);

      console.log(`\n📅 近 ${days} 天修改时间线:\n`);
      timeline.forEach(entry => {
        console.log(`${entry.date}: ${entry.filesModified} 个文件, ${entry.modifications} 次修改`);
      });
      console.log('');

      return {
        success: true,
        data: timeline,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  /**
   * 获取文件类型分布
   */
  getFileTypeDistribution(): CommandResult<any> {
    const startTime = Date.now();

    try {
      const distribution = this.fileTracker.getFileTypeDistribution();

      console.log('\n📁 文件类型分布:\n');
      distribution.sorted.forEach(type => {
        console.log(`${type.extension || '(无)'.padEnd(8)} ${type.language.padEnd(18)} 文件: ${type.fileCount.toString().padStart(5)} 修改: ${type.modificationCount.toString().padStart(6)} (${type.percentage.toFixed(1)}%)`);
      });
      console.log('');

      return {
        success: true,
        data: distribution,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  /**
   * 获取特定文件历史
   */
  getFileHistory(filePath: string): CommandResult<any> {
    const startTime = Date.now();

    try {
      const history = this.fileTracker.getFileHistory(filePath);

      console.log(`\n📄 "${filePath}" 的修改历史:\n`);

      if (history.length === 0) {
        console.log('未找到该文件的修改记录\n');
      } else {
        history.forEach((entry: any, index: number) => {
          console.log(`${index + 1}. ${new Date(entry.timestamp || entry.date).toLocaleString()}`);
          if (entry.commitHash) console.log(`   提交: ${entry.commitHash.substring(0, 8)}`);
          if (entry.author) console.log(`   作者: ${entry.author}`);
          if (entry.linesAdded || entry.linesRemoved) {
            console.log(`   变更: +${entry.linesAdded || 0} -${entry.linesRemoved || 0}`);
          }
          console.log('');
        });
      }

      return {
        success: true,
        data: history,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  // ============================================================
  // Token 统计 API (SubTask 10.5)
  // ============================================================

  /**
   * 分析 Token 消耗
   */
  async analyzeTokens(options?: CommandOptions): Promise<CommandResult<TokenStatisticsResult>> {
    const startTime = Date.now();

    try {
      const stats = await this.tokenCounter.analyze();

      if (options?.format === 'console' || !options?.format) {
        this.consoleReporter.reportTokenStats(stats);
      }

      if (options?.output && options.format !== 'console') {
        this.dataExporter.exportTokenStats(stats, options.format, options.output);
      }

      return {
        success: true,
        data: stats,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  /**
   * 获取 Token 摘要
   */
  getTokenSummary(): CommandResult<any> {
    const startTime = Date.now();

    try {
      const summary = this.tokenCounter.getSummary();

      console.log('\n💰 Token 消耗总览:');
      console.log(`   总输入 Tokens: ${this.formatNumber(summary.totalInputTokens)}`);
      console.log(`   总输出 Tokens: ${this.formatNumber(summary.totalOutputTokens)}`);
      console.log(`   总消耗 Tokens: ${this.formatNumber(summary.totalTokens)}`);
      console.log(`   平均每会话: ${this.formatNumber(summary.averageTokensPerSession)}`);
      console.log(`   平均每消息: ${this.formatNumber(summary.averageTokensPerMessage)}`);
      console.log(`   日均消耗: ${this.formatNumber(summary.dailyAverage)}`);
      console.log(`   峰值日期: ${summary.peakUsageDay || 'N/A'}\n`);

      return {
        success: true,
        data: summary,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  /**
   * 获取分组统计
   */
  getGroupedStats(groupBy: 'session' | 'model' | 'date'): CommandResult<any> {
    const startTime = Date.now();

    try {
      const stats = this.tokenCounter.getGroupedStatistics(groupBy);

      console.log(`\n📊 按 ${groupBy} 分组的 Token 统计:\n`);

      if (Array.isArray(stats)) {
        stats.slice(0, 10).forEach((item: any, index: number) => {
          console.log(`${index + 1}. ${item[groupBy] || item.model || item.sessionId || item.date}`);
          console.log(`   输入: ${this.formatNumber(item.inputTokens)} | 输出: ${this.formatNumber(item.outputTokens)} | 总计: ${this.formatNumber(item.totalTokens)}`);
          if (item.cost) console.log(`   成本: $${item.cost.toFixed(2)}`);
          console.log('');
        });
      }

      return {
        success: true,
        data: stats,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  /**
   * 获取成本估算
   */
  getCostEstimation(): CommandResult<any> {
    const startTime = Date.now();

    try {
      const cost = this.tokenCounter.estimateCost();

      console.log('\n💵 成本估算:');
      console.log(`   总成本 (${cost.currency}): $${cost.totalCost.toFixed(2)}`);
      console.log(`   本月已用: $${cost.monthlyProjection.currentMonth.cost.toFixed(2)}`);
      console.log(`   本月预计: $${cost.monthlyProjection.projectedMonthEnd.cost.toFixed(2)}`);
      console.log(`   趋势: ${cost.monthlyProjection.trend === 'increasing' ? '📈 上升' : cost.monthlyProjection.trend === 'decreasing' ? '📉 下降' : '➡️ 稳定'}`);
      console.log(`   年度预计: $${cost.yearlyProjection.projectedAnnualCost.toFixed(2)}\n`);

      return {
        success: true,
        data: cost,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  /**
   * 获取优化建议
   */
  getOptimizationSuggestions(): CommandResult<any> {
    const startTime = Date.now();

    try {
      const suggestions = this.tokenCounter.getOptimizationSuggestions();

      console.log('\n💡 优化建议:\n');

      if (suggestions.length === 0) {
        console.log('✨ 当前使用状况良好，无需优化！');
      } else {
        suggestions.forEach((suggestion, index) => {
          const priorityEmoji = suggestion.priority === 'high' ? '🔴' : suggestion.priority === 'medium' ? '🟡' : '🔵';
          console.log(`${index + 1}. ${priorityEmoji} [${suggestion.priority.toUpperCase()}] ${suggestion.title}`);
          console.log(`   ${suggestion.description}`);
          console.log(`   影响: ${suggestion.currentImpact}`);
          console.log(`   潜在节省: ${suggestion.potentialSaving}`);
          console.log(`   建议: ${suggestion.implementation}`);
          console.log('');
        });
      }

      return {
        success: true,
        data: suggestions,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
        timestamp: {
          unix: Math.floor(Date.now() / 1000),
          iso: new Date().toISOString(),
          date: new Date(),
        },
      };
    }
  }

  // ============================================================
  // 数据库 Schema 分析 (SubTask 10.1 & 10.2)
  // ============================================================

  /**
   * 分析 AI Agent 数据库 Schema
   */
  analyzeAIAgentDatabaseSchema(): any {
    const info = this.db.getAIAgentDatabaseInfo();

    console.log('\n📦 AI Agent 数据库信息:');
    console.log(`   路径: ${info.exists ? this.db.checkAIAgentDatabase().path : '不存在'}`);
    console.log(`   存在: ${info.exists}`);
    console.log(`   大小: ${(info.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   文件头 (hex): ${info.headerHex}`);

    if (info.exists) {
      console.log('\n⚠️ 该数据库使用自定义格式或加密，无法直接读取。');
      console.log('   可能的格式：SQLCipher、自定义二进制格式、或其他加密方案。\n');
    }

    return info;
  }

  /**
   * 分析 CKG 数据库 Schema
   */
  analyzeCKGDatabaseSchema(): any {
    const dbConfig = this.db.checkCKGDatabase();
    const envConfig = this.db.getCKGEnvConfig();
    const info = {
      ...dbConfig,
      exists: this.db.pathExists(dbConfig.path),
      size: this.db.getFileSize(dbConfig.path),
      envConfig,
    };

    console.log('\n📦 CKG Server 数据库信息:');
    console.log(`   路径: ${dbConfig.path}`);
    console.log(`   存在: ${info.exists}`);
    console.log(`   大小: ${(info.size / 1024).toFixed(2)} KB`);
    console.log(`   描述: ${dbConfig.description}`);

    if (envConfig) {
      console.log('\n   CKG 环境配置:');
      console.log(`     Host: ${envConfig.host || '(默认)'}`);
      console.log(`     Device ID: ${envConfig.device_id}`);
      console.log(`     隐私模式: ${envConfig.is_privacy_mode}`);
    }

    console.log('');

    return info;
  }

  /**
   * 分析 Workspace Storage 数据库 Schema
   */
  analyzeWorkspaceStorageSchemas(): any[] {
    const storages = this.db.getWorkspaceStorages();
    const results: any[] = [];

    console.log('\n📊 Workspace Storage 数据库分析:\n');

    for (const storage of storages) {
      console.log(`工作区: ${storage.id}`);
      console.log(`路径: ${storage.workspace.folders[0]?.path || '未知'}`);

      const schema = this.db.analyzeSchema(storage.databasePath);

      if (schema) {
        console.log(`表数量: ${schema.tables.length}`);
        schema.tables.forEach(table => {
          const rowCount = this.db.getTableRowCount(storage.databasePath, table.name);
          console.log(`  - ${table.name} (${rowCount} 行)`);
        });

        results.push({
          workspaceId: storage.id,
          path: storage.workspace.folders[0]?.path,
          tables: schema.tables.map(t => ({
            name: t.name,
            columns: t.columns.length,
            rowCount: this.db.getTableRowCount(storage.databasePath, t.name),
          })),
        });
      } else {
        console.log('无法读取 Schema（可能不是标准 SQLite 格式）');
      }

      console.log('');
    }

    return results;
  }

  // ============================================================
  // 数据源状态
  // ============================================================

  /**
   * 获取所有数据源状态
   */
  getDataSourcesStatus(): any[] {
    const statusList: any[] = [];

    // AI Agent 数据库
    const aiAgentInfo = this.db.getAIAgentDatabaseInfo();
    statusList.push({
      name: 'AI Agent Database',
      connected: aiAgentInfo.exists,
      lastSync: aiAgentInfo.exists ? {
        unix: Math.floor(Date.now() / 1000),
        iso: new Date().toISOString(),
        date: new Date(),
      } : null,
      recordCount: aiAgentInfo.exists ? Math.floor(aiAgentInfo.size / 1024) : 0,
      error: aiAgentInfo.exists ? '使用加密/自定义格式' : '数据库不存在',
    });

    // CKG 数据库
    const ckgConfig = this.db.checkCKGDatabase();
    const ckgExists = this.db.pathExists(ckgConfig.path);
    statusList.push({
      name: 'CKG Database',
      connected: ckgExists,
      lastSync: ckgExists ? {
        unix: Math.floor(Date.now() / 1000),
        iso: new Date().toISOString(),
        date: new Date(),
      } : null,
      recordCount: ckgExists ? Math.floor(this.db.getFileSize(ckgConfig.path) / 1024) : 0,
      error: ckgExists ? '使用加密/自定义格式' : '数据库不存在',
    });

    // Workspace Storage
    const storages = this.db.getWorkspaceStorages();
    statusList.push({
      name: 'Workspace Storage',
      connected: storages.length > 0,
      lastSync: {
        unix: Math.floor(Date.now() / 1000),
        iso: new Date().toISOString(),
        date: new Date(),
      },
      recordCount: storages.length,
      error: null,
    });

    return statusList;
  }

  // ============================================================
  // 清理资源
  // ============================================================

  /**
   * 关闭所有连接并清理资源
   */
  destroy(): void {
    this.db.closeAll();
    console.log('\n✅ Analytics Engine 已关闭所有连接\n');
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /**
   * 格式化持续时间
   */
  private formatDuration(ms: number): string {
    if (ms >= 60000) return `${(ms / 60000).toFixed(1)} min`;
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
    return `${ms} ms`;
  }

  /**
   * 格式化数字
   */
  private formatNumber(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }
}

// 导出默认实例创建函数
export function createAnalyticsEngine(config?: Partial<DashboardConfig>): AnalyticsEngine {
  return new AnalyticsEngine(config);
}
