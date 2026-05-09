/**
 * CKG (Context Knowledge Graph) 模块架构分析报告
 * =================================================
 *
 * ## 1. 模块基本信息
 * - **模块名称**: ckg
 * - **版本**: 1.0.0
 * - **入口文件**: start.bat (Windows)
 * - **通信端口**: 50000 (本地 Socket)
 * - **主程序**: ckg_server_windows_x64.exe
 *
 * ## 2. 数据存储配置
 *
 * ### 2.1 主数据库
 * - **位置**: `%USERPROFILE%\.icube\ai-chat\database.db`
 * - **格式**: SQLite (带向量扩展 sqlite_vec)
 * - **用途**: 存储对话历史、上下文信息、文档索引
 *
 * ### 2.2 服务器数据目录
 * - **位置**: `%USERPROFILE%\.icube\ckg_server`
 * - **内容**: 向量索引、缓存数据、模型文件
 *
 * ### 2.3 文件快照目录
 * - **位置**: `%USERPROFILE%\.icube\ai-chat\snapshot`
 * - **用途**: 文件系统的快照存储
 *
 * ## 3. 嵌入引擎分析
 *
 * ### 3.1 嵌入类型
 * - **类型**: `sqlite_vec` (本地 SQLite 向量扩展)
 * - **模式**: `-local_embedding` (本地嵌入计算)
 * - **优点**:
 *   - 无需网络请求，隐私性好
 *   - 低延迟，适合实时搜索
 *   - 轻量级，资源占用小
 *
 * ### 3.2 启动参数详解
 * ```
 * ckg_server_windows_x64.exe \
 *   -port=50000 \                          # 监听端口
 *   -ide_version=%ICUBE_BUILD_VERSION% \   # IDE 版本号
 *   -version_code=2 \                      # 版本代码
 *   -storage_path="...\ckg_server" \       # 数据存储路径
 *   -local_embedding \                     # 使用本地嵌入
 *   -embedding_storage_type=sqlite_vec \   # 向量存储类型
 *   -app_id=%CKG_APP_ID% \                 # 应用 ID
 *   -limit_cpu=1 \                         # CPU 限制
 *   -source_product=native_ide \           # 来源产品标识
 * ```
 *
 * ## 4. 数据库结构推测
 *
 * 基于 SQLite + sqlite_vec 的使用模式，数据库可能包含以下表：
 *
 * ### 4.1 核心表结构
 * ```sql
 * -- 文档/代码片段表
 * CREATE TABLE documents (
 *     id TEXT PRIMARY KEY,
 *     content TEXT NOT NULL,
 *     metadata JSON,
 *     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *     source_type TEXT,  -- 'code', 'document', 'conversation'
 *     file_path TEXT,
 *     hash TEXT         -- 内容哈希，用于去重
 * );
 *
 * -- 向量表 (使用 sqlite_vec 虚拟表)
 * CREATE VIRTUAL TABLE embeddings USING vec0(
 *     embedding float[1536]  -- 嵌入向量维度（取决于模型）
 * );
 *
 * -- 文档-向量关联表
 * CREATE TABLE document_embeddings (
 *     doc_id TEXT REFERENCES documents(id),
 *     embedding_id INTEGER REFERENCES embeddings(rowid),
 *     chunk_index INTEGER,  -- 文档分块索引
 *     PRIMARY KEY (doc_id, embedding_id)
 * );
 *
 * -- 对话历史表
 * CREATE TABLE conversations (
 *     id TEXT PRIMARY KEY,
 *     session_id TEXT,
 *     role TEXT,  -- 'user', 'assistant', 'system'
 *     content TEXT,
 *     timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *     metadata JSON
 * );
 *
 * -- 索引表
 * CREATE INDEX idx_documents_source ON documents(source_type);
 * CREATE INDEX idx_documents_hash ON documents(hash);
 * CREATE INDEX idx_conversations_session ON conversations(session_id);
 * ```
 *
 * ## 5. 与 AI Agent 的交互协议
 *
 * ### 5.1 通信方式
 * - **端口**: 50000 (Socket)
 * - **协议**: 可能是 gRPC 或自定义二进制协议
 * - **方向**: 双向通信
 *
 * ### 5.2 主要功能接口
 * 1. **文档注入**: AI Agent → CKG (添加新的代码/文档到知识库)
 * 2. **语义搜索**: AI Agent ← CKG (查询相关上下文)
 * 3. **上下文检索**: AI Agent ← CKG (获取对话相关背景)
 * 4. **索引管理**: AI Agent ↔ CKG (触发重新索引、状态查询)
 *
 * ### 5.3 数据流向
 * ```
 * 用户输入 → AI Agent → [查询 CKG 获取上下文] → 构建提示词 → LLM API
 *                                              ↑
 * 代码文件 → [解析并分块] → [生成嵌入向量] → [存储到 CKG]
 * ```
 *
 * ## 6. 关键发现与定制建议
 *
 * ### 6.1 可定制的功能
 * 1. ✅ **直接操作数据库**: 可以读写 SQLite 数据库
 * 2. ✅ **注入自定义文档**: 通过数据库插入或 API 接口
 * 3. ✅ **管理知识库条目**: CRUD 操作
 * 4. ✅ **触发重新索引**: 通过重启服务或发送命令
 *
 * ### 6.2 技术限制
 * 1. ⚠️ **嵌入模型未知**: 本地嵌入使用的具体模型不明确
 * 2. ⚠️ **向量维度固定**: 需要匹配原有维度（可能是 1536 或其他）
 * 3. ⚠️ **API 协议未公开**: 与 AI Agent 的通信协议需要逆向或猜测
 * 4. ⚠️ **并发控制**: 直接操作数据库可能导致数据不一致
 *
 * ### 6.3 推荐实现方案
 *
 * #### 方案 A: 直接数据库操作 (推荐用于批量导入)
 * - **优点**: 完全控制，支持批量操作
 * - **缺点**: 需要了解确切的表结构，可能有兼容性风险
 * - **适用场景**: 初始化知识库、批量导入文档
 *
 * #### 方案 B: HTTP API 封装 (如果 CKG 提供 HTTP 接口)
 * - **优点**: 安全、标准化
 * - **缺点**: 当前版本可能不支持 HTTP 接口
 * - **适用场景**: 运行时动态更新
 *
 * #### 方案 C: 通过 AI Agent 中转
 * - **优点**: 利用现有协议
 * - **缺点**: 依赖 AI Agent，延迟较高
 * - **适用场景**: 实时性要求不高的场景
 */

