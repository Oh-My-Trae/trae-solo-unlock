/**
 * Analytics Module Test Script
 * 快速验证数据分析功能
 */

import { AnalyticsEngine } from './analytics/index.js';

async function runTests() {
  console.log('='.repeat(70));
  console.log('  TRAE SOLO CN Analytics Toolkit - 功能测试');
  console.log('='.repeat(70) + '\n');

  const engine = new AnalyticsEngine();

  try {
    // 测试 1: 数据库 Schema 分析
    console.log('📋 测试 1: 数据库 Schema 分析');
    console.log('-'.repeat(50));

    engine.analyzeAIAgentDatabaseSchema();
    engine.analyzeCKGDatabaseSchema();
    engine.analyzeWorkspaceStorageSchemas();

    // 测试 2: Workspace Storage 数据读取
    console.log('\n📋 测试 2: Workspace Storage 数据读取');
    console.log('-'.repeat(50));

    const storages = engine['db'].getWorkspaceStorages();
    console.log(`发现 ${storages.length} 个工作区存储:\n`);

    for (const storage of storages.slice(0, 3)) {
      console.log(`工作区 ID: ${storage.id}`);
      console.log(`路径: ${storage.workspace.folders[0]?.path || '未知'}`);

      // 读取一些关键数据
      const customModes = engine['db'].getCustomModes(storage.databasePath);
      console.log(`自定义模式数: ${customModes.length}`);

      const sessionIndex = engine['db'].getChatSessionIndex(storage.databasePath);
      if (sessionIndex?.entries) {
        const entryCount = Object.keys(sessionIndex.entries).length;
        console.log(`会话索引条目: ${entryCount}`);
      }

      console.log('');
    }

    // 测试 3: 运行完整仪表板
    console.log('📋 测试 3: 完整数据洞察仪表板');
    console.log('-'.repeat(50));

    await engine.runDashboard();

    console.log('\n✅ 所有测试完成！\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  } finally {
    engine.destroy();
  }
}

// 运行测试
runTests().catch(console.error);
