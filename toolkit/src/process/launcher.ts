import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import { SOLO_EXE, CDP_PORT } from '../constants.js';

let soloProcess: ChildProcess | null = null;

export async function startSolo(): Promise<void> {
  if (soloProcess && !soloProcess.killed) {
    console.log('⚠️ SOLO 已在运行中');
    return;
  }
  console.log('🚀 启动 SOLO...');
  soloProcess = spawn(SOLO_EXE, [`--remote-debugging-port=${CDP_PORT}`], {
    detached: false,
    stdio: 'ignore',
  });
  soloProcess.on('error', (err) => {
    console.error(`❌ 启动失败: ${err.message}`);
    soloProcess = null;
  });
  soloProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`⚠️ SOLO 退出，代码: ${code}`);
    }
    soloProcess = null;
  });
  console.log(`✅ SOLO 已启动 (PID: ${soloProcess.pid})`);
  console.log('⏳ 等待就绪...');
  await waitForReady();
}

export function getSoloProcess(): ChildProcess | null {
  return soloProcess;
}

export async function waitForReady(maxRetries = 30, interval = 2000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await checkCdpReady();
      console.log('✅ SOLO 已就绪');
      return true;
    } catch {
      await new Promise(r => setTimeout(r, interval));
      process.stdout.write('.');
    }
  }
  console.log('\n❌ SOLO 启动超时');
  return false;
}

function checkCdpReady(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, (res) => {
      if (res.statusCode === 200) {
        res.resume();
        resolve();
      } else {
        reject(new Error('CDP not ready'));
      }
    });
    req.on('error', reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}
