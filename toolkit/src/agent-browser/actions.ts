/**
 * Agent-Browser 集成平台 - 自动化操作库
 *
 * 功能: 封装常用的 UI 自动化操作
 * - takeSnapshot(): 获取页面快照
 * - click(ref): 点击元素
 * - type(text): 输入文本
 * - pressKey(key): 按键
 * - waitFor(selector): 等待元素出现
 * - screenshot(path): 截图保存
 * - navigate(url): 导航到URL
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import type { PageSnapshot, ActionResult, SnapshotElement } from './types.js';
import { config } from './config.js';
import { logger } from './logger.js';

const execAsync = promisify(exec);

/** 操作执行器类 */
export class Actions {
  /**
   * 执行 agent-browser 命令的通用方法（带重试）
   */
  private async executeCommand(
    command: string,
    description: string,
    options?: { timeout?: number }
  ): Promise<ActionResult<string>> {
    const maxRetries = config.get('maxRetries') || 3;
    const retryDelay = config.get('retryDelay') || 1000;
    const timeout = options?.timeout || config.get('operationTimeout') || 30000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const endTimer = logger.startTimer('Actions', description);

      try {
        logger.debug('Actions', `执行命令 (第 ${attempt}/${maxRetries} 次)`, { command });

        const { stdout, stderr } = await execAsync(`agent-browser ${command}`, {
          timeout,
        });

        if (stderr && !stderr.includes('warning')) {
          logger.warn('Actions', `命令 stderr 输出: ${stderr}`);
        }

        endTimer();

        return {
          success: true,
          data: stdout.trim(),
          duration: 0,
          timestamp: new Date(),
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);

        if (attempt < maxRetries) {
          logger.warn('Actions', `${description} 失败 (第 ${attempt} 次): ${errMsg}`);
          logger.info('Actions', `${retryDelay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          logger.error('Actions', `${description} 最终失败: ${errMsg}`);
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

    // TypeScript 需要的返回值（理论上不会到达这里）
    return {
      success: false,
      error: '未知错误',
      duration: 0,
      timestamp: new Date(),
    };
  }

  /**
   * 获取页面快照
   * ⚠️ 这是所有操作的起点！遵循 OBSERVE-UNDERSTAND-ACT 模式
   */
  async takeSnapshot(): Promise<ActionResult<PageSnapshot>> {
    const result = await this.executeCommand('snapshot -i', '获取页面快照');

    if (!result.success || !result.data) {
      return { ...result, data: undefined } as unknown as ActionResult<PageSnapshot>;
    }

    try {
      // 解析快照数据
      const snapshot = this.parseSnapshot(result.data);

      logger.info('Actions', '页面快照获取成功', {
        elementCount: snapshot.elements.length,
        url: snapshot.url,
      });

      return {
        success: true,
        data: snapshot,
        duration: result.duration,
        timestamp: result.timestamp,
      };
    } catch (parseError) {
      const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
      logger.error('Actions', `解析快照失败: ${errMsg}`);

      return {
        success: false,
        error: `解析快照失败: ${errMsg}`,
        duration: result.duration,
        timestamp: result.timestamp,
      };
    }
  }

  /**
   * 解析原始快照文本为结构化数据
   */
  private parseSnapshot(rawText: string): PageSnapshot {
    const elements: SnapshotElement[] = [];
    const lines = rawText.split('\n');

    for (const line of lines) {
      // 匹配元素格式: [ref=eXX] role="..." name="..."
      const match = line.match(/\[ref=(e\d+)\]\s+(\w+)="([^"]*)"(?:\s+(\w+)="([^"]*)")?/);

      if (match) {
        elements.push({
          ref: match[1],
          role: match[2],
          name: match[3],
          visible: true, // 默认可见，实际可通过后续验证
        });
      }
    }

    return {
      timestamp: new Date(),
      url: '', // 快照中可能不包含完整 URL
      title: '',
      elements,
      rawText,
    };
  }

  /**
   * 点击元素
   * @param ref 元素引用 (如 "@e5")
   */
  async click(ref: string): Promise<ActionResult<void>> {
    // 验证 ref 格式
    if (!ref.startsWith('@')) {
      ref = `@${ref}`;
    }

    const result = await this.executeCommand(`click "${ref}"`, `点击元素 ${ref}`);
    return { ...result, data: undefined } as unknown as ActionResult<void>;
  }

  /**
   * 根据文本查找并点击元素
   */
  async clickByText(text: string): Promise<ActionResult<void>> {
    const result = await this.executeCommand(`find text "${text}" click`, `点击文本 "${text}"`);
    return { ...result, data: undefined } as unknown as ActionResult<void>;
  }

  /**
   * 根据角色查找并点击元素
   */
  async clickByRole(role: string): Promise<ActionResult<void>> {
    const result = await this.executeCommand(`find role ${role} click`, `点击角色 [${role}]`);
    return { ...result, data: undefined } as unknown as ActionResult<void>;
  }

  /**
   * 在当前焦点输入文本
   * @param text 要输入的文本
   */
  async type(text: string): Promise<ActionResult<void>> {
    const result = await this.executeCommand(`keyboard type "${text}"`, `输入文本`);
    return { ...result, data: undefined } as unknown as ActionResult<void>;
  }

  /**
   * 清空输入框并输入新文本
   */
  async clearAndType(text: string): Promise<ActionResult<void>> {
    // 先全选再删除，然后输入新文本
    await this.pressKey('Control+a');
    await this.pressKey('Backspace');
    await new Promise(resolve => setTimeout(resolve, 100));

    return this.type(text);
  }

  /**
   * 按键
   * @param key 按键名称 (Enter, Tab, Escape, Backspace 等)
   */
  async pressKey(key: string): Promise<ActionResult<void>> {
    const result = await this.executeCommand(`press ${key}`, `按下按键 [${key}]`);
    return { ...result, data: undefined } as unknown as ActionResult<void>;
  }

  /**
   * 等待指定时间
   * @param ms 等待时间（毫秒）
   */
  async wait(ms: number): Promise<ActionResult<void>> {
    logger.debug('Actions', `等待 ${ms}ms`);

    await new Promise(resolve => setTimeout(resolve, ms));

    return {
      success: true,
      duration: ms,
      timestamp: new Date(),
    };
  }

  /**
   * 等待元素出现
   * @param selector 选择器（文本或 CSS 选择器）
   * @param timeout 超时时间（毫秒），默认 10 秒
   */
  async waitFor(selector: string, timeout?: number): Promise<ActionResult<boolean>> {
    const endTimer = logger.startTimer('Actions', `等待元素 [${selector}]`);
    const maxWait = timeout || config.get('operationTimeout') || 10000;
    const interval = 500;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      try {
        // 获取快照检查元素是否存在
        const snapshot = await this.takeSnapshot();

        if (snapshot.success && snapshot.data) {
          const found = snapshot.data.elements.some(el =>
            el.name.includes(selector) ||
            el.role.includes(selector) ||
            snapshot.data!.rawText.includes(selector)
          );

          if (found) {
            endTimer();
            return {
              success: true,
              data: true,
              duration: 0,
              timestamp: new Date(),
            };
          }
        }
      } catch (error) {
        // 忽略错误，继续等待
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    logger.warn('Actions', `等待元素超时: ${selector}`);
    endTimer();

    return {
      success: false,
      error: `等待元素超时: ${selector}`,
      duration: 0,
      timestamp: new Date(),
    };
  }

  /**
   * 截图并保存
   * @param filename 文件名（不含路径）
   * @param fullPath 完整路径（可选，优先使用此参数）
   */
  async screenshot(filename?: string, fullPath?: string): Promise<ActionResult<string>> {
    let screenshotPath: string;

    if (fullPath) {
      screenshotPath = fullPath;
    } else {
      const screenshotDir = config.get('screenshotPath');
      const name = filename || `screenshot-${Date.now()}.png`;

      // 确保目录存在
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      screenshotPath = path.join(screenshotDir, name);
    }

    const result = await this.executeCommand(
      `screenshot --annotate "${screenshotPath}"`,
      `截图保存到 ${screenshotPath}`
    );

    if (result.success) {
      logger.info('Actions', `截图已保存: ${screenshotPath}`);

      return {
        ...result,
        data: screenshotPath,
      };
    }

    return result as ActionResult<string>;
  }

  /**
   * 导航到 URL
   * @param url 目标 URL
   */
  async navigate(url: string): Promise<ActionResult<void>> {
    const result = await this.executeCommand(`navigate "${url}"`, `导航到 ${url}`);

    // 导航后等待页面加载
    if (result.success) {
      await this.wait(1000);
    }

    return { ...result, data: undefined } as unknown as ActionResult<void>;
  }

  /**
   * 向下滚动页面
   * @param amount 滚动量（像素）
   */
  async scrollDown(amount: number = 300): Promise<ActionResult<void>> {
    const result = await this.executeCommand(`scroll down ${amount}`, `向下滚动 ${amount}px`);
    return { ...result, data: undefined } as unknown as ActionResult<void>;
  }

  /**
   * 向上滚动页面
   * @param amount 滚动量（像素）
   */
  async scrollUp(amount: number = 300): Promise<ActionResult<void>> {
    const result = await this.executeCommand(`scroll up ${amount}`, `向上滚动 ${amount}px`);
    return { ...result, data: undefined } as unknown as ActionResult<void>;
  }

  /**
   * 执行 JavaScript 代码
   * @param code JavaScript 代码
   */
  async evaluate(code: string): Promise<ActionResult<string>> {
    return this.executeCommand(`evaluate "${code}"`, `执行 JavaScript`);
  }

  /**
   * 获取页面 URL
   */
  async getUrl(): Promise<ActionResult<string>> {
    return this.executeCommand('url', '获取当前 URL');
  }

  /**
   * 获取页面标题
   */
  async getTitle(): Promise<ActionResult<string>> {
    return this.executeCommand('title', '获取页面标题');
  }

  /**
   * 刷新页面
   */
  async refresh(): Promise<ActionResult<void>> {
    const result = await this.executeCommand('refresh', '刷新页面');

    if (result.success) {
      await this.wait(1000);
    }

    return { ...result, data: undefined } as unknown as ActionResult<void>;
  }

  /**
   * 返回上一页
   */
  async back(): Promise<ActionResult<void>> {
    const result = await this.executeCommand('back', '返回上一页');

    if (result.success) {
      await this.wait(1000);
    }

    return { ...result, data: undefined } as unknown as ActionResult<void>;
  }

  /**
   * 组合操作：先截图再快照（用于调试和记录）
   */
  async captureState(label?: string): Promise<{
    screenshot: ActionResult<string>;
    snapshot: ActionResult<PageSnapshot>;
  }> {
    const prefix = label || `state-${Date.now()}`;

    const [screenshot, snapshot] = await Promise.all([
      this.screenshot(`${prefix}.png`),
      this.takeSnapshot(),
    ]);

    logger.info('Actions', `状态捕获完成: ${prefix}`);

    return { screenshot, snapshot };
  }
}

// 导出单例实例
export const actions = new Actions();
export default actions;
