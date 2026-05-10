/**
 * Closed-Loop Validation System - Analysis Decision Engine (A3)
 *
 * 分析决策引擎，负责：
 * A3.1: 性能基线对比分析 - 指标变化量计算、异常检测、趋势判断、性能评分
 * A3.2: UI 回归检测 - 像素级差异对比、阈值判断、差异统计
 * A3.3: 优化建议生成 - 基于规则引擎的智能建议系统
 *
 * 技术约束:
 * - TypeScript 严格类型定义
 * - 轻量级实现，不依赖重型框架
 * - 支持异步操作（图像处理）
 * - 提供清晰接口供 reporter.ts 调用
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  PerformanceSnapshot,
  OperationLog,
} from './types.js';
import { logger } from '../agent-browser/logger.js';

// ==================== Type Definitions ====================

/** 异常级别 */
export type AnomalyLevel = 'critical' | 'warning' | 'info';

/** 趋势方向 */
export type TrendDirection = 'stable' | 'increasing' | 'decreasing' | 'fluctuating';

/** 建议优先级 */
export type SuggestionPriority = 'critical' | 'high' | 'medium' | 'low';

/** 建议类型 */
export type SuggestionType = 'performance' | 'ui' | 'stability' | 'optimization';

/** 单个指标异常 */
export interface MetricAnomaly {
  /** 指标名称 */
  metric: string;
  /** 异常级别 */
  anomalyLevel: AnomalyLevel;
  /** 基线值 */
  baseline: number;
  /** 当前值 */
  current: number;
  /** 变化量 */
  delta: number;
  /** 变化百分比 */
  deltaPercent: number;
  /** 阈值 */
  threshold: number;
  /** 是否超过阈值 */
  exceeded: boolean;
  /** 描述信息 */
  description: string;
}

/** 趋势分析结果 */
export interface TrendAnalysis {
  /** 趋势方向 */
  direction: TrendDirection;
  /** 趋势强度 (0-1) */
  strength: number;
  /** 变化率 */
  rateOfChange: number;
  /** 数据点数量 */
  dataPoints: number;
  /** 描述 */
  description: string;
}

/** 性能评分详情 */
export interface PerformanceScore {
  /** 总分 (0-100) */
  total: number;
  /** 内存评分 */
  memory: number;
  /** CPU 评分 */
  cpu: number;
  /** CDP 延迟评分 */
  cdpLatency: number;
  /** 稳定性评分 */
  stability: number;
  /** 评级 */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

/** 性能对比分析结果 */
export interface PerformanceComparisonResult {
  /** 分析时间戳 */
  timestamp: Date;
  /** 当前快照 */
  currentSnapshot: PerformanceSnapshot;
  /** 基线快照 */
  baselineSnapshot: PerformanceSnapshot;
  /** 各指标变化量 */
  deltas: {
    memoryMB: number;
    cpuPercent: number;
    threadCount: number;
    handleCount: number;
    cdpLatencyMs: number;
    pageCount: number;
  };
  /** 各指标变化百分比 */
  deltaPercents: {
    memoryMB: number;
    cpuPercent: number;
    threadCount: number;
    handleCount: number;
    cdpLatencyMs: number;
    pageCount: number;
  };
  /** 检测到的异常列表 */
  anomalies: MetricAnomaly[];
  /** 趋势分析 */
  trends: Record<string, TrendAnalysis>;
  /** 性能评分 */
  score: PerformanceScore;
  /** 总体结论 */
  conclusion: 'pass' | 'warning' | 'fail';
}

/** UI 差异检测结果 */
export interface UIDiffResult {
  /** 检测时间戳 */
  timestamp: Date;
  /** 基线截图路径 */
  baselinePath: string;
  /** 当前截图路径 */
  currentPath: string;
  /** 总像素数 */
  totalPixels: number;
  /** 差异像素数 */
  diffPixels: number;
  /** 差异百分比 */
  diffPercent: number;
  /** 配置的差异阈值 */
  threshold: number;
  /** 是否通过阈值判断 */
  passed: boolean;
  /** 差异高亮图路径 (可选) */
  diffImagePath?: string;
  /** 统计摘要 */
  summary: {
    /** 平均差异程度 (0-255) */
    meanDiff: number;
    /** 最大差异程度 */
    maxDiff: number;
    /** 差异区域数量 */
    diffRegions: number;
  };
}

/** 单条优化建议 */
export interface OptimizationSuggestion {
  /** 唯一标识符 */
  id: string;
  /** 建议类型 */
  type: SuggestionType;
  /** 优先级 */
  priority: SuggestionPriority;
  /** 标题 */
  title: string;
  /** 详细描述 */
  description: string;
  /** 关联的指标/问题 */
  relatedMetric?: string;
  /** 预期影响 */
  expectedImpact?: string;
  /** 建议操作步骤 */
  actionSteps?: string[];
  /** 是否为新发现的问题 */
  isNew?: boolean;
  /** 是否为持续恶化的问题 */
  isDeteriorating?: boolean;
  /** 问题首次发现的轮次 */
  firstSeenIteration?: number;
  /** 问题持续存在的轮次 */
  persistCount?: number;
}

/** 建议生成结果 */
export interface SuggestionsResult {
  /** 生成时间戳 */
  timestamp: Date;
  /** 所有建议列表 */
  suggestions: OptimizationSuggestion[];
  /** 按优先级分组 */
  byPriority: {
    critical: OptimizationSuggestion[];
    high: OptimizationSuggestion[];
    medium: OptimizationSuggestion[];
    low: OptimizationSuggestion[];
  };
  /** 按类型分组 */
  byType: {
    performance: OptimizationSuggestion[];
    ui: OptimizationSuggestion[];
    stability: OptimizationSuggestion[];
    optimization: OptimizationSuggestion[];
  };
  /** 统计摘要 */
  summary: {
    totalCount: number;
    newIssuesCount: number;
    deterioratingCount: number;
    resolvedCount: number;
  };
}

/** 完整分析报告 */
export interface AnalysisReport {
  /** 报告生成时间 */
  timestamp: Date;
  /** 迭代编号 */
  iteration: number;
  /** 性能对比分析 */
  performance: PerformanceComparisonResult;
  /** UI 回归检测结果 */
  uiRegression?: UIDiffResult;
  /** 优化建议 */
  suggestions: SuggestionsResult;
  /** 总体结论 */
  conclusion: 'pass' | 'warning' | 'fail';
  /** 整体健康度评分 (0-100) */
  healthScore: number;
}

/** 分析引擎配置选项 */
export interface AnalyzerOptions {
  /** 性能异常阈值配置 */
  thresholds?: {
    /** 内存增长阈值 (MB)，默认 50 */
    memoryGrowthMB?: number;
    /** CPU 使用率阈值 (%)，默认 80 */
    cpuPercentThreshold?: number;
    /** CDP 延迟阈值 (ms)，默认 500 */
    cdpLatencyThresholdMs?: number;
    /** 线程增长阈值，默认 10 */
    threadGrowthThreshold?: number;
    /** 句柄增长阈值，默认 50 */
    handleGrowthThreshold?: number;
  };
  /** UI 回归检测配置 */
  uiDiffConfig?: {
    /** 差异阈值 (%)，默认 0.1 (99.9% 相似度算通过) */
    diffThreshold?: number;
    /** 是否生成差异高亮图，默认 false */
    generateDiffImage?: boolean;
    /** 差异图输出目录 */
    diffImageOutputDir?: string;
  };
  /** 历史数据轮次 (用于趋势分析)，默认 5 */
  historyIterations?: number;
  /** 是否启用详细日志 */
  verboseLogging?: boolean;
}

/** 完整分析输入参数 */
export interface FullAnalysisInput {
  /** 当前迭代编号 */
  iteration: number;
  /** 基线截图路径 (可选) */
  baselineScreenshot?: string;
  /** 当前截图路径 (可选) */
  currentScreenshot?: string;
  /** 历史分析报告 (用于跨轮对比) */
  historicalReports?: AnalysisReport[];
}

// ==================== Constants ====================

/** 默认配置 */
const DEFAULT_OPTIONS: Required<AnalyzerOptions> = {
  thresholds: {
    memoryGrowthMB: 50,
    cpuPercentThreshold: 80,
    cdpLatencyThresholdMs: 500,
    threadGrowthThreshold: 10,
    handleGrowthThreshold: 50,
  },
  uiDiffConfig: {
    diffThreshold: 0.1,
    generateDiffImage: false,
    diffImageOutputDir: path.join(process.cwd(), 'diff-images'),
  },
  historyIterations: 5,
  verboseLogging: true,
};

/** 性能评分权重 */
const SCORE_WEIGHTS = {
  memory: 0.25,
  cpu: 0.25,
  cdpLatency: 0.25,
  stability: 0.25,
};

/** 评级映射 */
const GRADE_THRESHOLDS = [
  { min: 90, grade: 'A' as const },
  { min: 75, grade: 'B' as const },
  { min: 60, grade: 'C' as const },
  { min: 40, grade: 'D' as const },
  { min: 0, grade: 'F' as const },
];

// ==================== A3.1: Performance Baseline Comparison Analyzer ====================

/**
 * 性能基线对比分析器
 *
 * 负责:
 * - 计算各指标变化量
 * - 检测异常指标（超过阈值）
 * - 判断趋势方向
 * - 生成性能评分
 */
class PerformanceBaselineAnalyzer {
  private thresholds: Required<NonNullable<AnalyzerOptions['thresholds']>>;

