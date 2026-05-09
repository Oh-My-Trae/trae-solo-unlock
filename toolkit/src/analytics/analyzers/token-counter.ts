/**
 * Token Counter - Token 消耗统计与优化建议工具 (SubTask 10.5)
 * 提供完整的 Token 使用分析和成本估算
 */

import type {
  TokenStatisticsResult,
  TokenSummary,
  TokenBySession,
  TokenByModel,
  TokenByDate,
  CostEstimation,
  ModelCostBreakdown,
  MonthlyProjection,
  YearlyProjection,
  OptimizationSuggestion,
} from '../types.js';
import { DatabaseConnector } from '../db/connector.js';
import { MODEL_PRICING, type OptimizationCategory } from '../types.js';

export class TokenCounter {
  private db: DatabaseConnector;

  constructor(dbConnector: DatabaseConnector) {
    this.db = dbConnector;
  }

  // ============================================================
  // 主要分析方法
  // ============================================================

  /**
   * 执行完整的 Token 统计分析
   */
  async analyze(): Promise<TokenStatisticsResult> {
    const tokenData = this.collectTokenData();

    return {
      summary: this.calculateSummary(tokenData),
      bySession: this.groupBySession(tokenData),
      byModel: this.groupByModel(tokenData),
      byDate: this.groupByDate(tokenData),
      costEstimation: this.estimateCosts(tokenData),
      optimizationSuggestions: this.generateOptimizationSuggestions(tokenData),
    };
  }

  /**
   * 获取 Token 消耗总览
   */
  getSummary(): TokenSummary {
    const tokenData = this.collectTokenData();
    return this.calculateSummary(tokenData);
  }

  /**
   * 按会话/模型/日期分组统计
   */
  getGroupedStatistics(groupBy: 'session' | 'model' | 'date'): any {
    const tokenData = this.collectTokenData();

    switch (groupBy) {
      case 'session':
        return this.groupBySession(tokenData);
      case 'model':
        return this.groupByModel(tokenData);
      case 'date':
        return this.groupByDate(tokenData);
      default:
        throw new Error(`Invalid groupBy: ${groupBy}`);
    }
  }

  /**
   * 成本估算
   */
  estimateCost(): CostEstimation {
    const tokenData = this.collectTokenData();
    return this.estimateCosts(tokenData);
  }

  /**
   * 生成优化建议
   */
  getOptimizationSuggestions(): OptimizationSuggestion[] {
    const tokenData = this.collectTokenData();
    return this.generateOptimizationSuggestions(tokenData);
  }

  // ============================================================
  // 数据收集方法
  // ============================================================

  /**
   * 收集所有 Token 数据
   */
  private collectTokenData(): TokenDataPoint[] {
    const allData: TokenDataPoint[] = [];
    const storages = this.db.getWorkspaceStorages();

    for (const storage of storages) {
      const data = this.extractTokenDataFromStorage(storage.databasePath);
      allData.push(...data);
    }

    return allData;
  }

  /**
   * 从 Workspace Storage 提取 Token 数据
   */
  private extractTokenDataFromStorage(dbPath: string): TokenDataPoint[] {
    const data: TokenDataPoint[] = [];

    try {
      // 尝试从聊天会话索引中提取 Token 信息
      const sessionIndex = this.db.getChatSessionIndex(dbPath);

      if (sessionIndex?.entries && typeof sessionIndex.entries === 'object') {
        for (const [sessionId, sessionData] of Object.entries(sessionIndex.entries)) {
          if (typeof sessionData === 'object' && sessionData !== null) {
            const sd = sessionData as any;

            // 如果会话有 totalTokens，添加为数据点
            if (sd.totalTokens) {
              data.push({
                sessionId,
                inputTokens: Math.floor(sd.totalTokens * 0.7), // 估算：70% 输入
                outputTokens: Math.floor(sd.totalTokens * 0.3), // 估算：30% 输出
                model: sd.model || 'default',
                timestamp: sd.createdAt || sd.created_at || Date.now() / 1000,
                messageCount: sd.messageCount || 1,
              });
            }
          }
        }
      }

      // 尝试从其他存储键中提取信息
      const keys = this.db.getStorageKeys(dbPath);
      const tokenRelatedKeys = keys.filter(k =>
        k.toLowerCase().includes('token') ||
        k.toLowerCase().includes('usage') ||
        k.toLowerCase().includes('cost')
      );

      for (const key of tokenRelatedKeys) {
        const value = this.db.getStorageValue(dbPath, key);

        if (value && typeof value === 'object') {
          // 尝试解析不同格式的数据
          if (value.inputTokens || value.input_tokens) {
            data.push({
              sessionId: key,
              inputTokens: value.inputTokens || value.input_tokens || 0,
              outputTokens: value.outputTokens || value.output_tokens || 0,
              model: value.model || 'default',
              timestamp: value.timestamp || Date.now() / 1000,
              messageCount: 1,
            });
          }
        }
      }
    } catch (error) {
      console.error('Error extracting token data:', error);
    }

    return data;
  }

