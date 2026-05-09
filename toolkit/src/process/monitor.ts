import { exec } from 'child_process';
import { promisify } from 'util';
import { SOLO_PROCESS_NAMES, CDP_PORT } from '../constants.js';
import http from 'http';

const execAsync = promisify(exec);

interface ProcessInfo {
  name: string;
  pid: string;
  memory: string;
  running: boolean;
}

export async function getStatus(): Promise<void> {
  console.log('\n📊 SOLO 进程状态:\n');
  const processes: ProcessInfo[] = [];
  for (const name of SOLO_PROCESS_NAMES) {
    try {
      const { stdout } = await execAsync(
        `tasklist /FI "IMAGENAME eq ${name}" /FO CSV /NH`,
        { windowsHide: true }
      );
      if (stdout.includes(name)) {
        const match = stdout.match(/"([^"]+)","(\d+)","[^"]*","[^"]*","(\d+[^"]*)"/);
        if (match) {
          processes.push({ name, pid: match[2], memory: match[3], running: true });
          console.log(`  ✅ ${name} (PID: ${match[2]}, 内存: ${match[3]})`);
        }
      } else {
        processes.push({ name, pid: '-', memory: '-', running: false });
        console.log(`  ❌ ${name} (未运行)`);
      }
    } catch {
      processes.push({ name, pid: '-', memory: '-', running: false });
      console.log(`  ❌ ${name} (未运行)`);
    }
  }
  const cdpReady = await checkCdp();
  console.log(`\n  CDP 端口 ${CDP_PORT}: ${cdpReady ? '✅ 就绪' : '❌ 未就绪'}`);
  console.log();
}

function checkCdp(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}