  constructor(thresholds?: Required<NonNullable<AnalyzerOptions['thresholds']>>) {
    this.thresholds = thresholds || DEFAULT_OPTIONS.thresholds;
  }

  /**
   * 执行性能基线对比分析
   *
   * @param current 当前性能快照
   * @param baseline 基线性能快照
   * @param historicalSnapshots 历史快照数据（用于趋势分析）
   * @returns 完整的性能对比分析结果
   */
  analyze(
    current: PerformanceSnapshot,
    baseline: PerformanceSnapshot,
    historicalSnapshots?: PerformanceSnapshot[]
  ): PerformanceComparisonResult {
    const endTimer = logger.startTimer('PerformanceBaselineAnalyzer', '执行性能基线对比分析');

    try {
      // 1. 计算各指标变化量
      const deltas = this.calculateDeltas(current, baseline);

      // 2. 计算变化百分比
      const deltaPercents = this.calculateDeltaPercents(current, baseline, deltas);

      // 3. 检测异常
      const anomalies = this.detectAnomalies(deltas, deltaPercents, current, baseline);

      // 4. 趋势分析
      const snapshotsForTrend = historicalSnapshots && historicalSnapshots.length > 0
        ? [baseline, ...historicalSnapshots.slice(-this.getHistorySize()), current]
        : [baseline, current];
      const trends = this.analyzeTrends(snapshotsForTrend);

      // 5. 性能评分
      const score = this.calculatePerformanceScore(anomalies, current);

      // 6. 总体结论
      const conclusion = this.determineConclusion(anomalies, score);

      const result: PerformanceComparisonResult = {
        timestamp: new Date(),
        currentSnapshot: current,
        baselineSnapshot: baseline,
        deltas,
        deltaPercents,
        anomalies,
        trends,
        score,
        conclusion,
      };

      logger.info('PerformanceBaselineAnalyzer', '性能基线对比分析完成', {
        score: score.total,
        grade: score.grade,
        conclusion,
        anomalyCount: anomalies.filter(a => a.anomalyLevel === 'critical').length,
      });

      endTimer();
      return result;

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('PerformanceBaselineAnalyzer', `性能分析失败: ${errMsg}`);
      endTimer();

      // 返回空结果
      return this.createEmptyResult(current, baseline);
    }
  }

  /**
   * 计算各指标绝对变化量
   */
  private calculateDeltas(
    current: PerformanceSnapshot,
    baseline: PerformanceSnapshot
  ): PerformanceComparisonResult['deltas'] {
    return {
      memoryMB: current.processInfo.memoryMB - baseline.processInfo.memoryMB,
      cpuPercent: current.processInfo.cpuPercent - baseline.processInfo.cpuPercent,
      threadCount: current.processInfo.threadCount - baseline.processInfo.threadCount,
      handleCount: current.processInfo.handleCount - baseline.processInfo.handleCount,
      cdpLatencyMs: current.cdpInfo.latencyMs - baseline.cdpInfo.latencyMs,
      pageCount: current.cdpInfo.pageCount - baseline.cdpInfo.pageCount,
    };
  }

  /**
   * 计算各指标相对变化百分比
   *
   * 对于基准值为 0 的情况，使用特殊处理避免除零错误
   */
  private calculateDeltaPercents(
    current: PerformanceSnapshot,
    baseline: PerformanceSnapshot,
    deltas: PerformanceComparisonResult['deltas']
  ): PerformanceComparisonResult['deltaPercents'] {
    const safePercent = (current: number, base: number): number => {
      if (base === 0) {
        return current > 0 ? 100 : 0;
      }
      return Math.round((current / base) * 10000) / 100;
    };

    return {
      memoryMB: safePercent(deltas.memoryMB, baseline.processInfo.memoryMB),
      cpuPercent: Math.round(deltas.cpuPercent * 10) / 10, // CPU 百分比直接使用差值
      threadCount: safePercent(deltas.threadCount, baseline.processInfo.threadCount),
      handleCount: safePercent(deltas.handleCount, baseline.processInfo.handleCount),
      cdpLatencyMs: safePercent(deltas.cdpLatencyMs, baseline.cdpInfo.latencyMs),
      pageCount: safePercent(deltas.pageCount, baseline.cdpInfo.pageCount),
    };
  }

  /**
   * 检测异常指标
   *
   * 规则:
   * - 内存增长 > 50MB → warning, > 100MB → critical
   * - CPU > 80% → warning, > 95% → critical
   * - CDP 延迟 > 500ms → warning, > 2000ms → critical
   * - 线程增长 > 10 → warning, > 30 → critical
   * - 句柄增长 > 50 → warning, > 200 → critical
   * - CDP 不可达 → critical
   */
  private detectAnomalies(
    deltas: PerformanceComparisonResult['deltas'],
    deltaPercents: PerformanceComparisonResult['deltaPercents'],
    current: PerformanceSnapshot,
    baseline: PerformanceSnapshot
  ): MetricAnomaly[] {
    const anomalies: MetricAnomaly[] = [];

    // 内存异常检测
    if (deltas.memoryMB > this.thresholds.memoryGrowthMB) {
      const level = deltas.memoryMB > this.thresholds.memoryGrowthMB * 2 ? 'critical' : 'warning';
      anomalies.push({
        metric: 'memory',
        anomalyLevel: level,
        baseline: baseline.processInfo.memoryMB,
        current: current.processInfo.memoryMB,
        delta: deltas.memoryMB,
        deltaPercent: deltaPercents.memoryMB,
        threshold: this.thresholds.memoryGrowthMB,
        exceeded: true,
        description: `内存增长 ${deltas.memoryMB > 0 ? '+' : ''}${deltas.memoryMB}MB (${deltaPercents.memoryMB}%)`,
      });
    }

    // CPU 异常检测
    if (current.processInfo.cpuPercent > this.thresholds.cpuPercentThreshold) {
      const level = current.processInfo.cpuPercent > 95 ? 'critical' : 'warning';
      anomalies.push({
        metric: 'cpu',
        anomalyLevel: level,
        baseline: baseline.processInfo.cpuPercent,
        current: current.processInfo.cpuPercent,
        delta: deltas.cpuPercent,
        deltaPercent: deltaPercents.cpuPercent,
        threshold: this.thresholds.cpuPercentThreshold,
        exceeded: true,
        description: `CPU 使用率 ${current.processInfo.cpuPercent}% (阈值: ${this.thresholds.cpuPercentThreshold}%)`,
      });
    }

    // CDP 延迟异常检测
    if (!current.cdpInfo.reachable) {
      anomalies.push({
        metric: 'cdpReachability',
        anomalyLevel: 'critical',
        baseline: baseline.cdpInfo.reachable ? 1 : 0,
        current: 0,
        delta: -1,
        deltaPercent: -100,
        threshold: 1,
        exceeded: true,
        description: 'CDP 连接不可达',
      });
    } else if (current.cdpInfo.latencyMs > this.thresholds.cdpLatencyThresholdMs) {
      const level = current.cdpInfo.latencyMs > this.thresholds.cdpLatencyThresholdMs * 4 ? 'critical' : 'warning';
      anomalies.push({
        metric: 'cdpLatency',
        anomalyLevel: level,
        baseline: baseline.cdpInfo.latencyMs,
        current: current.cdpInfo.latencyMs,
        delta: deltas.cdpLatencyMs,
        deltaPercent: deltaPercents.cdpLatencyMs,
        threshold: this.thresholds.cdpLatencyThresholdMs,
        exceeded: true,
        description: `CDP 延迟 ${current.cdpInfo.latencyMs}ms (阈值: ${this.thresholds.cdpLatencyThresholdMs}ms)`,
      });
    }

    // 线程数异常检测
    if (deltas.threadCount > this.thresholds.threadGrowthThreshold) {
      const level = deltas.threadCount > this.thresholds.threadGrowthThreshold * 3 ? 'critical' : 'warning';
      anomalies.push({
        metric: 'threadCount',
        anomalyLevel: level,
        baseline: baseline.processInfo.threadCount,
        current: current.processInfo.threadCount,
        delta: deltas.threadCount,
        deltaPercent: deltaPercents.threadCount,
        threshold: this.thresholds.threadGrowthThreshold,
        exceeded: true,
        description: `线程数增长 +${deltas.threadCount} (${deltaPercents.threadCount}%)`,
      });
    }

    // 句柄数异常检测
    if (deltas.handleCount > this.thresholds.handleGrowthThreshold) {
      const level = deltas.handleCount > this.thresholds.handleGrowthThreshold * 4 ? 'critical' : 'warning';
      anomalies.push({
        metric: 'handleCount',
        anomalyLevel: level,
        baseline: baseline.processInfo.handleCount,
        current: current.processInfo.handleCount,
        delta: deltas.handleCount,
        deltaPercent: deltaPercents.handleCount,
        threshold: this.thresholds.handleGrowthThreshold,
        exceeded: true,
        description: `句柄数增长 +${deltas.handleCount} (${deltaPercents.handleCount}%)`,
      });
    }

    return anomalies;
  }

