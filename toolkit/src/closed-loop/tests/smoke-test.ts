/**
 * Closed-Loop Validation System - Enhanced Smoke Test Suite (B1)
 *
 * 增强版冒烟测试套件，用于验证 TRAE SOLO CN 的基本功能
 *
 * 测试流程:
 * Phase 1: 初始化 - 设置迭代编号和输出目录
 * Phase 2: 启动 SOLO - 启动进程并等待 CDP 就绪
 * Phase 3: 结构检查 - CDP 连接性和页面快照
 * Phase 4: 元素检查 - 关键 UI 元素验证
 * Phase 5: 交互检查 - 截图和快照性能测试
 * Phase 6: 报告生成 - 汇总结果并导出日志
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import type { PerformanceSnapshot } from '../types.js';
import { SoloController } from '../controller.js';
import { DataCollector } from '../collector.js';
import { logger } from '../../agent-browser/logger.js';
import {
  DEFAULT_CDP_PORT,
  CDP_HOST,
  CDP_VERSION_ENDPOINT,
} from '../../constants.js';

// ==================== Type Definitions ====================

/** 冒烟测试配置选项 */
export interface SmokeTestOptions {
  /** 运行时控制器 */
  controller: SoloController;
  /** 数据采集器 */
  collector: DataCollector;
  /** 当前迭代编号 (默认 1) */
  iteration?: number;
  /** 截图保存目录 */
  screenshotDir?: string;
}

/** 单项测试检查结果 */
export interface TestCheck {
  /** 检查项名称 */
  name: string;
  /** 检查分类 (process/cdp/structure/ui/interaction) */
  category: string;
  /** 是否通过 */
  passed: boolean;
  /** 实际值 */
  actual?: any;
  /** 期望值 */
  expected?: any;
  /** 错误信息 */
  error?: string;
  /** 执行耗时 (ms) */
  durationMs: number;
  /** 时间戳 */
  timestamp: Date;
  /** 详细信息 */
  details?: string;
}

/** 冒烟测试完整结果 */
export interface SmokeTestResult {
  /** 总体是否通过 */
  passed: boolean;
  /** 执行的阶段列表 */
  phase: string[];
  /** 总执行时间 (ms) */
  durationMs: number;
  /** 截图文件路径列表 */
  snapshots: string[];
  /** 各项检查结果 */
  checks: TestCheck[];
  /** 性能基线快照 */
  performanceBaseline?: PerformanceSnapshot;
  /** 统计信息 */
  statistics: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    passRate: number;
    averageDurationMs: number;
  };
  /** 测试开始时间 */
  startTime: Date;
  /** 测试结束时间 */
  endTime: Date;
  /** 操作日志导出路径 */
  logExportPath?: string;
}

/** 关键元素定义 */
interface KeyElement {
  /** 元素名称（中英文） */
  names: string[];
  /** 元素类型或角色 */
  roles?: string[];
  /** 是否必须存在 */
  required: boolean;
}

// ==================== Constants ====================

/** 启动超时时间 (60 秒) */
const STARTUP_TIMEOUT_MS = 60000;

/** 默认截图目录 */
const DEFAULT_SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots', 'smoke');

/** 需要检查的关键 UI 元素列表 */
const KEY_UI_ELEMENTS: KeyElement[] = [
  {
    names: ['新建任务', 'New task'],
    roles: ['button'],
    required: true,
  },
  {
    names: ['技能', 'Skills'],
    roles: ['button'],
    required: true,
  },
  {
    names: ['自动化', 'Automation'],
    roles: ['button'],
    required: true,
  },
  {
    names: [],
    roles: ['textbox', 'textarea'],
    required: true,
  },
  {
    names: ['工作区', 'workspace', '底部栏'],
    required: false,
  },
];

// ==================== Smoke Test Class ====================

export class SmokeTest {
  private options: Required<SmokeTestOptions>;
  private checks: TestCheck[] = [];
  private snapshots: string[] = [];
  private phases: string[] = [];
  private startTime!: Date;
  private endTime!: Date;
  private abortController: AbortController | null = null;

