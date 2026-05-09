import fs from 'fs';
import path from 'path';
import { PRODUCT_JSON, BACKUP_DIR } from '../constants.js';
import { readProductJson } from './reader.js';

function ensureBackupDir(): string {
  const dir = path.resolve(BACKUP_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function backupProductJson(): string {
  const dir = ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(dir, `product-${timestamp}.json`);
  fs.copyFileSync(PRODUCT_JSON, backupPath);
  console.log(`📦 备份已保存: ${backupPath}`);
  return backupPath;
}

export function setConfigValue(obj: Record<string, any>, path: string, value: any): void {
  const keys = path.split('.');
  let current: any = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] === undefined) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

export function writeProductJson(config: Record<string, any>): void {
  const content = JSON.stringify(config, null, '\t');
  fs.writeFileSync(PRODUCT_JSON, content, 'utf-8');
  console.log('✅ product.json 已更新');
}

export function applyChanges(changes: Record<string, any>): void {
  backupProductJson();
  const config = readProductJson();
  for (const [path, value] of Object.entries(changes)) {
    console.log(`  🔧 ${path}: ${JSON.stringify(getNestedValue(config, path))} → ${JSON.stringify(value)}`);
    setConfigValue(config, path, value);
  }
  writeProductJson(config);
}

function getNestedValue(obj: Record<string, any>, path: string): any {
  const keys = path.split('.');
  let current: any = obj;
  for (const key of keys) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return current;
}
