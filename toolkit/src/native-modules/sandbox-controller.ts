/**
 * 沙箱策略动态调整工具 (Sandbox Controller)
 * ===========================================
 *
 * 功能：
 * 1. 动态添加/删除 RW（读写）目录
 * 2. 修改命令黑名单（运行时）
 * 3. 调整网络白名单
 * 4. 查看/导出当前沙箱策略
 * 5. 创建和切换权限预设
 * 6. 备份和恢复沙箱配置
 *
 * 注意：部分修改可能需要重启 TRAE SOLO CN 才能完全生效。
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SandboxConfig } from './sandbox-analysis.js';

// ==================== 类型定义 ====================

export interface SandboxPolicy {
  rwDirectories: string[];
  roDirectories: string[];
  commandDenyList: string[];
  commandMode: {
    ide: 'whitelist' | 'blacklist';
    solo: 'whitelist' | 'blacklist';
  };
  networkWhitelist?: NetworkRule[];
  metadata?: PolicyMetadata;
}

export interface PolicyMetadata {
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  author?: string;
  version?: string;
}

export interface NetworkRule {
  host: string;
  port?: number;
  protocol?: 'tcp' | 'udp' | 'both';
  action: 'allow' | 'deny';
  description?: string;
}

export interface PresetConfig {
  id: string;
  name: string;
  description: string;
  category: 'development' | 'security' | 'testing' | 'custom';
  policy: Partial<SandboxPolicy>;
}

interface ControllerConfig {
  productJsonPath: string;
  backupDir: string;
  presetsDir: string;
  logFile: string;
}

// ==================== 日志工具 ====================

class SandboxLogger {
  private logFile: string;

  constructor(logFile: string) {
    this.logFile = logFile;
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  info(message: string, data?: unknown): void {
    this.log('INFO', message, data);
  }

  error(message: string, error?: Error): void {
    this.log('ERROR', message, error?.message || error);
  }

  warn(message: string, data?: unknown): void {
    this.log('WARN', message, data);
  }

  private log(level: string, message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}${data ? ' | ' + JSON.stringify(data, null, 2) : ''}\n`;

    console.log(`[${level}] ${message}`, data || '');
    fs.appendFileSync(this.logFile, logEntry);
  }
}

// ==================== 预设配置 ====================

export const PRESET_CONFIGS: PresetConfig[] = [
  {
    id: 'default',
    name: 'Default (Balanced)',
    description: '默认的平衡配置，适合大多数开发场景',
    category: 'development',
    policy: {}
  },
  {
    id: 'permissive-dev',
    name: 'Permissive Development',
    description: '宽松的开发配置，允许更多目录访问',
    category: 'development',
    policy: {
      rwDirectories: [
        '$HOME',
        '$USERPROFILE',
        '/home',
        '$WORKSPACE_FOLDER'
      ],
      commandDenyList: [
        'rm -rf /',
        'dd if=/dev/zero of=/dev/sda',
        'mkfs.ext4',
        ':(){ :|:& };:',
        'chmod -R 777 /',
        'chown -R root:root /'
      ]
    }
  },
  {
    id: 'strict-security',
    name: 'Strict Security',
    description: '严格的安全配置，最小权限原则',
    category: 'security',
    policy: {
      rwDirectories: [
        '/tmp',
        '$TEMP%',
        '$WORKSPACE_FOLDER/node_modules/.cache'
      ],
      roDirectories: [
        '$WORKSPACE_FOLDER',
        '$WORKSPACE_FOLDER/.vscode'
      ],
      commandDenyList: [
        'rm -rf',
        'dd if=',
        'mkfs.',
        ':(){ :|:& };:',
        'sudo',
        'chmod',
        'chown',
        'curl | bash',
        'wget | bash',
        'eval',
        'base64 -d |',
        '> /etc/',
        '>> /etc/'
      ]
    }
  },
  {
    id: 'testing-qa',
    name: 'Testing/QA Environment',
    description: '测试环境专用配置，允许自动化工具访问',
    category: 'testing',
    policy: {
      rwDirectories: [
        '/tmp',
        '$TEMP%',
        '$WORKSPACE_FOLDER',
        '$WORKSPACE_FOLDER/test-results',
        '$WORKSPACE_FOLDER/coverage',
        '$WORKSPACE_FOLDER/.nyc_output',
        '$HOME/.cache',
        '~/.jest_cache'
      ],
      commandMode: {
        ide: 'blacklist',
        solo: 'blacklist'
      }
    }
  },
  {
    id: 'full-access-docker',
    name: 'Full Access (Docker/Container)',
    description: '容器内使用，允许完全访问（仅限隔离环境）',
    category: 'custom',
    policy: {
      rwDirectories: ['/'],
      commandDenyList: [],
      commandMode: {
        ide: 'blacklist',
        solo: 'blacklist'
      }
    }
  }
];

// ==================== 主类：SandboxController ====================

export class SandboxController {
  private config: ControllerConfig;
  private logger: SandboxLogger;
  private currentPolicy: SandboxPolicy | null = null;

  constructor(config?: Partial<ControllerConfig>) {
    this.config = {
      productJsonPath: config?.productJsonPath ||
        'D:\\apps\\TRAE SOLO CN\\resources\\app\\product.json',
      backupDir: config?.backupDir ||
        path.join(process.cwd(), 'backups', 'sandbox'),
      presetsDir: config?.presetsDir ||
        path.join(process.cwd(), 'presets', 'sandbox'),
      logFile: config?.logFile ||
        path.join(process.cwd(), 'logs', 'sandbox-controller.log')
    };

    this.logger = new SandboxLogger(this.config.logFile);
  }

  /**
   * 初始化控制器
   */
  async initialize(): Promise<void> {
    this.logger.info('SandboxController 初始化开始');

    // 确保必要目录存在
    [this.config.backupDir, this.config.presetsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // 验证 product.json 是否存在
    if (!fs.existsSync(this.config.productJsonPath)) {
      throw new Error(`产品配置文件不存在: ${this.config.productJsonPath}`);
    }

    // 加载当前策略
    this.currentPolicy = await this.loadCurrentPolicy();

    this.logger.info('初始化完成');
  }

  /**
   * 获取当前沙箱策略
   */
  async getCurrentPolicy(): Promise<SandboxPolicy> {
    if (!this.currentPolicy) {
      this.currentPolicy = await this.loadCurrentPolicy();
    }
    return { ...this.currentPolicy };
  }

  // ==================== RW 目录管理 ====================

  /**
   * 添加读写目录
   */
  async addRWDirectory(directory: string, options?: {
    validateExists?: boolean;     // 验证目录是否存在
    backupBeforeModify?: boolean;  // 修改前备份
  }): Promise<{ success: boolean; added: string; previousCount: number; newCount: number }> {
    const validateExists = options?.validateExists ?? false;
    const shouldBackup = options?.backupBeforeModify !== false;

    this.logger.info('添加 RW 目录', { directory, validateExists, shouldBackup });

    try {
      // 验证目录（如果需要）
      if (validateExists) {
        const expandedDir = this.expandPath(directory);
        if (!fs.existsSync(expandedDir)) {
          throw new Error(`目录不存在: ${expandedDir} (原始路径: ${directory})`);
        }
      }

      // 获取当前策略
      const policy = await this.getCurrentPolicy();
      const previousCount = policy.rwDirectories.length;

      // 检查是否已存在
      if (policy.rwDirectories.includes(directory)) {
        this.logger.warn('目录已存在于 RW 列表', { directory });
        return {
          success: true,
          added: directory,
          previousCount,
          newCount: previousCount
        };
      }

      // 备份当前配置
      if (shouldBackup) {
        await this.createBackup('pre-add-rw-' + this.sanitizeFilename(directory));
      }

      // 添加新目录
      policy.rwDirectories.push(directory);

      // 保存修改
      await this.savePolicy(policy);

      this.logger.info('RW 目录添加成功', {
        directory,
        previousCount,
        newCount: policy.rwDirectories.length
      });

      return {
        success: true,
        added: directory,
        previousCount,
        newCount: policy.rwDirectories.length
      };

    } catch (error) {
      this.logger.error('添加 RW 目录失败', error as Error);
      throw new Error(`添加 RW 目录失败: ${(error as Error).message}`);
    }
  }

  /**
   * 批量添加读写目录
   */
  async addRWDirectories(
    directories: string[],
    options?: { validateExists?: boolean; backupBeforeModify?: boolean }
  ): Promise<{ added: string[]; skipped: string[]; errors: Array<{ dir: string; error: string }> }> {
    this.logger.info('批量添加 RW 目录', { count: directories.length });

    const result = {
      added: [] as string[],
      skipped: [] as string[],
      errors: [] as Array<{ dir: string; error: string }>
    };

    for (const dir of directories) {
      try {
        const res = await this.addRWDirectory(dir, options);
        if (res.success && !result.skipped.includes(dir)) {
          result.added.push(res.added);
        }
      } catch (error) {
        result.errors.push({ dir, error: (error as Error).message });
        // 如果是"已存在"的情况，不算错误
        if (!(error as Error).message.includes('已存在')) {
          // 真正的错误
        } else {
          result.skipped.push(dir);
        }
      }
    }

    this.logger.info('批量添加完成', result);
    return result;
  }

  /**
   * 移除读写目录
   */
  async removeRWDirectory(directory: string, options?: {
    backupBeforeModify?: boolean;
  }): Promise<{ success: boolean; removed: string; remainingCount: number }> {
    const shouldBackup = options?.backupBeforeModify !== false;

    this.logger.info('移除 RW 目录', { directory });

    try {
      const policy = await this.getCurrentPolicy();

      // 检查是否存在
      const index = policy.rwDirectories.indexOf(directory);
      if (index === -1) {
        throw new Error(`目录不在 RW 列表中: ${directory}`);
      }

      // 备份
      if (shouldBackup) {
        await this.createBackup('pre-remove-rw-' + this.sanitizeFilename(directory));
      }

      // 移除目录
      policy.rwDirectories.splice(index, 1);

      // 保存
      await this.savePolicy(policy);

      this.logger.info('RW 目录移除成功', {
        directory,
        remainingCount: policy.rwDirectories.length
      });

      return {
        success: true,
        removed: directory,
        remainingCount: policy.rwDirectories.length
      };
    } catch (error) {
      this.logger.error('移除 RW 目录失败', error as Error);
      throw new Error(`移除 RW 目录失败: ${(error as Error).message}`);
    }
  }

  // ==================== 命令黑名单管理 ====================

  /**
   * 添加命令到黑名单
   */
  async addToCommandDenyList(
    commandPattern: string,
    options?: {
      reason?: string;
      backupBeforeModify?: boolean;
    }
  ): Promise<{ success: boolean; added: string; totalCount: number }> {
    const shouldBackup = options?.backupBeforeModify !== false;

    this.logger.info('添加命令到黑名单', { commandPattern, reason: options?.reason });

    try {
      const policy = await this.getCurrentPolicy();

      // 检查是否已存在
      if (policy.commandDenyList.includes(commandPattern)) {
        this.logger.warn('命令已在黑名单中', { commandPattern });
        return {
          success: true,
          added: commandPattern,
          totalCount: policy.commandDenyList.length
        };
      }

      // 备份
      if (shouldBackup) {
        await this.createBackup('pre-add-deny-' + this.sanitizeFilename(commandPattern));
      }

      // 添加到黑名单
      policy.commandDenyList.push(commandPattern);

      // 保存
      await this.savePolicy(policy);

      this.logger.info('命令已添加到黑名单', {
        pattern: commandPattern,
        totalCount: policy.commandDenyList.length
      });

      return {
        success: true,
        added: commandPattern,
        totalCount: policy.commandDenyList.length
      };
    } catch (error) {
      this.logger.error('添加命令到黑名单失败', error as Error);
      throw new Error(`添加命令到黑名单失败: ${(error as Error).message}`);
    }
  }

  /**
   * 从黑名单移除命令
   */
  async removeFromCommandDenyList(
    commandPattern: string,
    options?: {
      reason?: string;
      backupBeforeModify?: boolean;
    }
  ): Promise<{ success: boolean; removed: string; remainingCount: number }> {
    const shouldBackup = options?.backupBeforeModify !== false;

    this.logger.info('从黑名单移除命令', { commandPattern, reason: options?.reason });

    try {
      const policy = await this.getCurrentPolicy();

      const index = policy.commandDenyList.indexOf(commandPattern);
      if (index === -1) {
        throw new Error(`命令不在黑名单中: ${commandPattern}`);
      }

      // 备份
      if (shouldBackup) {
        await this.createBackup('pre-remove-deny-' + this.sanitizeFilename(commandPattern));
      }

      // 从黑名单移除
      policy.commandDenyList.splice(index, 1);

      // 保存
      await this.savePolicy(policy);

      this.logger.info('命令已从黑名单移除', {
        pattern: commandPattern,
        remainingCount: policy.commandDenyList.length
      });

      return {
        success: true,
        removed: commandPattern,
        remainingCount: policy.commandDenyList.length
      };
    } catch (error) {
      this.logger.error('从黑名单移除命令失败', error as Error);
      throw new Error(`从黑名单移除命令失败: ${(error as Error).message}`);
    }
  }

  /**
   * 设置完整的命令黑名单
   */
  async setCommandDenyList(
    commands: string[],
    options?: { backupBeforeModify?: boolean }
  ): Promise<{ success: boolean; count: number }> {
    const shouldBackup = options?.backupBeforeModify !== false;

    this.logger.info('设置完整命令黑名单', { count: commands.length });

    try {
      const policy = await this.getCurrentPolicy();

      if (shouldBackup) {
        await this.createBackup('pre-set-denylist');
      }

      policy.commandDenyList = [...commands];
      await this.savePolicy(policy);

      this.logger.info('命令黑名单已更新', { count: commands.length });
      return { success: true, count: commands.length };
    } catch (error) {
      this.logger.error('设置命令黑名单失败', error as Error);
      throw error;
    }
  }

  // ==================== 命令模式管理 ====================

  /**
   * 设置命令执行模式
   */
  async setCommandMode(
    mode: {
      ide?: 'whitelist' | 'blacklist';
      solo?: 'whitelist' | 'blacklist';
    },
    options?: { backupBeforeModify?: boolean }
  ): Promise<SandboxPolicy> {
    const shouldBackup = options?.backupBeforeModify !== false;

    this.logger.info('设置命令执行模式', mode);

    try {
      const policy = await this.getCurrentPolicy();

      if (shouldBackup) {
        await this.createBackup('pre-set-mode');
      }

      if (mode.ide) {
        policy.commandMode.ide = mode.ide;
      }
      if (mode.solo) {
        policy.commandMode.solo = mode.solo;
      }

      await this.savePolicy(policy);

      this.logger.info('命令执行模式已更新', policy.commandMode);
      return policy;
    } catch (error) {
      this.logger.error('设置命令执行模式失败', error as Error);
      throw error;
    }
  }

  // ==================== 网络控制（实验性）====================

  /**
   * 添加网络规则（如果支持）
   */
  async addNetworkRule(rule: NetworkRule, options?: { backupBeforeModify?: boolean }): Promise<SandboxPolicy> {
    this.logger.info('添加网络规则', rule);

    try {
      const policy = await this.getCurrentPolicy();

      if (!policy.networkWhitelist) {
        policy.networkWhitelist = [];
      }

      // 检查是否已存在相同规则
      const exists = policy.networkWhitelist.some(r =>
        r.host === rule.host &&
        r.port === rule.port &&
        r.protocol === rule.protocol
      );

      if (exists) {
        this.logger.warn('网络规则已存在', rule);
        return policy;
      }

      if (options?.backupBeforeModify !== false) {
        await this.createBackup('pre-add-network-rule');
      }

      policy.networkWhitelist.push(rule);
      await this.savePolicy(policy);

      this.logger.info('网络规则已添加', rule);
      return policy;
    } catch (error) {
      this.logger.error('添加网络规则失败', error as Error);
      throw error;
    }
  }

  // ==================== 预设管理 ====================

  /**
   * 获取所有可用的预设配置
   */
  getAvailablePresets(): PresetConfig[] {
    return PRESET_CONFIGS;
  }

  /**
   * 应用预设配置
   */
  async applyPreset(presetId: string, options?: {
    mergeWithCurrent?: boolean;  // 与当前配置合并而非替换
    backupBeforeApply?: boolean;
  }): Promise<{
    success: boolean;
    presetName: string;
    appliedChanges: string[];
  }> {
    const mergeWithCurrent = options?.mergeWithCurrent ?? true;
    const shouldBackup = options?.backupBeforeApply !== false;

    this.logger.info('应用预设配置', { presetId, mergeWithCurrent });

    try {
      // 查找预设
      const preset = PRESET_CONFIGS.find(p => p.id === presetId);
      if (!preset) {
        throw new Error(`未找到预设配置: ${presetId}`);
      }

      // 备份当前配置
      if (shouldBackup) {
        await this.createBackup(`pre-preset-${presetId}`);
      }

      // 获取当前或新的策略
      let policy: SandboxPolicy;
      if (mergeWithCurrent) {
        policy = await this.getCurrentPolicy();
      } else {
        policy = this.getDefaultPolicy();
      }

      // 应用预设的策略
      const appliedChanges: string[] = [];

      if (preset.policy.rwDirectories) {
        // 合并或替换 RW 目录
        if (mergeWithCurrent) {
          for (const dir of preset.policy.rwDirectories) {
            if (!policy.rwDirectories.includes(dir)) {
              policy.rwDirectories.push(dir);
              appliedChanges.push(`+RW: ${dir}`);
            }
          }
        } else {
          policy.rwDirectories = [...preset.policy.rwDirectories];
          appliedChanges.push(`RW: replaced (${preset.policy.rwDirectories.length} dirs)`);
        }
      }

      if (preset.policy.roDirectories) {
        if (mergeWithCurrent) {
          for (const dir of preset.policy.roDirectories) {
            if (!policy.roDirectories.includes(dir)) {
              policy.roDirectories.push(dir);
              appliedChanges.push(`+RO: ${dir}`);
            }
          }
        } else {
          policy.roDirectories = [...preset.policy.roDirectories];
          appliedChanges.push(`RO: replaced`);
        }
      }

      if (preset.policy.commandDenyList) {
        if (mergeWithCurrent) {
          for (const cmd of preset.policy.commandDenyList) {
            if (!policy.commandDenyList.includes(cmd)) {
              policy.commandDenyList.push(cmd);
              appliedChanges.push(`+DENY: ${cmd}`);
            }
          }
        } else {
          policy.commandDenyList = [...preset.policy.commandDenyList];
          appliedChanges.push(`DENY: replaced (${preset.policy.commandDenyList.length} cmds)`);
        }
      }

      if (preset.policy.commandMode) {
        if (preset.policy.commandMode.ide) {
          policy.commandMode.ide = preset.policy.commandMode.ide;
          appliedChanges.push(`MODE(ide): ${preset.policy.commandMode.ide}`);
        }
        if (preset.policy.commandMode.solo) {
          policy.commandMode.solo = preset.policy.commandMode.solo;
          appliedChanges.push(`MODE(solo): ${preset.policy.commandMode.solo}`);
        }
      }

      // 更新元数据
      if (!policy.metadata) {
        policy.metadata = {
          name: `Custom (based on ${preset.name})`,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
      policy.metadata.updatedAt = new Date();

      // 保存
      await this.savePolicy(policy);

      this.logger.info('预设配置已应用', {
        presetName: preset.name,
        changesApplied: appliedChanges.length
      });

      return {
        success: true,
        presetName: preset.name,
        appliedChanges
      };
    } catch (error) {
      this.logger.error('应用预设配置失败', error as Error);
      throw new Error(`应用预设配置失败: ${(error as Error).message}`);
    }
  }

  /**
   * 创建自定义预设
   */
  async createCustomPreset(preset: Omit<PresetConfig, 'id'>): Promise<PresetConfig> {
    const id = `custom-${Date.now()}`;
    const fullPreset: PresetConfig = { ...preset, id };

    // 保存到文件
    const presetPath = path.join(this.config.presetsDir, `${id}.json`);
    fs.writeFileSync(presetPath, JSON.stringify(fullPreset, null, 2), 'utf-8');

    this.logger.info('自定义预设已创建', { id, name: preset.name });
    return fullPreset;
  }

  // ==================== 导出/导入 ====================

  /**
   * 导出当前策略为文件
   */
  async exportPolicy(exportPath?: string): Promise<string> {
    const targetPath = exportPath ||
      path.join(this.config.backupDir, `policy-export-${Date.now()}.json`);

    this.logger.info('导出沙箱策略', { exportPath: targetPath });

    try {
      const policy = await this.getCurrentPolicy();
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        tool: 'TRAE-SOLO-CN-Sandbox-Controller',
        policy
      };

      fs.writeFileSync(targetPath, JSON.stringify(exportData, null, 2), 'utf-8');

      this.logger.info('策略导出成功', { path: targetPath });
      return targetPath;
    } catch (error) {
      this.logger.error('导出策略失败', error as Error);
      throw error;
    }
  }

  /**
   * 从文件导入策略
   */
  async importPolicy(importPath: string, options?: {
    mergeWithCurrent?: boolean;
    backupBeforeImport?: boolean;
  }): Promise<SandboxPolicy> {
    const mergeWithCurrent = options?.mergeWithCurrent ?? false;
    const shouldBackup = options?.backupBeforeImport !== false;

    this.logger.info('导入沙箱策略', { importPath, mergeWithCurrent });

    try {
      if (!fs.existsSync(importPath)) {
        throw new Error(`文件不存在: ${importPath}`);
      }

      const content = fs.readFileSync(importPath, 'utf-8');
      const importData = JSON.parse(content);

      if (!importData.policy) {
        throw new Error('无效的策略文件格式：缺少 policy 字段');
      }

      if (shouldBackup) {
        await this.createBackup('pre-import-policy');
      }

      let finalPolicy: SandboxPolicy;
      if (mergeWithCurrent) {
        // 合并策略
        const currentPolicy = await this.getCurrentPolicy();
        finalPolicy = this.mergePolicies(currentPolicy, importData.policy);
      } else {
        // 直接使用导入的策略
        finalPolicy = importData.policy;
      }

      await this.savePolicy(finalPolicy);

      this.logger.info('策略导入成功');
      return finalPolicy;
    } catch (error) {
      this.logger.error('导入策略失败', error as Error);
      throw new Error(`导入策略失败: ${(error as Error).message}`);
    }
  }

  // ==================== 备份与恢复 ====================

  /**
   * 创建当前配置的备份
   */
  async createBackup(backupName?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = backupName || `sandbox-backup-${timestamp}`;
    const backupPath = path.join(this.config.backupDir, `${name}.json`);

    this.logger.info('创建沙箱配置备份', { backupName: name });

    try {
      const policy = await this.getCurrentPolicy();
      const backupData = {
        version: '1.0.0',
        backedUpAt: new Date().toISOString(),
        tool: 'TRAE-SOLO-CN-Sandbox-Controller',
        policy
      };

      fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf-8');

      this.logger.info('备份创建成功', { path: backupPath });
      return backupPath;
    } catch (error) {
      this.logger.error('创建备份失败', error as Error);
      throw error;
    }
  }

  /**
   * 列出所有备份
   */
  listBackups(): Array<{ path: string; date: Date; size: number }> {
    if (!fs.existsSync(this.config.backupDir)) {
      return [];
    }

    const files = fs.readdirSync(this.config.backupDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(this.config.backupDir, f);
        const stats = fs.statSync(filePath);
        return {
          path: filePath,
          date: stats.mtime,
          size: stats.size
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    return files;
  }

  /**
   * 从备份恢复
   */
  async restoreFromBackup(backupPath?: string): Promise<SandboxPolicy> {
    if (!backupPath) {
      // 使用最新备份
      const backups = this.listBackups();
      if (backups.length === 0) {
        throw new Error('没有找到可用的备份文件');
      }
      backupPath = backups[0].path;
    }

    this.logger.info('从备份恢复', { backupPath });

    try {
      const content = fs.readFileSync(backupPath, 'utf-8');
      const backupData = JSON.parse(content);

      if (!backupData.policy) {
        throw new Error('无效的备份文件格式');
      }

      await this.savePolicy(backupData.policy);
      this.currentPolicy = backupData.policy;

      this.logger.info('恢复成功', { from: path.basename(backupPath) });
      return backupData.policy;
    } catch (error) {
      this.logger.error('恢复失败', error as Error);
      throw new Error(`恢复失败: ${(error as Error).message}`);
    }
  }

  /**
   * 重置为默认配置
   */
  async resetToDefault(options?: { backupBeforeReset?: boolean }): Promise<SandboxPolicy> {
    const shouldBackup = options?.backupBeforeReset !== false;

    this.logger.info('重置为默认配置');

    if (shouldBackup) {
      await this.createBackup('pre-reset-to-default');
    }

    const defaultPolicy = this.getDefaultPolicy();
    await this.savePolicy(defaultPolicy);
    this.currentPolicy = defaultPolicy;

    this.logger.info('已重置为默认配置');
    return defaultPolicy;
  }

  // ==================== 分析与诊断 ====================

  /**
   * 检查路径是否在 RW 列表中
   */
  isPathInRWList(pathToCheck: string): boolean {
    const policy = this.currentPolicy;
    if (!policy) return false;

    const expandedPath = this.expandPath(pathToCheck.toLowerCase());

    return policy.rwDirectories.some(dir => {
      const expandedDir = this.expandPath(dir).toLowerCase();
      return expandedPath.startsWith(expandedDir) || expandedPath === expandedDir;
    });
  }

  /**
   * 检查命令是否被阻止
   */
  isCommandBlocked(command: string): { blocked: boolean; matchedPattern?: string } {
    const policy = this.currentPolicy;
    if (!policy) return { blocked: false };

    for (const pattern of policy.commandDenyList) {
      // 将简单模式转换为正则表达式
      const regexPattern = pattern
        .replace(/\*/g, '.*')       // * 匹配任意字符
        .replace(/\?/g, '.')         // ? 匹配单个字符
        .replace(/\//g, '\\/');      // 转义斜杠

      try {
        const regex = new RegExp(regexPattern);
        if (regex.test(command)) {
          return { blocked: true, matchedPattern: pattern };
        }
      } catch {
        // 忽略无效的正则表达式
      }
    }

    return { blocked: false };
  }

  /**
   * 生成安全评估报告
   */
  generateSecurityReport(): {
    overallScore: number;           // 0-100, 分数越高越安全
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    findings: Array<{
      severity: 'info' | 'warning' | 'critical';
      category: string;
      message: string;
      recommendation?: string;
    }>;
  } {
    const policy = this.currentPolicy;
    if (!policy) {
      return {
        overallScore: 0,
        riskLevel: 'critical',
        findings: [{ severity: 'critical', category: 'system', message: '无法加载当前策略' }]
      };
    }

    const findings: Array<{
      severity: 'info' | 'warning' | 'critical';
      category: string;
      message: string;
      recommendation?: string;
    }> = [];

    let score = 100;

    // 检查 RW 目录数量
    if (policy.rwDirectories.length > 150) {
      score -= 20;
      findings.push({
        severity: 'warning',
        category: 'file-system',
        message: `RW 目录过多 (${policy.rwDirectories.length})`,
        recommendation: '审查并减少不必要的 RW 目录'
      });
    }

    // 检查是否有根目录或用户主目录
    const dangerousPaths = ['/', '$HOME', '$USERPROFILE', '%USERPROFILE%'];
    const hasDangerousPaths = policy.rwDirectories.some(dir =>
      dangerousPaths.includes(dir.toUpperCase())
    );
    if (hasDangerousPaths) {
      score -= 30;
      findings.push({
        severity: 'critical',
        category: 'file-system',
        message: '检测到高风险路径（根目录或用户主目录）',
        recommendation: '避免将整个系统目录加入 RW 列表'
      });
    }

    // 检查命令黑名单强度
    if (policy.commandDenyList.length < 5) {
      score -= 15;
      findings.push({
        severity: 'warning',
        category: 'command-execution',
        message: `命令黑名单条目过少 (${policy.commandDenyList.length})`,
        recommendation: '考虑添加更多危险命令到黑名单'
      });
    }

    // 检查命令模式
    if (policy.commandMode.ide === 'blacklist' || policy.commandMode.solo === 'blacklist') {
      score -= 10;
      findings.push({
        severity: 'warning',
        category: 'command-execution',
        message: '使用了黑名单模式（相对不安全）',
        recommendation: '建议使用白名单模式以获得更好的安全性'
      });
    }

    // 确定风险等级
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (score >= 80) riskLevel = 'low';
    else if (score >= 60) riskLevel = 'medium';
    else if (score >= 40) riskLevel = 'high';
    else riskLevel = 'critical';

    // 添加总结性发现
    findings.push({
      severity: 'info',
      category: 'summary',
      message: `总体安全评分: ${score}/100 (风险等级: ${riskLevel.toUpperCase()})`
    });

    return {
      overallScore: Math.max(0, score),
      riskLevel,
      findings
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 加载当前策略从 product.json
   */
  private async loadCurrentPolicy(): Promise<SandboxPolicy> {
    const content = fs.readFileSync(this.config.productJsonPath, 'utf-8');
    const productConfig = JSON.parse(content);
    const autoRunConfig = productConfig.iCubeApp?.nativeAppConfig?.autoRunConfig;

    if (!autoRunConfig) {
      this.logger.warn('未找到 autoRunConfig 配置，使用默认值');
      return this.getDefaultPolicy();
    }

    return {
      rwDirectories: autoRunConfig.sandboxRWList || [],
      roDirectories: autoRunConfig.sandboxROList || [],
      commandDenyList: autoRunConfig.commandDenyList || [],
      commandMode: {
        ide: autoRunConfig.ideCommandMode || 'whitelist',
        solo: autoRunConfig.soloCommandMode || 'whitelist'
      },
      networkWhitelist: undefined, // 当前版本可能不支持
      metadata: {
        name: 'Current Configuration',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };
  }

  /**
   * 保存策略到 product.json
   */
  private async savePolicy(policy: SandboxPolicy): Promise<void> {
    const content = fs.readFileSync(this.config.productJsonPath, 'utf-8');
    const productConfig = JSON.parse(content);

    // 确保 iCubeApp.nativeAppConfig.autoRunConfig 存在
    if (!productConfig.iCubeApp) productConfig.iCubeApp = {};
    if (!productConfig.iCubeApp.nativeAppConfig) productConfig.iCubeApp.nativeAppConfig = {};
    if (!productConfig.iCubeApp.nativeAppConfig.autoRunConfig) {
      productConfig.iCubeApp.nativeAppConfig.autoRunConfig = {};
    }

    const autoRunConfig = productConfig.iCubeApp.nativeAppConfig.autoRunConfig;

    // 更新配置
    autoRunConfig.sandboxRWList = policy.rwDirectories;
    autoRunConfig.sandboxROList = policy.roDirectories;
    autoRunConfig.commandDenyList = policy.commandDenyList;
    autoRunConfig.ideCommandMode = policy.commandMode.ide;
    autoRunConfig.soloCommandMode = policy.commandMode.solo;

    // 保存文件
    fs.writeFileSync(
      this.config.productJsonPath,
      JSON.stringify(productConfig, null, 2),
      'utf-8'
    );

    // 更新内存中的缓存
    this.currentPolicy = policy;
  }

  /**
   * 获取默认策略
   */
  private getDefaultPolicy(): SandboxPolicy {
    return {
      rwDirectories: [],
      roDirectories: [
        '$WORKSPACE_FOLDER/.vscode',
        '$WORKSPACE_FOLDER/.trae/mcp.json'
      ],
      commandDenyList: [
        'rm -rf /',
        'dd if=',
        'mkfs.',
        ':(){ :|:& };:'
      ],
      commandMode: {
        ide: 'whitelist',
        solo: 'whitelist'
      },
      metadata: {
        name: 'Default Policy',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };
  }

  /**
   * 合并两个策略
   */
  private mergePolicies(base: SandboxPolicy, override: Partial<SandboxPolicy>): SandboxPolicy {
    return {
      rwDirectories: override.rwDirectories || base.rwDirectories,
      roDirectories: override.roDirectories || base.roDirectories,
      commandDenyList: override.commandDenyList || base.commandDenyList,
      commandMode: override.commandMode || base.commandMode,
      networkWhitelist: override.networkWhitelist || base.networkWhitelist,
      metadata: {
        ...base.metadata,
        ...override.metadata,
        updatedAt: new Date()
      }
    };
  }

  /**
   * 展开路径中的环境变量
   */
  private expandPath(p: string): string {
    let expanded = p;

    // Windows 环境变量
    expanded = expanded.replace(/%([^%]+)%/g, (_, varName) => {
      return process.env[varName] || `%${varName}%`;
    });

    // Unix 环境变量
    expanded = expanded.replace(/\$([A-Z_]+)/g, (_, varName) => {
      if (varName === 'HOME') return process.env.USERPROFILE || process.env.HOME || '';
      if (varName === 'TMPDIR' || varName === 'TEMP') return process.env.TEMP || '/tmp';
      if (varName === 'WORKSPACE_FOLDER') return process.cwd(); // 简化处理
      return process.env[varName] || `$${varName}`;
    });

    // 处理 ~
    expanded = expanded.replace(/^~/, process.env.USERPROFILE || '');

    return expanded;
  }

  /**
   * 清理文件名（用于备份文件名）
   */
  private sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '_')
      .substring(0, 50); // 限制长度
  }
}

// ==================== 导出便捷函数 ====================

/**
 * 快速添加 RW 目录
 */
export async function quickAddRW(directory: string): Promise<boolean> {
  const controller = new SandboxController();
  await controller.initialize();
  const result = await controller.addRWDirectory(directory);
  return result.success;
}

/**
 * 快速应用预设
 */
export async function quickApplyPreset(presetId: string): Promise<boolean> {
  const controller = new SandboxController();
  await controller.initialize();
  const result = await controller.applyPreset(presetId);
  return result.success;
}

/**
 * 生成快速安全报告
 */
export async function quickSecurityCheck(): Promise<string> {
  const controller = new SandboxController();
  await controller.initialize();
  const report = controller.generateSecurityReport();

  let output = `\n${'='.repeat(60)}\n`;
  output += `沙箱安全检查报告\n`;
  output += `${'='.repeat(60)}\n\n`;
  output += `总体评分: ${report.overallScore}/100\n`;
  output += `风险等级: ${report.riskLevel.toUpperCase()}\n\n`;

  output += `发现的问题:\n`;
  output += `-`.repeat(60) + '\n';

  report.findings.forEach((finding, index) => {
    const icon = finding.severity === 'critical' ? '🔴' :
                 finding.severity === 'warning' ? '🟡' : '🟢';
    output += `\n${index + 1}. [${icon}] [${finding.severity.toUpperCase()}] ${finding.message}\n`;
    if (finding.recommendation) {
      output += `   建议: ${finding.recommendation}\n`;
    }
  });

  output += `\n${'='.repeat(60)}\n`;
  return output;
}
