import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import fs from 'fs';
import {
  SOLO_EXE,
  DEFAULT_CDP_PORT,
  CDP_HOST,
  CDP_VERSION_ENDPOINT,
  STARTUP_TIMEOUT_MS,
  CDP_POLL_INTERVAL_MS,
  CDP_POLL_MAX_RETRIES,
} from '../constants.js';
import { killSolo, killSoloByPid } from './killer.js';
import { isProcessRunning } from './monitor.js';

// ==================== 类型定义 ====================

export interface LaunchOptions {
  cdpPort?: number;         // CDP 端口，默认 9222
  noKill?: boolean;         // 不自动终止已有进程
  extraArgs?: string[];     // 额外启动参数
  timeout?: number;         // 启动超时（毫秒）
}

export interface CdpVersionInfo {
  Browser: string;
  'Protocol-Version': string;
  'User-Agent': string;
  'V8-Version': string;
  'WebKit-Version': string;
  webSocketDebuggerUrl?: string;
}

export interface LaunchResult {
  pid: number;
  cdpPort: number;
  cdpEndpoint: string;
  wsUrl?: string;
  browserVersion?: string;
  ready: boolean;
}

// ==================== 内部状态 ====================

let soloProcess: ChildProcess | null = null;
let currentCdpPort: number = DEFAULT_CDP_PORT;

// ==================== 日志工具 ====================

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [launcher] [${level}]`;
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
 * 启动 SOLO 进程
 *
 * 流程:
 * 1. 检查可执行文件是否存在
 * 2. 自动终止已有 SOLO 进程（除非 noKill=true）
 * 3. 构造启动参数并 spawn
 * 4. 等待 CDP 端口就绪
 * 5. 返回 PID 和 CDP 连接信息
 */
export async function startSolo(options: LaunchOptions = {}): Promise<LaunchResult> {
  const {
    cdpPort = DEFAULT_CDP_PORT,
    noKill = false,
    extraArgs = [],
    timeout = STARTUP_TIMEOUT_MS,
  } = options;

  currentCdpPort = cdpPort;

  // 1. 检查可执行文件
  if (!fs.existsSync(SOLO_EXE)) {
    const err = `可执行文件不存在: ${SOLO_EXE}\n  请确认 TRAE SOLO CN 已正确安装。`;
    log('ERROR', err);
    throw new Error(err);
  }

  // 2. 自动终止已有进程
  if (!noKill) {
    const running = await isProcessRunning('TRAE SOLO CN.exe');
    if (running) {
      log('INFO', '检测到已有 SOLO 进程，正在终止...');
      await killSolo(false);
      log('INFO', '已有进程已终止');
    }
  } else {
    // 即使 noKill，也检查本模块管理的进程引用
    if (soloProcess && !soloProcess.killed) {
      log('WARN', '本模块已管理一个 SOLO 进程，先终止旧引用');
      try {
        process.kill(soloProcess.pid!);
      } catch {
        // 进程可能已退出
      }
      soloProcess = null;
    }
  }

  // 3. 构造启动参数
  const args = [
    `--remote-debugging-port=${cdpPort}`,
    ...extraArgs,
  ];

  log('INFO', `启动 SOLO...`);
  log('INFO', `  可执行文件: ${SOLO_EXE}`);
  log('INFO', `  CDP 端口: ${cdpPort}`);
  log('INFO', `  额外参数: ${extraArgs.length > 0 ? extraArgs.join(' ') : '(无)'}`);

  // 4. spawn 进程
  soloProcess = spawn(SOLO_EXE, args, {
    detached: false,
    stdio: 'ignore',
    windowsHide: false,
  });

  const pid = soloProcess.pid!;
  log('INFO', `进程已启动 (PID: ${pid})`);

  // 监听进程事件
  soloProcess.on('error', (err) => {
    log('ERROR', `进程启动失败: ${err.message}`);
    soloProcess = null;
  });

  soloProcess.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      log('WARN', `进程退出，退出码: ${code}, 信号: ${signal}`);
    }
    soloProcess = null;
  });

  // 5. 等待 CDP 就绪
  log('INFO', '等待 CDP 端口就绪...');
  const maxRetries = Math.ceil(timeout / CDP_POLL_INTERVAL_MS);
  const ready = await waitForReady(maxRetries, CDP_POLL_INTERVAL_MS);

  const cdpEndpoint = `http://${CDP_HOST}:${cdpPort}${CDP_VERSION_ENDPOINT}`;
  const result: LaunchResult = {
    pid,
    cdpPort,
    cdpEndpoint,
    ready,
  };

  if (ready) {
    // 获取 CDP 版本信息
    try {
      const versionInfo = await fetchCdpVersionInfo(cdpPort);
      result.wsUrl = versionInfo.webSocketDebuggerUrl;
      result.browserVersion = versionInfo.Browser;
      log('INFO', `SOLO 已就绪`);
      log('INFO', `  浏览器版本: ${versionInfo.Browser}`);
      log('INFO', `  WebSocket: ${versionInfo.webSocketDebuggerUrl || '(未获取)'}`);
    } catch (err: any) {
      log('WARN', `获取 CDP 版本信息失败: ${err.message}`);
    }
  } else {
    log('ERROR', `SOLO 启动超时 (${timeout}ms)，CDP 端口未就绪`);
    log('ERROR', '  可能原因:');
    log('ERROR', '    1. 应用启动缓慢，可尝试增大 --timeout');
    log('ERROR', '    2. CDP 端口被占用，可尝试指定其他 --cdp-port');
    log('ERROR', '    3. 应用启动崩溃，请手动运行 TRAE SOLO CN.exe 检查');
  }

  return result;
}