  /**
   * 趋势分析
   *
   * 使用线性回归简化算法判断趋势方向和强度
   */
  private analyzeTrends(snapshots: PerformanceSnapshot[]): Record<string, TrendAnalysis> {
    if (snapshots.length < 2) {
      return {
        memory: { direction: 'stable', strength: 0, rateOfChange: 0, dataPoints: snapshots.length, description: '数据不足' },
        cpu: { direction: 'stable', strength: 0, rateOfChange: 0, dataPoints: snapshots.length, description: '数据不足' },
        latency: { direction: 'stable', strength: 0, rateOfChange: 0, dataPoints: snapshots.length, description: '数据不足' },
      };
    }

    const metrics = [
      { key: 'memory', extractor: (s: PerformanceSnapshot) => s.processInfo.memoryMB },
      { key: 'cpu', extractor: (s: PerformanceSnapshot) => s.processInfo.cpuPercent },
      { key: 'latency', extractor: (s: PerformanceSnapshot) => s.cdpInfo.latencyMs },
    ];

    const trends: Record<string, TrendAnalysis> = {};

    for (const metric of metrics) {
      const values = snapshots.map(metric.extractor);
      const trend = this.calculateSingleTrend(values);
      trends[metric.key] = trend;
    }

    return trends;
  }

  /**
   * 计算单个指标的趋势
   */
  private calculateSingleTrend(values: number[]): TrendAnalysis {
    const n = values.length;

    // 计算简单线性回归斜率
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const meanY = sumY / n;

    // 计算相关系数 R^2 作为趋势强度
    let ssTotal = 0, ssResidual = 0;
    for (let i = 0; i < n; i++) {
      const predicted = slope * i + (meanY - slope * (n - 1) / 2);
      ssTotal += Math.pow(values[i] - meanY, 2);
      ssResidual += Math.pow(values[i] - predicted, 2);
    }

    const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;
    const strength = Math.min(Math.sqrt(Math.abs(rSquared)), 1);

    // 判断趋势方向
    const varianceThreshold = meanY * 0.05; // 5% 的均值作为波动阈值
    let direction: TrendDirection;

    if (Math.abs(slope) < varianceThreshold / n) {
      direction = 'stable';
    } else if (slope > 0) {
      // 检查是否有明显的波动
      let increases = 0, decreases = 0;
      for (let i = 1; i < n; i++) {
        if (values[i] > values[i - 1]) increases++;
        else if (values[i] < values[i - 1]) decreases++;
      }
      direction = (increases > decreases * 1.5) ? 'increasing' :
                  (decreases > increases * 1.5) ? 'decreasing' : 'fluctuating';
    } else {
      let increases = 0, decreases = 0;
      for (let i = 1; i < n; i++) {
        if (values[i] > values[i - 1]) increases++;
        else if (values[i] < values[i - 1]) decreases++;
      }
      direction = (decreases > increases * 1.5) ? 'decreasing' :
                  (increases > decreases * 1.5) ? 'increasing' : 'fluctuating';
    }

    // 修正方向基于斜率
    if (direction === 'fluctuating') {
      direction = slope > 0.001 ? 'increasing' : slope < -0.001 ? 'decreasing' : 'stable';
    }

    const descriptions: Record<TrendDirection, string> = {
      stable: '指标保持稳定',
      increasing: `指标呈上升趋势 (+${(slope * 100).toFixed(2)} /轮)`,
      decreasing: `指标呈下降趋势 (${(slope * 100).toFixed(2)} /轮)`,
      fluctuating: '指标存在波动',
    };

    return {
      direction,
      strength: Math.round(strength * 100) / 100,
      rateOfChange: Math.round(slope * 100) / 100,
      dataPoints: n,
      description: descriptions[direction],
    };
  }

  /**
   * 计算性能评分
   *
   * 评分规则:
   * - 无异常: 100 分
   * - 每个 info 级异常扣 5 分
   * - 每个 warning 级异常扣 15 分
   * - 每个 critical 级异常扣 35 分
   * - 最低 0 分
   */
  private calculatePerformanceScore(
    anomalies: MetricAnomaly[],
    current: PerformanceSnapshot
  ): PerformanceScore {
    let totalScore = 100;

    for (const anomaly of anomalies) {
      switch (anomaly.anomalyLevel) {
        case 'info':
          totalScore -= 5;
          break;
        case 'warning':
          totalScore -= 15;
          break;
        case 'critical':
          totalScore -= 35;
          break;
      }
    }

    totalScore = Math.max(0, totalScore);

    // 计算各维度分数
    const memoryScore = this.calculateMetricScore(
      anomalies.filter(a => a.metric === 'memory'),
      current.processInfo.memoryMB
    );
    const cpuScore = this.calculateMetricScore(
      anomalies.filter(a => a.metric === 'cpu'),
      100 - current.processInfo.cpuPercent
    );
    const cdpLatencyScore = this.calculateMetricScore(
      anomalies.filter(a => a.metric === 'cdpLatency' || a.metric === 'cdpReachability'),
      Math.max(0, 100 - current.cdpInfo.latencyMs / 20)
    );
    const stabilityScore = this.calculateStabilityScore(anomalies, current);

    // 确定评级
    const grade = GRADE_THRESHOLDS.find(g => totalScore >= g.min)?.grade || 'F';

    return {
      total: totalScore,
      memory: memoryScore,
      cpu: cpuScore,
      cdpLatency: cdpLatencyScore,
      stability: stabilityScore,
      grade,
    };
  }

  /**
   * 计算单个指标分数
   */
  private calculateMetricScore(anomalies: MetricAnomaly[], baseValue: number): number {
    let score = Math.min(100, baseValue);

    for (const anomaly of anomalies) {
      switch (anomaly.anomalyLevel) {
        case 'warning':
          score -= 20;
          break;
        case 'critical':
          score -= 45;
          break;
      }
    }

    return Math.max(0, Math.round(score));
  }

  /**
   * 计算稳定性评分
   *
   * 基于线程数、句柄数等资源指标
   */
  private calculateStabilityScore(anomalies: MetricAnomaly[], current: PerformanceSnapshot): number {
    let score = 100;

    const resourceAnomalies = anomalies.filter(a =>
      a.metric === 'threadCount' || a.metric === 'handleCount'
    );

    for (const anomaly of resourceAnomalies) {
      switch (anomaly.anomalyLevel) {
        case 'warning':
          score -= 25;
          break;
        case 'critical':
          score -= 50;
          break;
      }
    }

    // 如果 CDP 不可用，大幅降低稳定性分数
    if (!current.cdpInfo.reachable) {
      score -= 40;
    }

    return Math.max(0, score);
  }

