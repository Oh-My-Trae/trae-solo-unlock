/**
 * File Tracker - 代码修改追踪器 (SubTask 10.4)
 * 追踪文件修改历史和热点文件分析
 */

import type {
  FileTrackingResult,
  FileHotspot,
  FileTimelineEntry,
  FileTypeDistribution,
  FileTypeStat,
  ChangeStatistics,
  ChangeEstimate,
} from '../types.js';
import { DatabaseConnector } from '../db/connector.js';
import path from 'path';

export class FileTracker {
  private db: DatabaseConnector;

  constructor(dbConnector: DatabaseConnector) {
    this.db = dbConnector;
  }

  // ============================================================
  // 主要分析方法
  // ============================================================

  /**
   * 执行完整的文件追踪分析
   */
  async analyze(): Promise<FileTrackingResult> {
    // 收集所有工作区的文件修改数据
    const allModifications = await this.collectFileModifications();

    return {
      hotspots: this.identifyHotspots(allModifications),
      timeline: this.buildTimeline(allModifications),
      fileTypeDistribution: this.analyzeFileTypeDistribution(allModifications),
      changeStatistics: this.calculateChangeStatistics(allModifications),
    };
  }

  /**
   * 获取热点文件排行榜
   */
  getHotspotFiles(limit: number = 20): FileHotspot[] {
    const modifications = this.collectFileModificationsSync();
    return this.identifyHotspots(modifications).slice(0, limit);
  }

  /**
   * 按时间段统计修改量
   */
  getModificationTimeline(days: number = 7): FileTimelineEntry[] {
    const modifications = this.collectFileModificationsSync();
    return this.buildTimeline(modifications, days);
  }

  /**
   * 按文件类型分类统计
   */
  getFileTypeDistribution(): FileTypeDistribution {
    const modifications = this.collectFileModificationsSync();
    return this.analyzeFileTypeDistribution(modifications);
  }

  /**
   * 查找特定文件的修改历史
   */
  getFileHistory(filePath: string): any {
    const storages = this.db.getWorkspaceStorages();

    for (const storage of storages) {
      const history = this.extractFileHistory(storage.databasePath, filePath);
      if (history.length > 0) {
        return history;
      }
    }

    return [];
  }

  // ============================================================
  // 数据收集方法
  // ============================================================

  /**
   * 异步收集文件修改数据
   */
  private async collectFileModifications(): Promise<FileModification[]> {
    return this.collectFileModificationsSync();
  }

  /**
   * 同步收集文件修改数据
   */
  private collectFileModificationsSync(): FileModification[] {
    const allModifications: FileModification[] = [];
    const storages = this.db.getWorkspaceStorages();

    for (const storage of storages) {
      const workspacePath = this.getWorkspaceFolderPath(storage);
      if (!workspacePath) continue;

      // 尝试从 Git 历史获取数据
      const gitHistory = this.getGitHistory(workspacePath);
      allModifications.push(...gitHistory);

      // 从 VSCode 状态获取最近打开/编辑的文件
      const recentFiles = this.getRecentEditedFiles(storage.databasePath);
      allModifications.push(...recentFiles);
    }

    return allModifications;
  }

  /**
   * 获取工作区文件夹路径
   */
  private getWorkspaceFolderPath(storage: any): string | null {
    try {
      if (storage.workspace?.folders?.length > 0) {
        return storage.workspace.folders[0].path;
      }
    } catch (error) {
      // 忽略错误
    }
    return null;
  }

