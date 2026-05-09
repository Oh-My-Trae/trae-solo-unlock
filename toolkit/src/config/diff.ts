import fs from 'fs';
import path from 'path';
import { PRODUCT_JSON, BACKUP_DIR } from '../constants.js';
import { readProductJson, getConfigValue } from './reader.js';

export function showDiff(): void {
  const dir = path.resolve(BACKUP_DIR);
  if (!fs.existsSync(dir)) {
    console.log('❌ 无备份文件');
    return;
  }
  const backups = fs.readdirSync(dir)
    .filter(f => f.startsWith('product-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (backups.length === 0) {
    console.log('❌ 无备份文件');
    return;
  }
  const latestBackup = path.join(dir, backups[0]);
  const backupConfig = JSON.parse(fs.readFileSync(latestBackup, 'utf-8'));
  const currentConfig = readProductJson();

  const keyFields = [
    'computerUse.enable',
    'autoRunConfig.ideCommandMode',
    'autoRunConfig.soloCommandMode',
    'icubeConfig.mcpToolLimit',
    'icubeConfig.mcpTokenLimit',
    'icubeConfig.customPromptTokenLimit',
    'icubeConfig.featureGates.enableHashDoc',
    'icubeConfig.featureGates.enableCueflow',
    'icubeConfig.featureGates.enableTabCue',
    'icubeConfig.worktree.enable',
    'icubeConfig.privacyMode.enable',
    'enableTelemetry',
  ];

  console.log(`\n📊 配置差异 (当前 vs 备份 ${backups[0]}):\n`);
  let hasDiff = false;
  for (const field of keyFields) {
    const current = getConfigValue(currentConfig, field);
    const backup = getConfigValue(backupConfig, field);
    if (JSON.stringify(current) !== JSON.stringify(backup)) {
      hasDiff = true;
      console.log(`  ${field}:`);
      console.log(`    备份: ${JSON.stringify(backup)}`);
      console.log(`    当前: ${JSON.stringify(current)}`);
    }
  }
  if (!hasDiff) {
    console.log('  (无差异)');
  }
  console.log();
}