  /**
   * 确定总体结论
   */
  private determineConclusion(
    anomalies: MetricAnomaly[],
    score: PerformanceScore
  ): 'pass' | 'warning' | 'fail' {
    // 存在 critical 异常直接失败
    if (anomalies.some(a => a.anomalyLevel === 'critical')) {
      return 'fail';
    }

    // 存在 warning 或分数低于 60 给出警告
    if (anomalies.some(a => a.anomalyLevel === 'warning') || score.total < 60) {
      return 'warning';
    }

    return 'pass';
  }

  /**
   * 创建空结果（错误时使用）
   */
  private createEmptyResult(
    current: PerformanceSnapshot,
    baseline: PerformanceSnapshot
  ): PerformanceComparisonResult {
    return {
      timestamp: new Date(),
      currentSnapshot: current,
      baselineSnapshot: baseline,
      deltas: {
        memoryMB: 0,
        cpuPercent: 0,
        threadCount: 0,
        handleCount: 0,
        cdpLatencyMs: 0,
        pageCount: 0,
      },
      deltaPercents: {
        memoryMB: 0,
        cpuPercent: 0,
        threadCount: 0,
        handleCount: 0,
        cdpLatencyMs: 0,
        pageCount: 0,
      },
      anomalies: [],
      trends: {},
      score: {
        total: 0,
        memory: 0,
        cpu: 0,
        cdpLatency: 0,
        stability: 0,
        grade: 'F',
      },
      conclusion: 'fail',
    };
  }

  /**
   * 获取历史数据大小限制
   */
  private getHistorySize(): number {
    return DEFAULT_OPTIONS.historyIterations;
  }
}

// ==================== A3.2: UI Regression Detector ====================

/**
 * UI 回归检测器
 *
 * 负责:
 * - 像素级差异对比
 * - 可配置差异阈值判断
 * - 差异统计输出
 * - 可选：生成差异高亮图
 */
class UIRegressionDetector {
  private config: Required<NonNullable<AnalyzerOptions['uiDiffConfig']>>;

  constructor(config?: NonNullable<AnalyzerOptions['uiDiffConfig']>) {
    this.config = config || DEFAULT_OPTIONS.uiDiffConfig;

    // 确保输出目录存在
    if (this.config.generateDiffImage && this.config.diffImageOutputDir) {
      if (!fs.existsSync(this.config.diffImageOutputDir)) {
        fs.mkdirSync(this.config.diffImageOutputDir, { recursive: });
      }
    }
  }

  /**
   * 执行 UI 回归检测
   *
   * @param baselineImagePath 基线截图路径
   * @param currentImagePath 当前截图路径
   * @returns UI 差异检测结果
   */
  async compare(
    baselineImagePath: string,
    currentImagePath: string
  ): Promise<UIDiffResult> {
    const endTimer = logger.startTimer('UIRegressionDetector', '执行 UI 回归检测');

    try {
      // 验证文件存在
      this.validateImages(baselineImagePath, currentImagePath);

      // 尝试使用 sharp 进行图像处理
      const result = await this.performPixelComparison(baselineImagePath, currentImagePath);

      logger.info('UIRegressionDetector', 'UI 回归检测完成', {
        diffPercent: result.diffPercent.toFixed(4),
        passed: result.passed,
        diffPixels: result.diffPixels,
      });

      endTimer();
      return result;

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('UIRegressionDetector', `UI 回归检测失败: ${errMsg}`);
      endTimer();

      // 返回失败结果
      return {
        timestamp: new Date(),
        baselinePath: baselineImagePath,
        currentPath: currentImagePath,
        totalPixels: 0,
        diffPixels: 0,
        diffPercent: 100, // 无法比较时视为完全不同
        threshold: this.config.diffThreshold,
        passed: false,
        summary: {
          meanDiff: 0,
          maxDiff: 0,
          diffRegions: 0,
        },
      };
    }
  }

  /**
   * 验证图片文件是否存在
   */
  private validateImages(baselinePath: string, currentPath: string): void {
    if (!fs.existsSync(baselinePath)) {
      throw new Error(`基线截图不存在: ${baselinePath}`);
    }
    if (!fs.existsSync(currentPath)) {
      throw new Error(`当前截图不存在: ${currentPath}`);
    }
  }

  /**
   * 执行像素级对比
   *
   * 使用 sharp 库进行高性能图像处理
   * 如果 sharp 不可用，则回退到基础实现
   */
  private async performPixelComparison(
    baselinePath: string,
    currentPath: string
  ): Promise<UIDiffResult> {
    // 尝试动态导入 sharp
    let sharp: any;
    try {
      sharp = await import('sharp').catch(() => null);
    } catch {
      sharp = null;
    }

    if (sharp) {
      return await this.compareWithSharp(sharp.default || sharp, baselinePath, currentPath);
    }

    // 回退到基础实现（仅检查文件大小和元数据）
    return this.fallbackComparison(baselinePath, currentPath);
  }

  /**
   * 使用 sharp 进行精确像素对比
   */
  private async compareWithSharp(
    sharp: any,
    baselinePath: string,
    currentPath: string
  ): Promise<UIDiffResult> {
    // 读取两张图片
    const [baselineImage, currentImage] = await Promise.all([
      sharp(baselinePath).raw().toBuffer(),
      sharp(currentPath).raw().toBuffer(),
    ]);

    // 获取图片元信息
    const baselineMeta = await sharp(baselinePath).metadata();
    const currentMeta = await sharp(currentPath).metadata();

    const width = baselineMeta.width || 0;
    const height = baselineMeta.height || 0;
    const channels = baselineMeta.channels || 4; // RGBA

    const totalPixels = width * height;

    // 确保尺寸一致
    if (width !== currentMeta.width || height !== currentMeta.height) {
      logger.warn('UIRegressionDetector', '图片尺寸不一致', {
        baseline: `${width}x${height}`,
        current: `${currentMeta.width}x${currentMeta.height}`,
      });
    }

    // 执行像素对比
    let diffPixels = 0;
    let totalDiff = 0;
    let maxDiff = 0;
    const diffBuffer = Buffer.alloc(baselineImage.length);

    const minLen = Math.min(baselineImage.length, currentImage.length);

    for (let i = 0; i < minLen; i++) {
      const diff = Math.abs(baselineImage[i] - currentImage[i]);
      diffBuffer[i] = diff;

      if (diff > 0) {
        totalDiff += diff;
        if (diff > maxDiff) {
          maxDiff = diff;
        }
      }
    }

    // 计算差异像素数（任一通道有差异即算）
    for (let i = 0; i < totalPixels; i++) {
      const pixelIndex = i * channels;
      let pixelDiff = false;

      for (let c = 0; c < channels; c++) {
        if (pixelIndex + c < minLen && diffBuffer[pixelIndex + c] > 2) { // 阈值 2 忽略微小噪声
          pixelDiff = true;
          break;
        }
      }

      if (pixelDiff) {
        diffPixels++;
      }
    }

    const diffPercent = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;
    const meanDiff = diffPixels > 0 ? totalDiff / diffPixels : 0;

    // 计算差异区域数量（连通区域）
    const diffRegions = this.countDiffRegions(diffBuffer, width, height, channels);

    // 判断是否通过
    const passed = diffPercent <= this.config.diffThreshold;

    let diffImagePath: string | undefined;

    // 生成差异高亮图
    if (this.config.generateDiffImage) {
      diffImagePath = await this.generateDiffImage(
        sharp,
        baselinePath,
        diffBuffer,
        width,
        height,
        channels
      );
    }

    return {
      timestamp: new Date(),
      baselinePath,
      currentPath,
      totalPixels,
      diffPixels,
      diffPercent: Math.round(diffPercent * 10000) / 10000,
      threshold: this.config.diffThreshold,
      passed,
      diffImagePath,
      summary: {
        meanDiff: Math.round(meanDiff * 100) / 100,
        maxDiff,
        diffRegions,
      },
    };
  }