export interface CKGConfig {
  moduleName: string;
  version: string;
  port: number;
  dbPath: string;
  storagePath: string;
  snapshotDir: string;
  embeddingType: string;
  storageType: string;
  appId: string;
  executable: string;
  environmentVariables: Record<string, string>;
}

export const CKGAnalysisResult: CKGConfig = {
  moduleName: 'ckg',
  version: '1.0.0',
  port: 50000,
  dbPath: '%USERPROFILE%\\.icube\\ai-chat\\database.db',
  storagePath: '%USERPROFILE%\\.icube\\ckg_server',
  snapshotDir: '%USERPROFILE%\\.icube\\ai-chat\\snapshot',
  embeddingType: 'local_embedding',
  storageType: 'sqlite_vec',
  appId: '6eefa01c-1036-4c7e-9ca5-d891f63bfcd8',
  executable: 'ckg_server_windows_x64.exe',
  environmentVariables: {
    MARSCODE_DEV_MODE: '开发模式标志',
    MARSCODE_DEV_CKG_MANUAL: '手动启动标志',
    AI_NATIVE_ENV: '运行环境',
    RUST_LOG: '日志级别',
    CLOUDIDE_TENANT_NAME: '租户名称',
    ICUBE_MODULAR_DATA_DIR: '数据目录',
    DB_PATH: '数据库路径',
    FILE_BASE_DIR: '快照目录',
    ICUBE_PRODUCT_PROVIDER: '产品提供商',
    DEV_MODE: '开发模式',
    platform: '平台标识',
    PORT0: '监听端口',
    ICUBE_BUILD_VERSION: 'IDE 版本号',
    CKG_APP_ID: '应用 ID',
    CKG_SOURCE_PRODUCT: '来源产品',
    PLUGIN_IDE_TYPE: 'IDE 类型'
  }
};
