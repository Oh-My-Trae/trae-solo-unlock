/**
 * TRAE SOLO CN 原生模块工具 - 使用示例
 * ==================================
 *
 * 本文件展示了如何使用 native-modules 工具包中的各种功能。
 */

// ==================== 示例 1: 模型端点切换 ====================

import { ModelSwitcher, quickSwitch, createProxyServer } from './model-switcher.js';

async function exampleModelSwitcher() {
  console.log('\n=== 示例 1: 模型端点切换 ===\n');

  // 创建并初始化 ModelSwitcher
  const switcher = new ModelSwitcher({
    productJsonPath: 'D:\\apps\\TRAE SOLO CN\\resources\\app\\product.json',
    enableProxy: false
  });

  await switcher.initialize();

  // 获取当前端点
  const currentEndpoint = await switcher.getCurrentEndpoint();
  console.log('当前端点:', currentEndpoint.name, '-', currentEndpoint.apiUrl);

  // 列出所有可用端点
  console.log('\n可用的预设端点:');
  switcher.getAvailableEndpoints().forEach(ep => {
    console.log(`  [${ep.id}] ${ep.type.toUpperCase()} - ${ep.name}`);
    console.log(`         URL: ${ep.apiUrl}`);
    console.log(`         描述: ${ep.description}`);
    console.log('');
  });

  // 示例: 切换到 Ollama（本地模型）
  try {
    // 注意：这会修改 product.json，请确保已备份
    /*
    const result = await switcher.switchEndpoint('ollama-local');
    console.log('切换结果:', result.message);
    console.log('备份位置:', result.backupPath);
    */
    console.log('[演示模式] 取消实际切换，仅显示操作流程');
  } catch (err) {
    const error = err as Error;
    console.error('切换失败:', error.message);
  }

  // 使用快速切换函数
  try {
    // const quickResult = await quickSwitch('openai-official', {
    //   apiKey: 'your-openai-api-key'
    // });
    // console.log('快速切换成功:', quickResult.message);
    console.log('[演示] 快速切换函数: quickSwitch(endpointId, options)');
  } catch (err) {
    const error = err as Error;
    console.error('快速切换失败:', error.message);
  }
}

// ==================== 示例 2: 启动代理服务器 ====================

async function exampleProxyServer() {
  console.log('\n=== 示例 2: 启动代理服务器 ===\n');

  try {
    // 创建代理服务器，将请求转发到 Ollama
    const proxyServer = await createProxyServer('ollama-local', {
      port: 9876
    });

    console.log('代理服务器已启动！');
    console.log('本地地址: http://localhost:9876');
    console.log('目标地址: http://localhost:11434 (Ollama)');
    console.log('\n提示: 现在可以将 Trae 的 API 端点设置为 http://localhost:9876');

    // 保持运行 5 秒后停止（仅用于演示）
    setTimeout(() => {
      proxyServer.stopProxy();
      console.log('\n代理服务器已停止');
    }, 5000);

  } catch (err) {
    const error = err as Error;
    console.error('代理服务器启动失败:', error.message);
  }
}

// ==================== 示例 3: 知识库管理 ====================

import { KnowledgeBaseManager, quickInject, importProject } from './knowledge-base.js';

