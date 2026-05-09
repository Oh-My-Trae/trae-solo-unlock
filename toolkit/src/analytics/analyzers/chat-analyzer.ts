/**
 * Chat Analyzer - 对话历史分析器 (SubTask 10.3)
 * 提供对话历史的统计分析功能
 */

import type {
  ChatAnalysisResult,
  ChatSummary,
  SuccessRateAnalysis,
  ResponseTimeAnalysis,
  PatternAnalysis,
  CategoryAnalysis,
  TimelineData,
  QueryFrequency,
  HourlyActivity,
  DayOfWeekStats,
  CategoryStat,
  ChatSession,
  ChatMessage,
} from '../types.js';
import { DatabaseConnector } from '../db/connector.js';

export class ChatAnalyzer {
  private db: DatabaseConnector;

  constructor(dbConnector: DatabaseConnector) {
    this.db = dbConnector;
  }

  // ============================================================
  // 主要分析方法
  // ============================================================

  /**
   * 执行完整的聊天分析
   */
  async analyze(): Promise<ChatAnalysisResult> {
    const storages = this.db.getWorkspaceStorages();

    // 从所有 workspace 收集数据
    const allSessions: ChatSession[] = [];
    const allMessages: ChatMessage[] = [];

    for (const storage of storages) {
      const sessions = await this.extractChatData(storage.databasePath);
      allSessions.push(...sessions.sessions);
      allMessages.push(...sessions.messages);
    }

    return {
      summary: this.calculateSummary(allSessions, allMessages),
      successRate: this.calculateSuccessRate(allMessages),
      responseTime: this.calculateResponseTime(allMessages),
      patterns: this.analyzePatterns(allMessages),
      categories: this.categorizeMessages(allMessages),
      timeline: this.buildTimeline(allMessages),
    };
  }

  /**
   * 获取最近的 N 条对话
   */
  getRecentChats(limit: number = 50): ChatSession[] {
    const storages = this.db.getWorkspaceStorages();
    const allSessions: ChatSession[] = [];

    for (const storage of storages) {
      const data = this.extractChatDataFromStorage(storage.databasePath);
      allSessions.push(...data.sessions);
    }

    // 按更新时间排序
    allSessions.sort((a, b) => b.updatedAt.unix - a.updatedAt.unix);

    return allSessions.slice(0, limit);
  }

  /**
   * 按模式统计查询
   */
  analyzeByPattern(groupBy: 'date' | 'hour' | 'dayOfWeek'): any {
    const storages = this.db.getWorkspaceStorages();
    const allMessages: ChatMessage[] = [];

    for (const storage of storages) {
      const data = this.extractChatDataFromStorage(storage.databasePath);
      allMessages.push(...data.messages);
    }

    switch (groupBy) {
      case 'date':
        return this.groupByDate(allMessages);
      case 'hour':
        return this.groupByHour(allMessages);
      case 'dayOfWeek':
        return this.groupByDayOfWeek(allMessages);
      default:
        throw new Error(`Invalid groupBy: ${groupBy}`);
    }
  }

  /**
   * 计算成功率
   */
  calculateSuccessRate(messages: ChatMessage[]): SuccessRateAnalysis {
    if (messages.length === 0) {
      return {
        overallSuccessRate: 0,
        successCount: 0,
        errorCount: 0,
        cancelledCount: 0,
        errorDistribution: {},
      };
    }

    const statusCounts: Record<string, number> = {};
    for (const msg of messages) {
      statusCounts[msg.status] = (statusCounts[msg.status] || 0) + 1;
    }

    const successCount = statusCounts['success'] || 0;
    const errorCount = statusCounts['error'] || 0;
    const cancelledCount = statusCounts['cancelled'] || 0;

    return {
      overallSuccessRate: (successCount / messages.length) * 100,
      successCount,
      errorCount,
      cancelledCount,
      errorDistribution: statusCounts,
    };
  }

  /**
   * 计算响应时间统计
   */
  calculateResponseTime(messages: ChatMessage[]): ResponseTimeAnalysis {
    const responseTimes = messages
      .filter(m => m.role === 'assistant' && m.metadata?.duration)
      .map(m => m.metadata!.duration)
      .sort((a, b) => a - b);

    if (responseTimes.length === 0) {
      return {
        average: 0,
        median: 0,
        min: 0,
        max: 0,
        p95: 0,
        p99: 0,
        distribution: [],
      };
    }

    const sum = responseTimes.reduce((a, b) => a + b, 0);
    const avg = sum / responseTimes.length;
    const mid = Math.floor(responseTimes.length / 2);
    const median = responseTimes[mid];
    const min = responseTimes[0];
    const max = responseTimes[responseTimes.length - 1];

    // 计算百分位数
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);
    const p95 = responseTimes[p95Index] || max;
    const p99 = responseTimes[p99Index] || max;

