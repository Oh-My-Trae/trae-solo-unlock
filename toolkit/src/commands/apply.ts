import { getPreset } from '../config/presets.js';
import { applyChanges } from '../config/writer.js';
import { rollback } from '../config/rollback.js';
import { stopSolo } from '../process/killer.js';
import { startSolo, waitForReady } from '../process/launcher.js';

export interface ApplyOptions {
  preset: string;
  rollbackOnFail?: boolean;
}

export async function applyPreset(options: ApplyOptions): Promise<boolean> {
  const { preset, rollbackOnFail = true } = options;
  
  console.log(`\n🔥 SOLO 魔改 - 预设: ${preset}\n`);
  
  // Step 1: 获取预设
  const presetConfig = getPreset(preset);
  if (!presetConfig) return false;
  console.log(`📋 应用预设: ${presetConfig.description}`);
  
  // Step 2: 备份并应用配置
  console.log('\n[1/4] 📝 修改配置...');
  try {
    applyChanges(presetConfig.changes);
  } catch (err) {
    console.error('❌ 配置修改失败:', err);
    return false;
  }
  
  // Step 3: 停止 SOLO
  console.log('\n[2/4] 🛑 停止 SOLO...');
  try {
    await stopSolo();
  } catch (err) {
    console.error('❌ 停止 SOLO 失败:', err);
    if (rollbackOnFail) {
      await doRollback();
    }
    return false;
  }
  
  // Step 4: 启动 SOLO
  console.log('\n[3/4] 🚀 启动 SOLO...');
  try {
    await startSolo();
  } catch (err) {
    console.error('❌ 启动 SOLO 失败:', err);
    if (rollbackOnFail) {
      await doRollback();
      await startSolo();
    }
    return false;
  }
  
  // Step 5: 等待就绪并验证
  console.log('\n[4/4] ✅ 验证启动状态...');
  const ready = await waitForReady(30, 2000);
  if (!ready) {
    console.log('⚠️ SOLO 启动超时，但配置已应用');
    return true; // 配置已应用，只是验证超时
  }
  
  console.log('\n✨ 魔改完成！');
  console.log(`  预设: ${preset}`);
  console.log(`  CDP 端口: 9222`);
  console.log(`  提示: 使用 solo-toolkit test smoke 进行冒烟测试\n`);
  return true;
}

async function doRollback(): Promise<void> {
  console.log('\n🔄 回滚配置...');
  const success = rollback();
  if (success) {
    console.log('✅ 已回滚到备份');
  } else {
    console.log('❌ 回滚失败！请手动恢复 backups/ 目录中的文件');
  }
}
