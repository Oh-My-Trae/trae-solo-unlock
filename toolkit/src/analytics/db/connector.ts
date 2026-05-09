/**
 * Database Connector - 数据库连接管理
 * 负责连接和查询各种数据源
 * 使用 sql.js (纯 JavaScript SQLite 实现)
 */

import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabaseType } from 'sql.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type {
  DatabaseConfig,
  WorkspaceStorage,
  CKGSchema,
} from '../types.js';

// SQL.js 数据库包装器接口
interface SqlJsDbWrapper {
  db: any; // sql.js Database 实例
  path: string;
}

export class DatabaseConnector {
  private connections: Map<string, SqlJsDbWrapper> = new Map();
  private appDataPath: string;
  private workspaceStoragePath: string;
  private initialized: boolean = false;

  constructor() {
    this.appDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'TRAE SOLO CN');
    this.workspaceStoragePath = path.join(this.appDataPath, 'User', 'workspaceStorage');
  }

  // ============================================================
  // 初始化
  // ============================================================

  /**
   * 初始化 sql.js 引擎（必须在所有操作前调用）
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await initSqlJs();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize sql.js:', error);
      throw error;
    }
  }

  /**
   * 确保已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DatabaseConnector not initialized. Call initialize() first.');
    }
  }

  // ============================================================
  // 连接管理
  // ============================================================

  /**
   * 获取或创建数据库连接
   */
  async getConnection(dbPath: string): Promise<any | null> {
    this.ensureInitialized();

    try {
      if (this.connections.has(dbPath)) {
        return this.connections.get(dbPath)!.db;
      }

      if (!fs.existsSync(dbPath)) {
        console.warn(`Database file not found: ${dbPath}`);
        return null;
      }

      // 读取数据库文件到内存
      const fileBuffer = fs.readFileSync(dbPath);
      const SQL = await initSqlJs();
      const db = new SQL.Database(fileBuffer);

      this.connections.set(dbPath, { db, path: dbPath });
      return db;
    } catch (error) {
      console.error(`Failed to connect to database: ${dbPath}`, error);
      return null;
    }
  }

  /**
   * 同步获取连接（仅用于已打开的连接）
   */
  getExistingConnection(dbPath: string): any | null {
    const wrapper = this.connections.get(dbPath);
    return wrapper?.db || null;
  }

  /**
   * 关闭所有连接
   */
  closeAll(): void {
    for (const [dbPath, wrapper] of this.connections) {
      try {
        wrapper.db.close();
      } catch (error) {
        console.error(`Error closing connection to ${dbPath}:`, error);
      }
    }
    this.connections.clear();
  }

  // ============================================================
  // Workspace Storage 查询
  // ============================================================

  /**
   * 获取所有 workspace storage
   */
  getWorkspaceStorages(): WorkspaceStorage[] {
    const storages: WorkspaceStorage[] = [];

    if (!fs.existsSync(this.workspaceStoragePath)) {
      return storages;
    }

    const dirs = fs.readdirSync(this.workspaceStoragePath, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const dir of dirs) {
      const storagePath = path.join(this.workspaceStoragePath, dir.name);
      const dbPath = path.join(storagePath, 'state.vscdb');

      if (fs.existsSync(dbPath)) {
        storages.push({
          id: dir.name,
          path: storagePath,
          databasePath: dbPath,
          workspace: { folders: [], settings: {} }, // 延迟加载
        });
      }
    }

    return storages;
  }

  /**
   * 获取工作区信息（异步）
   */
  async getWorkspaceInfoAsync(dbPath: string): Promise<any> {
    const db = await this.getConnection(dbPath);
    if (!db) return { folders: [], settings: {} };

    try {
      const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = 'workspace.json'");
      if (stmt.step()) {
        const row = stmt.getAsObject() as { value: any };
        if (row.value) {
          const value = Array.isArray(row.value)
            ? String.fromCharCode(...new Uint8Array(row.value))
            : row.value;
          return JSON.parse(value);
        }
      }
      stmt.free();
    } catch (error) {
      console.error('Error reading workspace info:', error);
    }

    return { folders: [], settings: {} };
  }

  /**
   * 从 workspace storage 获取值（异步）
   */
  async getStorageValueAsync(dbPath: string, key: string): Promise<any> {
    const db = await this.getConnection(dbPath);
    if (!db) return null;

    try {
      const stmt = db.prepare('SELECT value FROM ItemTable WHERE key = ?');
      stmt.bind([key]);

      if (stmt.step()) {
        const row = stmt.getAsObject() as { value: any };
        if (row.value) {
          const value = Array.isArray(row.value)
            ? String.fromCharCode(...new Uint8Array(row.value))
            : row.value;
          stmt.free();
          return JSON.parse(value);
        }
      }
      stmt.free();
    } catch (error) {
      console.error(`Error reading key ${key}:`, error);
    }

    return null;
  }

  /**
   * 获取所有存储的键（异步）
   */
  async getStorageKeysAsync(dbPath: string): Promise<string[]> {
    const db = await this.getConnection(dbPath);
    if (!db) return [];

    try {
      const stmt = db.prepare('SELECT key FROM ItemTable');
      const keys: string[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject() as { key: string };
        keys.push(row.key);
      }
      stmt.free();

      return keys;
    } catch (error) {
      console.error('Error reading keys:', error);
      return [];
    }
  }

  // 同步版本（向后兼容，需要先调用 initialize 并预热连接）
  getStorageValue(dbPath: string, key: string): any {
    const db = this.getExistingConnection(dbPath);
    if (!db) return null;

    try {
      const stmt = db.prepare('SELECT value FROM ItemTable WHERE key = ?');
      stmt.bind([key]);

      if (stmt.step()) {
        const row = stmt.getAsObject() as { value: any };
        if (row.value) {
          const value = Array.isArray(row.value)
            ? String.fromCharCode(...new Uint8Array(row.value))
            : row.value;
          stmt.free();
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
      }
      stmt.free();
    } catch (error) {
      console.error(`Error reading key ${key}:`, error);
    }

    return null;
  }

  getStorageKeys(dbPath: string): string[] {
    const db = this.getExistingConnection(dbPath);
    if (!db) return [];

    try {
      const stmt = db.prepare('SELECT key FROM ItemTable');
      const keys: string[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject() as { key: string };
        keys.push(row.key);
      }
      stmt.free();

      return keys;
    } catch (error) {
      console.error('Error reading keys:', error);
      return [];
    }
  }

  // ============================================================
  // 聊天数据查询
  // ============================================================

  /**
   * 聊天会话索引
   */
  async getChatSessionIndexAsync(dbPath: string): Promise<any> {
    return this.getStorageValueAsync(dbPath, 'chat.ChatSessionStore.index');
  }

  getChatSessionIndex(dbPath: string): any {
    return this.getStorageValue(dbPath, 'chat.ChatSessionStore.index');
  }

  /**
   * 自定义模式配置
   */
  async getCustomModesAsync(dbPath: string): Promise<any[]> {
    const data = await this.getStorageValueAsync(dbPath, 'chat.customModes');
    return Array.isArray(data) ? data : [];
  }

  getCustomModes(dbPath: string): any[] {
    const data = this.getStorageValue(dbPath, 'chat.customModes');
    return Array.isArray(data) ? data : [];
  }

  /**
   * 历史条目
   */
  async getHistoryEntriesAsync(dbPath: string): Promise<any[]> {
    const data = await this.getStorageValueAsync(dbPath, 'history.entries');
    return Array.isArray(data) ? data : [];
  }

  // ============================================================
  // AI Agent 数据库 (加密/自定义格式)
  // ============================================================

  checkAIAgentDatabase(): DatabaseConfig {
    const dbPath = path.join(
      this.appDataPath,
      'ModularData',
      'ai-agent',
      'database.db'
    );

    return {
      path: dbPath,
      type: 'encrypted',
      description: 'AI Agent 主数据库（可能使用自定义格式或加密）',
    };
  }

  getAIAgentDatabaseInfo(): { exists: boolean; size: number; headerHex: string } {
    const dbPath = path.join(
      this.appDataPath,
      'ModularData',
      'ai-agent',
      'database.db'
    );

    if (!fs.existsSync(dbPath)) {
      return { exists: false, size: 0, headerHex: '' };
    }

    const stats = fs.statSync(dbPath);
    const fd = fs.openSync(dbPath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    return {
      exists: true,
      size: stats.size,
      headerHex: buffer.toString('hex'),
    };
  }

  // ============================================================
  // CKG Server 数据库
  // ============================================================

  checkCKGDatabase(): DatabaseConfig {
    const dbPath = path.join(
      this.appDataPath,
      'ModularData',
      'ckg_server',
      'env_codekg.db'
    );

    return {
      path: dbPath,
      type: 'encrypted',
      description: 'CKG Code Knowledge Graph 数据库',
    };
  }

  getCKGEnvConfig(): any {
    const configPath = path.join(
      this.appDataPath,
      'ModularData',
      'ckg_server',
      'local_env.json'
    );

    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        console.error('Error reading CKG config:', error);
      }
    }

    return null;
  }

  // ============================================================
  // Schema 分析
  // ============================================================

  /**
   * 分析 SQLite 数据库 schema
   */
  async analyzeSchemaAsync(dbPath: string): Promise<CKGSchema | null> {
    const db = await this.getConnection(dbPath);
    if (!db) return null;

    try {
      const schema: CKGSchema = {
        tables: [],
        relationships: [],
        indexes: [],
      };

      // 获取所有表
      const tableStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      const tables: string[] = [];

      while (tableStmt.step()) {
        tables.push((tableStmt.getAsObject() as { name: string }).name);
      }
      tableStmt.free();

      for (const tableName of tables) {
        // 获取列信息
        const colStmt = db.prepare(`PRAGMA table_info(${tableName})`);
        const columns: any[] = [];

        while (colStmt.step()) {
          const col = colStmt.getAsObject() as any;
          columns.push({
            name: col.name,
            type: col.type,
            nullable: !col.notnull,
            primaryKey: col.pk > 0,
            defaultValue: col.dflt_value,
            description: '',
          });
        }
        colStmt.free();

        // 获取索引信息
        const idxStmt = db.prepare(`PRAGMA index_list(${tableName})`);
        const indexes: any[] = [];

        while (idxStmt.step()) {
          const idx = idxStmt.getAsObject() as any;

          const idxInfoStmt = db.prepare(`PRAGMA index_info(${idx.name})`);
          const idxColumns: string[] = [];

          while (idxInfoStmt.step()) {
            idxColumns.push((idxInfoStmt.getAsObject() as any).name);
          }
          idxInfoStmt.free();

          indexes.push({
            name: idx.name,
            tableName,
            columns: idxColumns,
            unique: !!idx.unique,
          });
        }
        idxStmt.free();

        // 尝试获取行数
        let rowCount = 0;
        try {
          const countStmt = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
          if (countStmt.step()) {
            rowCount = (countStmt.getAsObject() as any).count;
          }
          countStmt.free();
        } catch {
          // 忽略错误
        }

        schema.tables.push({
          name: tableName,
          columns,
          rowCount,
          description: '',
        });

        schema.indexes.push(...indexes);
      }

      return schema;
    } catch (error) {
      console.error('Error analyzing schema:', error);
      return null;
    }
  }

  analyzeSchema(dbPath: string): CKGSchema | null {
    const db = this.getExistingConnection(dbPath);
    if (!db) return null;

    try {
      const schema: CKGSchema = {
        tables: [],
        relationships: [],
        indexes: [],
      };

      const tableStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      const tables: string[] = [];

      while (tableStmt.step()) {
        tables.push((tableStmt.getAsObject() as { name: string }).name);
      }
      tableStmt.free();

      for (const tableName of tables) {
        const colStmt = db.prepare(`PRAGMA table_info(${tableName})`);
        const columns: any[] = [];

        while (colStmt.step()) {
          const col = colStmt.getAsObject() as any;
          columns.push({
            name: col.name,
            type: col.type,
            nullable: !col.notnull,
            primaryKey: col.pk > 0,
            defaultValue: col.dflt_value,
            description: '',
          });
        }
        colStmt.free();

        let rowCount = 0;
        try {
          const countStmt = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
          if (countStmt.step()) {
            rowCount = (countStmt.getAsObject() as any).count;
          }
          countStmt.free();
        } catch {}

        schema.tables.push({ name: tableName, columns, rowCount, description: '' });
      }

      return schema;
    } catch (error) {
      console.error('Error analyzing schema:', error);
      return null;
    }
  }

  /**
   * 获取表的行数
   */
  getTableRowCount(dbPath: string, tableName: string): number {
    const db = this.getExistingConnection(dbPath);
    if (!db) return 0;

    try {
      const stmt = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
      let count = 0;
      if (stmt.step()) {
        count = (stmt.getAsObject() as any).count;
      }
      stmt.free();
      return count;
    } catch (error) {
      console.error(`Error getting row count for ${tableName}:`, error);
      return 0;
    }
  }

  /**
   * 采样表数据
   */
  sampleTableData(dbPath: string, tableName: string, limit: number = 5): any[] {
    const db = this.getExistingConnection(dbPath);
    if (!db) return [];

    try {
      const stmt = db.prepare(`SELECT * FROM ${tableName} LIMIT ${limit}`);
      const rows: any[] = [];

      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();

      return rows;
    } catch (error) {
      console.error(`Error sampling ${tableName}:`, error);
      return [];
    }
  }

  // ============================================================
  // 工具方法
  // ============================================================

  getAppDataPath(): string {
    return this.appDataPath;
  }

  pathExists(p: string): boolean {
    return fs.existsSync(p);
  }

  getFileSize(p: string): number {
    if (fs.existsSync(p)) {
      return fs.statSync(p).size;
    }
    return 0;
  }
}
