import { Command } from 'commander';
import { startSolo, getCurrentCdpPort } from './process/launcher.js';
import { killSolo, stopSolo } from './process/killer.js';
import { getStatus, healthCheck } from './process/monitor.js';
import { startWatcher, stopWatcher, getWatcherStatus, printHistory, clearHistory, getChangeHistory } from './process/watcher.js';
import { showConfig } from './config/reader.js';
import { getPreset } from './config/presets.js';
import { applyChanges } from './config/writer.js';
import { rollback } from './config/rollback.js';
import { showDiff } from './config/diff.js';
// Agent-Browser 集成
import { platform } from './agent-browser/index.js';
import { DEFAULT_CDP_PORT } from './constants.js';

const program = new Command();

program
  .name('solo-toolkit')
  .description('TRAE SOLO CN Dev Toolkit')
  .version('0.2.0');

program
  .command('config')
  .description('配置管理')
  .addCommand(
    new Command('show')
      .description('显示当前配置')
      .action(() => { showConfig(); })
  )
  .addCommand(
    new Command('apply')
      .description('应用配置预设')
      .argument('<preset>', '预设名称: aggressive | conservative')
      .action((preset: string) => { const p = getPreset(preset); if (p) applyChanges(p.changes); })
  )
  .addCommand(
    new Command('rollback')
      .description('回滚到上次备份')
      .action(() => { rollback(); })
  )
  .addCommand(
    new Command('diff')
      .description('查看配置差异')
      .action(() => { showDiff(); })
  );

