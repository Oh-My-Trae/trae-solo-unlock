import { exec } from 'child_process';
import { promisify } from 'util';
import http from 'http';
import {
  SOLO_PROCESS_NAMES,
  CDP_PORT,
  CDP_HOST,
  CDP_VERSION_ENDPOINT,
  DEFAULT_CDP_PORT,
} from '../constants.js';

const execAsync = promisify(exec);

// ==================== 类型定义 ====================

export interface ProcessInfo {
  name: string;
  pid: number | null;
  memory: string;         // 内存占用，如 "123,456 K"
  memoryBytes: number;    // 内存占用字节数
  cpu: string;            // CPU 使用率，如 "1.2%"
  running: boolean;
  status: string;         // 进程状态
}

export interface CdpStatus {
  port: number;
  reachable: boolean;
  browserVersion?: string;
  wsUrl?: string;
  userAgent?: string;
}

export interface HealthReport {
  overall: boolean;           // 总体健康状态
  processRunning: boolean;    // 主进程是否运行
  cdpReachable: boolean;      // CDP 是否可连接
  childProcesses: number;     // 子进程数量
  memoryUsage: string;        // 总内存占用
  cpuUsage: string;           // 总 CPU 使用率
  details: {
    processes: ProcessInfo[];
    cdp: CdpStatus;
  };
  timestamp: string;
  warnings: string[];         // 警告信息
}