  /**
   * 回退对比方法（当 sharp 不可用时）
   *
   * 使用文件大小和基本元数据进行粗略比较
   */
  private fallbackComparison(
    baselinePath: string,
    currentPath: string
  ): UIDiffResult {
    const baselineStats = fs.statSync(baselinePath);
    const currentStats = fs.statSync(currentPath);

    const sizeDiff = Math.abs(baselineStats.size - currentStats.size);
    const sizeDiffPercent = baselineStats.size > 0
      ? (sizeDiff / baselineStats.size) * 100
      : 100;

    // 基于文件大小差异估算像素差异
    // 这只是一个粗略估计，实际精度取决于图像压缩方式
    const estimatedDiffPercent = Math.min(sizeDiffPercent * 0.5, 100);

    logger.warn('UIRegressionDetector', 'sharp 不可用，使用回退模式进行粗略比较', {
      sizeDiffPercent: Math.round(sizeDiffPercent * 100) / 100,
      estimatedDiffPercent: Math.round(estimatedDiffPercent * 100) / 100,
    });

    return {
      timestamp: new Date(),
      baselinePath,
      currentPath,
      totalPixels: 0, // 回退模式下无法获取准确像素数
      diffPixels: 0,
      diffPercent: Math.round(estimatedDiffPercent * 10000) / 10000,
      threshold: this.config.diffThreshold,
      passed: estimatedDiffPercent <= this.config.diffThreshold,
      summary: {
        meanDiff: sizeDiff,
        maxDiff: sizeDiff,
        diffRegions: 0,
      },
    };
  }

  /**
   * 计算差异区域数量
   *
   * 使用简化的连通区域计数算法
   */
  private countDiffRegions(
    diffBuffer: Buffer,
    width: number,
    height: number,
    channels: number
  ): number {
    if (width <= 0 || height <= 0) return 0;

    const visited = new Set<number>();
    let regions = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (visited.has(idx)) continue;

        // 检查该像素是否有显著差异
        const pixelIdx = idx * channels;
        let hasDiff = false;

        for (let c = 0; c < channels; c++) {
          if (pixelIdx + c < diffBuffer.length && diffBuffer[pixelIdx + c] > 10) {
            hasDiff = true;
            break;
          }
        }

        if (hasDiff) {
          regions++;
          // 标记相邻像素（简化 BFS）
          this.markRegion(diffBuffer, visited, x, y, width, height, channels);
        }
      }
    }

    return regions;
  }

  /**
   * 标记一个差异区域
   */
  private markRegion(
    diffBuffer: Buffer,
    visited: Set<number>,
    startX: number,
    startY: number,
    width: number,
    height: number,
    channels: number
  ): void {
    const queue: Array<[number, number]> = [[startX, startY]];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    while (queue.length > 0) {
      const [x, y] = queue.shift()!;

      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const idx = y * width + x;
      if (visited.has(idx)) continue;

      const pixelIdx = idx * channels;
      let hasDiff = false;

      for (let c = 0; c < channels; c++) {
        if (pixelIdx + c < diffBuffer.length && diffBuffer[pixelIdx + c] > 10) {
          hasDiff = true;
          break;
        }
      }

      if (!hasDiff) continue;

      visited.add(idx);

      for (const [dx, dy] of directions) {
        queue.push([x + dx, y + dy]);
      }
    }
  }

  /**
   * 生成差异高亮图
   *
   * 在基线图上叠加红色半透明遮罩标记差异区域
   */
  private async generateDiffImage(
    sharp: any,
    basePath: string,
    diffBuffer: Buffer,
    width: number,
    height: number,
    channels: number
  ): Promise<string> {
    try {
      // 创建差异可视化图像
      const diffImageData = Buffer.alloc(width * height * 4); // RGBA

      for (let i = 0; i < width * height; i++) {
        const srcIdx = i * channels;
        const dstIdx = i * 4;

        if (srcIdx + 2 < diffBuffer.length && diffBuffer[srcIdx] > 10) {
          // 差异区域：红色半透明
          diffImageData[dstIdx] = 255;     // R
          diffImageData[dstIdx + 1] = 0;   // G
          diffImageData[dstIdx + 2] = 0;   // B
          diffImageData[dstIdx + 3] = 128; // A (50% 透明)
        } else {
          // 非差异区域：透明
          diffImageData[dstIdx] = 0;
          diffImageData[dstIdx + 1] = 0;
          diffImageData[dstIdx + 2] = 0;
          diffImageData[dstIdx + 3] = 0;
        }
      }

      // 合成基线图和差异遮罩
      const composite = await sharp(basePath)
        .ensureAlpha()
        .composite([{
          input: diffImageData,
          raw: { width, height, channels: 4 },
          blend: 'over',
        }])
        .png()
        .toBuffer();

      // 保存差异图
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `diff-${timestamp}.png`;
      const outputPath = path.join(this.config.diffImageOutputDir, filename);

      fs.writeFileSync(outputPath, composite);

      logger.debug('UIRegressionDetector', `差异高亮图已保存: ${outputPath}`);
      return outputPath;

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn('UIRegressionDetector', `生成差异高亮图失败: ${errMsg}`);
      return undefined!;
    }
  }
}

// ==================== A3.3: Optimization Suggestion Generator ====================

/** 规则定义接口 */
interface AnalysisRule {
  id: string;
  name: string;
  category: SuggestionType;
  priority: SuggestionPriority;
  condition: (context: RuleContext) => boolean;
  generate: (context: RuleContext) => OptimizationSuggestion;
}

/** 规则评估上下文 */
interface RuleContext {
  iteration: number;
  performanceResult: PerformanceComparisonResult;
  uiResult?: UIDiffResult;
  historicalReports: AnalysisReport[];
  previousSuggestions: OptimizationSuggestion[];
}

/**
 * 优化建议生成器
 *
 * 基于规则引擎的智能建议系统:
 * - 性能规则集: 内存泄漏、CPU过高、延迟偏高、CDP不可达
 * - UI规则集: 显著变化、微小差异
 * - 稳定性规则集: 线程/句柄泄漏、低评分告警
 *
 * 结合历史数据分析:
 * - 对比前 N 轮结果，识别持续恶化指标
 * - 追踪问题修复情况
 * - 新增问题检测
 */
class OptimizationSuggestionGenerator {
  private rules: AnalysisRule[];

  constructor() {
    this.rules = this.buildRuleSet();
  }

  /**
   * 生成优化建议
   *
   * @param context 规则评估上下文
   * @returns 建议生成结果
   */
  generate(context: RuleContext): SuggestionsResult {
    const endTimer = logger.startTimer('OptimizationSuggestionGenerator', '生成优化建议');

    try {
      const suggestions: OptimizationSuggestion[] = [];
      const existingIds = new Set(context.previousSuggestions.map(s => s.id));

      // 执行所有规则
      for (const rule of this.rules) {
        try {
          if (rule.condition(context)) {
            const suggestion = rule.generate(context);

            // 检查是否已存在相同建议
            if (!existingIds.has(suggestion.id)) {
              suggestion.isNew = true;
              suggestion.firstSeenIteration = context.iteration;
              suggestion.persistCount = 1;
              suggestions.push(suggestion);
            } else {
              // 更新已有建议的持久化次数
              const existing = context.previousSuggestions.find(s => s.id === suggestion.id);
              if (existing) {
                suggestion.isNew = false;
                suggestion.firstSeenIteration = existing.firstSeenIteration;
                suggestion.persistCount = (existing.persistCount || 0) + 1;
                suggestions.push(suggestion);
              }
            }
          }
        } catch (error) {
          logger.warn('OptimizationSuggestionGenerator', `规则执行失败 [${rule.id}]: ${error}`);
        }
      }

      // 检测持续恶化的问题
      this.detectDeterioratingIssues(suggestions, context.historicalReports);

      // 统计已修复的问题
      const resolvedCount = this.countResolvedIssues(context.previousSuggestions, suggestions);

      // 按优先级和类型分组
      const result = this.organizeSuggestions(suggestions, resolvedCount);

      logger.info('OptimizationSuggestionGenerator', '优化建议生成完成', {
        total: result.summary.totalCount,
        new: result.summary.newIssuesCount,
        critical: result.byPriority.critical.length,
      });

      endTimer();
      return result;

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('OptimizationSuggestionGenerator', `建议生成失败: ${errMsg}`);
      endTimer();

      return this.createEmptyResult();
    }
  }