  // ============================================================
  // 分析方法
  // ============================================================

  /**
   * 计算 Token 摘要
   */
  private calculateSummary(data: TokenDataPoint[]): TokenSummary {
    if (data.length === 0) {
      return {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        averageTokensPerSession: 0,
        averageTokensPerMessage: 0,
        peakUsageDay: '',
        dailyAverage: 0,
      };
    }

    const totalInput = data.reduce((sum, d) => sum + d.inputTokens, 0);
    const totalOutput = data.reduce((sum, d) => sum + d.outputTokens, 0);
    const totalTokens = totalInput + totalOutput;
    const totalMessages = data.reduce((sum, d) => sum + d.messageCount, 0);

    // 计算每日使用量以找到峰值日期
    const dailyUsage: Record<string, number> = {};
    for (const d of data) {
      const dateKey = new Date(d.timestamp * 1000).toISOString().split('T')[0];
      dailyUsage[dateKey] = (dailyUsage[dateKey] || 0) + d.inputTokens + d.outputTokens;
    }

    let peakDay = '';
    let peakUsage = 0;
    for (const [day, usage] of Object.entries(dailyUsage)) {
      if (usage > peakUsage) {
        peakUsage = usage;
        peakDay = day;
      }
    }

    const daysWithData = Object.keys(dailyUsage).length || 1;
    const dailyAverage = Math.round(totalTokens / daysWithData);

    return {
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalTokens,
      averageTokensPerSession: Math.round(totalTokens / data.length),
      averageTokensPerMessage: totalMessages > 0 ? Math.round(totalTokens / totalMessages) : 0,
      peakUsageDay: peakDay,
      dailyAverage,
    };
  }

