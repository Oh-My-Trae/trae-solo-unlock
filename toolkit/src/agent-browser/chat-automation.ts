/**
 * Agent-Browser 集成平台 - AI 对话自动化模块
 *
 * 功能:
 * - sendPrompt(prompt): 发送 Prompt 到 AI
 * - waitForResponse(timeout): 等待 AI 响应
 * - collectResponse(): 采集完整响应内容
 * - batchTest(prompts[]): 批量测试多个 Prompt
 * - benchmarkTest(prompt): 性能基准测试（测量响应时间、Token消耗）
 */

import type { AIResponse, BatchTestResult, BenchmarkResult, ActionResult } from './types.js';
import { actions } from './actions.js';
import { workspaceManager } from './workspace.js';
import { config } from './config.js';
import { logger } from './logger.js';

/** AI 对话自动化类 */
export class ChatAutomation {
  private currentPrompt: string = '';
  private responseStartTime: Date | null = null;

  /**
   * 发送 Prompt 到 AI
   * @param prompt 要发送的提示文本
   * @param workspaceName 可选的工作区名称（如果需要在特定工作区中发送）
   */
  async sendPrompt(prompt: string, workspaceName?: string): Promise<ActionResult<void>> {
    const endTimer = logger.startTimer('ChatAutomation', `发送 Prompt (${prompt.length} 字符)`);

    try {
      // 1. 如果指定了工作区，先切换
      if (workspaceName) {
        await workspaceManager.newTaskInWorkspace(workspaceName);
      }

      // 2. OBSERVE: 快照查看当前状态
      const snapshot = await actions.takeSnapshot();

      if (!snapshot.success || !snapshot.data) {
        throw new Error('无法获取页面状态');
      }

      // 3. 查找输入框
      const textboxElement = snapshot.data.elements.find(el => el.role === 'textbox');

      if (!textboxElement) {
        throw new Error('找不到输入框');
      }

      // 4. 点击输入框并输入
      await actions.click(textboxElement.ref);
      await actions.wait(200);

      // 清空并输入新文本
      await actions.clearAndType(prompt);

      // 记录开始时间
      this.currentPrompt = prompt;
      this.responseStartTime = new Date();

      // 5. 发送（按 Enter）
      await actions.pressKey('Enter');

      logger.info('ChatAutomation', 'Prompt 已发送', {
        promptLength: prompt.length,
        preview: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
      });

      endTimer();

      return {
        success: true,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('ChatAutomation', `发送 Prompt 失败: ${errMsg}`);
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
   * 等待 AI 响应完成
   * @param timeout 超时时间（毫秒），默认 120 秒
   */
  async waitForResponse(timeout?: number): Promise<ActionResult<AIResponse>> {
    const maxWait = timeout || 120000; // 默认 2 分钟
    const endTimer = logger.startTimer('ChatAutomation', '等待 AI 响应');

    try {
      if (!this.responseStartTime) {
        throw new Error('未发送过 Prompt，无法等待响应');
      }

      const startTime = Date.now();
      let lastContent = '';
      let stableCount = 0;
      const stableThreshold = 3; // 连续 3 次检测到相同内容认为响应完成
      const checkInterval = 2000; // 每 2 秒检查一次

      while (Date.now() - startTime < maxWait) {
        // 获取当前快照
        const snapshot = await actions.takeSnapshot();

        if (snapshot.success && snapshot.data) {
          // 从快照中提取响应内容
          const currentContent = this.extractResponseFromSnapshot(snapshot.data);

          if (currentContent && currentContent.length > 0) {
            // 检查内容是否稳定（不再变化）
            if (currentContent === lastContent) {
              stableCount++;

              if (stableCount >= stableThreshold) {
                // 响应已完成
                const responseTime = Date.now() - this.responseStartTime!.getTime();

                const response: AIResponse = {
                  content: currentContent,
                  timestamp: new Date(),
                  duration: responseTime,
                };

                logger.info('ChatAutomation', 'AI 响应完成', {
                  contentLength: currentContent.length,
                  responseTime: `${responseTime}ms`,
                });

                endTimer();

                return {
                  success: true,
                  data: response,
                  duration: 0,
                  timestamp: new Date(),
                };
              }
            } else {
              stableCount = 0; // 重置稳定计数
              lastContent = currentContent;
            }

            // 输出进度
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            logger.debug('ChatAutomation', `响应生成中... (${elapsed}s, ${currentContent.length} 字符)`);
          }
        }

        // 等待下次检查
        await actions.wait(checkInterval);
      }

      // 超时
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.warn('ChatAutomation', `等待响应超时 (${elapsed}s)`);

      // 返回已收集的部分内容
      const partialResponse: AIResponse = {
        content: lastContent || '',
        timestamp: new Date(),
        duration: Date.now() - this.responseStartTime!.getTime(),
      };

      endTimer();

      return {
        success: false,
        data: partialResponse,
        error: `响应超时 (${maxWait}ms)，已收集部分内容`,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('ChatAutomation', `等待响应失败: ${errMsg}`);
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
   * 从快照中提取 AI 响应内容
   */
  private extractResponseFromSnapshot(snapshot: { rawText: string; elements: any[] }): string {
    // 策略：查找响应区域的内容
    // 通常在聊天界面中，响应会显示在特定的区域

    const lines = snapshot.rawText.split('\n');
    const responseLines: string[] = [];
    let inResponseArea = false;

    for (const line of lines) {
      // 标记响应开始（根据实际 UI 调整）
      if (
        line.includes('assistant') ||
        line.includes('AI') ||
        line.includes('response') ||
        (inResponseArea && line.trim().length > 0)
      ) {
        inResponseArea = true;
        // 过滤掉 UI 元素标记
        const cleanLine = line.replace(/\[ref=.*?\]/g, '').trim();
        if (cleanLine.length > 0) {
          responseLines.push(cleanLine);
        }
      }

      // 标记响应结束（遇到新的用户消息或输入框）
      if (
        inResponseArea &&
        (line.includes('user') ||
         line.includes('textbox') ||
         line.includes('input'))
      ) {
        break;
      }
    }

    return responseLines.join('\n').trim();
  }

  /**
   * 采集完整响应内容（同步版本，用于已经完成的对话）
   */
  async collectResponse(): Promise<ActionResult<AIResponse>> {
    const endTimer = logger.startTimer('ChatAutomation', '采集完整响应');

    try {
      const snapshot = await actions.takeSnapshot();

      if (!snapshot.success || !snapshot.data) {
        throw new Error('无法获取页面状态');
      }

      const content = this.extractResponseFromSnapshot(snapshot.data);

      const response: AIResponse = {
        content,
        timestamp: new Date(),
        duration: this.responseStartTime
          ? Date.now() - this.responseStartTime.getTime()
          : 0,
      };

      logger.info('ChatAutomation', '响应采集完成', {
        contentLength: content.length,
      });

      endTimer();

      return {
        success: true,
        data: response,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('ChatAutomation', `采集响应失败: ${errMsg}`);
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
   * 批量测试多个 Prompt
   * @param prompts 要测试的 Prompt 数组
   */
  async batchTest(prompts: string[]): Promise<ActionResult<BatchTestResult[]>> {
    const endTimer = logger.startTimer('ChatAutomation', `批量测试 ${prompts.length} 个 Prompt`);
    const results: BatchTestResult[] = [];

    try {
      for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        logger.info('ChatAutomation', `处理第 ${i + 1}/${prompts.length} 个 Prompt`);

        try {
          // 发送 Prompt
          const sendResult = await this.sendPrompt(prompt);

          if (!sendResult.success) {
            results.push({
              prompt,
              response: null,
              success: false,
              error: sendResult.error,
            });
            continue;
          }

          // 等待响应
          const responseResult = await this.waitForResponse();

          results.push({
            prompt,
            response: responseResult.data || null,
            success: responseResult.success,
            error: responseResult.error,
          });

          // 测试间间隔，避免请求过于频繁
          if (i < prompts.length - 1) {
            logger.info('ChatAutomation', '等待 2 秒后继续下一个...');
            await actions.wait(2000);
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.error(`ChatAutomation`, `第 ${i + 1} 个 Prompt 测试失败: ${errMsg}`);

          results.push({
            prompt,
            response: null,
            success: false,
            error: errMsg,
          });
        }
      }

      // 统计结果
      const successCount = results.filter(r => r.success).length;
      logger.info('ChatAutomation', '批量测试完成', {
        total: prompts.length,
        success: successCount,
        failed: prompts.length - successCount,
      });

      endTimer();

      return {
        success: true,
        data: results,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('ChatAutomation', `批量测试失败: ${errMsg}`);
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
   * 性能基准测试
   * @param prompt 要测试的 Prompt
   * @param iterations 迭代次数，默认 1
   */
  async benchmarkTest(
    prompt: string,
    iterations: number = 1
  ): Promise<ActionResult<BenchmarkResult[]>> {
    const endTimer = logger.startTimer('ChatAutomation', `基准测试 (${iterations} 次迭代)`);
    const results: BenchmarkResult[] = [];

    try {
      for (let i = 0; i < iterations; i++) {
        logger.info('ChatAutomation', `基准测试迭代 ${i + 1}/${iterations}`);

        const startTime = Date.now();

        // 发送 Prompt
        const sendResult = await this.sendPrompt(prompt);

        if (!sendResult.success) {
          results.push({
            prompt,
            responseTime: 0,
            success: false,
            error: sendResult.error,
          });
          continue;
        }

        // 等待响应
        const responseResult = await this.waitForResponse();
        const responseTime = Date.now() - startTime;

        results.push({
          prompt,
          responseTime,
          tokenCount: responseResult.data?.tokenCount,
          success: responseResult.success,
          error: responseResult.error,
        });

        // 迭代间间隔
        if (i < iterations - 1) {
          await actions.wait(3000);
        }
      }

      // 计算统计数据
      const successfulResults = results.filter(r => r.success);

      if (successfulResults.length > 0) {
        const avgResponseTime =
          successfulResults.reduce((sum, r) => sum + r.responseTime, 0) /
          successfulResults.length;

        const minResponseTime = Math.min(...successfulResults.map(r => r.responseTime));
        const maxResponseTime = Math.max(...successfulResults.map(r => r.responseTime));

        logger.info('ChatAutomation', '基准测试完成', {
          iterations,
          successful: successfulResults.length,
          avgResponseTime: `${(avgResponseTime / 1000).toFixed(2)}s`,
          minResponseTime: `${(minResponseTime / 1000).toFixed(2)}s`,
          maxResponseTime: `${(maxResponseTime / 1000).toFixed(2)}s`,
        });
      }

      endTimer();

      return {
        success: true,
        data: results,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('ChatAutomation', `基准测试失败: ${errMsg}`);
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
   * 完整的对话流程：发送 Prompt 并等待响应
   * @param prompt Prompt 文本
   * @param workspaceName 可选的工作区名称
   * @param timeout 响应超时时间
   */
  async chat(
    prompt: string,
    workspaceName?: string,
    timeout?: number
  ): Promise<ActionResult<AIResponse>> {
    const endTimer = logger.startTimer('ChatAutomation', '完整对话流程');

    try {
      // 1. 发送 Prompt
      const sendResult = await this.sendPrompt(prompt, workspaceName);

      if (!sendResult.success) {
        throw new Error(sendResult.error || '发送 Prompt 失败');
      }

      // 2. 等待响应
      const responseResult = await this.waitForResponse(timeout);

      if (!responseResult.success && !responseResult.data) {
        throw new Error(responseResult.error || '等待响应失败');
      }

      endTimer();

      return {
        success: true,
        data: responseResult.data!,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('ChatAutomation', `对话流程失败: ${errMsg}`);
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
   * 中止当前正在进行的响应
   */
  async abortResponse(): Promise<ActionResult<void>> {
    const endTimer = logger.startTimer('ChatAutomation', '中止响应');

    try {
      // 点击停止按钮（如果有）
      const stopResult = await actions.clickByText('停止');

      if (!stopResult.success) {
        // 尝试英文
        await actions.clickByText('Stop');
      }

      // 使用快捷键 Escape 作为备选方案
      await actions.pressKey('Escape');

      logger.info('ChatAutomation', '响应已中止');
      endTimer();

      return {
        success: true,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn('ChatAutomation', `中止响应时出错: ${errMsg}`);
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
export const chatAutomation = new ChatAutomation();
export default chatAutomation;