  /**
   * 构建规则集
   */
  private buildRuleSet(): AnalysisRule[] {
    return [
      // ========== 性能规则集 ==========

      // P1: 内存严重泄漏
      {
        id: 'PERF-MEM-LEAK-CRITICAL',
        name: '内存严重泄漏',
        category: 'performance',
        priority: 'critical',
        condition: (ctx) => {
          const memAnomaly = ctx.performanceResult.anomalies.find(
            a => a.metric === 'memory' && a.anomalyLevel === 'critical'
          );
          return !!memAnomaly && memAnomaly.delta > 100;
        },
        generate: (ctx) => ({
          id: 'PERF-MEM-LEAK-CRITICAL',
          type: 'performance',
          priority: 'critical',
          title: '严重的内存泄漏检测',
          description: `检测到内存增长超过 100MB (当前: ${ctx.performanceResult.currentSnapshot.processInfo.memoryMB}MB)。这可能导致系统性能下降或 OOM 崩溃。`,
          relatedMetric: 'memory',
          expectedImpact: '防止系统崩溃，恢复正常内存使用水平',
          actionSteps: [
            '检查是否存在未释放的大对象引用',
            '审查事件监听器和定时器的清理逻辑',
            '检查缓存策略是否有上限控制',
            '考虑添加内存监控和自动回收机制',
          ],
          isNew: true,
          firstSeenIteration: ctx.iteration,
          persistCount: 1,
        }),
      },

      // P2: 内存轻微泄漏警告
      {
        id: 'PERF-MEM-LEAK-WARNING',
        name: '内存增长警告',
        category: 'performance',
        priority: 'high',
        condition: (ctx) => {
          const memAnomaly = ctx.performanceResult.anomalies.find(
            a => a.metric === 'memory' && a.anomalyLevel === 'warning'
          );
          return !!memAnomaly;
        },
        generate: (ctx) => {
          const anomaly = ctx.performanceResult.anomalies.find(
            a => a.metric === 'memory'
          )!;
          return {
            id: 'PERF-MEM-LEAK-WARNING',
            type: 'performance',
            priority: 'high',
            title: '内存使用量持续增长',
            description: `检测到内存增长 ${anomaly.delta > 0 ? '+' : ''}${anomaly.delta}MB (${anomaly.deltaPercent}%)。建议关注长期运行稳定性。`,
            relatedMetric: 'memory',
            expectedImpact: '预防潜在的内存泄漏问题',
            actionSteps: [
              '监控后续迭代的内存变化趋势',
              '检查是否有不必要的对象缓存',
              '确认临时对象是否被正确回收',
            ],
            isNew: true,
            firstSeenIteration: ctx.iteration,
            persistCount: 1,
          };
        },
      },

      // P3: CPU 过高
      {
        id: 'PERF-CPU-HIGH',
        name: 'CPU 使用率过高',
        category: 'performance',
        priority: 'high',
        condition: (ctx) => {
          return ctx.performanceResult.anomalies.some(
            a => a.metric === 'cpu' && (a.anomalyLevel === 'critical' || a.anomalyLevel === 'warning')
          );
        },
        generate: (ctx) => {
          const anomaly = ctx.performanceResult.anomalies.find(a => a.metric === 'cpu')!;
          return {
            id: 'PERF-CPU-HIGH',
            type: 'performance',
            priority: anomaly?.anomalyLevel === 'critical' ? 'critical' : 'high',
            title: 'CPU 使用率过高',
            description: `当前 CPU 使用率为 ${ctx.performanceResult.currentSnapshot.processInfo.cpuPercent}%，${anomaly?.anomalyLevel === 'critical' ? '严重影响系统响应' : '可能影响用户体验'}。`,
            relatedMetric: 'cpu',
            expectedImpact: '恢复正常响应速度',
            actionSteps: [
              '检查是否有死循环或密集计算任务',
              '分析是否有阻塞主线程的操作',
              '考虑将耗时任务移至 Worker 线程',
              '检查第三方库的性能表现',
            ],
            isNew: true,
            firstSeenIteration: ctx.iteration,
            persistCount: 1,
          };
        },
      },

      // P4: CDP 延迟偏高
      {
        id: 'PERF-LATENCY-HIGH',
        name: 'CDP 响应延迟偏高',
        category: 'performance',
        priority: 'medium',
        condition: (ctx) => {
          return ctx.performanceResult.anomalies.some(
            a => a.metric === 'cdpLatency' && a.anomalyLevel === 'warning'
          );
        },
        generate: (ctx) => {
          const anomaly = ctx.performanceResult.anomalies.find(a => a.metric === 'cdpLatency')!;
          return {
            id: 'PERF-LATENCY-HIGH',
            type: 'performance',
            priority: 'medium',
            title: 'CDP 响应延迟偏高',
            description: `CDP 端点响应延迟达到 ${ctx.performanceResult.currentSnapshot.cdpInfo.latencyMs}ms，可能影响调试和自动化操作的实时性。`,
            relatedMetric: 'cdpLatency',
            expectedImpact: '提升自动化测试效率',
            actionSteps: [
              '检查网络连接质量',
              '确认浏览器实例负载情况',
              '考虑增加超时容忍时间',
            ],
            isNew: true,
            firstSeenIteration: ctx.iteration,
            persistCount: 1,
          };
        },
      },

      // P5: CDP 不可达
      {
        id: 'PERF-CDP-UNREACHABLE',
        name: 'CDP 连接不可达',
        category: 'stability',
        priority: 'critical',
        condition: (ctx) => {
          return ctx.performanceResult.anomalies.some(
            a => a.metric === 'cdpReachability'
          );
        },
        generate: () => ({
          id: 'PERF-CDP-UNREACHABLE',
          type: 'stability',
          priority: 'critical',
          title: 'CDP 连接不可达',
          description: '无法连接到 Chrome DevTools Protocol 端点。这将导致所有浏览器自动化功能失效。',
          relatedMetric: 'cdpReachability',
          expectedImpact: '恢复浏览器自动化能力',
          actionSteps: [
            '确认 SOLO 进程正在运行',
            '检查 CDP 端口配置是否正确',
            '验证防火墙设置',
            '尝试重启 SOLO 实例',
          ],
          isNew: true,
          firstSeenIteration: ctx.iteration,
          persistCount: 1,
        }),
      },

      // ========== UI 规则集 ==========

      // U1: 显著 UI 变化
      {
        id: 'UI-SIGNIFICANT-CHANGE',
        name: 'UI 显著变化',
        category: 'ui',
        priority: 'high',
        condition: (ctx) => {
          return !!ctx.uiResult && !ctx.uiResult.passed && ctx.uiResult.diffPercent > 1;
        },
        generate: (ctx) => ({
          id: 'UI-SIGNIFICANT-CHANGE',
          type: 'ui',
          priority: 'high',
          title: '检测到显著的 UI 变化',
          description: `当前截图与基线截图存在 ${ctx.uiResult!.diffPercent.toFixed(2)}% 的差异，超过可接受阈值。这可能表示 UI 回归或预期变更。`,
          relatedMetric: 'uiDiff',
          expectedImpact: '确保 UI 一致性',
          actionSteps: [
            '查看差异高亮图定位变化区域',
            '确认这是预期的 UI 变更还是意外回归',
            '如果是预期变更，更新基线截图',
          ],
          isNew: true,
          firstSeenIteration: ctx.iteration,
          persistCount: 1,
        }),
      },

      // U2: 微小 UI 差异
      {
        id: 'UI-MINOR-DIFF',
        name: 'UI 微小差异',
        category: 'ui',
        priority: 'low',
        condition: (ctx) => {
          return !!ctx.uiResult && !ctx.uiResult.passed && ctx.uiResult.diffPercent <= 1;
        },
        generate: (ctx) => ({
          id: 'UI-MINOR-DIFF',
          type: 'ui',
          priority: 'low',
          title: '检测到微小的 UI 差异',
          description: `当前截图与基线截图存在 ${ctx.uiResult!.diffPercent.toFixed(4)}% 的微小差异。可能是渲染噪声或字体抗锯齿差异。`,
          relatedMetric: 'uiDiff',
          expectedImpact: '保持视觉一致性',
          actionSteps: [
            '确认差异是否在可接受范围内',
            '必要时调整差异阈值',
          ],
          isNew: true,
          firstSeenIteration: ctx.iteration,
          persistCount: 1,
        }),
      },

      // ========== 稳定性规则集 ==========

      // S1: 线程泄漏
      {
        id: 'STAB-THREAD-LEAK',
        name: '线程数异常增长',
        category: 'stability',
        priority: 'high',
        condition: (ctx) => {
          return ctx.performanceResult.anomalies.some(
            a => a.metric === 'threadCount' && a.anomalyLevel !== 'info'
          );
        },
        generate: (ctx) => {
          const anomaly = ctx.performanceResult.anomalies.find(a => a.metric === 'threadCount')!;
          return {
            id: 'STAB-THREAD-LEAK',
            type: 'stability',
            priority: anomaly?.anomalyLevel === 'critical' ? 'critical' : 'high',
            title: '线程数异常增长',
            description: `线程数增长 +${anomaly?.delta || 0}，可能存在线程泄漏。长期运行可能导致资源耗尽。`,
            relatedMetric: 'threadCount',
            expectedImpact: '防止资源耗尽导致崩溃',
            actionSteps: [
              '检查异步任务的创建和销毁逻辑',
              '确认 Web Worker 或线程池的正确管理',
              '审查定时器和间隔器的清理机制',
            ],
            isNew: true,
            firstSeenIteration: ctx.iteration,
            persistCount: 1,
          };
        },
      },

      // S2: 句柄泄漏
      {
        id: 'STAB-HANDLE-LEAK',
        name: '句柄数异常增长',
        category: 'stability',
        priority: 'medium',
        condition: (ctx) => {
          return ctx.performanceResult.anomalies.some(
            a => a.metric === 'handleCount' && a.anomalyLevel !== 'info'
          );
        },
        generate: (ctx) => {
          const anomaly = ctx.performanceResult.anomalies.find(a => a.metric === 'handleCount')!;
          return {
            id: 'STAB-HANDLE-LEAK',
            type: 'stability',
            priority: anomaly?.anomalyLevel === 'critical' ? 'high' : 'medium',
            title: '句柄数异常增长',
            description: `句柄数增长 +${anomaly?.delta || 0}，可能存在资源未正确释放。`,
            relatedMetric: 'handleCount',
            expectedImpact: '防止系统资源耗尽',
            actionSteps: [
              '检查文件句柄、网络连接的关闭逻辑',
              '确认数据库连接池的正确管理',
              '审查事件监听器的移除',
            ],
            isNew: true,
            firstSeenIteration: ctx.iteration,
            persistCount: 1,
          };
        },
      },

      // S3: 低性能评分警告
      {
        id: 'STAB-LOW-SCORE',
        name: '性能评分偏低',
        category: 'stability',
        priority: 'medium',
        condition: (ctx) => {
          return ctx.performanceResult.score.total < 70 && ctx.performanceResult.score.total >= 40;
        },
        generate: (ctx) => ({
          id: 'STAB-LOW-SCORE',
          type: 'stability',
          priority: 'medium',
          title: '整体性能评分偏低',
          description: `当前性能评分为 ${ctx.performanceResult.score.total}/100 (等级: ${ctx.performanceResult.score.grade})。建议关注各项指标的改善。`,
          expectedImpact: '提升整体系统健康度',
          actionSteps: [
            '查看具体异常指标并针对性优化',
            '建立性能基线和监控体系',
            '考虑进行性能 profiling 定位瓶颈',
          ],
          isNew: true,
          firstSeenIteration: ctx.iteration,
          persistCount: 1,
        }),
      },

      // S4: 极低性能评分告警
      {
        id: 'STAB-CRITICAL-SCORE',
        name: '性能评分极低',
        category: 'stability',
        priority: 'critical',
        condition: (ctx) => {
          return ctx.performanceResult.score.total < 40;
        },
        generate: (ctx) => ({
          id: 'STAB-CRITICAL-SCORE',
          type: 'stability',
          priority: 'critical',
          title: '性能评分极低 - 需要紧急处理',
          description: `当前性能评分仅为 ${ctx.performanceResult.score.total}/100 (等级: ${ctx.performanceResult.score.grade})。系统状态堪忧，需要立即介入处理。`,
          expectedImpact: '防止系统故障',
          actionSteps: [
            '立即停止相关负载',
            '进行全面系统诊断',
            '考虑回滚最近的变更',
            '联系技术支持团队',
          ],
          isNew: true,
          firstSeenIteration: ctx.iteration,
          persistCount: 1,
        }),
      },

      // ========== 优化建议规则集 ==========

      // O1: 基于趋势的优化建议
      {
        id: 'OPT-TREND-INCREASING',
        name: '指标上升趋势优化',
        category: 'optimization',
        priority: 'low',
        condition: (ctx) => {
          const trends = Object.values(ctx.performanceResult.trends);
          return trends.some(t => t.direction === 'increasing' && t.strength > 0.5);
        },
        generate: (ctx) => {
          const increasingMetrics = Object.entries(ctx.performanceResult.trends)
            .filter(([, t]) => t.direction === 'increasing')
            .map(([key]) => key);
          return {
            id: 'OPT-TREND-INCREASING',
            type: 'optimization',
            priority: 'low',
            title: '部分指标呈上升趋势',
            description: `以下指标呈现上升趋势: ${increasingMetrics.join(', ')}。建议提前规划容量扩展或性能优化。`,
            expectedImpact: '预防未来性能问题',
            actionSteps: [
              '持续监控这些指标的变化',
              '制定相应的优化计划',
              '考虑在下一版本中进行针对性改进',
            ],
            isNew: true,
            firstSeenIteration: ctx.iteration,
            persistCount: 1,
          };
        },
      },
    ];
  }

