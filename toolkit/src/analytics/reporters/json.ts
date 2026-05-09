/**
 * JSON/CSV Reporter - 数据导出功能
 * 支持导出为 JSON、CSV、Markdown 格式
 */

import fs from 'fs';
import path from 'path';
import type {
  ChatAnalysisResult,
  FileTrackingResult,
  TokenStatisticsResult,
  ExportFormat,
} from '../types';

export class DataExporter {
  /**
   * 导出聊天分析数据
   */
  exportChatAnalysis(analysis: ChatAnalysisResult, format: ExportFormat, outputPath: string): void {
    const data = this.prepareChatAnalysisData(analysis);

    switch (format) {
      case 'json':
        this.exportJSON(data, outputPath);
        break;
      case 'csv':
        this.exportChatAnalysisCSV(analysis, outputPath);
        break;
      case 'markdown':
        this.exportChatAnalysisMarkdown(analysis, outputPath);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    console.log(`✅ 聊天分析数据已导出到: ${outputPath}`);
  }

  /**
   * 导出文件追踪数据
   */
  exportFileTracking(tracking: FileTrackingResult, format: ExportFormat, outputPath: string): void {
    const data = this.prepareFileTrackingData(tracking);

    switch (format) {
      case 'json':
        this.exportJSON(data, outputPath);
        break;
      case 'csv':
        this.exportFileTrackingCSV(tracking, outputPath);
        break;
      case 'markdown':
        this.exportFileTrackingMarkdown(tracking, outputPath);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    console.log(`✅ 文件追踪数据已导出到: ${outputPath}`);
  }

  /**
   * 导出 Token 统计数据
   */
  exportTokenStats(stats: TokenStatisticsResult, format: ExportFormat, outputPath: string): void {
    const data = this.prepareTokenStatsData(stats);

    switch (format) {
      case 'json':
        this.exportJSON(data, outputPath);
        break;
      case 'csv':
        this.exportTokenStatsCSV(stats, outputPath);
        break;
      case 'markdown':
        this.exportTokenStatsMarkdown(stats, outputPath);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    console.log(`✅ Token 统计数据已导出到: ${outputPath}`);
  }

  // ============================================================
  // JSON 导出
  // ============================================================

  /**
   * 导出为 JSON
   */
  private exportJSON(data: any, outputPath: string): void {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  // ============================================================
  // CSV 导出
  // ============================================================

  /**
   * 导出聊天分析 CSV
   */
  private exportChatAnalysisCSV(analysis: ChatAnalysisResult, outputPath: string): void {
    const lines: string[] = [];

    // 摘要信息
    lines.push('# Chat Analysis Summary');
    lines.push('Metric,Value');
    lines.push(`Total Sessions,${analysis.summary.totalSessions}`);
    lines.push(`Total Messages,${analysis.summary.totalMessages}`);
    lines.push(`Start Date,${analysis.summary.dateRange.start.toISOString()}`);
    lines.push(`End Date,${analysis.summary.dateRange.end.toISOString()}`);
    lines.push(`Avg Messages per Session,${analysis.summary.averageMessagesPerSession}`);
    lines.push('');

    // 成功率
    lines.push('# Success Rate');
    lines.push('Status,Count,Percentage');
    for (const [status, count] of Object.entries(analysis.successRate.errorDistribution)) {
      const total = analysis.successRate.successCount + analysis.successRate.errorCount + analysis.successRate.cancelledCount;
      lines.push(`${status},${count},${((count / total) * 100).toFixed(2)}%`);
    }
    lines.push('');

    // 时间线
    lines.push('# Timeline');
    lines.push('Date,Sessions,Messages,Tokens,Errors');
    for (const entry of analysis.timeline) {
      lines.push(`${entry.date},${entry.sessions},${entry.messages},${entry.tokens},${entry.errors}`);
    }

    this.writeToFile(lines.join('\n'), outputPath);
  }

  /**
   * 导出文件追踪 CSV
   */
  private exportFileTrackingCSV(tracking: FileTrackingResult, outputPath: string): void {
    const lines: string[] = [];

    // 热点文件
    lines.push('# Hotspot Files');
    lines.push('Rank,FilePath,ModificationCount,Language,LinesAdded,LinesRemoved,NetChange');
    tracking.hotspots.forEach((file, index) => {
      lines.push(`${index + 1},"${file.filePath}",${file.modificationCount},${file.language},${file.estimatedChanges.linesAdded},${file.estimatedChanges.linesRemoved},${file.estimatedChanges.netChange}`);
    });
    lines.push('');

    // 文件类型分布
    lines.push('# File Type Distribution');
    lines.push('Extension,Language,FileCount,ModificationCount,Percentage');
    tracking.fileTypeDistribution.sorted.forEach(type => {
      lines.push(`${type.extension || '(none)'},${type.language},${type.fileCount},${type.modificationCount},${type.percentage.toFixed(2)}%`);
    });
    lines.push('');

    // 时间线
    lines.push('# Timeline');
    lines.push('Date,FilesModified,Modifications');
    tracking.timeline.forEach(entry => {
      lines.push(`${entry.date},${entry.filesModified},${entry.modifications}`);
    });

    this.writeToFile(lines.join('\n'), outputPath);
  }

  /**
   * 导出 Token 统计 CSV
   */
  private exportTokenStatsCSV(stats: TokenStatisticsResult, outputPath: string): void {
    const lines: string[] = [];

    // 摘要
    lines.push('# Token Summary');
    lines.push('Metric,Value');
    lines.push(`Total Input Tokens,${stats.summary.totalInputTokens}`);
    lines.push(`Total Output Tokens,${stats.summary.totalOutputTokens}`);
    lines.push(`Total Tokens,${stats.summary.totalTokens}`);
    lines.push(`Avg Tokens per Session,${stats.summary.averageTokensPerSession}`);
    lines.push(`Avg Tokens per Message,${stats.summary.averageTokensPerMessage}`);
    lines.push(`Daily Average,${stats.summary.dailyAverage}`);
    lines.push(`Peak Usage Day,${stats.summary.peakUsageDay}`);
    lines.push('');

    // 按模型统计
    lines.push('# By Model');
    lines.push('Model,InputTokens,OutputTokens,TotalTokens,SessionCount,Cost,Percentage');
    stats.byModel.forEach(model => {
      lines.push(`${model.model},${model.inputTokens},${model.outputTokens},${model.totalTokens},${model.sessionCount},${model.cost.toFixed(4)},${model.percentage.toFixed(2)}%`);
    });
    lines.push('');

    // 按日期统计
    lines.push('# By Date');
    lines.push('Date,InputTokens,OutputTokens,TotalTokens,SessionCount,Cost');
    stats.byDate.forEach(date => {
      lines.push(`${date.date},${date.inputTokens},${date.outputTokens},${date.totalTokens},${date.sessionCount},${date.cost.toFixed(4)}`);
    });
    lines.push('');

    // 成本估算
    lines.push('# Cost Estimation');
    lines.push('Item,Value');
    lines.push(`Total Cost (${stats.costEstimation.currency}),$${stats.costEstimation.totalCost.toFixed(2)}`);
    lines.push(`Current Month Cost,$${stats.costEstimation.monthlyProjection.currentMonth.cost.toFixed(2)}`);
    lines.push(`Projected Month End Cost,$${stats.costEstimation.monthlyProjection.projectedMonthEnd.cost.toFixed(2)}`);
    lines.push(`Trend,${stats.costEstimation.monthlyProjection.trend}`);
    lines.push(`Projected Annual Cost,$${stats.costEstimation.yearlyProjection.projectedAnnualCost.toFixed(2)}`);

    this.writeToFile(lines.join('\n'), outputPath);
  }

  // ============================================================
  // Markdown 导出
  // ============================================================

  /**
   * 导出聊天分析 Markdown
   */
  private exportChatAnalysisMarkdown(analysis: ChatAnalysisResult, outputPath: string): void {
    const md: string[] = [];

    md.push('# TRAE SOLO CN - 对话历史分析报告');
    md.push('');
    md.push(`> 报告生成时间: ${new Date().toISOString()}`);
    md.push('');

    // 摘要
    md.push('## 📊 总体摘要');
    md.push('');
    md.push('| 指标 | 数值 |');
    md.push('|------|------|');
    md.push(`| 总会话数 | ${analysis.summary.totalSessions} |`);
    md.push(`| 总消息数 | ${analysis.summary.totalMessages} |`);
    md.push(`| 平均每会话消息数 | ${analysis.summary.averageMessagesPerSession.toFixed(1)} |`);
    md.push('');

    // 成功率
    md.push('## ✅ 成功率分析');
    md.push('');
    md.push(`整体成功率: **${analysis.successRate.overallSuccessRate.toFixed(1)}%**`);
    md.push('');
    md.push('| 状态 | 数量 | 占比 |');
    md.push('|------|------|------|');

    const total = analysis.successRate.successCount + analysis.successRate.errorCount + analysis.successRate.cancelledCount;
    for (const [status, count] of Object.entries(analysis.successRate.errorDistribution)) {
      md.push(`| ${status} | ${count} | ${((count / total) * 100).toFixed(1)}% |`);
    }
    md.push('');

    // 响应时间
    md.push('## ⏱️ 响应时间统计');
    md.push('');
    md.push('| 指标 | 值 |');
    md.push('|------|-----|');
    md.push(`| 平均响应时间 | ${this.formatDuration(analysis.responseTime.average)} |`);
    md.push(`| 中位数响应时间 | ${this.formatDuration(analysis.responseTime.median)} |`);
    md.push(`| 最小响应时间 | ${this.formatDuration(analysis.responseTime.min)} |`);
    md.push(`| 最大响应时间 | ${this.formatDuration(analysis.responseTime.max)} |`);
    md.push(`| P95 响应时间 | ${this.formatDuration(analysis.responseTime.p95)} |`);
    md.push(`| P99 响应时间 | ${this.formatDuration(analysis.responseTime.p99)} |`);
    md.push('');

    // Top 查询
    if (analysis.patterns.topQueries?.length > 0) {
      md.push('## 🔍 高频查询 Top 10');
      md.push('');
      md.push('# | 查询内容 | 次数 | 占比 |');
      md.push('--|---------|------|------|');

      analysis.patterns.topQueries.forEach((query, index) => {
        md.push(`${index + 1} | ${query.query.substring(0, 50)}... | ${query.count} | ${query.percentage.toFixed(1)}% |`);
      });
      md.push('');
    }

    // 分类统计
    if (analysis.categories.topCategories?.length > 0) {
      md.push('## 📂 Prompt 类型分类');
      md.push('');
      md.push('| 类型 | 数量 | 占比 |');
      md.push('|------|------|------|');

      analysis.categories.topCategories.forEach(cat => {
        md.push(`| ${cat.name} | ${cat.count} | ${cat.percentage.toFixed(1)}% |`);
      });
      md.push('');
    }

    // 时间线
    if (analysis.timeline.length > 0) {
      md.push('## 📅 最近活动时间线');
      md.push('');
      md.push('| 日期 | 会话数 | 消息数 | Tokens | 错误数 |');
      md.push('|------|--------|--------|--------|--------|');

      analysis.timeline.slice(-14).forEach(entry => {
        md.push(`| ${entry.date} | ${entry.sessions} | ${entry.messages} | ${entry.tokens} | ${entry.errors} |`);
      });
      md.push('');
    }

    this.writeToFile(md.join('\n'), outputPath);
  }

  /**
   * 导出文件追踪 Markdown
   */
  private exportFileTrackingMarkdown(tracking: FileTrackingResult, outputPath: string): void {
    const md: string[] = [];

    md.push('# TRAE SOLO CN - 代码修改追踪报告');
    md.push('');
    md.push(`> 报告生成时间: ${new Date().toISOString()}`);
    md.push('');

    // 统计概览
    md.push('## 📈 变更统计概览');
    md.push('');
    md.push('| 指标 | 数值 |');
    md.push('|------|------|');
    md.push(`| 总修改次数 | ${tracking.changeStatistics.totalModifications.toLocaleString()} |`);
    md.push(`| 影响文件总数 | ${tracking.changeStatistics.totalFilesAffected.toLocaleString()} |`);
    md.push(`| 平均每文件修改次数 | ${tracking.changeStatistics.averageModificationsPerFile.toFixed(1)} |`);
    md.push(`| 最活跃日期 | ${tracking.changeStatistics.mostActiveDay || 'N/A'} |`);
    md.push('');

    // 热点文件
    md.push('## 🔥 热点文件排行榜 Top 20');
    md.push('');
    md.push('# | 文件路径 | 修改次数 | 语言 | 净增行数 |');
    md.push('--|---------|----------|------|----------|');

    tracking.hotspots.slice(0, 20).forEach((file, index) => {
      const netChange = file.estimatedChanges.netChange >= 0
        ? `+${file.estimatedChanges.netChange}`
        : file.estimatedChanges.netChange.toString();
      md.push(`${index + 1} | \`${file.filePath}\` | ${file.modificationCount} | ${file.language} | ${netChange} |`);
    });
    md.push('');

    // 文件类型分布
    md.push('## 📁 文件类型分布');
    md.push('');
    md.push('| 扩展名 | 语言 | 文件数 | 修改次数 | 占比 |');
    md.push('|--------|------|--------|----------|------|');

    tracking.fileTypeDistribution.sorted.forEach(type => {
      md.push(`| ${type.extension || '(无)'} | ${type.language} | ${type.fileCount} | ${type.modificationCount} | ${type.percentage.toFixed(1)}% |`);
    });
    md.push('');

    // 时间线
    if (tracking.timeline.length > 0) {
      md.push('## 📅 近 7 天修改时间线');
      md.push('');
      md.push('| 日期 | 修改文件数 | 修改次数 |');
      md.push('|------|-----------|----------|');

      tracking.timeline.slice(-7).forEach(entry => {
        md.push(`| ${entry.date} | ${entry.filesModified} | ${entry.modifications} |`);
      });
      md.push('');
    }

    this.writeToFile(md.join('\n'), outputPath);
  }

  /**
   * 导出 Token 统计 Markdown
   */
  private exportTokenStatsMarkdown(stats: TokenStatisticsResult, outputPath: string): void {
    const md: string[] = [];

    md.push('# TRAE SOLO CN - Token 消耗统计报告');
    md.push('');
    md.push(`> 报告生成时间: ${new Date().toISOString()}`);
    md.push('');

    // 摘要
    md.push('## 💰 Token 消耗总览');
    md.push('');
    md.push('| 指标 | 数值 |');
    md.push('|------|------|');
    md.push(`| 总输入 Tokens | ${this.formatNumber(stats.summary.totalInputTokens)} |`);
    md.push(`| 总输出 Tokens | ${this.formatNumber(stats.summary.totalOutputTokens)} |`);
    md.push(`| 总消耗 Tokens | ${this.formatNumber(stats.summary.totalTokens)} |`);
    md.push(`| 平均每会话 Tokens | ${this.formatNumber(stats.summary.averageTokensPerSession)} |`);
    md.push(`| 平均每消息 Tokens | ${this.formatNumber(stats.summary.averageTokensPerMessage)} |`);
    md.push(`| 日均消耗 | ${this.formatNumber(stats.summary.dailyAverage)} |`);
    md.push(`| 峰值使用日期 | ${stats.summary.peakUsageDay || 'N/A'} |`);
    md.push('');

    // 按模型统计
    md.push('## 🤖 按模型分组统计');
    md.push('');
    md.push('| 模型 | 输入 Tokens | 输出 Tokens | 总计 | 成本 | 占比 |');
    md.push('|------|-----------|-----------|------|------|------|');

    stats.byModel.forEach(model => {
      md.push(`| ${model.model} | ${this.formatNumber(model.inputTokens)} | ${this.formatNumber(model.outputTokens)} | ${this.formatNumber(model.totalTokens)} | $${model.cost.toFixed(2)} | ${model.percentage.toFixed(1)}% |`);
    });
    md.push('');

    // 成本估算
    md.push('## 💵 成本估算');
    md.push('');
    md.push(`总成本 (**${stats.costEstimation.currency}**): **$${stats.costEstimation.totalCost.toFixed(2)}**`);
    md.push('');
    md.push('| 项目 | 金额 / 数量 |');
    md.push('|------|------------|');
    md.push(`| 本月已用 | $${stats.costEstimation.monthlyProjection.currentMonth.cost.toFixed(2)} (${this.formatNumber(stats.costEstimation.monthlyProjection.currentMonth.tokens)} tokens) |`);
    md.push(`| 本月预计 | $${stats.costEstimation.monthlyProjection.projectedMonthEnd.cost.toFixed(2)} (${this.formatNumber(stats.costEstimation.monthlyProjection.projectedMonthEnd.tokens)} tokens) |`);
    md.push(`| 趋势 | ${stats.costEstimation.monthlyProjection.trend === 'increasing' ? '📈 上升' : stats.costEstimation.monthlyProjection.trend === 'decreasing' ? '📉 下降' : '➡️ 稳定'} |`);
    md.push(`| 年度预计成本 | $${stats.costEstimation.yearlyProjection.projectedAnnualCost.toFixed(2)} |`);
    md.push(`| 年度预计 Tokens | ${this.formatNumber(stats.costEstimation.yearlyProjection.projectedAnnualTokens)} |`);
    md.push('');

    // 优化建议
    if (stats.optimizationSuggestions.length > 0) {
      md.push('## 💡 优化建议');
      md.push('');

      stats.optimizationSuggestions.forEach((suggestion, index) => {
        const priorityEmoji = suggestion.priority === 'high' ? '🔴' : suggestion.priority === 'medium' ? '🟡' : '🔵';
        md.push(`### ${index + 1}. ${priorityEmoji} ${suggestion.title}`);
        md.push('');
        md.push(`- **优先级**: ${suggestion.priority.toUpperCase()}`);
        md.push(`- **描述**: ${suggestion.description}`);
        md.push(`- **当前影响**: ${suggestion.currentImpact}`);
        md.push(`- **潜在节省**: ${suggestion.potentialSaving}`);
        md.push(`- **建议方案**: ${suggestion.implementation}`);
        md.push(`- **实施难度**: ${'⭐'.repeat(suggestion.difficulty === 'easy' ? 1 : suggestion.difficulty === 'medium' ? 2 : 3)}`);
        md.push('');
      });
    } else {
      md.push('## 💡 优化建议');
      md.push('');
      md.push('✨ 当前使用状况良好，无需优化！');
      md.push('');
    }

    this.writeToFile(md.join('\n'), outputPath);
  }

  // ============================================================
  // 数据准备方法
  // ============================================================

  /**
   * 准备聊天分析数据
   */
  private prepareChatAnalysisData(analysis: ChatAnalysisResult): any {
    return {
      type: 'chat-analysis',
      generatedAt: new Date().toISOString(),
      summary: analysis.summary,
      successRate: analysis.successRate,
      responseTime: analysis.responseTime,
      patterns: analysis.patterns,
      categories: analysis.categories,
      timeline: analysis.timeline,
    };
  }

  /**
   * 准备文件追踪数据
   */
  private prepareFileTrackingData(tracking: FileTrackingResult): any {
    return {
      type: 'file-tracking',
      generatedAt: new Date().toISOString(),
      hotspots: tracking.hotspots,
      timeline: tracking.timeline,
      fileTypeDistribution: tracking.fileTypeDistribution,
      changeStatistics: tracking.changeStatistics,
    };
  }

  /**
   * 准备 Token 统计数据
   */
  private prepareTokenStatsData(stats: TokenStatisticsResult): any {
    return {
      type: 'token-statistics',
      generatedAt: new Date().toISOString(),
      summary: stats.summary,
      bySession: stats.bySession,
      byModel: stats.byModel,
      byDate: stats.byDate,
      costEstimation: stats.costEstimation,
      optimizationSuggestions: stats.optimizationSuggestions,
    };
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 写入文件
   */
  private writeToFile(content: string, outputPath: string): void {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, content, 'utf-8');
  }

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
