/**
 * Agent-Browser 集成平台 - 统一导出入口
 *
 * 提供对所有子模块的统一访问接口
 */

// 类型导出
export type {
  CDPConnectionConfig,
  ConnectionStatus,
  ConnectionInfo,
  ProcessInfo,
  SnapshotElement,
  PageSnapshot,
  ActionResult,
  WorkspaceInfo,
  AIResponse,
  BatchTestResult,
  BenchmarkResult,
  RegressionTestCase,
  RegressionTestResult,
  RegressionReport,
  AgentBrowserConfig,
} from './types.js';

// 核心模块
export { connector, CDPConnector } from './connector.js';
export { processManager, ProcessManager } from './process-manager.js';
export { actions, Actions } from './actions.js';
export { workspaceManager, WorkspaceManager } from './workspace.js';
export { chatAutomation, ChatAutomation } from './chat-automation.js';
export { regressionTest, RegressionTestManager } from './regression-test.js';

// 工具模块
export { config } from './config.js';
export type { ConfigManager } from './config.js';
export { logger } from './logger.js';
export type { Logger } from './logger.js';

/**
 * Agent-Browser 平台主类
 *
 * 提供统一的 API 接口，整合所有子模块功能
 */
export class AgentBrowserPlatform {
  /** CDP 连接器 */
  readonly connector = connector;
  /** 进程管理器 */
  readonly process = processManager;
  /** 操作库 */
  readonly actions = actions;
  /** 工作区管理 */
  readonly workspace = workspaceManager;
  /** AI 对话自动化 */
  readonly chat = chatAutomation;
  /** 回归测试 */
  readonly regression = regressionTest;

  /**
   * 快速启动：启动 SOLO 并连接
   */
  async quickStart(): Promise<{
    process: boolean;
    connection: boolean;
  }> {
    console.log('🚀 正在快速启动 Agent-Browser 平台...\n');

    // 1. 启动 SOLO 进程
    console.log('📦 启动 SOLO 进程...');
    const processResult = await this.process.start();

    if (!processResult.success) {
      console.error(`❌ 启动失败: ${processResult.error}`);
      return {
        process: false,
        connection: false,
      };
    }

    console.log('✅ SOLO 进程已启动\n');

    // 2. 建立 CDP 连接
    console.log('🔌 建立 CDP 连接...');
    const connectionResult = await this.connector.connect();

    if (!connectionResult.success) {
      console.error(`❌ 连接失败: ${connectionResult.error}`);
      return {
        process: true,
        connection: false,
      };
    }

    console.log('✅ CDP 连接已建立\n');
    console.log('🎉 Agent-Browser 平台就绪！\n');

    return {
      process: true,
      connection: true,
    };
  }

  /**
   * 完整停止：断开连接并停止进程
   */
  async quickStop(): Promise<void> {
    console.log('\n🛑 正在停止 Agent-Browser 平台...\n');

    // 1. 断开连接
    console.log('🔌 断开 CDP 连接...');
    await this.connector.disconnect();
    console.log('✅ 已断开连接\n');

    // 2. 停止进程
    console.log('📦 停止 SOLO 进程...');
    await this.process.stop();
    console.log('✅ 进程已停止\n');

    console.log('👋 Agent-Browser 平台已关闭');
  }

  /**
   * 执行完整的冒烟测试
   */
  async runSmokeTest(): Promise<{
    passed: boolean;
    results: Record<string, boolean>;
  }> {
    console.log('\n🔥 开始冒烟测试...\n');
    const results: Record<string, boolean> = {};

    try {
      // 测试 1: 进程健康检查
      console.log('1️⃣  检查进程状态...');
      const health = await this.process.healthCheck();
      results['process'] = health.overall;
      console.log(`   ${health.overall ? '✅' : '❌'} 进程状态: ${JSON.stringify(health)}\n`);

      // 测试 2: 连接验证
      console.log('2️⃣  验证 CDP 连接...');
      const connectionValid = await this.connector.validateConnection();
      results['connection'] = connectionValid.data || false;
      console.log(`   ${connectionValid.data ? '✅' : '❌'} 连接状态: ${connectionValid.data}\n`);

      // 测试 3: 页面快照
      console.log('3️⃣  获取页面快照...');
      const snapshot = await this.actions.takeSnapshot();
      results['snapshot'] = snapshot.success && !!snapshot.data?.elements.length;
      console.log(
        `   ${results['snapshot'] ? '✅' : '❌'} 快照结果: ${
          snapshot.success ? `${snapshot.data?.elements.length} 个元素` : snapshot.error
        }\n`
      );

      // 测试 4: 截图功能
      console.log('4️⃣  测试截图功能...');
      const screenshot = await this.actions.screenshot('smoke-test.png');
      results['screenshot'] = screenshot.success;
      console.log(
        `   ${screenshot.success ? '✅' : '❌'} 截图结果: ${
          screenshot.success ? screenshot.data : screenshot.error
        }\n`
      );

      const allPassed = Object.values(results).every(r => r);

      console.log(
        `${allPassed ? '🎉' : '⚠️ '} 冒烟测试${allPassed ? '通过' : '未通过'}: ${
          Object.values(results).filter(r => r).length
        }/${Object.keys(results).length} 项通过`
      );

      return {
        passed: allPassed,
        results,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ 冒烟测试异常: ${errMsg}`);

      return {
        passed: false,
        results,
      };
    }
  }
}

// 导出平台实例
export const platform = new AgentBrowserPlatform();
export default platform;
