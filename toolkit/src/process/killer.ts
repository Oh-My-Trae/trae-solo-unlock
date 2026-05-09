import { exec } from 'child_process';
import { promisify } from 'util';
import { SOLO_PROCESS_NAMES } from '../constants.js';

const execAsync = promisify(exec);

export async function stopSolo(): Promise<void> {
  console.log('🛑 停止 SOLO 及子进程...');
  for (const name of SOLO_PROCESS_NAMES) {
    try {
      const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${name}" /NH`, {
        windowsHide: true,
      });
      if (stdout.includes(name)) {
        await execAsync(`taskkill /F /IM "${name}" /T`, { windowsHide: true });
        console.log(`  ✅ 已终止: ${name}`);
      }
    } catch {
      // 进程不存在，忽略
    }
  }
  console.log('✅ SOLO 已停止');
  await new Promise(r => setTimeout(r, 2000));
}
