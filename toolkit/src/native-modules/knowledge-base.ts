/**
 * 自定义知识库注入工具 (Knowledge Base Manager)
 * ===============================================
 *
 * 功能：
 * 1. 向 CKG 注入自定义文档或代码片段
 * 2. 管理知识库条目（增删改查）
 * 3. 触发重新索引
 * 4. 导出/导入知识库
 * 5. 查询和搜索知识库内容
 *
 * 注意：此工具通过直接操作 SQLite 数据库实现，
 *       需要确保 CKG 服务已停止或数据库未被锁定。
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { CKGConfig } from './ckg-analysis.js';

// ==================== 类型定义 ====================

export interface KnowledgeEntry {
  id: string;
  content: string;
  metadata: EntryMetadata;
  sourceType: 'code' | 'document' | 'conversation' | 'custom';
  filePath?: string;
  hash?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface EntryMetadata {
  title?: string;
  author?: string;
  tags?: string[];
  language?: string;        // 编程语言（代码类型）
  project?: string;         // 项目名称
  version?: string;         // 版本号
  customFields?: Record<string, unknown>;
}

export interface SearchQuery {
  text: string;
  limit?: number;
  sourceType?: string;
  tags?: string[];
  minSimilarity?: number;   // 0-1, 相似度阈值
}

export interface SearchResult {
  entries: KnowledgeEntry[];
  scores: number[];
  totalFound: number;
  queryTime: number;         // 毫秒
}

export interface ImportResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  errors: Array<{ entry: string; error: string }>;
  timestamp: Date;
}

export interface ExportResult {
  success: boolean;
  exportPath: string;
  entryCount: number;
  fileSize: number;
  timestamp: Date;
}

interface KBManagerConfig {
  dbPath: string;
  storagePath: string;
  backupDir: string;
  logFile: string;
}

// ==================== 日志工具 ====================

class KBLogger {
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

// ==================== 主类：KnowledgeBaseManager ====================

export class KnowledgeBaseManager {
  private config: KBManagerConfig;
  private logger: KBLogger;

  constructor(config?: Partial<KBManagerConfig>) {
    const userDataDir = process.env.USERPROFILE || '';

    this.config = {
      dbPath: config?.dbPath ||
        path.join(userDataDir, '.icube', 'ai-chat', 'database.db'),
      storagePath: config?.storagePath ||
        path.join(userDataDir, '.icube', 'ckg_server'),
      backupDir: config?.backupDir ||
        path.join(process.cwd(), 'backups', 'knowledge-base'),
      logFile: config?.logFile ||
        path.join(process.cwd(), 'logs', 'knowledge-base.log')
    };

    this.logger = new KBLogger(this.config.logFile);
  }

  /**
   * 初始化知识库管理器
   */
  async initialize(): Promise<void> {
    this.logger.info('KnowledgeBaseManager 初始化开始');

    // 确保备份目录存在
    if (!fs.existsSync(this.config.backupDir)) {
      fs.mkdirSync(this.config.backupDir, { recursive: true });
    }

    // 检查数据库文件是否存在
    if (!fs.existsSync(this.config.dbPath)) {
      this.logger.warn(`数据库文件不存在: ${this.config.dbPath}`);
      this.logger.info('这可能是正常的（如果 CKG 服务尚未运行过）');
    } else {
      this.logger.info('找到数据库文件', { dbPath: this.config.dbPath });
    }

    this.logger.info('初始化完成');
  }

  /**
   * 检查数据库是否可访问
   */
  isDatabaseAccessible(): boolean {
    try {
      if (!fs.existsSync(this.config.dbPath)) {
        return false;
      }

      // 尝试读取数据库（只读模式）
      // 这里使用简单的文件锁检测
      const stats = fs.statSync(this.config.dbPath);
      return true;
    } catch (error) {
      this.logger.error('数据库访问检查失败', error as Error);
      return false;
    }
  }

  /**
   * 获取数据库状态信息
   */
  async getDatabaseStatus(): Promise<{
    exists: boolean;
    size: number;
    lastModified: Date | null;
    estimatedEntryCount?: number;
  }> {
    const status = {
      exists: fs.existsSync(this.config.dbPath),
      size: 0,
      lastModified: null as Date | null,
      estimatedEntryCount: undefined as number | undefined
    };

    if (status.exists) {
      const stats = fs.statSync(this.config.dbPath);
      status.size = stats.size;
      status.lastModified = stats.mtime;

      // 尝试估算条目数（需要 sqlite3 命令行工具）
      try {
        const result = this.executeSQLiteQuery(
          "SELECT COUNT(*) as count FROM documents"
        );
        status.estimatedEntryCount = result[0]?.count || 0;
      } catch {
        // 如果查询失败，忽略错误
      }
    }

    return status;
  }

  // ==================== CRUD 操作 ====================

  /**
   * 添加新的知识条目
   */
  async addEntry(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<KnowledgeEntry> {
    this.logger.info('添加新知识条目', {
      sourceType: entry.sourceType,
      contentLength: entry.content.length,
      title: entry.metadata?.title
    });

    const id = this.generateId();
    const hash = this.generateHash(entry.content);
    const now = new Date();

    const fullEntry: KnowledgeEntry = {
      ...entry,
      id,
      hash,
      createdAt: now,
      updatedAt: now
    };

    try {
      // 插入到数据库
      this.insertEntryToDB(fullEntry);

      this.logger.info('条目添加成功', { id });
      return fullEntry;

    } catch (error) {
      this.logger.error('添加条目失败', error as Error);
      throw new Error(`添加条目失败: ${(error as Error).message}`);
    }
  }

  /**
   * 批量添加条目
   */
  async addEntries(
    entries: Array<Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<ImportResult> {
    this.logger.info('批量添加知识条目', { count: entries.length });

    const result: ImportResult = {
      success: true,
      importedCount: 0,
      skippedCount: 0,
      errors: [],
      timestamp: new Date()
    };

    for (const entry of entries) {
      try {
        await this.addEntry(entry);
        result.importedCount++;
      } catch (error) {
        result.skippedCount++;
        result.errors.push({
          entry: entry.content.substring(0, 100),
          error: (error as Error).message
        });
      }
    }

    result.success = result.errors.length === 0;
    this.logger.info('批量添加完成', {
      imported: result.importedCount,
      skipped: result.skippedCount,
      errors: result.errors.length
    });

    return result;
  }

  /**
   * 根据 ID 获取条目
   */
  async getEntry(id: string): Promise<KnowledgeEntry | null> {
    try {
      const results = this.executeSQLiteQuery(
        'SELECT * FROM documents WHERE id = ?',
        [id]
      );

      if (results.length > 0) {
        return this.mapRowToEntry(results[0]);
      }
      return null;
    } catch (error) {
      this.logger.error('获取条目失败', error as Error);
      throw new Error(`获取条目失败: ${(error as Error).message}`);
    }
  }

  /**
   * 更新现有条目
   */
  async updateEntry(id: string, updates: Partial<Pick<KnowledgeEntry, 'content' | 'metadata' | 'sourceType' | 'filePath'>>): Promise<KnowledgeEntry> {
    this.logger.info('更新知识条目', { id });

    try {
      const existing = await this.getEntry(id);
      if (!existing) {
        throw new Error(`条目不存在: ${id}`);
      }

      const updated: KnowledgeEntry = {
        ...existing,
        ...updates,
        hash: updates.content ? this.generateHash(updates.content) : existing.hash,
        updatedAt: new Date()
      };

      this.updateEntryInDB(updated);

      this.logger.info('条目更新成功', { id });
      return updated;

    } catch (error) {
      this.logger.error('更新条目失败', error as Error);
      throw new Error(`更新条目失败: ${(error as Error).message}`);
    }
  }

  /**
   * 删除条目
   */
  async deleteEntry(id: string): Promise<boolean> {
    this.logger.info('删除知识条目', { id });

    try {
      // 先备份要删除的条目
      const entry = await this.getEntry(id);
      if (entry) {
        this.backupEntry(entry);
      }

      // 从数据库删除
      this.executeSQLiteQuery('DELETE FROM document_embeddings WHERE doc_id = ?', [id]);
      this.executeSQLiteQuery('DELETE FROM documents WHERE id = ?', [id]);

      this.logger.info('条目删除成功', { id });
      return true;
    } catch (error) {
      this.logger.error('删除条目失败', error as Error);
      throw new Error(`删除条目失败: ${(error as Error).message}`);
    }
  }

  /**
   * 搜索知识库
   */
  async search(query: SearchQuery): Promise<SearchResult> {
    const startTime = Date.now();

    this.logger.info('搜索知识库', {
      text: query.text.substring(0, 50),
      limit: query.limit || 10
    });

    try {
      let sql = 'SELECT * FROM documents WHERE 1=1';
      const params: unknown[] = [];

      // 文本搜索（简单实现）
      if (query.text) {
        sql += ' AND content LIKE ?';
        params.push(`%${query.text}%`);
      }

      // 来源类型过滤
      if (query.sourceType) {
        sql += ' AND source_type = ?';
        params.push(query.sourceType);
      }

      // 限制结果数量
      const limit = query.limit || 10;
      sql += ` LIMIT ${limit}`;

      const results = this.executeSQLiteQuery(sql, params);
      const entries = results.map(row => this.mapRowToEntry(row));

      const queryTime = Date.now() - startTime;

      const searchResult: SearchResult = {
        entries,
        scores: entries.map(() => 1), // 简单实现的相似度分数
        totalFound: entries.length,
        queryTime
      };

      this.logger.info('搜索完成', {
        found: searchResult.totalFound,
        time: `${searchResult.queryTime}ms`
      });

      return searchResult;

    } catch (error) {
      this.logger.error('搜索失败', error as Error);
      throw new Error(`搜索失败: ${(error as Error).message}`);
    }
  }

  /**
   * 列出所有条目（分页）
   */
  async listEntries(options?: {
    offset?: number;
    limit?: number;
    sourceType?: string;
  }): Promise<{ entries: KnowledgeEntry[]; total: number }> {
    try {
      let countSql = 'SELECT COUNT(*) as total FROM documents';
      let selectSql = 'SELECT * FROM documents';
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (options?.sourceType) {
        conditions.push('source_type = ?');
        params.push(options.sourceType);
      }

      if (conditions.length > 0) {
        const whereClause = ' WHERE ' + conditions.join(' AND ');
        countSql += whereClause;
        selectSql += whereClause;
      }

      // 获取总数
      const countResult = this.executeSQLiteQuery(countSql, params);
      const total = countResult[0]?.total || 0;

      // 分页
      const offset = options?.offset || 0;
      const limit = options?.limit || 20;
      selectSql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      const results = this.executeSQLiteQuery(selectSql, params);
      const entries = results.map(row => this.mapRowToEntry(row));

      return { entries, total };
    } catch (error) {
      this.logger.error('列出条目失败', error as Error);
      throw new Error(`列出条目失败: ${(error as Error).message}`);
    }
  }

  // ==================== 导入/导出 ====================

  /**
   * 从文件导入知识条目
   */
  async importFromFile(filePath: string, options?: {
    sourceType?: KnowledgeEntry['sourceType'];
    metadata?: Partial<EntryMetadata>;
  }): Promise<ImportResult> {
    this.logger.info('从文件导入知识库', { filePath });

    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`文件不存在: ${filePath}`);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();

      // 根据文件类型解析
      let entries: Array<Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>> = [];

      if (ext === '.json') {
        // JSON 格式：可以是单个对象或数组
        const data = JSON.parse(content);
        entries = Array.isArray(data) ? data : [data];
      } else if (ext === '.md' || ext === '.txt') {
        // Markdown 或纯文本：按标题分割
        entries = this.parseMarkdownContent(content, filePath, options);
      } else if ( ['.js', '.ts', '.py', '.java', '.go', '.rs', '.cpp'].includes(ext) ) {
        // 代码文件：按函数/类分割
        entries = this.parseCodeFile(content, filePath, options);
      } else {
        // 其他文件：作为单个文档导入
        entries = [{
          content,
          metadata: {
            title: path.basename(filePath),
            ...options?.metadata
          },
          sourceType: options?.sourceType || 'document',
          filePath
        }];
      }

      return this.addEntries(entries);

    } catch (error) {
      this.logger.error('导入文件失败', error as Error);
      throw new Error(`导入文件失败: ${(error as Error).message}`);
    }
  }

  /**
   * 从目录递归导入
   */
  async importFromDirectory(
    dirPath: string,
    options?: {
      sourceType?: KnowledgeEntry['sourceType'];
      filePatterns?: string[];     // 文件匹配模式，如 ['*.md', '*.js']
      excludePatterns?: string[];  // 排除模式，如 ['node_modules', '*.test.js']
      metadata?: Partial<EntryMetadata>;
    }
  ): Promise<ImportResult> {
    this.logger.info('从目录导入知识库', { dirPath });

    const result: ImportResult = {
      success: true,
      importedCount: 0,
      skippedCount: 0,
      errors: [],
      timestamp: new Date()
    };

    try {
      if (!fs.existsSync(dirPath)) {
        throw new Error(`目录不存在: ${dirPath}`);
      }

      const files = this.scanDirectory(dirPath, options?.filePatterns, options?.excludePatterns);

      this.logger.info(`发现 ${files.length} 个文件`);

      for (const file of files) {
        try {
          const importResult = await this.importFromFile(file, options);
          result.importedCount += importResult.importedCount;
          result.skippedCount += importResult.skippedCount;
          result.errors.push(...importResult.errors);
        } catch (error) {
          result.skippedCount++;
          result.errors.push({ entry: file, error: (error as Error).message });
        }
      }

      result.success = result.errors.length === 0;
      this.logger.info('目录导入完成', result);

      return result;
    } catch (error) {
      this.logger.error('导入目录失败', error as Error);
      result.success = false;
      result.errors.push({ entry: dirPath, error: (error as Error).message });
      return result;
    }
  }

  /**
   * 导出知识库到 JSON 文件
   */
  async exportToJson(exportPath?: string, options?: {
    sourceType?: string;
    includeEmbeddings?: boolean;
  }): Promise<ExportResult> {
    const targetPath = exportPath ||
      path.join(this.config.backupDir, `kb-export-${Date.now()}.json`);

    this.logger.info('导出知识库', { exportPath: targetPath });

    try {
      const { entries, total } = await this.listEntries({
        sourceType: options?.sourceType,
        limit: Infinity  // 导出所有
      });

      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        totalCount: total,
        entries
      };

      fs.writeFileSync(targetPath, JSON.stringify(exportData, null, 2), 'utf-8');

      const stats = fs.statSync(targetPath);

      const result: ExportResult = {
        success: true,
        exportPath: targetPath,
        entryCount: total,
        fileSize: stats.size,
        timestamp: new Date()
      };

      this.logger.info('导出成功', result);
      return result;
    } catch (error) {
      this.logger.error('导出失败', error as Error);
      throw new Error(`导出失败: ${(error as Error).message}`);
    }
  }

  // ==================== 索引管理 ====================

  /**
   * 触发重新索引
   *
   * 注意：这通常需要重启 CKG 服务才能生效
   */
  async triggerReindex(options?: {
    force?: boolean;           // 强制完全重建索引
    sourceTypes?: string[];    // 只重新索引特定类型
  }): Promise<void> {
    this.logger.info('触发重新索引', options);

    try {
      // 方法1: 尝试发送信号给 CKG 进程（如果支持）
      // 方法2: 标记需要重新索引的记录
      // 方法3: 提示用户重启服务

      if (options?.force) {
        // 清除现有的嵌入向量
        this.executeSQLiteQuery('DELETE FROM document_embeddings');
        this.logger.info('已清除现有嵌入向量');
      }

      // 标记需要重新索引的条目
      let sql = 'UPDATE documents SET updated_at = ?';
      const params: unknown[] = [new Date().toISOString()];

      if (options?.sourceTypes && options.sourceTypes.length > 0) {
        sql += ' WHERE source_type IN (' + options.sourceTypes.map(() => '?').join(',') + ')';
        params.push(...options.sourceTypes);
      }

      this.executeSQLiteQuery(sql, params);

      this.logger.info('已标记需要重新索引的条目');
      this.logger.warn('请重启 TRAE SOLO CN 应用以使更改生效');

    } catch (error) {
      this.logger.error('触发重新索引失败', error as Error);
      throw new Error(`触发重新索引失败: ${(error as Error).message}`);
    }
  }

  /**
   * 备份整个知识库
   */
  async createBackup(backupName?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = backupName || `kb-backup-${timestamp}`;
    const backupPath = path.join(this.config.backupDir, `${name}.json`);

    this.logger.info('创建知识库备份', { backupName: name });

    try {
      const result = await this.exportToJson(backupPath, { includeEmbeddings: true });
      this.logger.info('备份创建成功', { path: result.exportPath, size: result.fileSize });
      return result.exportPath;
    } catch (error) {
      this.logger.error('创建备份失败', error as Error);
      throw error;
    }
  }

  /**
   * 清空知识库（危险操作！）
   */
  async clearAll(confirmMessage?: string): Promise<void> {
    const CONFIRMPhrase = 'YES_I_WANT_TO_DELETE_ALL_DATA';

    if (confirmMessage !== CONFIRMPhrase) {
      throw new Error(`为了防止误操作，请传入确认消息: "${CONFIRMPhrase}"`);
    }

    this.logger.warn('⚠️  正在清空整个知识库！！！');

    try {
      // 先创建完整备份
      await this.createBackup('pre-clear-backup');

      // 删除所有数据
      this.executeSQLiteQuery('DELETE FROM document_embeddings');
      this.executeSQLiteQuery('DELETE FROM embeddings');
      this.executeSQLiteQuery('DELETE FROM conversations');
      this.executeSQLiteQuery('DELETE FROM documents');

      this.logger.warn('知识库已清空');
    } catch (error) {
      this.logger.error('清空知识库失败', error as Error);
      throw error;
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `kb_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 生成内容哈希
   */
  private generateHash(content: string): string {
    // 简单的哈希实现（生产环境应使用 crypto 模块）
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * 执行 SQLite 查询
   */
  private executeSQLiteQuery(sql: string, params?: unknown[]): Record<string, unknown>[] {
    try {
      // 使用 sqlite3 命令行工具
      const paramStr = params ?
        params.map(p => `'${String(p).replace(/'/g, "''")}'`).join(' ') :
        '';

      const cmd = `sqlite3 "${this.config.dbPath}" "${sql.replace(/\?/g, '%s')}" ${paramStr}`.trim();
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 10000 });

      if (!output.trim()) {
        return [];
      }

      // 解析输出为对象数组
      const lines = output.trim().split('\n');
      if (lines.length <= 1) {
        return lines[0] ? [this.parseSQLiteLine(lines[0])] : [];
      }

      return lines.map(line => this.parseSQLiteLine(line));
    } catch (error) {
      // 如果 sqlite3 命令不可用，抛出更友好的错误
      if ((error as Error).message.includes('sqlite3')) {
        throw new Error('sqlite3 命令行工具未安装。请安装 SQLite3 或使用其他方式访问数据库。');
      }
      throw error;
    }
  }

  /**
   * 解析 SQLite 输出行
   */
  private parseSQLiteLine(line: string): Record<string, unknown> {
    // 简单实现：假设是 JSON 格式或管道分隔
    try {
      return JSON.parse(line);
    } catch {
      // 如果不是 JSON，返回原始值
      return { value: line };
    }
  }

  /**
   * 将数据库行映射为 KnowledgeEntry 对象
   */
  private mapRowToEntry(row: Record<string, unknown>): KnowledgeEntry {
    return {
      id: String(row.id || ''),
      content: String(row.content || ''),
      metadata: typeof row.metadata === 'string' ?
        JSON.parse(row.metadata) :
        (row.metadata as EntryMetadata) || {},
      sourceType: (row.sourceType as KnowledgeEntry['sourceType']) || 'custom',
      filePath: row.filePath as string | undefined,
      hash: row.hash as string | undefined,
      createdAt: row.createdAt ? new Date(String(row.createdAt)) : undefined,
      updatedAt: row.updatedAt ? new Date(String(row.updatedAt)) : undefined
    };
  }

  /**
   * 插入条目到数据库
   */
  private insertEntryToDB(entry: KnowledgeEntry): void {
    const sql = `
      INSERT INTO documents (id, content, metadata, source_type, file_path, hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.executeSQLiteQuery(sql, [
      entry.id,
      entry.content,
      JSON.stringify(entry.metadata),
      entry.sourceType,
      entry.filePath || null,
      entry.hash,
      entry.createdAt?.toISOString(),
      entry.updatedAt?.toISOString()
    ]);
  }

  /**
   * 更新数据库中的条目
   */
  private updateEntryInDB(entry: KnowledgeEntry): void {
    const sql = `
      UPDATE documents
      SET content = ?, metadata = ?, source_type = ?, file_path = ?, hash = ?, updated_at = ?
      WHERE id = ?
    `;

    this.executeSQLiteQuery(sql, [
      entry.content,
      JSON.stringify(entry.metadata),
      entry.sourceType,
      entry.filePath || null,
      entry.hash,
      entry.updatedAt?.toISOString(),
      entry.id
    ]);
  }

  /**
   * 备份单个条目
   */
  private backupEntry(entry: KnowledgeEntry): void {
    const backupDir = path.join(this.config.backupDir, 'deleted-entries');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupPath = path.join(backupDir, `${entry.id}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(entry, null, 2), 'utf-8');
  }

  /**
   * 解析 Markdown 内容为多个条目
   */
  private parseMarkdownContent(
    content: string,
    filePath: string,
    options?: { sourceType?: KnowledgeEntry['sourceType']; metadata?: Partial<EntryMetadata> }
  ): Array<Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>> {
    const entries: Array<Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>> = [];

    // 按 # 标题分割
    const sections = content.split(/^#{1,3}\s+/m).filter(s => s.trim());

    if (sections.length <= 1) {
      // 没有明确的章节，作为整体导入
      entries.push({
        content,
        metadata: {
          title: path.basename(filePath),
          ...options?.metadata
        },
        sourceType: options?.sourceType || 'document',
        filePath
      });
    } else {
      // 按章节拆分
      sections.forEach(section => {
        const firstNewline = section.indexOf('\n');
        const title = section.substring(0, firstNewline).trim();
        const body = section.substring(firstNewline + 1).trim();

        if (body) {
          entries.push({
            content: body,
            metadata: {
              title,
              ...options?.metadata
            },
            sourceType: options?.sourceType || 'document',
            filePath
          });
        }
      });
    }

    return entries;
  }

  /**
   * 解析代码文件为多个条目
   */
  private parseCodeFile(
    content: string,
    filePath: string,
    options?: { sourceType?: KnowledgeEntry['sourceType']; metadata?: Partial<EntryMetadata> }
  ): Array<Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>> {
    const entries: Array<Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>> = [];
    const ext = path.extname(filePath).toLowerCase();

    // 简单的代码分割逻辑：按顶级函数/类分割
    const patterns: Record<string, RegExp> = {
      '.js': /^(?:export\s+)?(?:async\s+)?function\s+\w+|^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/gm,
      '.ts': /^(?:export\s+)?(?:abstract\s+)?(?:async\s+)?function\s+\w+|^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)|^(?:export\s+)?class\s+\w+/gm,
      '.py': /^def\s+\w+|^class\s+\w+/gm,
      '.java': /^(?:public|private|protected)?\s*(?:static\s+)?(?:class|interface|enum)\s+\w+|(?:public|private|protected)?\s*(?:static\s+)?\w+\s+\w+\s*\([^)]*\)/gm,
      '.go': /^func\s+\w+/gm,
      '.rs': /^fn\s+\w+|^(?:pub\s+)?(?:struct|enum|trait|impl)\s+\w+/gm
    };

    const pattern = patterns[ext];
    if (pattern) {
      const matches = [...content.matchAll(pattern)];

      if (matches.length > 1) {
        // 有多个函数/类，按位置分割
        matches.forEach((match, index) => {
          const start = match.index!;
          const end = matches[index + 1]?.index ?? content.length;
          const codeSnippet = content.substring(start, end).trim();

          entries.push({
            content: codeSnippet,
            metadata: {
              title: match[0].split(/[ (\n]/)[0],
              language: ext.substring(1),  // 去掉点号
              ...options?.metadata
            },
            sourceType: options?.sourceType || 'code',
            filePath
          });
        });
      }
    }

    // 如果没有成功分割，作为整体导入
    if (entries.length === 0) {
      entries.push({
        content,
        metadata: {
          title: path.basename(filePath),
          language: ext.substring(1),
          ...options?.metadata
        },
        sourceType: options?.sourceType || 'code',
        filePath
      });
    }

    return entries;
  }

  /**
   * 扫描目录获取文件列表
   */
  private scanDirectory(
    dirPath: string,
    includePatterns?: string[],
    excludePatterns?: string[]
  ): string[] {
    const files: string[] = [];

    const scan = (currentPath: string) => {
      const items = fs.readdirSync(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          // 检查排除目录
          const shouldExclude = excludePatterns?.some(pattern =>
            this.matchPattern(item, pattern)
          );
          if (!shouldExclude) {
            scan(itemPath);
          }
        } else if (stat.isFile()) {
          // 检查包含模式
          const shouldInclude = !includePatterns ||
            includePatterns.some(pattern =>
              this.matchPattern(item, pattern)
            );
          if (shouldInclude) {
            files.push(itemPath);
          }
        }
      }
    };

    scan(dirPath);
    return files;
  }

  /**
   * 简单的模式匹配（支持通配符）
   */
  private matchPattern(filename: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(filename);
  }
}

// ==================== 导出便捷函数 ====================

/**
 * 快速注入文档到知识库
 */
export async function quickInject(
  content: string,
  options?: {
    title?: string;
    sourceType?: KnowledgeEntry['sourceType'];
    tags?: string[];
  }
): Promise<KnowledgeEntry> {
  const kb = new KnowledgeBaseManager();
  await kb.initialize();

  return kb.addEntry({
    content,
    metadata: {
      title: options?.title,
      tags: options?.tags
    },
    sourceType: options?.sourceType || 'document'
  });
}

/**
 * 快速导入项目代码到知识库
 */
export async function importProject(
  projectPath: string,
  options?: {
    filePatterns?: string[];
    excludePatterns?: string[];
  }
): Promise<ImportResult> {
  const kb = new KnowledgeBaseManager();
  await kb.initialize();

  return kb.importFromDirectory(projectPath, {
    sourceType: 'code',
    filePatterns: options?.filePatterns || ['*.ts', '*.js', '*.py', '*.java', '*.go', '*.rs'],
    excludePatterns: options?.excludePatterns || [
      'node_modules',
      'dist',
      'build',
      '.git',
      '*.test.js',
      '*.spec.js'
    ]
  });
}
