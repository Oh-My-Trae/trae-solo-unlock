import chokidar from 'chokidar';
import { PRODUCT_JSON } from '../constants.js';
import { stopSolo } from './killer.js';
import { startSolo } from './launcher.js';

let watcher: chokidar.FSWatcher | null = null;
let isRestarting = false;

export function startWatcher(): void {
  if (watcher) {
    console.log('⚠️ 监控已在运行');
    return;
  }
  console.log(`👁️ 监控 product.json 变更...`);
  watcher = chokidar.watch(PRODUCT_JSON, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 200,
    },
  });
  watcher.on('change', async () => {
    if (isRestarting) return;
    isRestarting = true;
    console.log('\n🔄 检测到 product.json 变更，自动重启 SOLO...');
    try {
      await stopSolo();
      await startSolo();
    } catch (err) {
      console.error('❌ 自动重启失败:', err);
    }
    isRestarting = false;
  });
}

export function stopWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    console.log('👁️ 监控已停止');
  }
}
