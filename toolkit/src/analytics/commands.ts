/**
 * Analytics CLI Commands - 分析工具的命令行接口
 * 提供 solo analyze, solo track, solo stats 等命令
 */

import { Command } from 'commander';
import { AnalyticsEngine } from './index';
import type { ExportFormat, CommandOptions } from './types';

export function registerAnalyticsCommands(program: Command): void {
  // ============================================================
  // 主分析命令: solo analyze
  // ============================================================

  const analyzeCommand = program
    .command('analyze')
    .description('TRAE SOLO CN 数据分析工具集');

  // 子命令: chat - 对话历史分析
  analyzeCommand
    .command('chat')
    .description('对话历史分析 (SubTask 10.3)')
    .option('-r, --recent <number>', '查看最近 N 条对话', '50')
    .option('-p, --pattern', '统计查询模式')
    .option('--by <group>', '按日期/时间/关键词分组 (date|hour|dayOfWeek)', 'date')
    .option('--success-rate', '计算成功率')
    .option('--response-time', '平均响应时间统计')
    .option('-c, --categorize', '按 Prompt 类型分类统计')
    .option('-o, --output <path>', '输出文件路径')
    .option('-f, --format <type>', '输出格式 (console|json|csv|markdown)', 'console')
    .action(async (options) => {
      const engine = new AnalyticsEngine();

      try {
        await engine.initialize();

        if (options.recent) {
          const result = engine.getRecentChats(parseInt(options.recent));
          if (!result.success) {
            console.error('错误:', result.error);
            process.exit(1);
          }
        }

        if (options.pattern || options.by) {
          const result = engine.analyzeByPattern(options.by as any);
          if (!result.success) {
            console.error('错误:', result.error);
            process.exit(1);
          }
        }

        if (options.successRate) {
          const result = engine.getSuccessRate();
          if (!result.success) {
            console.error('错误:', result.error);
            process.exit(1);
          }
        }

        if (options.responseTime) {
          const result = engine.getResponseTime();
          if (!result.success) {
            console.error('错误:', result.error);
            process.exit(1);
          }
        }

        if (options.categorize) {
          const result = engine.categorizePrompts();
          if (!result.success) {
            console.error('错误:', result.error);
            process.exit(1);
          }
        }

        // 如果没有指定具体子选项，执行完整分析
        if (
          !options.recent &&
          !options.pattern &&
          !options.successRate &&
          !options.responseTime &&
          !options.categorize
        ) {
          const cmdOptions: CommandOptions = {
            output: options.output,
            format: options.format as ExportFormat,
          };
          const result = await engine.analyzeChat(cmdOptions);

          if (!result.success) {
            console.error('错误:', result.error);
            process.exit(1);
          }
        }
      } finally {
        engine.destroy();
      }
    });

  // ============================================================
  // 文件追踪命令: solo track
  // ============================================================

  const trackCommand = program
    .command('track')
    .description('代码修改追踪工具 (SubTask 10.4)')
    .alias('files');

  // 热点文件
  trackCommand
    .command('hotspot')
    .description('热点文件排行榜（修改最频繁的文件）')
    .option('-t, --top <number>', '显示 Top N 个文件', '20')
    .action(async (options) => {
      const engine = new AnalyticsEngine();
      try {
        await engine.initialize();
        const result = engine.getHotspotFiles(parseInt(options.top));
        if (!result.success) {
          console.error('错误:', result.error);
          process.exit(1);
        }
      } finally {
        engine.destroy();
      }
    });

  // 时间线
  trackCommand
    .command('timeline')
    .description('按时间段统计修改量')
    .option('-r, --range <days>', '时间范围（天）', '7')
    .action(async (options) => {
      const engine = new AnalyticsEngine();
      try {
        await engine.initialize();
        const result = engine.getModificationTimeline(parseInt(options.range));
        if (!result.success) {
          console.error('错误:', result.error);
          process.exit(1);
        }
      } finally {
        engine.destroy();
      }
    });

  // 文件类型分布
  trackCommand
    .command('type')
    .description('按文件类型分类统计')
    .action(async () => {
      const engine = new AnalyticsEngine();
      try {
        await engine.initialize();
        const result = engine.getFileTypeDistribution();
        if (!result.success) {
          console.error('错误:', result.error);
          process.exit(1);
        }
      } finally {
        engine.destroy();
      }
    });

  // 文件历史
  trackCommand
    .command('history <filePath>')
    .description('查找特定文件的修改历史')
    .action(async (filePath) => {
      const engine = new AnalyticsEngine();
      try {
        await engine.initialize();
        const result = engine.getFileHistory(filePath);
        if (!result.success) {
          console.error('错误:', result.error);
          process.exit(1);
        }
      } finally {
        engine.destroy();
      }
    });

  // 完整分析
  trackCommand
    .command('analyze')
    .description('执行完整的文件追踪分析')
    .option('-o, --output <path>', '输出文件路径')
    .option('-f, --format <type>', '输出格式 (console|json|csv|markdown)', 'console')
    .action(async (options) => {
      const engine = new AnalyticsEngine();

      try {
        await engine.initialize();

        const cmdOptions: CommandOptions = {
          output: options.output,
          format: options.format as ExportFormat,
        };

        const result = await engine.analyzeFiles(cmdOptions);

        if (!result.success) {
          console.error('错误:', result.error);
          process.exit(1);
        }
      } finally {
        engine.destroy();
      }
    });

  // ============================================================
  // Token 统计命令: solo stats
  // ============================================================

  const statsCommand = program
    .command('stats')
    .description('Token 消耗统计与优化建议工具 (SubTask 10.5)')
    .alias('tokens');

  // 总览
  statsCommand
    .command('summary')
    .description('Token 消耗总览')
    .action(async () => {
      const engine = new AnalyticsEngine();
      try {
        await engine.initialize();
        const result = engine.getTokenSummary();
        if (!result.success) {
          console.error('错误:', result.error);
          process.exit(1);
        }
      } finally {
        engine.destroy();
      }
    });

  // 分组统计
  statsCommand
    .command('group-by <group>')
    .description('按会话/模型/日期分组统计')
    .addHelpText('after', '\n可选值: session, model, date')
    .action(async (group) => {
      const engine = new AnalyticsEngine();
      try {
        await engine.initialize();

        const validGroups = ['session', 'model', 'date'];
        if (!validGroups.includes(group)) {
          console.error(`无效的分组方式: ${group}`);
          console.log(`可选值: ${validGroups.join(', ')}`);
          process.exit(1);
        }

        const result = engine.getGroupedStats(group as any);
        if (!result.success) {
          console.error('错误:', result.error);
          process.exit(1);
        }
      } finally {
        engine.destroy();
      }
    });

  // 成本估算
  statsCommand
    .command('cost')
    .description('成本估算（基于模型定价）')
    .action(async () => {
      const engine = new AnalyticsEngine();
      try {
        await engine.initialize();
        const result = engine.getCostEstimation();
        if (!result.success) {
          console.error('错误:', result.error);
          process.exit(1);
        }
      } finally {
        engine.destroy();
      }
    });

  // 优化建议
  statsCommand
    .command('optimize')
    .description('优化建议（识别高消耗模式）')
    .action(async () => {
      const engine = new AnalyticsEngine();
      try {
        await engine.initialize();
        const result = engine.getOptimizationSuggestions();
        if (!result.success) {
          console.error('错误:', result.error);
          process.exit(1);
        }
      } finally {
        engine.destroy();
      }
    });

  // 完整分析
  statsCommand
    .command('analyze')
    .description('执行完整的 Token 统计分析')
    .option('-o, --output <path>', '输出文件路径')
    .option('-f, --format <type>', '输出格式 (console|json|csv|markdown)', 'console')
    .action(async (options) => {
      const engine = new AnalyticsEngine();

      try {
        await engine.initialize();

        const cmdOptions: CommandOptions = {
          output: options.output,
          format: options.format as ExportFormat,
        };

        const result = await engine.analyzeTokens(cmdOptions);

        if (!result.success) {
          console.error('错误:', result.error);
          process.exit(1);
        }
      } finally {
        engine.destroy();
      }
    });

  // ============================================================
  // 仪表板命令: solo dashboard
  // ============================================================

  program
    .command('dashboard')
    .description('启动数据洞察仪表板 (SubTask 10.6)')
    .alias('dash')
    .option('-i, --interval <ms>', '刷新间隔（毫秒）', '300000')
    .option('-t, --theme <theme>', '主题 (light|dark|auto)', 'auto')
    .action(async (options) => {
      const engine = new AnalyticsEngine({
        refreshInterval: parseInt(options.interval),
        theme: options.theme as any,
      });

      try {
        await engine.runDashboard();
      } catch (error) {
        console.error('仪表板运行失败:', error);
        process.exit(1);
      } finally {
        engine.destroy();
      }
    });

  // ============================================================
  // Schema 分析命令
  // ============================================================

  const schemaCommand = program
    .command('schema')
    .description('数据库 Schema 分析工具 (SubTask 10.1 & 10.2)');

  schemaCommand
    .command('ai-agent')
    .description('分析 AI Agent 数据库结构')
    .action(() => {
      const engine = new AnalyticsEngine();
      try {
        engine.analyzeAIAgentDatabaseSchema();
      } finally {
        engine.destroy();
      }
    });

  schemaCommand
    .command('ckg')
    .description('分析 CKG 数据库结构')
    .action(() => {
      const engine = new AnalyticsEngine();
      try {
        engine.analyzeCKGDatabaseSchema();
      } finally {
        engine.destroy();
      }
    });

  schemaCommand
    .command('workspace')
    .description('分析 Workspace Storage 结构')
    .action(async () => {
      const engine = new AnalyticsEngine();
      try {
        await engine.initialize();
        engine.analyzeWorkspaceStorageSchemas();
      } finally {
        engine.destroy();
      }
    });
}
