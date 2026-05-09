/**
 * Agent-Browser 集成平台 - 回归测试模块
 *
 * 功能:
 * - takeBaselineScreenshot(name): 采集基准截图
 * - compareScreenshots(before, after): 对比截图差异
 * - runRegressionSuite(tests[]): 执行回归测试套件
 * - generateReport(results): 生成测试报告
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  RegressionTestCase,
  RegressionTestResult,
  RegressionReport,
  ActionResult
} from './types.js';
import { actions } from './actions.js';
import { config } from './config.js';
import { logger } from './logger.js';

const execAsync = promisify(exec);

/** 回归测试管理器类 */
export class RegressionTestManager {
  private baselineDir: string;
  private currentDir: string;
  private reportDir: string;

  constructor() {
    const baseDir = config.get('screenshotPath');
    this.baselineDir = path.join(baseDir, 'baselines');
    this.currentDir = path.join(baseDir, 'current');
    this.reportDir = path.join(baseDir, 'reports');

    // 确保目录存在
    this.ensureDirectories();
  }

  /**
   * 确保所有必要目录存在
   */
  private ensureDirectories(): void {
    [this.baselineDir, this.currentDir, this.reportDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info('RegressionTest', `创建目录: ${dir}`);
      }
    });
  }

  /**
   * 采集基准截图
   * @param name 基准名称（用于标识）
   */
  async takeBaselineScreenshot(name: string): Promise<ActionResult<string>> {
    const endTimer = logger.startTimer('RegressionTest', `采集基准截图 [${name}]`);

    try {
      const filename = `${name}-baseline.png`;
      const filePath = path.join(this.baselineDir, filename);

      // 截图
      const screenshotResult = await actions.screenshot(filename, filePath);

      if (!screenshotResult.success) {
        throw new Error(screenshotResult.error || '截图失败');
      }

      // 保存元数据
      const metadata = {
        name,
        timestamp: new Date().toISOString(),
        path: filePath,
        size: fs.statSync(filePath).size,
      };

      const metadataPath = path.join(this.baselineDir, `${name}-baseline.json`);
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

      logger.info('RegressionTest', `基准截图已保存`, metadata);
      endTimer();

      return {
        success: true,
        data: filePath,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('RegressionTest', `采集基准截图失败: ${errMsg}`);
      endTimer();

      return {
        success: false,
        error: errMsg,
        duration: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 对比两张截图的差异
   * 使用像素级对比（需要安装 pixelmatch 或类似工具）
   * @param beforePath 基准截图路径
   * @param afterPath 当前截图路径
   * @param tolerance 容差值（0-1），默认 0.1
   */
  async compareScreenshots(
    beforePath: string,
    afterPath: string,
    tolerance: number = 0.1
  ): Promise<{
    diffScore: number;
    diffImagePath?: string;
    identical: boolean;
  }> {
    const endTimer = logger.startTimer('RegressionTest', '对比截图差异');

    try {
      // 验证文件存在
      if (!fs.existsSync(beforePath)) {
        throw new Error(`基准截图不存在: ${beforePath}`);
      }

      if (!fs.existsSync(afterPath)) {
        throw new Error(`当前截图不存在: ${afterPath}`);
      }

      // 使用 ImageMagick 的 compare 命令进行对比（如果可用）
      // 或者使用简单的文件大小对比作为备选方案

      let diffScore = 0;

      try {
        // 尝试使用 ImageMagick
        const diffOutputPath = path.join(
          this.currentDir,
          `diff-${Date.now()}.png`
        );

        const { stdout } = await execAsync(
          `compare -metric AE "${beforePath}" "${afterPath}" "${diffOutputPath}" 2>&1`,
          { timeout: 30000 }
        );

        // 解析输出获取差异像素数
        const aeValue = parseInt(stdout.trim(), 10);

        if (!isNaN(aeValue)) {
          // 归一化到 0-1 范围（假设最大差异为图片总面积的 10%）
          const { width, height } = await this.getImageDimensions(beforePath);
          const totalPixels = width * height;
          diffScore = Math.min(aeValue / (totalPixels * tolerance), 1);
        }

        logger.debug('RegressionTest', `ImageMagick 对比完成`, { diffScore, aeValue });
      } catch (imageMagickError) {
        // ImageMagick 不可用，使用备选方案：文件大小和哈希对比
        logger.warn('RegressionTest', 'ImageMagick 不可用，使用备选对比方法');

        const beforeStats = fs.statSync(beforePath);
        const afterStats = fs.statSync(afterPath);

        // 简单的大小差异计算
        const sizeDiff =
          Math.abs(beforeStats.size - afterStats.size) /
          Math.max(beforeStats.size, afterStats.size);

        diffScore = Math.min(sizeDiff * 10, 1); // 放大差异以便检测
      }

      const identical = diffScore < tolerance;

      logger.info('RegressionTest', '截图对比完成', {
        diffScore: diffScore.toFixed(4),
        tolerance,
        identical,
      });

      endTimer();

      return {
        diffScore,
        identical,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('RegressionTest', `截图对比失败: ${errMsg}`);
      endTimer();

      return {
        diffScore: 1,
        identical: false,
      };
    }
  }

  /**
   * 获取图片尺寸
   */
  private async getImageDimensions(
    imagePath: string
  ): Promise<{ width: number; height: number }> {
    try {
      const { stdout } = await execAsync(
        `identify -format "%w %h" "${imagePath}"`,
        { timeout: 5000 }
      );

      const [width, height] = stdout.trim().split(/\s+/).map(Number);

      return { width: width || 0, height: height || 0 };
    } catch {
      // 返回默认尺寸
      return { width: 1920, height: 1080 };
    }
  }

  /**
   * 执行单个回归测试用例
   */
  async runSingleTest(testCase: RegressionTestCase): Promise<RegressionTestResult> {
    const startTime = Date.now();
    const testName = testCase.name;

    logger.info('RegressionTest', `执行测试用例: ${testName}`);

    try {
      // 1. 执行前置操作
      const actionResult = await testCase.action();

      if (!actionResult.success) {
        throw new Error(actionResult.error || '操作执行失败');
      }

      // 2. 截取当前状态
      const currentFilename = `${testName}-current-${Date.now()}.png`;
      const currentPath = path.join(this.currentDir, currentFilename);

      const screenshotResult = await actions.screenshot(currentFilename, currentPath);

      if (!screenshotResult.success) {
        throw new Error(screenshotResult.error || '截图失败');
      }

      // 3. 与基准对比
      const comparison = await this.compareScreenshots(
        testCase.baselinePath,
        currentPath,
        testCase.tolerance || 0.1
      );

      const duration = Date.now() - startTime;

      const result: RegressionTestResult = {
        name: testName,
        passed: comparison.identical,
        baselinePath: testCase.baselinePath,
        currentPath,
        diffScore: comparison.diffScore,
        duration,
      };

      logger.info('RegressionTest', `测试用例完成: ${testName}`, {
        passed: result.passed,
        diffScore: result.diffScore.toFixed(4),
        duration: `${duration}ms`,
      });

      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;

      logger.error('RegressionTest', `测试用例失败: ${testName}`, {
        error: errMsg,
        duration: `${duration}ms`,
      });

      return {
        name: testName,
        passed: false,
        baselinePath: testCase.baselinePath,
        currentPath: '',
        diffScore: 1,
        duration,
        error: errMsg,
      };
    }
  }

  /**
   * 执行回归测试套件
   * @param tests 测试用例数组
   */
  async runRegressionSuite(
    tests: RegressionTestCase[]
  ): Promise<ActionResult<RegressionReport>> {
    const endTimer = logger.startTimer(
      'RegressionTest',
      `执行回归测试套件 (${tests.length} 个用例)`
    );

    const results: RegressionTestResult[] = [];

    try {
      logger.info('RegressionTest', '开始执行回归测试套件');

      for (let i = 0; i < tests.length; i++) {
        const test = tests[i];

        logger.info(
          'RegressionTest',
          `进度: ${i + 1}/${tests.length} - ${test.name}`
        );

        const result = await this.runSingleTest(test);
        results.push(result);

        // 用例间间隔
        if (i < tests.length - 1) {
          await actions.wait(500);
        }
      }

      // 生成报告
      const report = this.generateReport(results);

      logger.info('RegressionTest', '回归测试套件执行完毕', {
        total: report.totalTests,
        passed: report.passed,
        failed: report.failed,
        passRate: ((report.passed / report.totalTests) * 100).toFixed(1) + '%',
      });

      endTimer();

      return {
        success: true,
        data: report,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('RegressionTest', `回归测试套件执行失败: ${errMsg}`);

      // 即使整体失败，也返回已有结果的报告
      const partialReport = this.generateReport(results);

      endTimer();

      return {
        success: false,
        data: partialReport,
        error: errMsg,
        duration: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 生成测试报告
   * @param results 测试结果数组
   */
  generateReport(results: RegressionTestResult[]): RegressionReport {
    const totalTests = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = totalTests - passed;

    const avgDuration =
      results.reduce((sum, r) => sum + r.duration, 0) / totalTests || 0;

    const avgDiffScore =
      results.reduce((sum, r) => sum + r.diffScore, 0) / totalTests || 0;

    const summary = [
      `回归测试报告`,
      `=${'='.repeat(40)}`,
      ``,
      `执行时间: ${new Date().toLocaleString('zh-CN')}`,
      `总测试数: ${totalTests}`,
      `通过: ${passed} (${((passed / totalTests) * 100).toFixed(1)}%)`,
      `失败: ${failed} (${((failed / totalTests) * 100).toFixed(1)}%)`,
      `平均耗时: ${(avgDuration / 1000).toFixed(2)}s`,
      `平均差异分数: ${avgDiffScore.toFixed(4)}`,
      ``,
      `详细结果:` + '\n' + '-'.repeat(50),
      ...results.map(r =>
        `[${r.passed ? 'PASS' : 'FAIL'}] ${r.name}` +
        (r.duration ? ` (${r.duration}ms)` : '') +
        (r.diffScore > 0 ? ` [diff: ${r.diffScore.toFixed(4)}]` : '') +
        (r.error ? `\n  错误: ${r.error}` : '')
      ),
    ].join('\n');

    const report: RegressionReport = {
      runDate: new Date(),
      totalTests,
      passed,
      failed,
      results,
      summary,
    };

    // 保存报告到文件
    this.saveReport(report);

    return report;
  }

  /**
   * 保存报告到文件
   */
  private saveReport(report: RegressionReport): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportFilename = `regression-report-${timestamp}.txt`;
      const reportPath = path.join(this.reportDir, reportFilename);

      fs.writeFileSync(reportPath, report.summary, 'utf-8');

      // 同时保存 JSON 格式
      const jsonReportPath = path.join(
        this.reportDir,
        `regression-report-${timestamp}.json`
      );
      fs.writeFileSync(
        jsonReportPath,
        JSON.stringify(report, null, 2),
        'utf-8'
      );

      logger.info('RegressionTest', `报告已保存: ${reportPath}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('RegressionTest', `保存报告失败: ${errMsg}`);
    }
  }

  /**
   * 更新基准截图
   * @param name 基准名称
   */
  async updateBaseline(name: string): Promise<ActionResult<string>> {
    const endTimer = logger.startTimer('RegressionTest', `更新基准截图 [${name}]`);

    try {
      // 先截取当前状态作为新基准
      const result = await this.takeBaselineScreenshot(name);

      if (!result.success) {
        throw new Error(result.error || '更新失败');
      }

      logger.info('RegressionTest', `基准截图已更新: ${name}`);
      endTimer();

      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('RegressionTest', `更新基准截图失败: ${errMsg}`);
      endTimer();

      return {
        success: false,
        error: errMsg,
        duration: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 列出所有可用的基准截图
   */
  listBaselines(): Array<{ name: string; path: string; date: Date }> {
    const baselines: Array<{ name: string; path: string; date: Date }> = [];

    try {
      if (!fs.existsSync(this.baselineDir)) {
        return baselines;
      }

      const files = fs.readdirSync(this.baselineDir);

      for (const file of files) {
        if (file.endsWith('-baseline.json')) {
          const metadataPath = path.join(this.baselineDir, file);
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

          baselines.push({
            name: metadata.name,
            path: metadata.path,
            date: new Date(metadata.timestamp),
          });
        }
      }

      // 按日期排序
      baselines.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      logger.error('RegressionTest', '列出基准截图失败:', error);
    }

    return baselines;
  }

  /**
   * 清理旧的当前截图（保留最近 N 天的）
   * @param keepDays 保留天数，默认 7
   */
  cleanupOldScreenshots(keepDays: number = 7): ActionResult<void> {
    const endTimer = logger.startTimer('RegressionTest', '清理旧截图');

    try {
      const cutoffTime = Date.now() - keepDays * 24 * 60 * 60 * 1000;
      let cleanedCount = 0;

      if (fs.existsSync(this.currentDir)) {
        const files = fs.readdirSync(this.currentDir);

        for (const file of files) {
          const filePath = path.join(this.currentDir, file);
          const stats = fs.statSync(filePath);

          if (stats.mtimeMs < cutoffTime) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        }
      }

      logger.info('RegressionTest', `已清理 ${cleanedCount} 个旧截图`);
      endTimer();

      return {
        success: true,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('RegressionTest', `清理旧截图失败: ${errMsg}`);
      endTimer();

      return {
        success: false,
        error: errMsg,
        duration: 0,
        timestamp: new Date(),
      };
    }
  }
}

// 导出单例实例
export const regressionTest = new RegressionTestManager();
export default regressionTest;