// ==================== 日志工具 ====================

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [monitor] [${level}]`;
  if (level === 'ERROR') {
    console.error(`${prefix} ${msg}`);
  } else if (level === 'WARN') {
    console.warn(`${prefix} ${msg}`);
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

// ==================== 进程检查 ====================

/**
 * 检查指定进程名是否在运行
 */
export async function isProcessRunning(name: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `tasklist /FI "IMAGENAME eq ${name}" /NH`,
      { windowsHide: true }
    );
    return stdout.includes(name);
  } catch {
    return false;
  }
}

/**
 * 检查指定 PID 是否在运行
 */
export async function isPidRunning(pid: number): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `tasklist /FI "PID eq ${pid}" /NH`,
      { windowsHide: true }
    );
    return stdout.includes(String(pid));
  } catch {
    return false;
  }
}

/**
 * 获取指定进程名的所有进程信息
 */
export async function getProcessInfo(name: string): Promise<ProcessInfo[]> {
  try {
    const { stdout } = await execAsync(
      `tasklist /FI "IMAGENAME eq ${name}" /FO CSV /NH`,
      { windowsHide: true }
    );

    if (!stdout.includes(name)) {
      return [{ name, pid: null, memory: '-', memoryBytes: 0, cpu: '-', running: false, status: '未运行' }];
    }

    const results: ProcessInfo[] = [];
    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      if (!line.includes(name)) continue;
      const match = line.match(/"([^"]+)","(\d+)","([^"]*)","([^"]*)","(\d+[^"]*)"/);
      if (match) {
        const memStr = match[5];
        const memBytes = parseMemoryToBytes(memStr);
        results.push({
          name: match[1],
          pid: parseInt(match[2], 10),
          memory: memStr,
          memoryBytes: memBytes,
          cpu: '-',  // tasklist 不提供 CPU，需要通过 wmic 获取
          running: true,
          status: match[4] || 'Running',
        });
      }
    }
    return results.length > 0 ? results : [{ name, pid: null, memory: '-', memoryBytes: 0, cpu: '-', running: false, status: '未运行' }];
  } catch {
    return [{ name, pid: null, memory: '-', memoryBytes: 0, cpu: '-', running: false, status: '查询失败' }];
  }
}

/**
 * 获取指定进程的 CPU 使用率（通过 WMIC）
 */
export async function getProcessCpu(pid: number): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `wmic process where "ProcessId=${pid}" get PercentProcessorTime /VALUE`,
      { windowsHide: true, timeout: 5000 }
    );
    const match = stdout.match(/PercentProcessorTime=(\d+)/);
    return match ? `${match[1]}%` : '0%';
  } catch {
    return 'N/A';
  }
}

/**
 * 获取指定进程的内存占用（通过 WMIC，返回字节）
 */
export async function getProcessMemory(pid: number): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `wmic process where "ProcessId=${pid}" get WorkingSetSize /VALUE`,
      { windowsHide: true, timeout: 5000 }
    );
    const match = stdout.match(/WorkingSetSize=(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

// ==================== CDP 检查 ====================

/**
 * 检查 CDP 端口是否可连接
 */
export async function checkCdpReachable(port: number = DEFAULT_CDP_PORT): Promise<CdpStatus> {
  const status: CdpStatus = { port, reachable: false };

  try {
    const info = await fetchCdpInfo(port);
    status.reachable = true;
    status.browserVersion = info.Browser;
    status.wsUrl = info.webSocketDebuggerUrl;
    status.userAgent = info['User-Agent'];
  } catch {
    // CDP 不可连接
  }

  return status;
}

/**
 * 获取 CDP 版本信息
 */
function fetchCdpInfo(port: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${CDP_HOST}:${port}${CDP_VERSION_ENDPOINT}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('解析 CDP 响应失败'));
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('CDP 连接超时'));
    });
  });
}

// ==================== 健康检查 ====================

/**
 * 综合健康检查报告
 */
export async function healthCheck(port: number = DEFAULT_CDP_PORT): Promise<HealthReport> {
  const warnings: string[] = [];
  const processes: ProcessInfo[] = [];
  let totalMemoryBytes = 0;
  let mainProcessRunning = false;

  // 1. 检查所有 SOLO 相关进程
  for (const name of SOLO_PROCESS_NAMES) {
    const infos = await getProcessInfo(name);
    for (const info of infos) {
      processes.push(info);
      if (info.running) {
        totalMemoryBytes += info.memoryBytes;
        if (info.name === 'TRAE SOLO CN.exe') {
          mainProcessRunning = true;
        }
      }
    }
  }

  // 2. 检查 CDP 连接
  const cdpStatus = await checkCdpReachable(port);

  // 3. 获取主进程 CPU
  let totalCpu = 0;
  const mainProcess = processes.find(p => p.name === 'TRAE SOLO CN.exe' && p.running);
  if (mainProcess && mainProcess.pid) {
    const cpuStr = await getProcessCpu(mainProcess.pid);
    mainProcess.cpu = cpuStr;
    const cpuMatch = cpuStr.match(/(\d+)/);
    if (cpuMatch) totalCpu = parseInt(cpuMatch[1], 10);
  }

  // 4. 生成警告
  if (!mainProcessRunning) {
    warnings.push('主进程 (TRAE SOLO CN.exe) 未运行');
  }
  if (mainProcessRunning && !cdpStatus.reachable) {
    warnings.push(`主进程运行中但 CDP 端口 ${port} 不可连接，应用可能尚未完全启动`);
  }
  if (totalMemoryBytes > 2 * 1024 * 1024 * 1024) {
    warnings.push(`内存占用超过 2GB (${formatBytes(totalMemoryBytes)})，可能存在内存泄漏`);
  }

  const runningCount = processes.filter(p => p.running).length;

  return {
    overall: mainProcessRunning && cdpStatus.reachable,
    processRunning: mainProcessRunning,
    cdpReachable: cdpStatus.reachable,
    childProcesses: runningCount - (mainProcessRunning ? 1 : 0),
    memoryUsage: formatBytes(totalMemoryBytes),
    cpuUsage: `${totalCpu}%`,
    details: { processes, cdp: cdpStatus },
    timestamp: new Date().toISOString(),
    warnings,
  };
}

// ==================== 状态展示 ====================

/**
 * 打印进程状态（向后兼容）
 */
export async function getStatus(): Promise<void> {
  const report = await healthCheck();

  console.log('\n========================================');
  console.log('  SOLO 进程状态');
  console.log('========================================\n');

  // 进程列表
  console.log('  进程列表:');
  for (const p of report.details.processes) {
    if (p.running) {
      console.log(`    [运行] ${p.name} (PID: ${p.pid}, 内存: ${p.memory}, CPU: ${p.cpu})`);
    } else {
      console.log(`    [停止] ${p.name}`);
    }
  }

  // CDP 状态
  const cdp = report.details.cdp;
  console.log(`\n  CDP 端口 ${cdp.port}: ${cdp.reachable ? '[就绪]' : '[未就绪]'}`);
  if (cdp.reachable) {
    if (cdp.browserVersion) console.log(`    浏览器版本: ${cdp.browserVersion}`);
    if (cdp.wsUrl) console.log(`    WebSocket: ${cdp.wsUrl}`);
  }

  // 总体状态
  console.log(`\n  总内存占用: ${report.memoryUsage}`);
  console.log(`  子进程数: ${report.childProcesses}`);
  console.log(`  健康状态: ${report.overall ? '[正常]' : '[异常]'}`);

  // 警告
  if (report.warnings.length > 0) {
    console.log('\n  警告:');
    for (const w of report.warnings) {
      console.log(`    - ${w}`);
    }
  }

  console.log(`\n  检查时间: ${report.timestamp}`);
  console.log('========================================\n');
}

/**
 * 获取结构化状态数据（供程序调用）
 */
export async function getStatusData(port?: number): Promise<HealthReport> {
  return healthCheck(port);
}

// ==================== 工具函数 ====================

/**
 * 解析 tasklist 内存字符串为字节数
 * 例如: "123,456 K" -> 126418944
 */
function parseMemoryToBytes(memStr: string): number {
  const cleaned = memStr.replace(/[,\s]/g, '');
  const match = cleaned.match(/(\d+)/);
  if (match) {
    // tasklist 返回的是 KB
    return parseInt(match[1], 10) * 1024;
  }
  return 0;
}

/**
 * 格式化字节数为可读字符串
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
