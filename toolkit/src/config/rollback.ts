import fs from 'fs';
import path from 'path';
import { PRODUCT_JSON, BACKUP_DIR } from '../constants.js';

export function rollback(): boolean {
  const dir = path.resolve(BACKUP_DIR);
  if (!fs.existsSync(dir)) {
    console.log('❌ 无备份文件，无法回滚');
    return false;
  }
  const backups = fs.readdirSync(dir)
    .filter(f => f.startsWith('product-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (backups.length === 0) {
    console.log('❌ 无备份文件，无法回滚');
    return false;
  }
  const latestBackup = path.join(dir, backups[0]);
  fs.copyFileSync(latestBackup, PRODUCT_JSON);
  console.log(`✅ 已回滚到备份: ${backups[0]}`);
  fs.unlinkSync(latestBackup);
  return true;
}
