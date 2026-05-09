/**
 * Console Reporter - 终端输出报告
 * 提供美观的终端格式化输出
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import type {
  ChatAnalysisResult,
  FileTrackingResult,
  TokenStatisticsResult,
  DashboardData,
} from '../types';

export class ConsoleReporter {
  private useColor: boolean;

  constructor(useColor: boolean = true) {
    this.useColor = useColor;
    if (!useColor) {
      chalk.level = 0;
    }
  }

  // ============================================================
  // 聊天分析报告
  // ============================================================

  /**
   * 输出聊天分析报告
   */
  reportChatAnalysis(analysis: ChatAnalysisResult): void {
    console.log('\n' + chalk.bold.cyan('═'.repeat(70)));
    console.log(chalk.bold.cyan('  TRAE SOLO CN - 对话历史分析报告'));
    console.log(chalk.bold.cyan('═'.repeat(70)) + '\n');

    this.printSummary(analysis.summary);
    this.printSuccessRate(analysis.successRate);
    this.printResponseTime(analysis.responseTime);
    this.printPatterns(analysis.patterns);
    this.printCategories(analysis.categories);
    this.printTimeline(analysis.timeline);

    console.log('\n' + chalk.gray('─'.repeat(70)) + '\n');
  }

  /**
   * 打印摘要信息
   */
  private printSummary(summary: any): void {
    console.log(chalk.bold.yellow('📊 总体摘要'));
    console.log(chalk.gray('─'.repeat(40)));

    const table = new Table({
      head: ['指标', '数值'],
      colWidths: [30, 35],
      style: { head: ['cyan'] },
    });

    table.push(
      ['总会话数', summary.totalSessions.toLocaleString()],
      ['总消息数', summary.totalMessages.toLocaleString()],
      ['数据时间范围', `${summary.dateRange.start.toLocaleDateString()} ~ ${summary.dateRange.end.toLocaleDateString()}`],
      ['平均每会话消息数', summary.averageMessagesPerSession.toFixed(1)],
    );

    console.log(table.toString() + '\n');
  }

  /**
   * 打印成功率
   */
  private printSuccessRate(successRate: any): void {
    console.log(chalk.bold.green('✅ 成功率分析'));
    console.log(chalk.gray('─'.repeat(40)));

    const rate = successRate.overallSuccessRate;
    const rateColor = rate >= 90 ? chalk.green : rate >= 70 ? chalk.yellow : chalk.red;
    const emoji = rate >= 90 ? '🎉' : rate >= 70 ? '👍' : '⚠️';

    console.log(`${emoji} 整体成功率: ${rateColor(`${rate.toFixed(1)}%`)}`);

    const table = new Table({
      head: ['状态', '数量', '占比'],
      colWidths: [20, 15, 15],
      style: { head: ['cyan'] },
    });

    for (const [status, count] of Object.entries(successRate.errorDistribution)) {
      const countNum = Number(count) || 0;
      const percentage = ((countNum / (successRate.successCount + successRate.errorCount + successRate.cancelledCount)) * 100).toFixed(1);
      let statusIcon = '';
      switch (status) {
        case 'success': statusIcon = '✅'; break;
        case 'error': statusIcon = '❌'; break;
        case 'cancelled': statusIcon = '⏹️'; break;
        default: statusIcon = '📝';
      }
      table.push([`${statusIcon} ${status}`, countNum.toString(), `${percentage}%`]);
    }

    console.log(table.toString() + '\n');
  }

  /**
   * 打印响应时间
   */
  private printResponseTime(responseTime: any): void {
    console.log(chalk.bold.blue('⏱️ 响应时间统计'));
    console.log(chalk.gray('─'.repeat(40)));

    const formatMs = (ms: number) => {
      if (ms >= 60000) return `${(ms / 60000).toFixed(1)} min`;
      if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
      return `${ms} ms`;
    };

    const table = new Table({
      head: ['指标', '值'],
      colWidths: [25, 20],
      style: { head: ['cyan'] },
    });

    table.push(
      ['平均响应时间', formatMs(responseTime.average)],
      ['中位数响应时间', formatMs(responseTime.median)],
      ['最小响应时间', formatMs(responseTime.min)],
      ['最大响应时间', formatMs(responseTime.max)],
      ['P95 响应时间', formatMs(responseTime.p95)],
      ['P99 响应时间', formatMs(responseTime.p99)],
    );

    console.log(table.toString());

    // 响应时间分布图
    if (responseTime.distribution?.length > 0) {
      console.log('\n响应时间分布:');
      for (const item of responseTime.distribution) {
        const barLength = Math.round((item.count / Math.max(...responseTime.distribution.map(d => d.count))) * 20);
        const bar = '█'.repeat(barLength);
        console.log(`  ${item.range.padEnd(10)} ${chalk.cyan(bar)} ${item.count}`);
      }
    }

    console.log('');
  }

  /**
   * 打印查询模式
   */
  private printPatterns(patterns: any): void {
    console.log(chalk.bold.magenta('🔍 查询模式分析'));
    console.log(chalk.gray('─'.repeat(40)));

    // Top 查询
    if (patterns.topQueries?.length > 0) {
      console.log('\n高频查询 Top 10:');
      const table = new Table({
        head: ['#', '查询内容', '次数', '占比'],
        colWidths: [5, 40, 8, 8],
        style: { head: ['cyan'] },
      });

      patterns.topQueries.forEach((query: any, index: number) => {
        const preview = query.query.length > 37 ? query.query.substring(0, 37) + '...' : query.query;
        table.push([
          (index + 1).toString(),
          preview,
          query.count.toString(),
          `${query.percentage.toFixed(1)}%`,
        ]);
      });

      console.log(table.toString());
    }

    // 每小时活动热力图
    if (patterns.peakHours?.length > 0) {
      console.log('\n每小时活动分布 (24h):');

      const maxActivity = Math.max(...patterns.peakHours.map((h: any) => h.messageCount));
      for (let hour = 0; hour < 24; hour++) {
        const data = patterns.peakHours[hour];
        const intensity = maxActivity > 0 ? data.messageCount / maxActivity : 0;
        const bar = this.getHeatmapBar(intensity);
        console.log(`  ${String(hour).padStart(2, '0')}:00 ${bar} ${data.messageCount} 条消息`);
      }
    }

    console.log('');
  }

  /**
   * 打印分类统计
   */
  private printCategories(categories: any): void {
    console.log(chalk.bold.yellow('📂 Prompt 类型分类'));
    console.log(chalk.gray('─'.repeat(40)));

    if (categories.topCategories?.length > 0) {
      const table = new Table({
        head: ['类型', '数量', '占比', '示例'],
        colWidths: [18, 10, 10, 32],
        style: { head: ['cyan'] },
      });

      categories.topCategories.forEach((cat: any) => {
        const example = cat.examples[0]?.substring(0, 29) || '';
        table.push([
          cat.name,
          cat.count.toString(),
          `${cat.percentage.toFixed(1)}%`,
          example + (cat.examples[0]?.length > 29 ? '...' : ''),
        ]);
      });

      console.log(table.toString() + '\n');
    }
  }

  /**
   * 打印时间线
   */
  private printTimeline(timeline: any[]): void {
    console.log(chalk.bold.cyan('📅 活动时间线'));
    console.log(chalk.gray('─'.repeat(40)));

    if (timeline.length === 0) {
      console.log(chalk.gray('暂无数据\n'));
      return;
    }

    // 只显示最近 14 天
    const recentTimeline = timeline.slice(-14);

    const table = new Table({
      head: ['日期', '会话', '消息', 'Tokens', '错误'],
      colWidths: [12, 8, 10, 12, 8],
      style: { head: ['cyan'] },
    });

    recentTimeline.forEach((entry: any) => {
      const errorStr = entry.errors > 0 ? chalk.red(entry.errors.toString()) : '0';
      table.push([
        entry.date,
        entry.sessions.toString(),
        entry.messages.toString(),
        this.formatNumber(entry.tokens),
        errorStr,
      ]);
    });

    console.log(table.toString() + '\n');
  }

  // ============================================================
  // 文件追踪报告
  // ============================================================

  /**
   * 输出文件追踪报告
   */
  reportFileTracking(tracking: FileTrackingResult): void {
    console.log('\n' + chalk.bold.cyan('═'.repeat(70)));
    console.log(chalk.bold.cyan('  TRAE SOLO CN - 代码修改追踪报告'));
    console.log(chalk.bold.cyan('═'.repeat(70)) + '\n');

    this.printHotspots(tracking.hotspots.slice(0, 20));
    this.printFileTypeDistribution(tracking.fileTypeDistribution);
    this.printChangeStatistics(tracking.changeStatistics);
    this.printFileTimeline(tracking.timeline.slice(-7));

    console.log('\n' + chalk.gray('─'.repeat(70)) + '\n');
  }

  /**
   * 打印热点文件
   */
  private printHotspots(hotspots: any[]): void {
    console.log(chalk.bold.red('🔥 热点文件排行榜 Top 20'));
    console.log(chalk.gray('─'.repeat(40)));

    if (hotspots.length === 0) {
      console.log(chalk.gray('暂无数据\n'));
      return;
    }

    const table = new Table({
      head: ['#', '文件路径', '修改次数', '语言', '净增行数'],
      colWidths: [4, 42, 10, 15, 12],
      style: { head: ['cyan'] },
    });

    hotspots.forEach((file: any, index: number) => {
      const filePath = file.filePath.length > 39 ? file.filePath.substring(0, 39) + '...' : file.filePath;
      const netChange = file.estimatedChanges.netChange >= 0
        ? `+${file.estimatedChanges.netChange}`
        : file.estimatedChanges.netChange.toString();

      table.push([
        (index + 1).toString(),
        filePath,
        file.modificationCount.toString(),
        file.language,
        netChange,
      ]);
    });

    console.log(table.toString() + '\n');
  }

  /**
   * 打印文件类型分布
   */
  private printFileTypeDistribution(distribution: any): void {
    console.log(chalk.bold.green('📁 文件类型分布'));
    console.log(chalk.gray('─'.repeat(40)));

    if (!distribution.sorted || distribution.sorted.length === 0) {
      console.log(chalk.gray('暂无数据\n'));
      return;
    }

    const table = new Table({
      head: ['扩展名', '语言', '文件数', '修改次数', '占比'],
      colWidths: [10, 18, 10, 12, 10],
      style: { head: ['cyan'] },
    });

    distribution.sorted.forEach((type: any) => {
      table.push([
        type.extension || '(无)',
        type.language,
        type.fileCount.toString(),
        type.modificationCount.toString(),
        `${type.percentage.toFixed(1)}%`,
      ]);
    });

    console.log(table.toString() + '\n');
  }

  /**
   * 打印变更统计
   */
  private printChangeStatistics(stats: any): void {
    console.log(chalk.bold.blue('📈 变更统计概览'));
    console.log(chalk.gray('─'.repeat(40)));

    const table = new Table({
      head: ['指标', '数值'],
      colWidths: [30, 35],
      style: { head: ['cyan'] },
    });

    table.push(
      ['总修改次数', stats.totalModifications.toLocaleString()],
      ['影响文件总数', stats.totalFilesAffected.toLocaleString()],
      ['平均每文件修改次数', stats.averageModificationsPerFile.toFixed(1)],
      ['最活跃日期', stats.mostActiveDay || 'N/A'],
    );

    console.log(table.toString() + '\n');
  }

  /**
   * 打印文件时间线
   */
  private printFileTimeline(timeline: any[]): void {
    console.log(chalk.bold.magenta('📅 近 7 天修改时间线'));
    console.log(chalk.gray('─'.repeat(40)));

    if (timeline.length === 0) {
      console.log(chalk.gray('暂无数据\n'));
      return;
    }

    const table = new Table({
      head: ['日期', '修改文件数', '修改次数', 'Top 文件'],
      colWidths: [12, 14, 12, 32],
      style: { head: ['cyan'] },
    });

    timeline.forEach((entry: any) => {
      const topFiles = entry.topFiles?.slice(0, 3).map((f: string) =>
        f.split('/').pop()?.substring(0, 15)
      ).join(', ') || '';

      table.push([
        entry.date,
        entry.filesModified.toString(),
        entry.modifications.toString(),
        topFiles,
      ]);
    });

    console.log(table.toString() + '\n');
  }

  // ============================================================
  // Token 统计报告
  // ============================================================

  /**
   * 输出 Token 统计报告
   */
  reportTokenStats(stats: TokenStatisticsResult): void {
    console.log('\n' + chalk.bold.cyan('═'.repeat(70)));
    console.log(chalk.bold.cyan('  TRAE SOLO CN - Token 消耗统计报告'));
    console.log(chalk.bold.cyan('═'.repeat(70)) + '\n');

    this.printTokenSummary(stats.summary);
    this.printTokenByModel(stats.byModel);
    this.printCostEstimation(stats.costEstimation);
    this.printOptimizationSuggestions(stats.optimizationSuggestions);

    console.log('\n' + chalk.gray('─'.repeat(70)) + '\n');
  }

  /**
   * 打印 Token 摘要
   */
  private printTokenSummary(summary: any): void {
    console.log(chalk.bold.yellow('💰 Token 消耗总览'));
    console.log(chalk.gray('─'.repeat(40)));

    const table = new Table({
      head: ['指标', '数值'],
      colWidths: [30, 35],
      style: { head: ['cyan'] },
    });

    table.push(
      ['总输入 Tokens', this.formatNumber(summary.totalInputTokens)],
      ['总输出 Tokens', this.formatNumber(summary.totalOutputTokens)],
      ['总消耗 Tokens', this.formatNumber(summary.totalTokens)],
      ['平均每会话 Tokens', this.formatNumber(summary.averageTokensPerSession)],
      ['平均每消息 Tokens', this.formatNumber(summary.averageTokensPerMessage)],
      ['日均消耗', this.formatNumber(summary.dailyAverage)],
      ['峰值使用日期', summary.peakUsageDay || 'N/A'],
    );

    console.log(table.toString() + '\n');
  }

  /**
   * 按模型打印
   */
  private printTokenByModel(byModel: any[]): void {
    console.log(chalk.bold.blue('🤖 按模型分组统计'));
    console.log(chalk.gray('─'.repeat(40)));

    if (byModel.length === 0) {
      console.log(chalk.gray('暂无数据\n'));
      return;
    }

    const table = new Table({
      head: ['模型', '输入 Tokens', '输出 Tokens', '总计', '成本', '占比'],
      colWidths: [18, 14, 14, 14, 12, 10],
      style: { head: ['cyan'] },
    });

    byModel.forEach((model: any) => {
      table.push([
        model.model,
        this.formatNumber(model.inputTokens),
        this.formatNumber(model.outputTokens),
        this.formatNumber(model.totalTokens),
        `$${model.cost.toFixed(2)}`,
        `${model.percentage.toFixed(1)}%`,
      ]);
    });

    console.log(table.toString() + '\n');
  }

  /**
   * 打印成本估算
   */
  private printCostEstimation(cost: any): void {
    console.log(chalk.bold.green('💵 成本估算'));
    console.log(chalk.gray('─'.repeat(40)));

    const table = new Table({
      head: ['项目', '金额 / 数量'],
      colWidths: [30, 35],
      style: { head: ['cyan'] },
    });

    table.push(
      [`总成本 (${cost.currency})`, `$${cost.totalCost.toFixed(2)}`],
      ['本月已用', `$${cost.monthlyProjection.currentMonth.cost.toFixed(2)} (${this.formatNumber(cost.monthlyProjection.currentMonth.tokens)} tokens)`],
      ['本月预计', `$${cost.monthlyProjection.projectedMonthEnd.cost.toFixed(2)} (${this.formatNumber(cost.monthlyProjection.projectedMonthEnd.tokens)} tokens)`],
      ['趋势', this.getTrendEmoji(cost.monthlyProjection.trend)],
      ['年度预计成本', `$${cost.yearlyProjection.projectedAnnualCost.toFixed(2)}`],
      ['年度预计 Tokens', this.formatNumber(cost.yearlyProjection.projectedAnnualTokens)],
    );

    console.log(table.toString());

    // 模型成本明细
    if (cost.byModel?.length > 0) {
      console.log('\n模型成本明细:');
      const costTable = new Table({
        head: ['模型', '输入成本', '输出成本', '总成本', '单价($/1K)'],
        colWidths: [18, 12, 12, 12, 16],
        style: { head: ['cyan'] },
      });

      cost.byModel.forEach((model: any) => {
        costTable.push([
          model.model,
          `$${model.inputCost.toFixed(4)}`,
          `$${model.outputCost.toFixed(4)}`,
          `$${model.totalCost.toFixed(4)}`,
          `In: $${model.inputPrice} / Out: $${model.outputPrice}`,
        ]);
      });

      console.log(costTable.toString());
    }

    console.log('');
  }

  /**
   * 打印优化建议
   */
  private printOptimizationSuggestions(suggestions: any[]): void {
    console.log(chalk.bold.magenta('💡 优化建议'));
    console.log(chalk.gray('─'.repeat(40)));

    if (suggestions.length === 0) {
      console.log(chalk.green('✨ 当前使用状况良好，无需优化！\n'));
      return;
    }

    suggestions.forEach((suggestion: any, index: number) => {
      const priorityColor = {
        high: chalk.red,
        medium: chalk.yellow,
        low: chalk.blue,
      }[suggestion.priority] || chalk.white;

      const difficultyEmoji = {
        easy: '⭐',
        medium: '⭐⭐',
        hard: '⭐⭐⭐',
      }[suggestion.difficulty] || '❓';

      console.log(`\n${index + 1}. ${priorityColor(`[${suggestion.priority.toUpperCase()}]`)} ${suggestion.title}`);
      console.log(`   ${chalk.gray(suggestion.description)}`);
      console.log(`   影响: ${chalk.yellow(suggestion.currentImpact)}`);
      console.log(`   潜在节省: ${chalk.green(suggestion.potentialSaving)}`);
      console.log(`   建议: ${chalk.cyan(suggestion.implementation)}`);
      console.log(`   难度: ${difficultyEmoji}`);
    });

    console.log('');
  }

  // ============================================================
  // 仪表板报告
  // ============================================================

  /**
   * 输出仪表板数据
   */
  reportDashboard(data: DashboardData): void {
    console.log('\n' + chalk.bold.cyan('═'.repeat(70)));
    console.log(chalk.bold.cyan('  TRAE SOLO CN - 数据洞察仪表板'));
    console.log(chalk.bold.cyan('═'.repeat(70)));
    console.log(chalk.gray(`\n最后更新: ${data.lastUpdated?.iso || new Date().toISOString()}\n`));

    // 数据源状态
    console.log(chalk.bold('📡 数据源状态:'));
    data.dataSources?.forEach(source => {
      const status = source.connected ? chalk.green('● 已连接') : chalk.red('● 断开');
      console.log(`  ${status} ${source.name} (${source.recordCount} 条记录)`);
    });

    // 快速预览
    if (data.chatAnalysis) {
      this.printQuickPreview('对话分析', [
        [`总会话`, data.chatAnalysis.summary.totalSessions.toString()],
        [`总消息`, data.chatAnalysis.summary.totalMessages.toString()],
        [`成功率`, `${data.chatAnalysis.successRate.overallSuccessRate.toFixed(1)}%`],
      ]);
    }

    if (data.fileTracking) {
      this.printQuickPreview('文件追踪', [
        [`总修改`, data.fileTracking.changeStatistics.totalModifications.toString()],
        [`影响文件`, data.fileTracking.changeStatistics.totalFilesAffected.toString()],
        [`最活跃日`, data.fileTracking.changeStatistics.mostActiveDay || 'N/A'],
      ]);
    }

    if (data.tokenStats) {
      this.printQuickPreview('Token 统计', [
        [`总消耗`, this.formatNumber(data.tokenStats.summary.totalTokens)],
        [`总成本`, `$${data.tokenStats.costEstimation.totalCost.toFixed(2)}`],
        [`日均`, this.formatNumber(data.tokenStats.summary.dailyAverage)],
      ]);
    }

    console.log('\n' + chalk.gray('─'.repeat(70)) + '\n');
  }

  /**
   * 打印快速预览卡片
   */
  private printQuickPreview(title: string, items: Array<[string, string]>): void {
    console.log(`\n${chalk.bold(title)}:`);
    items.forEach(([label, value]) => {
      console.log(`  ${chalk.cyan(label.padEnd(12))} ${value}`);
    });
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 获取热力图条形
   */
  private getHeatmapBar(intensity: number): string {
    if (intensity === 0) return chalk.gray('░'.repeat(20));
    if (intensity < 0.2) return chalk.blue('▒'.repeat(Math.ceil(intensity * 100)) + '░'.repeat(20 - Math.ceil(intensity * 100)));
    if (intensity < 0.5) return chalk.green('▓'.repeat(Math.ceil(intensity * 100)) + '░'.repeat(20 - Math.ceil(intensity * 100)));
    if (intensity < 0.8) return chalk.yellow('█'.repeat(Math.ceil(intensity * 100)) + '░'.repeat(20 - Math.ceil(intensity * 100)));
    return chalk.red('█'.repeat(20));
  }

  /**
   * 获取趋势表情
   */
  private getTrendEmoji(trend: string): string {
    switch (trend) {
      case 'increasing': return chalk.red('📈 上升');
      case 'decreasing': return chalk.green('📉 下降');
      default: return chalk.gray('➡️ 稳定');
    }
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

