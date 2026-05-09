import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PRODUCT_JSON, WATCHER_CHANGE_HISTORY_MAX, WATCHER_HISTORY_FILE } from '../constants.js';
import { killSolo } from './killer.js';
import { startSolo } from './launcher.js';

// ==================== 类型定义 ====================

export interface ChangeRecord {
  timestamp: string;
  file: string;
  changeType: 'change' | 'add' | 'unlink';
  previousHash: string;
  currentHash: string;
  sizeDiff: number;          // 文件大小变化（字节）
  autoReloaded: boolean;     // 是否已自动重载
}

export interface WatcherOptions {
  autoReload?: boolean;      // 检测到变更后自动重载（默认 false，提示用户）
  watchFiles?: string[];     // 监听的文件列表
  stabilityThreshold?: number; // 文件写入稳定阈值（毫秒）
  pollInterval?: number;     // 轮询间隔（毫秒）
}

export interface WatcherStatus {
  active: boolean;
  watchedFiles: string[];
  changeCount: number;
  lastChange: ChangeRecord | null;
}

// ==================== 内部状态 ====================

let watcher: chokidar.FSWatcher | null = null;
let isRestarting = false;
let changeHistory: ChangeRecord[] = [];
let watcherOptions: WatcherOptions = {};
let fileHashes = new Map<string, string>();   // 文件路径 -> 哈希值
let fileSizes = new Map<string, number>();     // 文件路径 -> 文件大小