// ==================== 进程管理命令 ====================
program
  .command('solo')
  .description('进程管理')
  .addCommand(
    new Command('start')
      .description('启动 SOLO')
      .option('-p, --cdp-port <port>', 'CDP 调试端口', String(DEFAULT_CDP_PORT))
      .option('--no-kill', '不自动终止已有 SOLO 进程')
      .option('--timeout <ms>', '启动超时（毫秒）', '60000')
      .option('--extra-args <args...>', '额外启动参数')
      .action(async (options: { cdpPort: string; noKill: boolean; timeout: string; extraArgs?: string[] }) => {
        const result = await startSolo({
          cdpPort: parseInt(options.cdpPort, 10),
          noKill: options.noKill,
          timeout: parseInt(options.timeout, 10),
          extraArgs: options.extraArgs,
        });
        if (result.ready) {
          console.log(`\n  SOLO 启动成功`);
          console.log(`  PID: ${result.pid}`);
          console.log(`  CDP 端口: ${result.cdpPort}`);
          console.log(`  CDP 端点: ${result.cdpEndpoint}`);
          if (result.browserVersion) console.log(`  浏览器版本: ${result.browserVersion}`);
          if (result.wsUrl) console.log(`  WebSocket: ${result.wsUrl}`);
          console.log('');
        } else {
          console.error(`\n  SOLO 启动超时，CDP 端口未就绪`);
          console.error(`  PID: ${result.pid}`);
          console.error(`  请检查应用是否正常启动\n`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('stop')
      .description('停止 SOLO')
      .option('-f, --force', '强制终止（/F 参数）', true)
      .option('--no-force', '优雅终止（不使用 /F）')
      .option('--timeout <ms>', '等待超时（毫秒）', '15000')
      .action(async (options: { force: boolean; timeout: string }) => {
        const result = await killSolo(options.force, {
          timeout: parseInt(options.timeout, 10),
        });
        console.log(`\n  终止结果:`);
        console.log(`  成功: ${result.killed.length} 个进程`);
        if (result.failed.length > 0) {
          console.log(`  失败: ${result.failed.join(', ')}`);
        }
        if (result.timedOut) {
          console.log(`  警告: 部分进程未在超时内退出`);
        }
        console.log('');
      })
  )
  .addCommand(
    new Command('restart')
      .description('重启 SOLO')
      .option('-p, --cdp-port <port>', 'CDP 调试端口', String(DEFAULT_CDP_PORT))
      .option('--timeout <ms>', '启动超时（毫秒）', '60000')
      .action(async (options: { cdpPort: string; timeout: string }) => {
        console.log('正在重启 SOLO...');
        const killResult = await killSolo(true);
        if (killResult.failed.length > 0) {
          console.warn(`  警告: 部分进程终止失败: ${killResult.failed.join(', ')}`);
        }
        const startResult = await startSolo({
          cdpPort: parseInt(options.cdpPort, 10),
          timeout: parseInt(options.timeout, 10),
        });
        if (startResult.ready) {
          console.log(`\n  SOLO 重启成功 (PID: ${startResult.pid})\n`);
        } else {
          console.error(`\n  SOLO 重启后 CDP 未就绪\n`);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('status')
      .description('查看进程状态')
      .option('-p, --cdp-port <port>', 'CDP 端口', String(DEFAULT_CDP_PORT))
      .option('--json', '以 JSON 格式输出')
      .action(async (options: { cdpPort: string; json: boolean }) => {
        if (options.json) {
          const report = await healthCheck(parseInt(options.cdpPort, 10));
          console.log(JSON.stringify(report, null, 2));
        } else {
          await getStatus();
        }
      })
  )
  .addCommand(
    new Command('watch')
      .description('监听配置变更')
      .option('--auto-reload', '检测到变更后自动重载 SOLO')
      .option('--history', '查看变更历史')
      .option('--clear-history', '清空变更历史')
      .option('-n, --limit <count>', '历史记录条数', '10')
      .action(async (options: { autoReload: boolean; history: boolean; clearHistory: boolean; limit: string }) => {
        if (options.clearHistory) {
          clearHistory();
          console.log('变更历史已清空');
          return;
        }
        if (options.history) {
          printHistory(parseInt(options.limit, 10));
          return;
        }
        // 启动监听
        startWatcher({ autoReload: options.autoReload });
        // 保持进程运行
        process.on('SIGINT', () => {
          stopWatcher();
          console.log('\n监听器已停止');
          process.exit(0);
        });
      })
  );

program
  .command('apply')
  .description('一键魔改：备份→修改→重启→验证')
  .argument('<preset>', '预设名称: aggressive | conservative')
  .option('--rollback', '验证失败时自动回滚', true)
  .action(async (preset: string, options: { rollback: boolean }) => {
    const { applyPreset } = await import('./commands/apply.js');
    await applyPreset({ preset, rollbackOnFail: options.rollback });
  });

program
  .command('test')
  .description('自动化测试')
  .addCommand(
    new Command('smoke')
      .description('冒烟测试')
      .action(() => { console.log('Test smoke - TODO'); })
  )
  .addCommand(
    new Command('screenshot')
      .description('截图')
      .action(() => { console.log('Test screenshot - TODO'); })
  );

program
  .command('gateway')
  .description('API 网关')
  .addCommand(
    new Command('start')
      .description('启动网关')
      .action(() => { console.log('Gateway start - TODO'); })
  )
  .addCommand(
    new Command('stop')
      .description('停止网关')
      .action(() => { console.log('Gateway stop - TODO'); })
  );

// ==================== Agent-Browser 集成命令 ====================
program
  .command('browser')
  .description('Agent-Browser 深度集成平台 (UI 自动化/测试/监控)')
  .addCommand(
    new Command('start')
      .description('快速启动: 启动 SOLO + 建立 CDP 连接')
      .action(async () => {
        await platform.quickStart();
      })
  )
  .addCommand(
    new Command('stop')
      .description('完整停止: 断开连接 + 停止进程')
      .action(async () => {
        await platform.quickStop();
      })
  )
  .addCommand(
    new Command('connect')
      .description('建立 CDP 连接')
      .action(async () => {
        const result = await platform.connector.connect();
        if (result.success) {
          console.log(`✅ 连接成功: ${result.data?.wsUrl}`);
        } else {
          console.error(`❌ 连接失败: ${result.error}`);
        }
      })
  )
  .addCommand(
    new Command('disconnect')
      .description('断开 CDP 连接')
      .action(async () => {
        const result = await platform.connector.disconnect();
        if (result.success) {
          console.log('✅ 已断开连接');
        } else {
          console.error(`❌ 断开失败: ${result.error}`);
        }
      })
  )
  .addCommand(
    new Command('status')
      .description('查看平台状态')
      .action(async () => {
        const connectionStatus = platform.connector.getStatus();
        const processInfo = platform.process.getInfo();
        const health = await platform.process.healthCheck();

        console.log('\n📊 Agent-Browser 平台状态');
        console.log('=' .repeat(40));
        console.log(`连接状态: ${connectionStatus.status}`);
        console.log(`进程状态: ${processInfo.running ? '运行中' : '已停止'}`);
        if (processInfo.pid) console.log(`进程 PID: ${processInfo.pid}`);
        console.log(`CDP 端口: ${processInfo.cdpPort}`);
        console.log(`健康检查: ${health.overall ? '✅ 正常' : '❌ 异常'}`);
        console.log('');
      })
  )
  // 操作命令
  .addCommand(
    new Command('snapshot')
      .description('获取页面快照 (OBSERVE-UNDERSTAND-ACT)')
      .action(async () => {
        const result = await platform.actions.takeSnapshot();
        if (result.success && result.data) {
          console.log('\n📸 页面快照:');
          console.log('-' .repeat(50));
          console.log(`元素数量: ${result.data.elements.length}`);
          console.log(`原始文本:\n${result.data.rawText.substring(0, 500)}...`);
          console.log('-' .repeat(50) + '\n');
        } else {
          console.error(`❌ 获取快照失败: ${result.error}`);
        }
      })
  )
  .addCommand(
    new Command('screenshot')
      .description('截图保存')
      .argument('[filename]', '文件名', `screenshot-${Date.now()}.png`)
      .action(async (filename: string) => {
        const result = await platform.actions.screenshot(filename);
        if (result.success) {
          console.log(`✅ 截图已保存: ${result.data}`);
        } else {
          console.error(`❌ 截图失败: ${result.error}`);
        }
      })
  )
  .addCommand(
    new Command('click')
      .description('点击元素')
      .argument('<ref>', '元素引用 (如 @e5 或 e5)')
      .action(async (ref: string) => {
        const result = await platform.actions.click(ref);
        if (result.success) {
          console.log(`✅ 已点击: ${ref}`);
        } else {
          console.error(`❌ 点击失败: ${result.error}`);
        }
      })
  )
  .addCommand(
    new Command('type')
      .description('输入文本')
      .argument('<text>', '要输入的文本')
      .action(async (text: string) => {
        const result = await platform.actions.type(text);
        if (result.success) {
          console.log(`✅ 已输入: ${text}`);
        } else {
          console.error(`❌ 输入失败: ${result.error}`);
        }
      })
  )
  // 工作区管理
  .addCommand(
    new Command('workspace')
      .description('工作区管理')
    .addCommand(
      new Command('list')
        .description('列出所有工作区')
        .action(async () => {
          const result = await platform.workspace.listWorkspaces();
          if (result.success && result.data) {
            console.log('\n📁 工作区列表:');
            result.data.forEach((w: { name: string; isActive: boolean }) => {
              console.log(`${w.isActive ? '▶' : ' '} ${w.name}${w.isActive ? ' (当前)' : ''}`);
            });
            console.log('');
          } else {
            console.error(`❌ 列出工作区失败: ${result.error}`);
          }
        })
    )
    .addCommand(
      new Command('switch')
        .description('切换工作区')
        .argument('<name>', '工作区名称')
        .action(async (name: string) => {
          const result = await platform.workspace.switchWorkspace(name);
          if (result.success) {
            console.log(`✅ 已切换到工作区: ${name}`);
          } else {
            console.error(`❌ 切换失败: ${result.error}`);
          }
        })
    )
  )
  // AI 对话
  .addCommand(
    new Command('chat')
      .description('AI 对话自动化')
    .addCommand(
      new Command('send')
        .description('发送 Prompt 到 AI')
        .argument('<prompt>', '提示文本')
        .option('-w, --workspace <name>', '指定工作区')
        .option('-t, --timeout <ms>', '响应超时时间', '120000')
        .action(async (prompt: string, options: { workspace?: string; timeout: string }) => {
          const result = await platform.chat.chat(prompt, options.workspace, parseInt(options.timeout));
          if (result.success && result.data) {
            console.log('\n💬 AI 响应:');
            console.log('-' .repeat(50));
            console.log(result.data.content);
            console.log('-' .repeat(50));
            console.log(`⏱️  响应时间: ${(result.data.duration / 1000).toFixed(2)}s`);
            console.log(`📝 内容长度: ${result.data.content.length} 字符\n`);
          } else {
            console.error(`❌ 对话失败: ${result.error}`);
          }
        })
    )
    .addCommand(
      new Command('batch')
        .description('批量测试多个 Prompt')
        .argument('<prompts...>', '多个提示文本（空格分隔）')
        .action(async (prompts: string[]) => {
          const result = await platform.chat.batchTest(prompts);
          if (result.success && result.data) {
            console.log('\n📊 批量测试结果:');
            const successCount = result.data.filter(r => r.success).length;
            console.log(`总计: ${prompts.length}, 成功: ${successCount}, 失败: ${prompts.length - successCount}\n`);

            result.data.forEach((r: { success: boolean; prompt: string; error?: string }, i: number) => {
              console.log(`${i + 1}. [${r.success ? 'PASS' : 'FAIL'}] ${r.prompt.substring(0, 50)}...`);
              if (!r.success && r.error) {
                console.log(`   错误: ${r.error}`);
              }
            });
          } else {
            console.error(`❌ 批量测试失败: ${result.error}`);
          }
        })
    )
  )
  // 回归测试
  .addCommand(
    new Command('regression')
      .description('回归测试')
    .addCommand(
      new Command('baseline')
        .description('采集基准截图')
        .argument('<name>', '基准名称')
        .action(async (name: string) => {
          const result = await platform.regression.takeBaselineScreenshot(name);
          if (result.success) {
            console.log(`✅ 基准截图已保存: ${result.data}`);
          } else {
            console.error(`❌ 采集基准失败: ${result.error}`);
          }
        })
    )
    .addCommand(
      new Command('list-baselines')
        .description('列出所有基准截图')
        .action(() => {
          const baselines = platform.regression.listBaselines();
          if (baselines.length === 0) {
            console.log('暂无基准截图');
          } else {
            console.log('\n📷 基准截图列表:');
            baselines.forEach((b: { name: string; date: Date }) => {
              console.log(`  - ${b.name} (${b.date.toLocaleString()})`);
            });
            console.log('');
          }
        })
    )
  )
  // 冒烟测试
  .addCommand(
    new Command('smoke-test')
      .description('执行冒烟测试')
      .action(async () => {
        const result = await platform.runSmokeTest();
        process.exit(result.passed ? 0 : 1);
      })
  );

program.parse();