async function exampleKnowledgeBase() {
  console.log('\n=== 示例 3: 知识库管理 ===\n');

  // 创建知识库管理器
  const kbManager = new KnowledgeBaseManager({
    dbPath: `${process.env.USERPROFILE}\\.icube\\ai-chat\\database.db`
  });

  await kbManager.initialize();

  // 检查数据库状态
  const status = await kbManager.getDatabaseStatus();
  console.log('数据库状态:');
  console.log('  存在:', status.exists);
  if (status.exists) {
    console.log('  大小:', (status.size / 1024).toFixed(2), 'KB');
    console.log('  最后修改:', status.lastModified?.toLocaleString());
    console.log('  预估条目数:', status.estimatedEntryCount || '未知');
  }

  // 示例: 添加单个文档
  try {
    const entry = await quickInject(
      `# TypeScript 最佳实践

## 类型定义
- 始终使用明确的类型注解
- 避免使用 any 类型
- 优先使用 interface 而非 type

## 函数设计
- 保持函数单一职责
- 使用纯函数减少副作用
- 合理使用泛型提高复用性

## 错误处理
- 使用 Result 类型处理可能失败的操作
- 避免空的 catch 块
- 记录有意义的错误信息`,
      {
        title: 'TypeScript Best Practices',
        sourceType: 'document',
        tags: ['typescript', 'best-practices', 'development']
      }
    );

    console.log('\n文档注入成功:');
    console.log('  ID:', entry.id);
    console.log('  标题:', entry.metadata.title);
    console.log('  标签:', entry.metadata.tags);
  } catch (err) {
    const error = err as Error;
    console.error('文档注入失败:', error.message);
  }

  // 示例: 导入项目代码
  try {
    /*
    const importResult = await importProject('D:\\projects\\my-typescript-project', {
      filePatterns: ['*.ts', '*.tsx'],
      excludePatterns: ['node_modules', 'dist', '*.test.ts']
    });

    console.log('\n项目导入完成:');
    console.log('  成功导入:', importResult.importedCount, '个条目');
    console.log('  跳过:', importResult.skippedCount, '个文件');
    if (importResult.errors.length > 0) {
      console.log('  错误数:', importResult.errors.length);
    }
    */
    console.log('[演示] 项目导入函数: importProject(projectPath, options)');
  } catch (err) {
    const error = err as Error;
    console.error('项目导入失败:', error.message);
  }

  // 示例: 搜索知识库
  try {
    const searchResult = await kbManager.search({
      text: 'TypeScript',
      limit: 5
    });

    console.log('\n搜索结果 ("TypeScript"):');
    console.log('  找到:', searchResult.totalFound, '个相关条目');
    console.log('  耗时:', searchResult.queryTime, 'ms');

    searchResult.entries.forEach((entry, index) => {
      console.log(`\n  ${index + 1}. ${entry.metadata.title || 'Untitled'}`);
      console.log(`     内容预览: ${entry.content.substring(0, 100)}...`);
    });
  } catch (err) {
    const error = err as Error;
    console.error('搜索失败:', error.message);
  }

  // 示例: 导出知识库
  try {
    const exportResult = await kbManager.exportToJson();
    console.log('\n知识库导出成功:');
    console.log('  文件路径:', exportResult.exportPath);
    console.log('  条目数量:', exportResult.entryCount);
    console.log('  文件大小:', (exportResult.fileSize / 1024).toFixed(2), 'KB');
  } catch (err) {
    const error = err as Error;
    console.error('导出失败:', error.message);
  }
}

// ==================== 示例 4: 沙箱策略控制 ====================

import { SandboxController, quickAddRW, quickApplyPreset, quickSecurityCheck } from './sandbox-controller.js';

async function exampleSandboxControl() {
  console.log('\n=== 示例 4: 沙箱策略控制 ===\n');

  // 创建沙箱控制器
  const sandboxController = new SandboxController({
    productJsonPath: 'D:\\apps\\TRAE SOLO CN\\resources\\app\\product.json'
  });

  await sandboxController.initialize();

  // 获取当前策略
  const currentPolicy = await sandboxController.getCurrentPolicy();
  console.log('当前沙箱策略:');
  console.log('  RW 目录数量:', currentPolicy.rwDirectories.length);
  console.log('  RO 目录数量:', currentPolicy.roDirectories.length);
  console.log('  黑名单命令数量:', currentPolicy.commandDenyList.length);
  console.log('  IDE 命令模式:', currentPolicy.commandMode.ide);
  console.log('  SOLO 命令模式:', currentPolicy.commandMode.solo);

  // 列出可用预设
  console.log('\n可用的权限预设:');
  sandboxController.getAvailablePresets().forEach(preset => {
    console.log(`  [${preset.id}] (${preset.category}) ${preset.name}`);
    console.log(`           ${preset.description}`);
  });

  // 示例: 添加 RW 目录
  try {
    /*
    const result = await sandboxController.addRWDirectory('$HOME/my-custom-dir', {
      validateExists: true,
      backupBeforeModify: true
    });

    console.log('\n添加 RW 目录成功:');
    console.log('  目录:', result.added);
    console.log('  当前总数:', result.newCount);
    */
    console.log('[演示] 添加 RW 目录: addRWDirectory(directory, options)');
  } catch (err) {
    const error = err as Error;
    console.error('添加 RW 目录失败:', error.message);
  }

  // 示例: 应用安全预设
  try {
    /*
    const presetResult = await sandboxController.applyPreset('strict-security', {
      mergeWithCurrent: true,
      backupBeforeApply: true
    });

    console.log('\n应用安全预设成功:');
    console.log('  预设名称:', presetResult.presetName);
    console.log('  应用的更改:');
    presetResult.appliedChanges.forEach(change => {
      console.log(`    - ${change}`);
    });
    */
    console.log('[演示] 应用预设: applyPreset(presetId, options)');
  } catch (err) {
    const error = err as Error;
    console.error('应用预设失败:', error.message);
  }

  // 安全检查报告
  try {
    const report = sandboxController.generateSecurityReport();
    console.log('\n安全评估报告:');
    console.log('  总体评分:', report.overallScore, '/100');
    console.log('  风险等级:', report.riskLevel.toUpperCase());

    if (report.findings.length > 0) {
      console.log('\n  发现的问题:');
      report.findings.forEach(finding => {
        const icon = finding.severity === 'critical' ? '[CRITICAL]' :
                     finding.severity === 'warning' ? '[WARNING]' : '[INFO]';
        console.log(`  ${icon} [${finding.severity}] ${finding.message}`);
        if (finding.recommendation) {
          console.log(`     建议: ${finding.recommendation}`);
        }
      });
    }
  } catch (err) {
    const error = err as Error;
    console.error('生成安全报告失败:', error.message);
  }

  // 快速安全检查（生成完整报告文本）
  try {
    const securityText = await quickSecurityCheck();
    console.log(securityText);
  } catch (err) {
    const error = err as Error;
    console.error('快速安全检查失败:', error.message);
  }
}

