import { exec } from 'child_process';
import { promisify } from 'util';
import {
  SOLO_PROCESS_NAMES,
  SHUTDOWN_TIMEOUT_MS,
  PROCESS_EXIT_POLL_MS,
  PROCESS_EXIT_MAX_POLLS,
} from '../constants.js';
import { resetSoloProcess } from './launcher.js';

const execAsync = promisify(exec);

// ==================== 类型定义 ====================

export interface KillOptions {
  force?: boolean;        // 强制终止 (/F)
  timeout?: number;       // 等待超时（毫秒）
  killChildren?: boolean; // 是否终止子进程树
}

export interface KillResult {
  killed: string[];       // 成功终止的进程名
  failed: string[];       // 终止失败的进程名
  notFound: string[];     // 未找到的进程名
  timedOut: boolean;      // 是否超时
}

// ==================== 日志工具 ====================

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [killer] [${level}]`;
  if (level === 'ERROR') {
    console.error(`${prefix} ${msg}`);
  } else if (level === 'WARN') {
    console.warn(`${prefix} ${msg}`);
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

// ==================== 核心功能 ====================

/**
 * 终止 SOLO 主进程及所有子进程树
 *
 * 流程:
 * 1. 查找所有 SOLO 相关进程
 * 2. 使用 taskkill /T 终止进程树
 * 3. 如 force=true，使用 /F 强制终止
 * 4. 等待进程完全退出
 * 5. 处理僵死进程
 */
export async function killSolo(force: boolean = true, options: KillOptions = {}): Promise<KillResult> {
  const {
    timeout = SHUTDOWN_TIMEOUT_MS,
    killChildren = true,
  } = options;

  const useForce = force || options.force !== false;
  const result: KillResult = { killed: [], failed: [], notFound: [], timedOut: false };

  log('INFO', `开始终止 SOLO 进程 (force=${useForce}, killChildren=${killChildren})`);

  // 1. 查找并终止所有 SOLO 相关进程
  // 先找主进程的 PID，以便后续终止子进程树
  const mainPids = await findProcessPids('TRAE SOLO CN.exe');

  if (mainPids.length > 0 && killChildren) {
    // 2. 终止主进程的子进程树（/T 参数）
    for (const pid of mainPids) {
      log('INFO', `终止主进程树 (PID: ${pid})...`);
      try {
        const cmd = useForce
          ? `taskkill /F /PID ${pid} /T`
          : `taskkill /PID ${pid} /T`;
        await execAsync(cmd, { windowsHide: true, timeout: 10000 });
        log('INFO', `  主进程树已终止 (PID: ${pid})`);
        result.killed.push(`TRAE SOLO CN.exe (PID:${pid})`);
      } catch (err: any) {
        // taskkill 在进程不存在时会返回非零退出码
        if (err.message?.includes('not found') || err.message?.includes('找不到')) {
          log('WARN', `  主进程已不存在 (PID: ${pid})`);
          result.notFound.push(`TRAE SOLO CN.exe (PID:${pid})`);
        } else {
          log('ERROR', `  终止主进程树失败 (PID: ${pid}): ${err.message}`);
          result.failed.push(`TRAE SOLO CN.exe (PID:${pid})`);
        }
      }
    }
  }

  // 3. 逐个终止其他子进程（不在主进程树中的）
  const childProcessNames = SOLO_PROCESS_NAMES.filter(n => n !== 'TRAE SOLO CN.exe');
  for (const name of childProcessNames) {
    try {
      const pids = await findProcessPids(name);
      if (pids.length === 0) {
        result.notFound.push(name);
        continue;
      }
      for (const pid of pids) {
        const cmd = useForce
          ? `taskkill /F /PID ${pid} /T`
          : `taskkill /PID ${pid} /T`;
        try {
          await execAsync(cmd, { windowsHide: true, timeout: 10000 });
          log('INFO', `  已终止: ${name} (PID: ${pid})`);
          result.killed.push(`${name} (PID:${pid})`);
        } catch (err: any) {
          if (err.message?.includes('not found') || err.message?.includes('找不到')) {
            result.notFound.push(`${name} (PID:${pid})`);
          } else {
            log('ERROR', `  终止失败: ${name} (PID: ${pid}): ${err.message}`);
            result.failed.push(`${name} (PID:${pid})`);
          }
        }
      }
    } catch {
      result.notFound.push(name);
    }
  }

  // 4. 等待进程完全退出
  log('INFO', '等待进程完全退出...');
  const exited = await waitForAllProcessesExit(timeout);
  if (!exited) {
    result.timedOut = true;
    log('WARN', `部分进程未在 ${timeout}ms 内退出，尝试强制清理僵死进程...`);
    await cleanupZombieProcesses();
  }

  // 5. 重置 launcher 的进程引用
  resetSoloProcess();

  log('INFO', `终止完成: 成功=${result.killed.length}, 失败=${result.failed.length}, 未找到=${result.notFound.length}`);
  return result;
}

/**
 * 通过 PID 终止指定进程
 */
export async function killSoloByPid(pid: number, force: boolean = true): Promise<boolean> {
  try {
    const cmd = force
      ? `taskkill /F /PID ${pid} /T`
      : `taskkill /PID ${pid} /T`;
    await execAsync(cmd, { windowsHide: true, timeout: 10000 });
    log('INFO', `已终止进程 (PID: ${pid})`);
    resetSoloProcess();
    return true;
  } catch (err: any) {
    log('ERROR', `终止进程失败 (PID: ${pid}): ${err.message}`);
    return false;
  }
}

/**
 * 通过进程名终止进程
 */
export async function killSoloByName(name: string, force: boolean = true): Promise<boolean> {
  try {
    const cmd = force
      ? `taskkill /F /IM "${name}" /T`
      : `taskkill /IM "${name}" /T`;
    await execAsync(cmd, { windowsHide: true, timeout: 10000 });
    log('INFO', `已终止进程: ${name}`);
    return true;
  } catch (err: any) {
    log('ERROR', `终止进程失败: ${name}: ${err.message}`);
    return false;
  }
}

// ==================== 辅助函数 ====================

/**
 * 查找指定进程名的所有 PID
 */
async function findProcessPids(name: string): Promise<number[]> {
  try {
    const { stdout } = await execAsync(
      `tasklist /FI "IMAGENAME eq ${name}" /FO CSV /NH`,
      { windowsHide: true }
    );
    const pids: number[] = [];
    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      if (line.includes(name)) {
        const match = line.match(/"[^"]+","(\d+)"/);
        if (match) {
          pids.push(parseInt(match[1], 10));
        }
      }
    }
    return pids;
  } catch {
    return [];
  }
}

/**
 * 等待所有 SOLO 相关进程退出
 */
async function waitForAllProcessesExit(timeout: number): Promise<boolean> {
  const maxPolls = Math.ceil(timeout / PROCESS_EXIT_POLL_MS);
  for (let i = 0; i < maxPolls; i++) {
    let anyRunning = false;
    for (const name of SOLO_PROCESS_NAMES) {
      const pids = await findProcessPids(name);
      if (pids.length > 0) {
        anyRunning = true;
        break;
      }
    }
    if (!anyRunning) {
      return true;
    }
    await new Promise(r => setTimeout(r, PROCESS_EXIT_POLL_MS));
  }
  return false;
}

/**
 * 清理僵死进程
 *
 * 使用 WMIC 查找并强制终止无响应的进程
 */
async function cleanupZombieProcesses(): Promise<void> {
  for (const name of SOLO_PROCESS_NAMES) {
    try {
      const pids = await findProcessPids(name);
      for (const pid of pids) {
        log('WARN', `发现僵死进程: ${name} (PID: ${pid})，尝试强制终止...`);
        try {
          // 使用 /F 强制终止
          await execAsync(`taskkill /F /PID ${pid}`, { windowsHide: true, timeout: 5000 });
          log('INFO', `  僵死进程已强制终止 (PID: ${pid})`);
        } catch {
          // 最后手段: 使用 WMIC 终止
          try {
            await execAsync(`wmic process where "ProcessId=${pid}" delete`, {
              windowsHide: true,
              timeout: 5000,
            });
            log('INFO', `  通过 WMIC 终止僵死进程 (PID: ${pid})`);
          } catch (wmicErr: any) {
            log('ERROR', `  无法终止僵死进程 (PID: ${pid}): ${wmicErr.message}`);
            log('ERROR', `  请手动打开任务管理器终止该进程`);
          }
        }
      }
    } catch {
      // 忽略查询错误
    }
  }
}

/**
 * 保留向后兼容的 stopSolo 函数
 */
export async function stopSolo(): Promise<void> {
  const result = await killSolo(true);
  if (result.failed.length > 0) {
    log('WARN', `部分进程终止失败: ${result.failed.join(', ')}`);
  }
  if (result.timedOut) {
    log('WARN', '部分进程未在超时内退出');
  }
}
