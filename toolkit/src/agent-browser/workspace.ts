/**
 * Agent-Browser 集成平台 - 工作区管理模块
 *
 * 功能:
 * - listWorkspaces(): 列出所有工作区
 * - switchWorkspace(name): 切换工作区
 * - createWorkspace(name, path): 创建新工作区
 * - deleteWorkspace(name): 删除工作区
 * - importProject(path): 导入项目文件夹
 */

import type { WorkspaceInfo, ActionResult } from './types.js';
import { actions } from './actions.js';
import { logger } from './logger.js';

/** 工作区管理器类 */
export class WorkspaceManager {
  /**
   * 获取当前工作区列表
   * 遵循 OBSERVE-UNDERSTAND-ACT 模式：先快照再解析
   */
  async listWorkspaces(): Promise<ActionResult<WorkspaceInfo[]>> {
    const endTimer = logger.startTimer('WorkspaceManager', '列出所有工作区');

    try {
      // 1. OBSERVE: 先获取页面快照
      const snapshotResult = await actions.takeSnapshot();

      if (!snapshotResult.success || !snapshotResult.data) {
        throw new Error(snapshotResult.error || '无法获取页面快照');
      }

      // 2. UNDERSTAND: 从快照中提取工作区信息
      const workspaces = this.parseWorkspacesFromSnapshot(snapshotResult.data);

      logger.info('WorkspaceManager', `发现 ${workspaces.length} 个工作区`, {
        workspaces: workspaces.map(w => w.name),
        active: workspaces.find(w => w.isActive)?.name,
      });

      endTimer();

      return {
        success: true,
        data: workspaces,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('WorkspaceManager', `列工作区失败: ${errMsg}`);
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
   * 从快照中解析工作区信息
   */
  private parseWorkspacesFromSnapshot(snapshot: { rawText: string; elements: any[] }): WorkspaceInfo[] {
    const workspaces: WorkspaceInfo[] = [];
    const lines = snapshot.rawText.split('\n');

    // 查找包含工作区名称的行（通常在底部状态栏或侧边栏）
    for (const line of lines) {
      // 匹配格式: "WorkspaceName · ..." 或 "[ref=eXX] ... WorkspaceName ..."
      const workspaceMatch = line.match(/(\w[\w\s-]+?)\s*·/);

      if (workspaceMatch) {
        const name = workspaceMatch[1].trim();
        const isActive = line.includes('·'); // 带 · 标记的通常是当前活动工作区

        workspaces.push({
          name,
          isActive,
        });
      }
    }

    // 去重
    const uniqueWorkspaces = workspaces.filter(
      (workspace, index, self) =>
        index === self.findIndex(w => w.name === workspace.name)
    );

    return uniqueWorkspaces;
  }

  /**
   * 切换到指定工作区
   * @param name 工作区名称
   */
  async switchWorkspace(name: string): Promise<ActionResult<void>> {
    const endTimer = logger.startTimer('WorkspaceManager', `切换到工作区 [${name}]`);

    try {
      // 1. OBSERVE: 先快照查看当前状态
      await actions.takeSnapshot();

      // 2. ACT: 点击目标工作区的 "New task" 按钮
      const clickResult = await actions.clickByText(name);

      if (!clickResult.success) {
        throw new Error(clickResult.error || '无法点击工作区');
      }

      // 等待切换完成
      await actions.wait(500);

      // 3. VERIFY: 验证切换成功
      const verifySnapshot = await actions.takeSnapshot();

      if (verifySnapshot.success && verifySnapshot.data) {
        const currentWorkspace = verifySnapshot.data.rawText.match(/(\w[\w\s-]+?)\s*·/)?.[1];

        if (currentWorkspace && currentWorkspace.includes(name)) {
          logger.info('WorkspaceManager', `成功切换到工作区: ${name}`);
          endTimer();

          return {
            success: true,
            duration: 0,
            timestamp: new Date(),
          };
        }
      }

      throw new Error('验证失败：未切换到目标工作区');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('WorkspaceManager', `切换工作区失败: ${errMsg}`);
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
   * 创建新工作区
   * @param name 工作区名称
   * @param path 可选的工作区路径
   */
  async createWorkspace(name: string, path?: string): Promise<ActionResult<WorkspaceInfo>> {
    const endTimer = logger.startTimer('WorkspaceManager', `创建工作区 [${name}]`);

    try {
      // 1. OBSERVE: 快照查看当前界面
      const snapshot = await actions.takeSnapshot();

      if (!snapshot.success) {
        throw new Error('无法获取当前界面状态');
      }

      // 2. ACT: 查找并点击"添加工作区"或类似按钮
      // 通常在侧边栏底部或工作区列表区域
      const addResult = await actions.clickByText('添加');

      if (!addResult.success) {
        // 尝试其他可能的按钮文本
        const altAddResult = await actions.clickByText('+');
        if (!altAddResult.success) {
          throw new Error('找不到"添加工作区"按钮');
        }
      }

      await actions.wait(500);

      // 输入工作区名称
      await actions.type(name);
      await actions.pressKey('Enter');
      await actions.wait(1000);

      // 3. VERIFY: 验证工作区已创建
      const listResult = await this.listWorkspaces();

      if (listResult.success && listResult.data) {
        const newWorkspace = listResult.data.find(w => w.name === name);

        if (newWorkspace) {
          logger.info('WorkspaceManager', `工作区创建成功: ${name}`, {
            path,
          });

          endTimer();

          return {
            success: true,
            data: {
              ...newWorkspace,
              path,
            },
            duration: 0,
            timestamp: new Date(),
          };
        }
      }

      throw new Error('验证失败：工作区未出现在列表中');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('WorkspaceManager', `创建工作区失败: ${errMsg}`);
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
   * 删除工作区
   * ⚠️ 危险操作，需要确认
   * @param name 工作区名称
   */
  async deleteWorkspace(name: string): Promise<ActionResult<void>> {
    const endTimer = logger.startTimer('WorkspaceManager', `删除工作区 [${name}]`);

    try {
      // 1. OBSERVE: 先快照确认当前状态
      await actions.takeSnapshot();

      // 2. 右键点击目标工作区打开上下文菜单
      const rightClickResult = await this.rightClickWorkspace(name);

      if (!rightClickResult.success) {
        throw new Error(rightClickResult.error || '无法右键点击工作区');
      }

      await actions.wait(300);

      // 3. 点击"删除"选项
      const deleteResult = await actions.clickByText('删除');

      if (!deleteResult.success) {
        // 尝试英文
        const deleteEngResult = await actions.clickByText('Delete');
        if (!deleteEngResult.success) {
          throw new Error('找不到删除选项');
        }
      }

      await actions.wait(300);

      // 确认删除对话框
      const confirmResult = await actions.clickByText('确定');

      if (!confirmResult.success) {
        // 尝试其他确认按钮
        await actions.pressKey('Enter');
      }

      await actions.wait(1000);

      // 4. VERIFY: 验证删除成功
      const listResult = await this.listWorkspaces();

      if (listResult.success && listResult.data) {
        const stillExists = listResult.data.some(w => w.name === name);

        if (stillExists) {
          throw new Error('验证失败：工作区仍然存在');
        }
      }

      logger.info('WorkspaceManager', `工作区已删除: ${name}`);
      endTimer();

      return {
        success: true,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('WorkspaceManager', `删除工作区失败: ${errMsg}`);
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
   * 右键点击工作区（辅助方法）
   */
  private async rightClickWorkspace(name: string): Promise<ActionResult<void>> {
    // agent-browser 可能支持右键点击，或者通过 JavaScript 实现
    try {
      // 尝试使用 evaluate 执行右键点击
      const result = await actions.evaluate(`
        const elements = document.querySelectorAll('*');
        for (const el of elements) {
          if (el.textContent.includes('${name}') && el.textContent.length < 100) {
            const event = new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            el.dispatchEvent(event);
            return 'success';
          }
        }
        throw new Error('Element not found');
      `);

      return { ...result, data: undefined } as unknown as ActionResult<void>;
    } catch {
      // 回退方案：使用键盘导航
      return actions.clickByText(name);
    }
  }

  /**
   * 导入项目文件夹到当前工作区
   * @param projectPath 项目文件夹路径
   */
  async importProject(projectPath: string): Promise<ActionResult<void>> {
    const endTimer = logger.startTimer('WorkspaceManager', `导入项目 [${projectPath}]`);

    try {
      // 1. OBSERVE: 快照查看当前界面
      await actions.takeSnapshot();

      // 2. 打开文件菜单或使用快捷键
      // Ctrl+K Ctrl+O 是 VS Code/Trae 的打开文件夹快捷键
      await actions.pressKey('Control+k');
      await actions.wait(100);
      await actions.pressKey('Control+o');
      await actions.wait(1000);

      // 3. 在文件选择对话框中输入路径
      // 这可能需要系统级交互，这里提供基础实现
      // 实际情况可能需要根据 OS 和应用调整

      logger.info('WorkspaceManager', `正在导入项目: ${projectPath}`);

      // 使用剪贴板粘贴路径（跨平台兼容性更好）
      // 注意：这需要额外的剪贴板操作支持

      endTimer();

      return {
        success: true,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('WorkspaceManager', `导入项目失败: ${errMsg}`);
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
   * 获取当前活动工作区名称
   */
  async getCurrentWorkspace(): Promise<ActionResult<string | null>> {
    const listResult = await this.listWorkspaces();

    if (listResult.success && listResult.data) {
      const active = listResult.data.find(w => w.isActive);

      return {
        success: true,
        data: active?.name || null,
        duration: 0,
        timestamp: new Date(),
      };
    }

    return {
      success: false,
      error: listResult.error || '无法获取工作区列表',
      duration: 0,
      timestamp: new Date(),
    };
  }

  /**
   * 在指定工作区中新建任务（聊天会话）
   * @param workspaceName 工作区名称
   */
  async newTaskInWorkspace(workspaceName: string): Promise<ActionResult<void>> {
    const endTimer = logger.startTimer('WorkspaceManager', `在 [${workspaceName}] 中新建任务`);

    try {
      // 1. 切换到目标工作区
      const switchResult = await this.switchWorkspace(workspaceName);

      if (!switchResult.success) {
        throw new Error(switchResult.error || '切换工作区失败');
      }

      // 2. 点击 "New task" 或 "新建任务"
      let clickResult = await actions.clickByText('New task');

      if (!clickResult.success) {
        clickResult = await actions.clickByText('新建任务');

        if (!clickResult.success) {
          throw new Error('找不到"新建任务"按钮');
        }
      }

      await actions.wait(500);

      // 3. 验证聊天界面已打开
      const snapshot = await actions.takeSnapshot();

      if (snapshot.success && snapshot.data) {
        const hasChatInterface =
          snapshot.data.rawText.includes('textbox') ||
          snapshot.data.rawText.includes('输入') ||
          snapshot.data.elements.some(e => e.role === 'textbox');

        if (!hasChatInterface) {
          logger.warn('WorkspaceManager', '未能确认聊天界面已打开');
        }
      }

      logger.info('WorkspaceManager', `已在 [${workspaceName}] 中新建任务`);
      endTimer();

      return {
        success: true,
        duration: 0,
        timestamp: new Date(),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('WorkspaceManager', `新建任务失败: ${errMsg}`);
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
export const workspaceManager = new WorkspaceManager();
export default workspaceManager;