// ==================== 综合示例: 完整工作流 ====================

async function completeWorkflow() {
  console.log('\n' + '='.repeat(60));
  console.log('综合示例: 完整的模块定制工作流');
  console.log('='.repeat(60));

  // 步骤 1: 备份当前配置
  console.log('\n[步骤 1] 备份当前配置...');
  const switcher = new ModelSwitcher();
  await switcher.initialize();

  const sandboxCtrl = new SandboxController();
  await sandboxCtrl.initialize();

  // 使用公共 API 进行备份
  const modelBackup = await switcher.switchEndpoint('trae-default');  // 这会自动创建备份
  const sandboxBackup = await sandboxCtrl.createBackup('pre-workflow');

  console.log('✓ AI Agent 配置已备份');
  console.log('✓ Sandbox 配置已备份:', sandboxBackup);

  // 步骤 2: 切换到本地 Ollama
  console.log('\n[步骤 2] 切换 API 端点到本地 Ollama...');
  // 实际使用时取消注释:
  // await switcher.switchEndpoint('ollama-local');
  console.log('✓ (演示模式) 将切换到 Ollama');

  // 步骤 3: 注入自定义知识库
  console.log('\n[步骤 3] 注入项目特定知识...');
  const kb = new KnowledgeBaseManager();
  await kb.initialize();
  // await kb.importFromDirectory('./my-docs', { sourceType: 'document' });
  console.log('✓ (演示模式) 将导入文档到知识库');

  // 步骤 4: 调整沙箱权限
  console.log('\n[步骤 4] 调整沙箱权限以适应开发需求...');
  // await sandboxCtrl.applyPreset('permissive-dev');
  // await sandboxCtrl.addRWDirectory('$HOME/dev-projects');
  console.log('✓ (演示模式) 将应用宽松开发权限');

  // 步骤 5: 生成最终报告
  console.log('\n[步骤 5] 生成配置摘要...');
  const securityReport = sandboxCtrl.generateSecurityReport();
  console.log('\n配置完成! 安全评分:', securityReport.overallScore, '/100');

  console.log('\n' + '='.repeat(60));
  console.log('工作流完成!');
  console.log('='.repeat(60));
}

// ==================== 主入口 ====================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     TRAE SOLO CN 原生模块工具包 - 使用示例            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  try {
    // 运行各个示例
    await exampleModelSwitcher();
    // await exampleProxyServer();  // 会阻塞 5 秒
    await exampleKnowledgeBase();
    await exampleSandboxControl();
    // await completeWorkflow();    // 完整工作流

    console.log('\n✅ 所有示例执行完毕!\n');
  } catch (err) {
    const error = err as Error;
    console.error('\n❌ 执行出错:', error.message);
  }
}

// 运行主函数
main().catch(console.error);