    // 构建分布直方图
    const distribution = this.buildResponseTimeDistribution(responseTimes);

    return {
      average: Math.round(avg),
      median,
      min,
      max,
      p95,
      p99,
      distribution,
    };
  }

  /**
   * 按 Prompt 类型分类
   */
  categorizeMessages(messages: ChatMessage[]): CategoryAnalysis {
    const userMessages = messages.filter(m => m.role === 'user');
    const categoryMap: Record<string, { count: number; examples: string[] }> = {};

    for (const msg of userMessages) {
      const category = this.classifyPrompt(msg.content);
      if (!categoryMap[category]) {
        categoryMap[category] = { count: 0, examples: [] };
      }
      categoryMap[category].count++;
      if (categoryMap[category].examples.length < 3) {
        categoryMap[category].examples.push(msg.content.substring(0, 100));
      }
    }

    const total = userMessages.length;
    const categories: Record<string, CategoryStat> = {};
    const topCategories: CategoryStat[] = [];

    for (const [name, data] of Object.entries(categoryMap)) {
      const stat: CategoryStat = {
        name,
        count: data.count,
        percentage: (data.count / total) * 100,
        examples: data.examples,
      };
      categories[name] = stat;
      topCategories.push(stat);
    }

    // 按数量排序
    topCategories.sort((a, b) => b.count - a.count);

    return { categories, topCategories };
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /**
   * 从数据库提取聊天数据
   */
  private async extractChatData(dbPath: string): Promise<{
    sessions: ChatSession[];
    messages: ChatMessage[];
  }> {
    return this.extractChatDataFromStorage(dbPath);
  }

  /**
   * 从 Workspace Storage 提取数据
   */
  private extractChatDataFromStorage(dbPath: string): {
    sessions: ChatSession[];
    messages: ChatMessage[];
  } {
    const sessions: ChatSession[] = [];
    const messages: ChatMessage[] = [];

    try {
      // 尝试获取聊天会话索引
      const sessionIndex = this.db.getChatSessionIndex(dbPath);

      if (sessionIndex?.entries && typeof sessionIndex.entries === 'object') {
        // 解析会话索引中的数据
        for (const [sessionId, sessionData] of Object.entries(sessionIndex.entries)) {
          if (typeof sessionData === 'object' && sessionData !== null) {
            const data = sessionData as any;
            sessions.push({
              sessionId,
              createdAt: this.parseTimestamp(data.createdAt || data.created_at),
              updatedAt: this.parseTimestamp(data.updatedAt || data.updated_at),
              messageCount: data.messageCount || data.messages?.length || 0,
              messages: [],
              metadata: {
                workspaceId: data.workspaceId,
                customModeId: data.customModeId,
                model: data.model,
                totalTokens: data.totalTokens || 0,
                duration: data.duration || 0,
              },
            });
          }
        }
      }
    } catch (error) {
      console.error('Error extracting chat data:', error);
    }

    return { sessions, messages };
  }

  /**
   * 计算摘要信息
   */
  private calculateSummary(sessions: ChatSession[], messages: ChatMessage[]): ChatSummary {
    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalMessages: 0,
        dateRange: { start: new Date(), end: new Date() },
        averageMessagesPerSession: 0,
      };
    }

    const timestamps = sessions.map(s => s.createdAt.date.getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);

    return {
      totalSessions: sessions.length,
      totalMessages: messages.length,
      dateRange: {
        start: new Date(minTime),
        end: new Date(maxTime),
      },
      averageMessagesPerSession: messages.length / sessions.length,
    };
  }

  /**
   * 分析查询模式
   */
  private analyzePatterns(messages: ChatMessage[]): PatternAnalysis {
    const userMessages = messages.filter(m => m.role === 'user');

    // 高频查询 Top 10
    const queryFreq: Record<string, number> = {};
    for (const msg of userMessages) {
      const key = msg.content.substring(0, 100).toLowerCase();
      queryFreq[key] = (queryFreq[key] || 0) + 1;
    }

    const topQueries: QueryFrequency[] = Object.entries(queryFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([query, count]) => ({
        query,
        count,
        percentage: (count / userMessages.length) * 100,
      }));

    // 每小时活动统计
    const hourlyActivity: HourlyActivity[] = this.groupByHour(userMessages);

    // 每周活动统计
    const dayOfWeekActivity: DayOfWeekStats[] = this.groupByDayOfWeek(userMessages);

    return {
      topQueries,
      peakHours: hourlyActivity,
      dayOfWeekActivity,
    };
  }

  /**
   * 构建时间线数据
   */
  private buildTimeline(messages: ChatMessage[]): TimelineData[] {
    const dailyMap: Record<string, TimelineData> = {};

    for (const msg of messages) {
      const dateKey = msg.timestamp.date.toISOString().split('T')[0];

      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = {
          date: dateKey,
          sessions: new Set<string>().size as any,
          messages: 0,
          tokens: 0,
          errors: 0,
        };
        // 修正 sessions 为 Set 以便追踪唯一会话
        (dailyMap[dateKey] as any)._sessionSet = new Set<string>();
      }

      const entry = dailyMap[dateKey];
      entry.messages++;
      entry.tokens += msg.tokenCount?.total || 0;

      if (msg.status === 'error') {
        entry.errors++;
      }

      (entry as any)._sessionSet.add(msg.sessionId);
      entry.sessions = (entry as any)._sessionSet.size;
    }

    // 清理内部属性并排序
    const result: TimelineData[] = [];
    for (const [dateKey, entry] of Object.entries(dailyMap)) {
      const { _sessionSet, ...rest } = entry as any;
      result.push(rest);
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 按日期分组
   */
  private groupByDate(messages: ChatMessage[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const msg of messages) {
      const date = msg.timestamp.date.toISOString().split('T')[0];
      grouped[date] = (grouped[date] || 0) + 1;
    }
    return grouped;
  }

  /**
   * 按小时分组
   */
  private groupByHour(messages: ChatMessage[]): HourlyActivity[] {
    const hourlyMap: Record<number, { messageCount: number; sessionCount: Set<string> }> = {};

    for (const msg of messages) {
      const hour = msg.timestamp.date.getHours();
      if (!hourlyMap[hour]) {
        hourlyMap[hour] = { messageCount: 0, sessionCount: new Set() };
      }
      hourlyMap[hour].messageCount++;
      hourlyMap[hour].sessionCount.add(msg.sessionId);
    }

    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      messageCount: hourlyMap[hour]?.messageCount || 0,
      sessionCount: hourlyMap[hour]?.sessionCount.size || 0,
    }));
  }

  /**
   * 按星期几分组
   */
  private groupByDayOfWeek(messages: ChatMessage[]): DayOfWeekStats[] {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayMap: Record<number, { messageCount: number; sessionCount: Set<string> }> = {};

    for (const msg of messages) {
      const day = msg.timestamp.date.getDay();
      if (!dayMap[day]) {
        dayMap[day] = { messageCount: 0, sessionCount: new Set() };
      }
      dayMap[day].messageCount++;
      dayMap[day].sessionCount.add(msg.sessionId);
    }

    return Array.from({ length: 7 }, (_, day) => ({
      dayOfWeek: day,
      dayName: dayNames[day],
      messageCount: dayMap[day]?.messageCount || 0,
      sessionCount: dayMap[day]?.sessionCount.size || 0,
    }));
  }

  /**
   * 分类 Prompt
   */
  private classifyPrompt(content: string): string {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('bug') || lowerContent.includes('fix') || lowerContent.includes('error')) {
      return 'Bug修复';
    } else if (lowerContent.includes('implement') || lowerContent.includes('create') || lowerContent.includes('build')) {
      return '功能实现';
    } else if (lowerContent.includes('refactor') || lowerContent.includes('improve') || lowerContent.includes('optimize')) {
      return '代码优化';
    } else if (lowerContent.includes('explain') || lowerContent.includes('what is') || lowerContent.includes('how to')) {
      return '知识咨询';
    } else if (lowerContent.includes('review') || lowerContent.includes('analyze') || lowerContent.includes('check')) {
      return '代码审查';
    } else if (lowerContent.includes('test') || lowerContent.includes('spec') || lowerContent.includes('unit')) {
      return '测试相关';
    } else if (lowerContent.includes('help') || lowerContent.includes('assist') || lowerContent.includes('support')) {
      return '帮助请求';
    } else {
      return '其他';
    }
  }

  /**
   * 构建响应时间分布
   */
  private buildResponseTimeDistribution(times: number[]): Array<{ range: string; count: number }> {
    const ranges = [
      { label: '< 1s', min: 0, max: 1000 },
      { label: '1-3s', min: 1000, max: 3000 },
      { label: '3-5s', min: 3000, max: 5000 },
      { label: '5-10s', min: 5000, max: 10000 },
      { label: '10-30s', min: 10000, max: 30000 },
      { label: '> 30s', min: 30000, max: Infinity },
    ];

    return ranges.map(range => ({
      range: range.label,
      count: times.filter(t => t >= range.min && t < range.max).length,
    }));
  }

  /**
   * 解析时间戳
   */
  private parseTimestamp(timestamp: any): any {
    if (!timestamp) {
      return {
        unix: 0,
        iso: new Date(0).toISOString(),
        date: new Date(0),
      };
    }

    const date = typeof timestamp === 'number'
      ? new Date(timestamp * 1000)
      : new Date(timestamp);

    return {
      unix: Math.floor(date.getTime() / 1000),
      iso: date.toISOString(),
      date,
    };
  }
}