  /**
   * 从 Git 历史获取文件修改记录
   */
  private getGitHistory(workspacePath: string): FileModification[] {
    const { execSync } = require('child_process');
    const modifications: FileModification[] = [];

    try {
      // 获取最近的提交历史（包含文件变更）
      const gitLog = execSync(
        'git log --name-status --pretty=format:"COMMIT:%H|%s|%an|%ai" -100',
        { cwd: workspacePath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      );

      let currentCommit: { hash: string; message: string; author: string; date: string } | null = null;

      for (const line of gitLog.split('\n')) {
        if (line.startsWith('COMMIT:')) {
          const [, hash, message, author, date] = line.split('|');
          currentCommit = { hash, message, author, date };
        } else if (line.trim() && currentCommit && line.includes('\t')) {
          const [status, filePath] = line.split('\t');
          const linesAdded = status.startsWith('A') || status.startsWith('M') ? this.estimateLines(workspacePath, currentCommit.hash, filePath) : 0;
          const linesRemoved = status.startsWith('D') || status.startsWith('M') ? Math.floor(linesAdded * 0.3) : 0;

          modifications.push({
            filePath,
            modifiedAt: new Date(currentCommit.date).getTime() / 1000,
            linesAdded,
            linesRemoved,
            commitHash: currentCommit.hash,
            commitMessage: currentCommit.message,
            author: currentCommit.author,
            project: workspacePath,
            language: this.detectLanguage(filePath),
          });
        }
      }
    } catch (error) {
      // Git 不可用或不是 Git 仓库
      console.warn(`Git history not available for ${workspacePath}`);
    }

    return modifications;
  }

  /**
   * 估算文件的行数变更
   */
  private estimateLines(workspacePath: string, commitHash: string, filePath: string): number {
    try {
      const { execSync } = require('child_process');
      const diff = execSync(
        `git diff ${commitHash}^..${commitHash} -- "${filePath}" --stat`,
        { cwd: workspacePath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      );

      // 解析 diff stat 输出，提取插入行数
      const match = diff.match(/(\d+) insertion\(+\)?/);
      return match ? parseInt(match[1]) : 10; // 默认估算值
    } catch (error) {
      return 10;
    }
  }

  /**
   * 获取最近编辑的文件（从 VSCode 状态）
   */
  private getRecentEditedFiles(dbPath: string): FileModification[] {
    const files: FileModification[] = [];

    try {
      // 尝试读取最近打开的文件列表
      const recentFiles = this.db.getStorageValue(dbPath, 'editor.recentFiles');

      if (Array.isArray(recentFiles)) {
        for (const file of recentFiles.slice(0, 50)) {
          files.push({
            filePath: file.path || file,
            modifiedAt: Date.now() / 1000,
            linesAdded: 5, // 估算值
            linesRemoved: 2, // 估算值
            commitHash: '',
            commitMessage: 'Recent edit',
            author: '',
            project: '',
            language: this.detectLanguage(file.path || file),
          });
        }
      }
    } catch (error) {
      // 忽略错误
    }

    return files;
  }

  /**
   * 提取特定文件的历史
   */
  private extractFileHistory(dbPath: string, filePath: string): any[] {
    const history: any[] = [];

    try {
      // 这里可以从数据库中查询特定文件的修改记录
      // 由于实际的数据结构可能不同，这里提供一个框架实现

      const keys = this.db.getStorageKeys(dbPath);
      const relevantKeys = keys.filter(k =>
        k.includes('fileHistory') ||
        k.includes('fileChanges') ||
        k.includes('recent')
      );

      for (const key of relevantKeys) {
        const data = this.db.getStorageValue(dbPath, key);
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.path === item.filePath || item.path?.includes(filePath)) {
              history.push(item);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error extracting file history:', error);
    }

    return history;
  }

  // ============================================================
  // 分析方法
  // ============================================================

  /**
   * 识别热点文件
   */
  private identifyHotspots(modifications: FileModification[]): FileHotspot[] {
    const fileMap: Map<string, FileHotspot> = new Map();

    for (const mod of modifications) {
      const existing = fileMap.get(mod.filePath);

      if (existing) {
        existing.modificationCount++;
        existing.estimatedChanges.linesAdded += mod.linesAdded;
        existing.estimatedChanges.linesRemoved += mod.linesRemoved;
        existing.estimatedChanges.netChange =
          existing.estimatedChanges.linesAdded - existing.estimatedChanges.linesRemoved;

        if (mod.modifiedAt > existing.lastModified.unix) {
          existing.lastModified = this.parseTimestamp(mod.modifiedAt);
        }
      } else {
        fileMap.set(mod.filePath, {
          filePath: mod.filePath,
          modificationCount: 1,
          lastModified: this.parseTimestamp(mod.modifiedAt),
          project: mod.project,
          language: mod.language,
          estimatedChanges: {
            linesAdded: mod.linesAdded,
            linesRemoved: mod.linesRemoved,
            netChange: mod.linesAdded - mod.linesRemoved,
          },
        });
      }
    }

    return Array.from(fileMap.values())
      .sort((a, b) => b.modificationCount - a.modificationCount);
  }

  /**
   * 构建时间线
   */
  private buildTimeline(modifications: FileModification[], days: number = 30): FileTimelineEntry[] {
    const dailyMap: Map<string, Set<string>> = new Map();
    const dailyCount: Map<string, number> = new Map();

    const cutoffDate = Date.now() / 1000 - (days * 24 * 60 * 60);

    for (const mod of modifications) {
      if (mod.modifiedAt < cutoffDate) continue;

      const dateKey = new Date(mod.modifiedAt * 1000).toISOString().split('T')[0];

      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, new Set());
        dailyCount.set(dateKey, 0);
      }

      dailyMap.get(dateKey)!.add(mod.filePath);
      dailyCount.set(dateKey, dailyCount.get(dateKey)! + 1);
    }

    const timeline: FileTimelineEntry[] = [];

    for (const [date, files] of dailyMap) {
      timeline.push({
        date,
        filesModified: files.size,
        modifications: dailyCount.get(date) || 0,
        topFiles: Array.from(files).slice(0, 5),
      });
    }

    return timeline.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 分析文件类型分布
   */
  private analyzeFileTypeDistribution(modifications: FileModification[]): FileTypeDistribution {
    const typeMap: Record<string, { fileCount: Set<string>; modificationCount: number }> = {};
    const { FILE_TYPE_MAP } = require('../types');

    for (const mod of modifications) {
      const ext = path.extname(mod.filePath).toLowerCase();
      const language = FILE_TYPE_MAP[ext] || 'Unknown';

      if (!typeMap[ext]) {
        typeMap[ext] = { fileCount: new Set(), modificationCount: 0 };
      }

      typeMap[ext].fileCount.add(mod.filePath);
      typeMap[ext].modificationCount++;
    }

    const totalModifications = modifications.length;
    const types: Record<string, FileTypeStat> = {};
    const sorted: FileTypeStat[] = [];

    for (const [extension, data] of Object.entries(typeMap)) {
      const language = FILE_TYPE_MAP[extension] || 'Unknown';
      const stat: FileTypeStat = {
        extension,
        language,
        fileCount: data.fileCount.size,
        modificationCount: data.modificationCount,
        percentage: (data.modificationCount / totalModifications) * 100,
      };

      types[extension] = stat;
      sorted.push(stat);
    }

    sorted.sort((a, b) => b.modificationCount - a.modificationCount);

    return { types, sorted };
  }

  /**
   * 计算变更统计
   */
  private calculateChangeStatistics(modifications: FileModification[]): ChangeStatistics {
    const uniqueFiles = new Set(modifications.map(m => m.filePath));
    const dailyModifications: Record<string, number> = {};

    for (const mod of modifications) {
      const dateKey = new Date(mod.modifiedAt * 1000).toISOString().split('T')[0];
      dailyModifications[dateKey] = (dailyModifications[dateKey] || 0) + 1;
    }

    const mostActiveDay = Object.entries(dailyModifications)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || '';

    return {
      totalModifications: modifications.length,
      totalFilesAffected: uniqueFiles.size,
      averageModificationsPerFile: modifications.length / uniqueFiles.size || 0,
      mostActiveDay,
      modificationsByDay: dailyModifications,
    };
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 检测编程语言
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const { FILE_TYPE_MAP } = require('../types');
    return FILE_TYPE_MAP[ext] || 'Unknown';
  }

  /**
   * 解析时间戳
   */
  private parseTimestamp(timestamp: number): any {
    const date = new Date(timestamp * 1000);
    return {
      unix: timestamp,
      iso: date.toISOString(),
      date,
    };
  }
}

// ============================================================
// 内部类型定义
// ============================================================

interface FileModification {
  filePath: string;
  modifiedAt: number;
  linesAdded: number;
  linesRemoved: number;
  commitHash: string;
  commitMessage: string;
  author: string;
  project: string;
  language: string;
}