  /**
   * 检测持续恶化的问题
   */
  private detectDeterioratingIssues(
    suggestions: OptimizationSuggestion[],
    historicalReports: AnalysisReport[]
  ): void {
    if (historicalReports.length < 2) return;

    // 获取最近几轮的建议 ID 和其指标状态
    const recentHistory = historicalReports.slice(-3);

    for (const suggestion of suggestions) {
      if (!suggestion.relatedMetric) continue;

      // 检查该关联指标在历史记录中是否持续恶化
      let deteriorationCount = 0;

      for (const report of recentHistory) {
        const sameMetricAnomaly = report.performance.anomalies.find(
          a => a.metric === suggestion.relatedMetric
        );

        if (sameMetricAnomaly) {
          deteriorationCount++;
        }
      }

      // 如果在最近多轮都出现，标记为持续恶化
      if (deteriorationCount >= 2) {
        suggestion.isDeteriorating = true;
        suggestion.priority = this.elevatePriority(suggestion.priority);
      }
    }
  }

  /**
   * 提升优先级
   */
  private elevatePriority(current: SuggestionPriority): SuggestionPriority {
    const hierarchy: SuggestionPriority[] = ['low', 'medium', 'high', 'critical'];
    const currentIndex = hierarchy.indexOf(current);

    if (currentIndex < hierarchy.length - 1) {
      return hierarchy[currentIndex + 1];
    }

    return current;
  }

  /**
   * 统计已修复的问题数量
   */
  private countResolvedIssues(
    previous: OptimizationSuggestion[],
    current: OptimizationS[]
  ): number {
    if (previous.length === 0) return 0;

    const currentIds = new Set(current.map(s => s.id));
    let resolved = 0;

    for (const prev of previous) {
      if (!currentIds.has(prev.id) && (prev.persistCount || 0) > 1) {
        resolved++;
      }
    }

    return resolved;
  }

  /**
   * 组织建议并按优先级/类型分组
   */
  private organizeizeSuggestions(
    suggestions: OptimizationSuggestion[],
    resolvedCount: number
  ): SuggestionsResult {
    // 按优先级排序
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    suggestions.sort((a, b) =>
      (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99)
    );

    // 按优先级分组
    const byPriority = {
      critical: suggestions.filter(s => s.priority === 'critical'),
      high: suggestions.filter(s => s.priority === 'high'),
      medium: suggestions.filter(s => s.priority === 'medium'),
      low: suggestions.filter(s => s.priority === 'low'),
    };

    // 按类型分组
    const byType = {
      performance: suggestions.filter(s => s.type === 'performance'),
      ui: suggestions.filter(s => s.type === 'ui'),
      stability: suggestions.filter(s => s.type === 'stability'),
      optimization: suggestions.filter(s => s.type === 'optimization'),
    };

    return {
      timestamp: new Date(),
      suggestions,
      byPriority,
      byType,
      summary: {
        totalCount: suggestions.length,
        newIssuesCount: suggestions.filter(s => s.isNew).length,
        deterioratingCount: suggestions.filter(s => s.isDeteriorating).length,
        resolvedCount,
      },
    };
  }