// ==================== 日志工具 ====================

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [watcher] [${level}]`;
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
 * 启动配置变更监听器
 *
 * 功能:
 * 1. 监听 product.json 等配置文件变更
 * 2. 检测到变更后计算哈希差异
 * 3. 根据配置决定自动重载或提示用户
 * 4. 记录变更历史
 */
export function startWatcher(options: WatcherOptions = {}): void {
  if (watcher) {
    log('WARN', '监听器已在运行');
    return;
  }

  watcherOptions = {
    autoReload: false,
    watchFiles: [PRODUCT_JSON],
    stabilityThreshold: 1000,
    pollInterval: 200,
    ...options,
  };

  // 初始化文件哈希
  for (const file of watcherOptions.watchFiles!) {
    const hash = computeFileHash(file);
    const size = getFileSize(file);
    if (hash) {
      fileHashes.set(file, hash);
      fileSizes.set(file, size);
    }
  }

  // 加载历史记录
  loadHistory();

  log('INFO', `启动配置变更监听器`);
  log('INFO', `  监听文件: ${watcherOptions.watchFiles!.join(', ')}`);
  log('INFO', `  自动重载: ${watcherOptions.autoReload ? '开启' : '关闭'}`);

  watcher = chokidar.watch(watcherOptions.watchFiles!, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: watcherOptions.stabilityThreshold,
      pollInterval: watcherOptions.pollInterval,
    },
  });

  watcher.on('change', (filePath) => handleFileChange(filePath, 'change'));
  watcher.on('add', (filePath) => handleFileChange(filePath, 'add'));
  watcher.on('unlink', (filePath) => handleFileChange(filePath, 'unlink'));

  watcher.on('error', (err) => {
    log('ERROR', `监听器错误: ${err.message}`);
  });

  watcher.on('ready', () => {
    log('INFO', '监听器已就绪，正在监听配置变更...');
  });
}

/**
 * 停止监听器
 */
export function stopWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    log('INFO', '监听器已停止');
  }
}

/**
 * 获取监听器状态
 */
export function getWatcherStatus(): WatcherStatus {
  return {
    active: watcher !== null,
    watchedFiles: watcherOptions.watchFiles ?? [],
    changeCount: changeHistory.length,
    lastChange: changeHistory.length > 0 ? changeHistory[changeHistory.length - 1] : null,
  };
}

/**
 * 获取变更历史
 */
export function getChangeHistory(limit?: number): ChangeRecord[] {
  const history = [...changeHistory].reverse();
  return limit ? history.slice(0, limit) : history;
}

/**
 * 清空变更历史
 */
export function clearHistory(): void {
  changeHistory = [];
  saveHistory();
  log('INFO', '变更历史已清空');
}

// ==================== 内部处理 ====================

/**
 * 处理文件变更事件
 */
async function handleFileChange(filePath: string, changeType: 'change' | 'add' | 'unlink'): Promise<void> {
  if (isRestarting) return;

  const previousHash = fileHashes.get(filePath) || '';
  const previousSize = fileSizes.get(filePath) || 0;

  // 计算新哈希
  let currentHash = '';
  let currentSize = 0;
  if (changeType !== 'unlink') {
    currentHash = computeFileHash(filePath) || '';
    currentSize = getFileSize(filePath);
  }

  // 更新缓存
  if (changeType === 'unlink') {
    fileHashes.delete(filePath);
    fileSizes.delete(filePath);
  } else {
    fileHashes.set(filePath, currentHash);
    fileSizes.set(filePath, currentSize);
  }

  // 检查是否真正变更（哈希不同）
  if (changeType === 'change' && previousHash === currentHash) {
    log('INFO', `文件 ${filePath} 内容未变化（哈希一致），忽略`);
    return;
  }

  const record: ChangeRecord = {
    timestamp: new Date().toISOString(),
    file: filePath,
    changeType,
    previousHash,
    currentHash,
    sizeDiff: currentSize - previousSize,
    autoReloaded: false,
  };

  // 记录变更
  addChangeRecord(record);

  const fileName = path.basename(filePath);
  const sizeInfo = record.sizeDiff !== 0
    ? ` (大小变化: ${record.sizeDiff > 0 ? '+' : ''}${record.sizeDiff} 字节)`
    : '';

  log('INFO', `检测到 ${fileName} 变更 [${changeType}]${sizeInfo}`);

  if (changeType === 'unlink') {
    log('WARN', `文件 ${fileName} 已被删除！`);
    return;
  }

  // 根据配置决定自动重载或提示
  if (watcherOptions.autoReload) {
    await performAutoReload(record);
  } else {
    promptUserForReload(record);
  }
}

/**
 * 执行自动重载
 */
async function performAutoReload(record: ChangeRecord): Promise<void> {
  isRestarting = true;
  log('INFO', '自动重载 SOLO...');

  try {
    await killSolo(true);
    await startSolo();
    record.autoReloaded = true;
    log('INFO', '自动重载完成');
  } catch (err: any) {
    log('ERROR', `自动重载失败: ${err.message}`);
    log('ERROR', '  请手动执行: solo restart');
  } finally {
    isRestarting = false;
  }
}

/**
 * 提示用户选择是否重载
 */
function promptUserForReload(record: ChangeRecord): void {
  const fileName = path.basename(record.file);
  console.log('');
  console.log('========================================');
  console.log(`  配置文件变更通知`);
  console.log('========================================');
  console.log(`  文件: ${fileName}`);
  console.log(`  类型: ${record.changeType}`);
  console.log(`  时间: ${record.timestamp}`);
  if (record.sizeDiff !== 0) {
    console.log(`  大小变化: ${record.sizeDiff > 0 ? '+' : ''}${record.sizeDiff} 字节`);
  }
  console.log('----------------------------------------');
  console.log('  建议操作:');
  console.log('    solo restart          -- 重启 SOLO 使配置生效');
  console.log('    solo status           -- 查看当前状态');
  console.log('    solo watch --history  -- 查看变更历史');
  console.log('========================================');
  console.log('');
}

// ==================== 历史记录管理 ====================

/**
 * 添加变更记录
 */
function addChangeRecord(record: ChangeRecord): void {
  changeHistory.push(record);
  // 限制历史记录数量
  if (changeHistory.length > WATCHER_CHANGE_HISTORY_MAX) {
    changeHistory = changeHistory.slice(-WATCHER_CHANGE_HISTORY_MAX);
  }
  saveHistory();
}

/**
 * 保存历史记录到文件
 */
function saveHistory(): void {
  try {
    const data = JSON.stringify(changeHistory, null, 2);
    fs.writeFileSync(WATCHER_HISTORY_FILE, data, 'utf-8');
  } catch (err: any) {
    log('WARN', `保存变更历史失败: ${err.message}`);
  }
}

/**
 * 从文件加载历史记录
 */
function loadHistory(): void {
  try {
    if (fs.existsSync(WATCHER_HISTORY_FILE)) {
      const data = fs.readFileSync(WATCHER_HISTORY_FILE, 'utf-8');
      changeHistory = JSON.parse(data);
      log('INFO', `已加载 ${changeHistory.length} 条变更历史`);
    }
  } catch (err: any) {
    log('WARN', `加载变更历史失败: ${err.message}`);
    changeHistory = [];
  }
}

// ==================== 工具函数 ====================

/**
 * 计算文件 SHA256 哈希
 */
function computeFileHash(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  } catch {
    return null;
  }
}

/**
 * 获取文件大小
 */
function getFileSize(filePath: string): number {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const stat = fs.statSync(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

/**
 * 打印变更历史
 */
export function printHistory(limit: number = 10): void {
  const history = getChangeHistory(limit);

  if (history.length === 0) {
    console.log('\n  暂无变更历史记录\n');
    return;
  }

  console.log('\n========================================');
  console.log('  配置变更历史');
  console.log('========================================\n');

  for (const record of history) {
    const fileName = path.basename(record.file);
    const sizeInfo = record.sizeDiff !== 0
      ? ` [${record.sizeDiff > 0 ? '+' : ''}${record.sizeDiff}B]`
      : '';
    const reloadTag = record.autoReloaded ? ' [已重载]' : '';
    console.log(`  ${record.timestamp}`);
    console.log(`    ${fileName} [${record.changeType}]${sizeInfo}${reloadTag}`);
    console.log(`    哈希: ${record.previousHash.substring(0, 8)} -> ${record.currentHash.substring(0, 8)}`);
    console.log('');
  }

  console.log('========================================\n');
}