  /**
   * 按会话分组
   */
  private groupBySession(data: TokenDataPoint[]): TokenBySession[] {
    const sessionMap: Map<string, { input: number; output: number; messages: number; timestamp: number }> = new Map();

    for (const d of data) {
      const existing = sessionMap.get(d.sessionId);

      if (existing) {
        existing.input += d.inputTokens;
        existing.output += d.outputTokens;
        existing.messages += d.messageCount;
        if (d.timestamp > existing.timestamp) {
          existing.timestamp = d.timestamp;
        }
      } else {
        sessionMap.set(d.sessionId, {
          input: d.inputTokens,
          output: d.outputTokens,
          messages: d.messageCount,
          timestamp: d.timestamp,
        });
      }
    }

    return Array.from(sessionMap.entries())
      .map(([sessionId, stats]) => ({
        sessionId,
        inputTokens: stats.input,
        outputTokens: stats.output,
        totalTokens: stats.input + stats.output,
        messageCount: stats.messages,
        date: new Date(stats.timestamp * 1000).toISOString().split('T')[0],
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens);
  }

  /**
   * 按模型分组
   */
  private groupByModel(data: TokenDataPoint[]): TokenByModel[] {
    const modelMap: Map<string, { input: number; output: number; sessions: Set<string> }> = new Map();

    for (const d of data) {
      const existing = modelMap.get(d.model);

      if (existing) {
        existing.input += d.inputTokens;
        existing.output += d.outputTokens;
        existing.sessions.add(d.sessionId);
      } else {
        modelMap.set(d.model, {
          input: d.inputTokens,
          output: d.outputTokens,
          sessions: new Set([d.sessionId]),
        });
      }
    }

    const totalTokens = data.reduce((sum, d) => sum + d.inputTokens + d.outputTokens, 0);
    const pricing = MODEL_PRICING;

    return Array.from(modelMap.entries())
      .map(([model, stats]) => {
        const modelPricing = pricing[model] || pricing['default'];
        const cost = (stats.input / 1000) * modelPricing.input + (stats.output / 1000) * modelPricing.output;

        return {
          model,
          inputTokens: stats.input,
          outputTokens: stats.output,
          totalTokens: stats.input + stats.output,
          sessionCount: stats.sessions.size,
          cost: parseFloat(cost.toFixed(4)),
          percentage: ((stats.input + stats.output) / totalTokens) * 100,
        };
      })
      .sort((a, b) => b.totalTokens - a.totalTokens);
  }

  /**
   * 按日期分组
   */
  private groupByDate(data: TokenDataPoint[], days: number = 30): TokenByDate[] {
    const dateMap: Map<string, { input: number; output: number; sessions: Set<string> }> = new Map();
    const cutoffTime = Date.now() / 1000 - (days * 24 * 60 * 60);

    for (const d of data) {
      if (d.timestamp < cutoffTime) continue;

      const dateKey = new Date(d.timestamp * 1000).toISOString().split('T')[0];
      const existing = dateMap.get(dateKey);

      if (existing) {
        existing.input += d.inputTokens;
        existing.output += d.outputTokens;
        existing.sessions.add(d.sessionId);
      } else {
        dateMap.set(dateKey, {
          input: d.inputTokens,
          output: d.outputTokens,
          sessions: new Set([d.sessionId]),
        });
      }
    }

    const pricing = MODEL_PRICING;

    return Array.from(dateMap.entries())
      .map(([date, stats]) => {
        // 使用默认定价计算成本（因为按日期可能混合多个模型）
        const defaultPricing = pricing['default'];
        const cost = (stats.input / 1000) * defaultPricing.input + (stats.output / 1000) * defaultPricing.output;

        return {
          date,
          inputTokens: stats.input,
          outputTokens: stats.output,
          totalTokens: stats.input + stats.output,
          sessionCount: stats.sessions.size,
          cost: parseFloat(cost.toFixed(4)),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 估算成本
   */
  private estimateCosts(data: TokenDataPoint[]): CostEstimation {
    const byModel = this.groupByModel(data);
    const byDate = this.groupByDate(data, 30);

    const totalCost = byModel.reduce((sum, m) => sum + m.cost, 0);

    const modelCostBreakdown: ModelCostBreakdown[] = byModel.map(m => {
      const pricing = MODEL_PRICING[m.model] || MODEL_PRICING['default'];
      return {
        model: m.model,
        inputCost: parseFloat(((m.inputTokens / 1000) * pricing.input).toFixed(4)),
        outputCost: parseFloat(((m.outputTokens / 1000) * pricing.output).toFixed(4)),
        totalCost: m.cost,
        inputPrice: pricing.input,
        outputPrice: pricing.output,
      };
    });

    // 月度预测
    const currentMonth = byDate.filter(d => {
      const date = new Date(d.date);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });

    const monthCostSoFar = currentMonth.reduce((sum, d) => sum + d.cost, 0);
    const monthTokensSoFar = currentMonth.reduce((sum, d) => sum + d.totalTokens, 0);
    const daysPassed = currentMonth.length;
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const dailyAvgCost = daysPassed > 0 ? monthCostSoFar / daysPassed : 0;
    const dailyAvgTokens = daysPassed > 0 ? monthTokensSoFar / daysPassed : 0;

    const monthlyProjection: MonthlyProjection = {
      currentMonth: { cost: parseFloat(monthCostSoFar.toFixed(4)), tokens: monthTokensSoFar },
      projectedMonthEnd: {
        cost: parseFloat((dailyAvgCost * daysInMonth).toFixed(4)),
        tokens: Math.round(dailyAvgTokens * daysInMonth),
      },
      trend: this.detectTrend(byDate.slice(-7)),
    };

    // 年度预测
    const yearlyProjection: YearlyProjection = {
      projectedAnnualCost: parseFloat((monthlyProjection.projectedMonthEnd.cost * 12).toFixed(4)),
      projectedAnnualTokens: monthlyProjection.projectedMonthEnd.tokens * 12,
      monthlyAverage: monthlyProjection.projectedMonthEnd.cost,
    };

    return {
      totalCost: parseFloat(totalCost.toFixed(4)),
      currency: 'USD',
      byModel: modelCostBreakdown,
      monthlyProjection,
      yearlyProjection,
    };
  }

  /**
   * 生成优化建议
   */
  private generateOptimizationSuggestions(data: TokenDataPoint[]): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    const summary = this.calculateSummary(data);
    const byModel = this.groupByModel(data);

    // 1. 上下文长度优化
    if (summary.averageTokensPerSession > 50000) {
      suggestions.push({
        id: 'opt-1',
        priority: 'high',
        category: 'context_length',
        title: '减少上下文长度',
        description: `当前平均每会话使用 ${this.formatNumber(summary.averageTokensPerSession)} tokens，超过建议的 50K 阈值。`,
        currentImpact: '高成本和延迟',
        potentialSaving: '可减少 20-40% 的 Token 消耗',
        implementation: '定期清理不必要的历史消息，使用摘要代替完整历史',
        difficulty: 'medium',
      });
    }

    // 2. 模型选择优化
    const expensiveModels = byModel.filter(m => {
      const pricing = MODEL_PRICING[m.model];
      return pricing && pricing.input > 0.01;
    });

    if (expensiveModels.length > 0) {
      suggestions.push({
        id: 'opt-2',
        priority: 'medium',
        category: 'model_selection',
        title: '考虑使用更经济的模型',
        description: `发现 ${expensiveModels.map(m => m.model).join(', ')} 等高成本模型在使用。`,
        currentImpact: `高成本模型占总消耗的 ${expensiveModels.reduce((sum, m) => sum + m.percentage, 0).toFixed(1)}%`,
        potentialSaving: '可节省 50-70% 的 API 成本',
        implementation: '对于简单任务使用 GPT-3.5-turbo 或 Claude-3-Sonnet',
        difficulty: 'easy',
      });
    }

    // 3. 缓存建议
    if (data.length > 100) {
      suggestions.push({
        id: 'opt-3',
        priority: 'medium',
        category: 'caching',
        title: '实现响应缓存',
        description: '检测到大量相似的查询模式。',
        currentImpact: '重复查询导致不必要的 Token 消耗',
        potentialSaving: '可减少 15-25% 的重复计算',
        implementation: '对常见问题实现缓存机制，设置合理的 TTL',
        difficulty: 'medium',
      });
    }

    // 4. Prompt 优化
    if (summary.averageTokensPerMessage > 2000) {
      suggestions.push({
        id: 'opt-4',
        priority: 'low',
        category: 'prompt_optimization',
        title: '优化 Prompt 长度',
        description: `平均每个消息使用 ${this.formatNumber(summary.averageTokensPerMessage)} tokens。`,
        currentImpact: '较长的处理时间',
        potentialSaving: '可提升 10-20% 的响应速度',
        implementation: '精简系统提示词，移除冗余说明，使用更简洁的表达',
        difficulty: 'easy',
      });
    }

    // 5. 批处理建议
    if (data.some(d => d.messageCount === 1)) {
      suggestions.push({
        id: 'opt-5',
        priority: 'low',
        category: 'batching',
        title: '批量处理小请求',
        description: '检测到许多单条消息的会话。',
        currentImpact: '频繁的小请求增加开销',
        potentialSaving: '可减少 5-10% 的 API 调用开销',
        implementation: '将相关的小问题合并为一个请求',
        difficulty: 'hard',
      });
    }

    // 6. 监控和告警
    suggestions.push({
      id: 'opt-6',
      priority: 'low',
      category: 'other',
      title: '建立使用监控',
      description: '设置定期的使用报告和成本告警。',
      currentImpact: '无法及时发现异常使用',
      potentialSaving: '避免意外的高额账单',
      implementation: '配置每日/每周使用报告，设置预算阈值告警',
      difficulty: 'easy',
    });

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 检测趋势
   */
  private detectTrend(recentDays: TokenByDate[]): 'increasing' | 'decreasing' | 'stable' {
    if (recentDays.length < 3) return 'stable';

    const firstHalf = recentDays.slice(0, Math.floor(recentDays.length / 2));
    const secondHalf = recentDays.slice(Math.floor(recentDays.length / 2));

    const firstAvg = firstHalf.reduce((sum, d) => sum + d.totalTokens, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, d) => sum + d.totalTokens, 0) / secondHalf.length;

    const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (changePercent > 10) return 'increasing';
    if (changePercent < -10) return 'decreasing';
    return 'stable';
  }

  /**
   * 格式化数字
   */
  private formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }
}

// ============================================================
// 内部类型定义
// ============================================================

interface TokenDataPoint {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  timestamp: number;
  messageCount: number;
}