  /**
   * 创建空结果
   */
  private createEmptyResult(): SuggestionsResult {
    return {
      timestamp: new Date(),
      suggestions: [],
      byPriority: { critical: [], high: [], medium: [], low: [] },
      byType: { performance: [], ui: [], stability: [], optimization: [] },
      summary: { totalCount: 0, newIssuesCount: 0, deterioratingCount: 0, resolvedCount: 0 },
    };
  }
}

// ==================== Main Analysis Engine Class ====================

/**
 * 分析决策引擎 (A3)
 *
 * 整合三个子模块，提供统一的分析入口:
 * - A3.1: 性能基线对比分析
 * - A3.2: UI 回归检测
 * - A3.3: 优化建议生成
 *
 * 使用示例:
 * ```typescript
 * const engine = new AnalysisEngine({ thresholds: { memoryGrowthMB: 60 } });
 *
 * const report = await engine.runFullAnalysis(
 *   currentSnapshot,
 *   baselineSnapshot,
 *   { iteration: 1, baselineScreenshot: '/path/to/baseline.png', currentScreenshot: '/path/to/current.png' }
 * );
 *
 * console.log(`结论: ${report.conclusion}, 评分: ${report.healthScore}`);
 * ```
 */
export class AnalysisEngine {
  private options: typeof DEFAULT_OPTIONS;
  private performanceAnalyzer: PerformanceBaselineAnalyzer;
  private uiDetector: UIRegressionDetector;
  private suggestionGenerator: OptimizationSuggestionGenerator;

  constructor(options: AnalyzerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // 确保嵌套配置也被合并
    if (options.thresholds) {
      this.options.thresholds = { ...DEFAULT_OPTIONS.thresholds, ...options.thresholds };
    }
    if (options.uiDiffConfig) {
      this.options.uiDiffConfig = { ...DEFAULT_OPTIONS.uiDiffConfig, ...options.uiDiffConfig };
    }

    // 初始化子模块
    this.performanceAnalyzer = new PerformanceBaselineAnalyzer(this.options.thresholds);
    this.uiDetector = new UIRegressionDetector(this.options.uiDiffConfig);
    this.suggestionGenerator = new OptimizationSuggestionGenerator();

    logger.info('AnalysisEngine', '分析决策引擎初始化完成', {
      memoryThreshold: this.options.thresholds.memoryGrowthMB,
      cpuThreshold: this.options.thresholds.cpuPercentThreshold,
      uiDiffThreshold: this.options.uiDiffConfig.diffThreshold,
    });
  }

  /**
   * 执行完整的分析流程
   *
   * @param currentSnapshot 当前性能快照
   * @param baselineSnapshot 基线性能快照
   * @param input 完整分析输入参数
   * @returns 完整的分析报告
   */
  async runFullAnalysis(
    currentSnapshot: PerformanceSnapshot,
    baselineSnapshot: PerformanceSnapshot,
    input: FullAnalysisInput = { iteration: 1 }
  ): Promise<AnalysisReport> {
    const endTimer = logger.startTimer('AnalysisEngine', '执行完整分析流程');

    logger.info('AnalysisEngine', `开始第 ${input.iteration} 轮完整分析...`);

    try {
      // 1. 性能基线对比分析 (A3.1)
      const historicalSnapshots = input.historicalReports
        ?.map(r => r.currentSnapshot)
        .filter(Boolean) as PerformanceSnapshot[] | undefined;

      const performanceResult = this.performanceAnalyzer.analyze(
        currentSnapshot,
        baselineSnapshot,
        historicalSnapshots
      );

      // 2. UI 回归检测 (A3.2) - 仅在有截图时执行
      let uiResult: UIDiffResult | undefined;

      if (input.baselineScreenshot && input.currentScreenshot) {
        try {
          uiResult = await this.uiDetector.compare(
            input.baselineScreenshot,
            input.currentScreenshot
          );
        } catch (error) {
          logger.warn('AnalysisEngine', `UI 回归检测跳过: ${error}`);
        }
      }

      // 3. 优化建议生成 (A3.3)
      const previousSuggestions = input.historicalReports
        ?.flatMap(r => r.suggestions.suggestions) || [];

      const suggestionsResult = this.suggestionGenerator.generate({
        iteration: input.iteration,
        performanceResult,
        uiResult,
        historicalReports: input.historicalReports || [],
        previousSuggestions,
      });

      // 4. 计算总体结论和健康度评分
      const conclusion = this.determineOverallConclusion(performanceResult, uiResult);
      const healthScore = this.calculateHealthScore(performanceResult, uiResult, suggestionsResult);

      const report: AnalysisReport = {
        timestamp: new Date(),
        iteration: input.iteration,
        performance: performanceResult,
        uiRegression: uiResult,
        suggestions: suggestionsResult,
        conclusion,
        healthScore,
      };

      logger.info('AnalysisEngine', '完整分析流程完成', {
        iteration: input.iteration,
        conclusion,
        healthScore,
        perfScore: performanceResult.score.total,
        suggestionCount: suggestionsResult.summary.totalCount,
      });

      endTimer();
      return report;

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('AnalysisEngine', `完整分析流程失败: ${errMsg}`);
      endTimer();
      throw error;
    }
  }

  /**
   * 仅执行性能分析
   */
  analyzePerformance(
    current: PerformanceSnapshot,
    baseline: PerformanceSnapshot,
    historical?: PerformanceSnapshot[]
  ): PerformanceComparisonResult {
    return this.performanceAnalyzer.analyze(current, baseline, historical);
  }

  /**
   * 仅执行 UI 回归检测
   */
  async compareUI(
    baselinePath: string,
    currentPath: string
  ): Promise<UIDiffResult> {
    return this.uiDetector.compare(baselinePath, currentPath);
  }

  /**
   * 仅生成建议
   */
  generateSuggestions(context: RuleContext): SuggestionsResult {
    return this.suggestionGenerator.generate(context);
  }

  /**
   * 确定总体结论
   */
  private determineOverallConclusion(
    performance: PerformanceComparisonResult,
    uiResult?: UIDiffResult
  ): 'pass' | 'warning' | 'fail' {
    // 性能分析结论优先
    if (performance.conclusion === 'fail') {
      return 'fail';
    }

    // UI 回归检测不通过且差异较大
    if (uiResult && !uiResult.passed && uiResult.diffPercent > 1) {
      if (performance.conclusion === 'warning') {
        return 'fail';
      }
      return 'warning';
    }

    return performance.conclusion;
  }

  /**
   * 计算整体健康度评分
   *
   * 综合性能评分和 UI 一致性
   */
  private calculateHealthScore(
    performance: PerformanceComparisonResult,
    uiResult?: UIDiffResult,
    suggestions: SuggestionsResult
  ): number {
    let score = performance.score.total;

    // UI 一致性加权 (权重 20%)
    if (uiResult) {
      const uiScore = uiResult.passed ? 100 : Math.max(0, 100 - uiResult.diffPercent * 10);
      score = score * 0.8 + uiScore * 0.2;
    }

    // 严重问题惩罚
    const criticalCount = suggestions.byPriority.critical.length;
    if (criticalCount > 0) {
      score -= criticalCount * 15;
    }

    // 高优先级问题惩罚
    const highCount = suggestions.byPriority.high.length;
    if (highCount > 0) {
      score -= highCount * 8;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * 获取当前配置
   */
  getOptions(): Readonly<typeof this.options> {
    return this.options;
  }

  /**
   * 更新配置
   */
  updateOptions(options: Partial<AnalyzerOptions>): void {
    Object.assign(this.options, options);

    if (options.thresholds) {
      Object.assign(this.options.thresholds, options.thresholds);
      this.performanceAnalyzer = new PerformanceBaselineAnalyzer(this.options.thresholds);
    }

    if (options.uiDiffConfig) {
      Object.assign(this.options.uiDiffConfig, options.uiDiffConfig);
      this.uiDetector = new UIRegressionDetector(this.options.uiDiffConfig);
    }
  }
}

// 导出单例实例
export const analysisEngine = new AnalysisEngine();
export default analysisEngine;