/**
 * 等待 CDP 端口就绪
 */
export async function waitForReady(
  maxRetries: number = CDP_POLL_MAX_RETRIES,
  interval: number = CDP_POLL_INTERVAL_MS,
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await checkCdpReady(currentCdpPort);
      return true;
    } catch {
      if (i < maxRetries - 1) {
        process.stdout.write('.');
        await new Promise(r => setTimeout(r, interval));
      }
    }
  }
  console.log();
  return false;
}

/**
 * 检查 CDP 端口是否可连接
 */
function checkCdpReady(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${CDP_HOST}:${port}${CDP_VERSION_ENDPOINT}`, (res) => {
      if (res.statusCode === 200) {
        res.resume();
        resolve();
      } else {
        reject(new Error(`CDP 返回非 200 状态码: ${res.statusCode}`));
      }
    });
    req.on('error', reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('CDP 连接超时'));
    });
  });
}

/**
 * 获取 CDP 版本信息
 */
export async function fetchCdpVersionInfo(port: number = currentCdpPort): Promise<CdpVersionInfo> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${CDP_HOST}:${port}${CDP_VERSION_ENDPOINT}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as CdpVersionInfo);
        } catch (err) {
          reject(new Error(`解析 CDP 版本信息失败: ${data}`));
        }
      });
    });
    req.on('error', (err) => reject(new Error(`CDP 请求失败: ${err.message}`)));
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('CDP 请求超时'));
    });
  });
}

// ==================== 状态查询 ====================

/**
 * 获取当前管理的进程实例
 */
export function getSoloProcess(): ChildProcess | null {
  return soloProcess;
}

/**
 * 获取当前 CDP 端口
 */
export function getCurrentCdpPort(): number {
  return currentCdpPort;
}

/**
 * 获取 CDP WebSocket URL
 */
export async function getCdpWsUrl(port?: number): Promise<string | null> {
  try {
    const info = await fetchCdpVersionInfo(port ?? currentCdpPort);
    return info.webSocketDebuggerUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * 重置内部进程引用（进程被外部终止时调用）
 */
export function resetSoloProcess(): void {
  soloProcess = null;
}
