import fs from 'fs';
import { PRODUCT_JSON } from '../constants.js';

export function readProductJson(): Record<string, any> {
  const raw = fs.readFileSync(PRODUCT_JSON, 'utf-8');
  return JSON.parse(raw);
}

export function getConfigValue(obj: Record<string, any>, path: string): any {
  const keys = path.split('.');
  let current: any = obj;
  for (const key of keys) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return current;
}

export function showConfig(): void {
  const config = readProductJson();
  const keyFields = [
    ['computerUse.enable', 'Computer Use'],
    ['autoRunConfig.ideCommandMode', 'IDE命令模式'],
    ['autoRunConfig.soloCommandMode', 'Solo命令模式'],
    ['icubeConfig.mcpToolLimit', 'MCP工具限制'],
    ['icubeConfig.mcpTokenLimit', 'MCP Token限制'],
    ['icubeConfig.customPromptTokenLimit', '自定义提示词限制'],
    ['icubeConfig.featureGates.enableHashDoc', 'HashDoc'],
    ['icubeConfig.featureGates.enableCueflow', 'Cueflow'],
    ['icubeConfig.featureGates.enableTabCue', 'TabCue'],
    ['icubeConfig.worktree.enable', 'Worktree'],
    ['icubeConfig.privacyMode.enable', 'Privacy Mode'],
    ['enableTelemetry', '遥测'],
  ];
  console.log('\n📊 SOLO 当前配置:\n');
  for (const [path, label] of keyFields) {
    const value = getConfigValue(config, path);
    const display = value === undefined ? '(未定义)' : JSON.stringify(value);
    console.log(`  ${label}: ${display}`);
  }
  console.log();
}