  constructor(options: SmokeTestOptions) {
    this.options = {
      ...options,
      iteration: options.iteration || 1,
      screenshotDir: options.screenshotDir || DEFAULT_SCREENSHOT_DIR,
    };

    // 确保输出目录存在
    this.ensureDirectory(this.options.screenshotDir);
  }

  /**
   * 执行完整的冒烟测试
   *
   * @param signal 可选的 AbortSignal 用于取消测试
   * @returns 完整的测试结果
   */
  async run(signal?: AbortSignal): Promise<SmokeTestResult> {
    // 初始化
    this.startTime = new Date();
    this.checks = [];
    this.snapshots = [];
    this.phases = [];
    this.abortController = new AbortController();

    // 监听外部取消信号
    if (signal) {
      signal.addEventListener('abort', () => this.abortController?.abort(), { once: true });
    }

    logger.info('SmokeTest', `开始执行增强版冒烟测试 (迭代 ${this.options.iteration})`);

    try {
      // ===== Phase 1: 初始化 =====
      await this.executePhase('Phase 1: 初始化', async () => {
        await this.phase1_Initialize();
      });

      // 检查是否已取消
      this.checkAborted();

      // ===== Phase 2: 启动 SOLO =====
      await this.executePhase('Phase 2: 启动 SOLO', async () => {
        await this.phase2_StartSolo();
      });

      this.checkAborted();

      // ===== Phase 3: 结构检查 =====
      await this.executePhase('Phase 3: 结构检查', async () => {
        await this.phase3_StructureCheck();
      });

      this.checkAborted();

      // ===== Phase 4: 元素检查 =====
      await this.executePhase('Phase 4: 元素检查', async () => {
        await this.phase4_ElementCheck();
      });

      this.checkAborted();

      // ===== Phase 5: 交互检查 =====
      await this.executePhase('Phase 5: 交互检查', async () => {
        await this.phase5_InteractionCheck();
      });

      this.checkAborted();

      // ===== Phase 6: 报告生成 =====
      await this.executePhase('Phase 6: 报告生成', async () => {
        return; // 报告生成在最后统一处理
      });

      // 记录结束时间
      this.endTime = new Date();

      // 生成最终报告
      const result = await this.generateReport();

      logger.info('SmokeTest', `冒烟测试完成`, {
        passed: result.passed,
        passRate: `${result.statistics.passRate}%`,
        durationMs: result.durationMs,
        snapshotCount: result.snapshots.length,
      });

      return result;
    } catch (error) {
      // 如果是取消操作，返回部分结果
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('SmokeTest', '冒烟测试被取消');
        this.endTime = new Date();
        return await this.generateReport();
      }

      // 其他错误
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('SmokeTest', `冒烟测试异常: ${errMsg}`);

      // 记录异常为失败的检查
      this.addCheck({
        name: '测试执行',
        category: 'system',
        passed: false,
        error: errMsg,
        durationMs: 0,
        timestamp: new Date(),
        details: '测试执行过程中发生未处理的异常',
      });

      this.endTime = new Date();
      return await this.generateReport();
    }
  }

  // ==================== Phase Implementations ====================

  /**
   * Phase 1: 初始化
   * - 设置迭代编号
   * - 创建输出目录
   * - 记录开始时间
   */
  private async phase1_Initialize(): Promise<void> {
    const startMs = Date.now();

    logger.info('SmokeTest', '初始化测试环境...');

    try {
      // 设置数据采集器的迭代编号
      this.options.collector.setIteration(this.options.iteration);

      // 记录初始化操作
      this.options.collector.logOperation({
        timestamp: new Date(),
        iteration: this.options.iteration,
        phase: 'initialization',
        test: 'smoke-test',
        type: 'custom',
        input: { iteration: this.options.iteration, screenshotDir: this.options.screenshotDir },
        output: { initialized: true },
        durationMs: Date.now() - startMs,
        success: true,
      });

      // 记录成功的检查
      this.addCheck({
        name: '初始化',
        category: 'system',
        passed: true,
        actual: {
          iteration: this.options.iteration,
          screenshotDir: this.options.screenshotDir,
        },
        expected: { iteration: this.options.iteration },
        durationMs: Date.now() - startMs,
        timestamp: new Date(),
        details: `迭代 ${this.options.iteration}, 截图目录: ${this.options.screenshotDir}`,
      });

      logger.info('SmokeTest', '初始化完成');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.addCheck({
        name: '初始化',
        category: 'system',
        passed: false,
        error: errMsg,
        durationMs: Date.now() - startMs,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Phase 2: 启动 SOLO
   * - 调用 controller.start()
   * - 等待 CDP 就绪
   * - 截取初始状态截图
   * - 采集性能基线快照
   */
  private async phase2_StartSolo(): Promise<void> {
    const startMs = Date.now();
    const logTimed = this.options.collector.createTimedLog(
      'custom',
      'startup',
      'smoke-test',
      { action: 'start-solo' }
    );

    logger.info('SmokeTest', '启动 SOLO 进程...');

    try {
      // 2.1 启动 SOLO
      const startResult = await this.options.controller.start(
        this.abortController?.signal
      );

      const pidCheck: TestCheck = {
        name: '进程启动',
        category: 'process',
        passed: startResult.success && startResult.pid > 0,
        actual: { pid: startResult.pid, success: startResult.success },
        expected: { pid: '>0', success: true },
        durationMs: 0,
        timestamp: new Date(),
      };

      if (!startResult.success) {
        pidCheck.error = startResult.error || 'SOLO 启动失败';
        logger.error('SmokeTest', `SOLO 启动失败: ${pidCheck.error}`);
      } else {
        logger.info('SmokeTest', `SOLO 进程已启动 (PID: ${startResult.pid})`);
      }

      pidCheck.durationMs = Date.now() - startMs;
      this.addCheck(pidCheck);

      // 2.2 检查启动耗时
      const startupDuration = Date.now() - startMs;
      const timeoutCheck: TestCheck = {
        name: '启动耗时',
        category: 'process',
        passed: startupDuration < STARTUP_TIMEOUT_MS,
        actual: { durationMs: startupDuration },
        expected: { maxDurationMs: STARTUP_TIMEOUT_MS },
        durationMs: 0,
        timestamp: new Date(),
        details: `启动耗时 ${startupDuration}ms (限制 ${STARTUP_TIMEOUT_MS}ms)`,
      };

      if (startupDuration >= STARTUP_TIMEOUT_MS) {
        timeoutCheck.error = `启动超时 (${startupDuration}ms >= ${STARTUP_TIMEOUT_MS}ms)`;
      }

      this.addCheck(timeoutCheck);

      logTimed({ startResult }, startResult.success, startResult.error);

      // 如果启动失败，仍然继续后续检查（但会失败）
      if (!startResult.success) {
        logger.warn('SmokeTest', 'SOLO 启动失败，后续检查可能会失败');
      }

      // 2.3 截取初始状态截图
      await this.capturePhaseScreenshot('initial');

      // 2.4 采集性能基线快照
      if (startResult.success) {
        try {
          const baseline = await this.options.collector.collectPerformanceSnapshot();
          logTimed({ baseline }, true);
          // 基线会在 generateReport 中使用
        } catch (baselineError) {
          logger.warn('SmokeTest', `性能基线采集失败: ${baselineError}`);
        }
      }

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logTimed(null, false, errMsg);

      this.addCheck({
        name: '进程启动',
        category: 'process',
        passed: false,
        error: errMsg,
        durationMs: Date.now() - startMs,
        timestamp: new Date(),
      });

      // 不抛出错误，继续执行后续检查
      logger.error('SmokeTest', `启动阶段异常: ${errMsg}`);
    }
  }

  /**
   * Phase 3: 结构检查
   * - CDP 连接性检查
   * - 页面快照获取
   * - 截图记录
   */
  private async phase3_StructureCheck(): Promise<void> {
    logger.info('SmokeTest', '执行结构检查...');

    // 3.1 CDP 连接检查
    await this.checkCdpConnection();

    // 3.2 页面快照检查
    await this.checkPageSnapshot();

    // 3.3 截图
    await this.capturePhaseScreenshot('snapshot');
  }

  /**
   * Phase 4: 元素检查
   * - 检查关键 UI 元素是否存在
   * - AI 面板可见性检查
   * - 截图记录
   */
  private async phase4_ElementCheck(): Promise<void> {
    logger.info('SmokeTest', '执行元素检查...');

    // 4.1 检查关键 UI 元素
    await this.checkKeyUIElements();

    // 4.2 AI 面板可见性检查
    await this.checkAIPanelVisibility();

    // 4.3 截图
    await this.capturePhaseScreenshot('elements');
  }

  /**
   * Phase 5: 交互检查
   * - 截图功能测试
   * - Snapshot 性能测试
   * - 截图记录
   */
  private async phase5_InteractionCheck(): Promise<void> {
    logger.info('SmokeTest', '执行交互检查...');

    // 5.1 截图功能测试
    await this.testScreenshotFunctionality();

    // 5.2 Snapshot 性能测试
    await this.testSnapshotPerformance();

    // 5.3 最终截图
    await this.capturePhaseScreenshot('interaction');
  }

  // ==================== Check Methods ====================

  /**
   * 检查 CDP 连接
   */
  private async checkCdpConnection(): Promise<void> {
    const startMs = Date.now();
    const state = this.options.controller.getState();
    const port = state.cdpPort || DEFAULT_CDP_PORT;
    const logTimed = this.options.collector.createTimedLog(
      'custom',
      'structure',
      'cdp-connection',
      { port }
    );

    try {
      // 3.1.1 检查 CDP 端口可达性
      const cdpReachable = await this.checkCdpPort(port);

      this.addCheck({
        name: 'CDP 端口可达性',
        category: 'cdp',
        passed: cdpReachable.reachable,
        actual: { port, reachable: cdpReachable.reachable, latencyMs: cdpReachable.latencyMs },
        expected: { port, reachable: true },
        durationMs: cdpReachable.latencyMs,
        timestamp: new Date(),
        details: `端口 ${port} ${cdpReachable.reachable ? '可达' : '不可达'} (${cdpReachable.latencyMs}ms)`,
      });

      // 3.1.2 检查 WebSocket URL
      const wsUrlCheck: TestCheck = {
        name: 'WebSocket URL',
        category: 'cdp',
        passed: !!state.wsUrl && state.wsUrl.length > 0,
        actual: { wsUrl: state.wsUrl || '(未获取)' },
        expected: { wsUrl: '(非空字符串)' },
        durationMs: 0,
        timestamp: new Date(),
      };

      if (!state.wsUrl) {
        wsUrlCheck.error = '未获取到 WebSocket URL';
      }

      this.addCheck(wsUrlCheck);

      // 3.1.3 检查 Browser Version
      const browserVersionCheck: TestCheck = {
        name: 'Browser Version',
        category: 'cdp',
        passed: !!state.browserVersion && state.browserVersion.length > 0,
        actual: { version: state.browserVersion || '(未获取)' },
        expected: { version: '(非空字符串)' },
        durationMs: 0,
        timestamp: new Date(),
      };

      if (!state.browserVersion) {
        browserVersionCheck.error = '未获取到浏览器版本信息';
      } else {
        browserVersionCheck.details = `浏览器版本: ${state.browserVersion}`;
      }

      this.addCheck(browserVersionCheck);

      logTimed(
        { reachable: cdpReachable.reachable, wsUrl: !!state.wsUrl, version: !!state.browserVersion },
        cdpReachable.reachable && !!state.wsUrl && !!state.browserVersion
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logTimed(null, false, errMsg);

      this.addCheck({
        name: 'CDP 连接检查',
        category: 'cdp',
        passed: false,
        error: errMsg,
        durationMs: Date.now() - startMs,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 检查 CDP 端口可达性
   */
  private async checkCdpPort(port: number): Promise<{ reachable: boolean; latencyMs: number }> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const req = http.get(`http://${CDP_HOST}:${port}${CDP_VERSION_ENDPOINT}`, (res) => {
        if (res.statusCode === 200) {
          res.resume(); // 释放内存
          resolve({
            reachable: true,
            latencyMs: Date.now() - startTime,
          });
        } else {
          resolve({
            reachable: false,
            latencyMs: Date.now() - startTime,
          });
        }
      });

      req.on('error', () => {
        resolve({
          reachable: false,
          latencyMs: Date.now() - startTime,
        });
      });

      req.setTimeout(10000, () => {
        req.destroy();
        resolve({
          reachable: false,
          latencyMs: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * 检查页面快照
   */
  private async checkPageSnapshot(): Promise<void> {
    const startMs = Date.now();
    const logTimed = this.options.collector.createTimedLog(
      'snapshot',
      'structure',
      'page-snapshot',
      {}
    );

    try {
      const snapshotResult = await this.options.controller.getSnapshot();

      const snapshotCheck: TestCheck = {
        name: '页面快照获取',
        category: 'structure',
        passed: snapshotResult.success && !!snapshotResult.data,
        actual: {
          success: snapshotResult.success,
          hasData: !!snapshotResult.data,
          elementCount: snapshotResult.data?.elements?.length || 0,
        },
        expected: { success: true, hasData: true },
        durationMs: Date.now() - startMs,
        timestamp: new Date(),
      };

      if (!snapshotResult.success) {
        snapshotCheck.error = snapshotResult.error || '页面快照获取失败';
      } else {
        snapshotCheck.details = `获取到 ${snapshotResult.data?.elements?.length || 0} 个元素`;
      }

      this.addCheck(snapshotCheck);
      logTimed(snapshotResult.data, snapshotResult.success, snapshotResult.error);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logTimed(null, false, errMsg);

      this.addCheck({
        name: '页面快照获取',
        category: 'structure',
        passed: false,
        error: errMsg,
        durationMs: Date.now() - startMs,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 检查关键 UI 元素
   */
  private async checkKeyUIElements(): Promise<void> {
    const startMs = Date.now();
    const logTimed = this.options.collector.createTimedLog(
      'custom',
      'elements',
      'ui-elements',
      { elementsToCheck: KEY_UI_ELEMENTS.length }
    );

    try {
      // 获取页面快照
      const snapshotResult = await this.options.controller.getSnapshot();

      if (!snapshotResult.success || !snapshotResult.data) {
        // 无法获取快照，所有元素检查都标记为失败
        for (const element of KEY_UI_ELEMENTS) {
          const elementName = element.names[0] || element.roles?.join('/') || '未知元素';

          this.addCheck({
            name: `UI 元素: ${elementName}`,
            category: 'ui',
            passed: !element.required, // 非必需元素可以不通过
            error: '无法获取页面快照',
            durationMs: Date.now() - startMs,
            timestamp: new Date(),
            details: element.required ? '必需元素无法验证' : '非必需元素',
          });
        }

        logTimed(null, false, '无法获取页面快照');
        return;
      }

      const elements = snapshotResult.data.elements;
      let foundCount = 0;

      // 检查每个关键元素
      for (const keyElement of KEY_UI_ELEMENTS) {
        const elementStartMs = Date.now();
        const elementName = keyElement.names[0] || keyElement.roles?.join('/') || '未知元素';

        // 在快照中查找元素
        const found = elements.some(el => {
          // 按名称匹配
          const nameMatch = keyElement.names.some(name =>
            el.name.toLowerCase().includes(name.toLowerCase())
          );

          // 按角色匹配
          const roleMatch = keyElement.roles?.some(role =>
            el.role.toLowerCase().includes(role.toLowerCase())
          ) ?? false;

          return nameMatch || roleMatch;
        });

        const elementCheck: TestCheck = {
          name: `UI 元素: ${elementName}`,
          category: 'ui',
          passed: found || !keyElement.required,
          actual: { found },
          expected: { found: true },
          durationMs: Date.now() - elementStartMs,
          timestamp: new Date(),
          details: found
            ? `元素 "${elementName}" 已找到`
            : `元素 "${elementName}" 未找到${keyElement.required ? ' (必需)' : ' (可选)'}`,
        };

        if (!found && keyElement.required) {
          elementCheck.error = `必需元素 "${elementName}" 未找到`;
        }

        this.addCheck(elementCheck);

        if (found) foundCount++;
      }

      logTimed(
        { totalElements: KEY_UI_ELEMENTS.length, found: foundCount },
        foundCount >= KEY_UI_ELEMENTS.filter(e => e.required).length
      );

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logTimed(null, false, errMsg);

      this.addCheck({
        name: 'UI 元素检查',
        category: 'ui',
        passed: false,
        error: errMsg,
        durationMs: Date.now() - startMs,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 检查 AI 面板可见性
   */
  private async checkAIPanelVisibility(): Promise<void> {
    const startMs = Date.now();
    const logTimed = this.options.collector.createTimedLog(
      'custom',
      'elements',
      'ai-panel',
      {}
    );

    try {
      const snapshotResult = await this.options.controller.getSnapshot();

      if (!snapshotResult.success || !snapshotResult.data) {
        this.addCheck({
          name: 'AI 面板可访问性',
          category: 'ui',
          passed: false,
          error: '无法获取页面快照',
          durationMs: Date.now() - startMs,
          timestamp: new Date(),
        });

        logTimed(null, false, '无法获取页面快照');
        return;
      }

      const elements = snapshotResult.data.elements;

      // 查找 AI 相关元素（聊天面板、输入框、发送按钮等）
      const aiPanelIndicators = [
        '聊天', 'chat', 'AI', '发送', 'send', 'message', '输入框',
        'input', 'textbox', 'textarea'
      ];

      const aiRelatedElements = elements.filter(el =>
        aiPanelIndicators.some(indicator =>
          el.name.toLowerCase().includes(indicator.toLowerCase()) ||
          el.role.toLowerCase().includes(indicator.toLowerCase())
        )
      );

      // 检查 AI 聊天面板是否可访问
      const panelAccessible = aiRelatedElements.length > 0;

      const panelCheck: TestCheck = {
        name: 'AI 聊天面板',
        category: 'ui',
        passed: panelAccessible,
        actual: { accessible: panelAccessible, relatedElements: aiRelatedElements.length },
        expected: { accessible: true },
        durationMs: Date.now() - startMs,
        timestamp: new Date(),
        details: panelAccessible
          ? `找到 ${aiRelatedElements.length} 个 AI 相关元素`
          : '未找到 AI 面板相关元素',
      };

      if (!panelAccessible) {
        panelCheck.error = 'AI 聊天面板不可访问';
      }

      this.addCheck(panelCheck);

      // 检查发送按钮是否存在
      const sendButtonExists = elements.some(el =>
        el.name.toLowerCase().includes('发送') ||
        el.name.toLowerCase().includes('send') ||
        (el.role === 'button' && (
          el.name.toLowerCase().includes('提交') ||
          el.name.toLowerCase().includes('submit')
        ))
      );

      const sendButtonCheck: TestCheck = {
        name: '发送按钮',
        category: 'ui',
        passed: sendButtonExists,
        actual: { exists: sendButtonExists },
        expected: { exists: true },
        durationMs: 0,
        timestamp: new Date(),
        details: sendButtonExists ? '发送按钮已找到' : '发送按钮未找到',
      };

      if (!sendButtonExists) {
        sendButtonCheck.error = '发送按钮不存在';
      }

      this.addCheck(sendButtonCheck);

      logTimed(
        { panelAccessible, sendButtonExists, aiElements: aiRelatedElements.length },
        panelAccessible && sendButtonExists
      );

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logTimed(null, false, errMsg);

      this.addCheck({
        name: 'AI 面板检查',
        category: 'ui',
        passed: false,
        error: errMsg,
        durationMs: Date.now() - startMs,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 测试截图功能
   */
  private async testScreenshotFunctionality(): Promise<void> {
    const startMs = Date.now();
    const logTimed = this.options.collector.createTimedLog(
      'screenshot',
      'interaction',
      'screenshot-test',
      {}
    );

    try {
      // 使用控制器的截图功能
      const screenshotResult = await this.options.controller.takeScreenshot(
        `${this.options.iteration}-smoke-screenshot-test`
      );

      const screenshotCheck: TestCheck = {
        name: '截图功能',
        category: 'interaction',
        passed: screenshotResult.success && !!screenshotResult.data,
        actual: {
          success: screenshotResult.success,
          hasPath: !!screenshotResult.data,
          path: screenshotResult.data || '(无)',
        },
        expected: { success: true, hasPath: true },
        durationMs: Date.now() - startMs,
        timestamp: new Date(),
      };

      if (screenshotResult.success && screenshotResult.data) {
        this.snapshots.push(screenshotResult.data);
        screenshotCheck.details = `截图保存至: ${screenshotResult.data}`;
      } else {
        screenshotCheck.error = screenshotResult.error || '截图失败';
      }

      this.addCheck(screenshotCheck);
      logTimed(screenshotResult.data, screenshotResult.success, screenshotResult.error);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logTimed(null, false, errMsg);

      this.addCheck({
        name: '截图功能',
        category: 'interaction',
        passed: false,
        error: errMsg,
        durationMs: Date.now() - startMs,
        timestamp: new Date(),
      });
    }
  }

  /**
   * 测试 Snapshot 性能
   */
  private async testSnapshotPerformance(): Promise<void> {
    const startMs = Date.now();
    const logTimed = this.options.collector.createTimedLog(
      'snapshot',
      'interaction',
      'snapshot-performance',
      {}
    );

    try {
      // 多次执行 snapshot 以测试性能和稳定性
      const iterations = 3;
      const durations: number[] = [];
      let allSuccess = true;

      for (let i = 0; i < iterations; i++) {
        const iterStartMs = Date.now();
        const result = await this.options.controller.getSnapshot();
        const iterDuration = Date.now() - iterStartMs;

        durations.push(iterDuration);

        if (!result.success) {
          allSuccess = false;
        }

        // 短暂间隔
        if (i < iterations - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      const perfCheck: TestCheck = {
        name: 'Snapshot 性能',
        category: 'interaction',
        passed: allSuccess && avgDuration < 10000, // 平均耗时小于 10 秒
        actual: {
          iterations,
          allSuccess,
          avgDurationMs: avgDuration,
          maxDurationMs: maxDuration,
          minDurationMs: minDuration,
          durations,
        },
        expected: { allSuccess: true, avgDurationMs: '<10000' },
        durationMs: Date.now() - startMs,
        timestamp: new Date(),
        details: `${iterations} 次快照, 平均 ${avgDuration}ms (最小 ${minDuration}ms, 最大 ${maxDuration}ms)`,
      };

      if (!allSuccess) {
        perfCheck.error = '部分 snapshot 操作失败';
      } else if (avgDuration >= 10000) {
        perfCheck.error = `平均耗时过长 (${avgDuration}ms >= 10000ms)`;
      }

      this.addCheck(perfCheck);
      logTimed(
        { iterations, allSuccess, avgDuration, maxDuration, minDuration },
        allSuccess && avgDuration < 10000
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logTimed(null, false, errMsg);

      this.addCheck({
        name: 'Snapshot 性能',
        category: 'interaction',
        passed: false,
        error: errMsg,
        durationMs: Date.now() - startMs,
        timestamp: new Date(),
      });
    }
  }

  // ==================== Helper Methods ====================

  /**
   * 执行一个测试阶段
   */
  private async executePhase(phaseName: string, fn: () => Promise<void>): Promise<void> {
    logger.info('SmokeTest', `>>> ${phaseName}`);
    this.phases.push(phaseName);

    try {
      await fn();
      logger.info('SmokeTest', `<<< ${phaseName} 完成`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('SmokeTest', `<<< ${phaseName} 失败: ${errMsg}`);

      // 阶段失败不中止整个测试，只记录错误
      this.addCheck({
        name: phaseName,
        category: 'phase',
        passed: false,
        error: errMsg,
        durationMs: 0,
        timestamp: new Date(),
        details: `阶段执行失败，但继续后续测试`,
      });
    }
  }

  /**
   * 截取阶段截图
   */
  private async capturePhaseScreenshot(phase: string): Promise<void> {
    try {
      const metadata = await this.options.collector.takeScreenshot('smoke', phase);
      this.snapshots.push(metadata.path);

      logger.debug('SmokeTest', `阶段截图已保存: ${metadata.path} (${phase})`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn('SmokeTest', `阶段截图失败 [${phase}]: ${errMsg}`);

      // 截图失败不影响测试结果
    }
  }

  /**
   * 添加检查结果
   */
  private addCheck(check: TestCheck): void {
    this.checks.push(check);

    const statusIcon = check.passed ? '[PASS]' : '[FAIL]';
    const errorStr = check.error ? ` | ${check.error}` : '';
    logger.info('SmokeTest', `${statusIcon} [${check.category}] ${check.name}${errorStr}`);
  }

  /**
   * 检查是否已被取消
   */
  private checkAborted(): void {
    if (this.abortController?.signal.aborted) {
      throw new DOMException('测试被用户取消', 'AbortError');
    }
  }

  /**
   * 确保目录存在
   */
  private ensureDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logger.debug('SmokeTest', `创建目录: ${dirPath}`);
    }
  }

  /**
   * 生成最终报告
   */
  private async generateReport(): Promise<SmokeTestResult> {
    const totalTime = this.endTime.getTime() - this.startTime.getTime();
    const totalChecks = this.checks.length;
    const passedChecks = this.checks.filter(c => c.passed).length;
    const failedChecks = totalChecks - passedChecks;
    const passRate = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 10000) / 100 : 0;
    const avgDuration = totalChecks > 0
      ? Math.round(this.checks.reduce((sum, c) => sum + c.durationMs, 0) / totalChecks)
      : 0;

    // 导出操作日志
    let logExportPath: string | undefined;
    try {
      logExportPath = await this.options.collector.exportLogsToFile();
    } catch {
      // 日志导出失败不影响主流程
    }

    return {
      passed: failedChecks === 0, // 所有检查都通过才算通过
      phase: [...this.phases],
      durationMs: totalTime,
      snapshots: [...this.snapshots],
      checks: [...this.checks],
      statistics: {
        totalChecks,
        passedChecks,
        failedChecks,
        passRate,
        averageDurationMs: avgDuration,
      },
      startTime: this.startTime,
      endTime: this.endTime,
      logExportPath,
    };
  }

  /**
   * 打印测试报告摘要
   */
  printSummary(result: SmokeTestResult): void {
    console.log('\n' + '='.repeat(80));
    console.log('增强版冒烟测试报告摘要');
    console.log('='.repeat(80));
    console.log(`总体结果: ${result.passed ? '✓ 通过' : '✗ 失败'}`);
    console.log(`执行阶段: ${result.phase.join(' → ')}`);
    console.log(`总耗时: ${result.durationMs}ms`);
    console.log('-'.repeat(80));
    console.log(`检查统计:`);
    console.log(`  总检查数: ${result.statistics.totalChecks}`);
    console.log(`  通过: ${result.statistics.passedChecks}`);
    console.log(`  失败: ${result.statistics.failedChecks}`);
    console.log(`  通过率: ${result.statistics.passRate}%`);
    console.log(`  平均耗时: ${result.statistics.averageDurationMs}ms`);
    console.log('-'.repeat(80));
    console.log(`截图数量: ${result.snapshots.length}`);

    if (result.snapshots.length > 0) {
      console.log('截图文件:');
      result.snapshots.forEach((path, idx) => {
        console.log(`  ${idx + 1}. ${path}`);
      });
    }

    console.log('-'.repeat(80));

    if (result.checks.some(c => !c.passed)) {
      console.log('失败的检查:');
      result.checks
        .filter(c => !c.passed)
        .forEach(check => {
          console.log(`  ✗ [${check.category}] ${check.name}: ${check.error || '未知错误'}`);
        });
    }

    if (result.logExportPath) {
      console.log('-'.repeat(80));
      console.log(`操作日志: ${result.logExportPath}`);
    }

    console.log('='.repeat(80) + '\n');
  }
}

// ==================== Convenience Functions ====================

/**
 * 快速执行冒烟测试的便捷函数
 *
 * @param options 测试配置选项
 * @param signal 可选的取消信号
 * @returns 测试结果
 */
export async function runSmokeTest(
  options: SmokeTestOptions,
  signal?: AbortSignal
): Promise<SmokeTestResult> {
  const smokeTest = new SmokeTest(options);
  const result = await smokeTest.run(signal);

  // 自动打印摘要
  smokeTest.printSummary(result);

  return result;
}

// 导出默认实例工厂函数
export default SmokeTest;
