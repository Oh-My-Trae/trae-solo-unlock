"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const https = __importStar(require("node:https"));

// ============================================================
// Tool Definitions
// ============================================================
const TOOLS_DEF = [
  {
    name: 'list_projects',
    description: 'List all Supabase projects associated with the configured account. Returns project IDs, names, regions, and status.',
    inputSchema: {
      type: 'object',
      properties: {
        includePaused: { type: 'boolean', description: 'Whether to include paused projects. Default: true.' },
      },
    },
  },
  {
    name: 'get_project',
    description: 'Get detailed information about a specific Supabase project including database connection strings, API URLs, and settings.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Supabase project ID (ref). Can be obtained from list_projects.' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'execute_query',
    description: 'Execute a SQL query on the Supabase database. Supports SELECT, INSERT, UPDATE, DELETE, and DDL statements. Returns results as JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL query to execute.' },
        projectId: { type: 'string', description: 'Project ID. If omitted, uses the default project from configuration.' },
        readOnly: { type: 'boolean', description: 'If true, only SELECT queries are allowed. Default: false.' },
      },
      required: ['sql'],
    },
  },
  {
    name: 'list_tables',
    description: 'List all tables in the Supabase database with row counts, column information, and relationships.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID. If omitted, uses the default project.' },
        schema: { type: 'string', description: 'Database schema. Default: "public".' },
        includeColumns: { type: 'boolean', description: 'Whether to include column details. Default: true.' },
      },
    },
  },
  {
    name: 'describe_table',
    description: 'Get detailed schema information for a specific table: columns, types, constraints, indexes, and foreign keys.',
    inputSchema: {
      type: 'object',
      properties: {
        tableName: { type: 'string', description: 'Name of the table to describe.' },
        schema: { type: 'string', description: 'Schema name. Default: "public".' },
        projectId: { type: 'string', description: 'Project ID. If omitted, uses the default project.' },
      },
      required: ['tableName'],
    },
  },
  {
    name: 'manage_auth',
    description: 'Manage Supabase Auth: list users, get user details, create users, or delete users.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list_users', 'get_user', 'create_user', 'delete_user', 'list_roles'], description: 'Auth management action.' },
        userId: { type: 'string', description: 'User ID for get_user or delete_user.' },
        email: { type: 'string', description: 'Email for create_user.' },
        password: { type: 'string', description: 'Password for create_user.' },
        role: { type: 'string', description: 'Role for create_user. Default: "authenticated".' },
        page: { type: 'number', description: 'Page number for list_users. Default: 1.' },
        perPage: { type: 'number', description: 'Items per page for list_users. Default: 50.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'apply_migration',
    description: 'Apply a SQL migration to the Supabase database. Creates a named migration and applies it.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Migration name.' },
        sql: { type: 'string', description: 'SQL migration content.' },
        projectId: { type: 'string', description: 'Project ID.' },
      },
      required: ['name', 'sql'],
    },
  },
  {
    name: 'list_storage_buckets',
    description: 'List all storage buckets in the Supabase project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID.' },
      },
    },
  },
];

// ============================================================
// Supabase API Client
// ============================================================
class SupabaseClient {
  constructor() { this.config = this.loadConfig(); }
  loadConfig() {
    const conf = vscode.workspace.getConfiguration('supabase');
    return {
      accessToken: conf.get('accessToken', ''),
      projectUrl: conf.get('projectUrl', ''),
      serviceRoleKey: conf.get('serviceRoleKey', ''),
      anonKey: conf.get('anonKey', ''),
      defaultLimit: conf.get('defaultLimit', 100),
    };
  }
  reloadConfig() { this.config = this.loadConfig(); }
  isConfigured() { return !!(this.config.accessToken || (this.config.projectUrl && this.config.serviceRoleKey)); }
  getDefaultProjectId() {
    if (!this.config.projectUrl) return null;
    const match = this.config.projectUrl.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/);
    return match ? match[1] : null;
  }
  async managementGet(path) {
    return this.request('GET', `https://api.supabase.com${path}`, { Authorization: `Bearer ${this.config.accessToken}` });
  }
  async managementPost(path, body) {
    return this.request('POST', `https://api.supabase.com${path}`, { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' }, body);
  }
  async managementDelete(path) {
    return this.request('DELETE', `https://api.supabase.com${path}`, { Authorization: `Bearer ${this.config.accessToken}` });
  }
  async queryDatabase(sql, projectId) {
    const ref = projectId || this.getDefaultProjectId();
    if (!ref) throw new Error('No project ID configured.');
    return this.managementPost(`/v1/projects/${ref}/database/query`, { query: sql });
  }
  async authGet(path, projectId) {
    const ref = projectId || this.getDefaultProjectId();
    if (!ref) throw new Error('No project ID configured.');
    return this.request('GET', `https://${ref}.supabase.co/auth/v1${path}`, { apikey: this.config.serviceRoleKey, Authorization: `Bearer ${this.config.serviceRoleKey}` });
  }
  async authPost(path, body, projectId) {
    const ref = projectId || this.getDefaultProjectId();
    if (!ref) throw new Error('No project ID configured.');
    return this.request('POST', `https://${ref}.supabase.co/auth/v1${path}`, { apikey: this.config.serviceRoleKey, Authorization: `Bearer ${this.config.serviceRoleKey}`, 'Content-Type': 'application/json' }, body);
  }
  async authDelete(path, projectId) {
    const ref = projectId || this.getDefaultProjectId();
    if (!ref) throw new Error('No project ID configured.');
    return this.request('DELETE', `https://${ref}.supabase.co/auth/v1${path}`, { apikey: this.config.serviceRoleKey, Authorization: `Bearer ${this.config.serviceRoleKey}` });
  }
  async storageGet(path, projectId) {
    const ref = projectId || this.getDefaultProjectId();
    if (!ref) throw new Error('No project ID configured.');
    return this.request('GET', `https://${ref}.supabase.co/storage/v1${path}`, { apikey: this.config.serviceRoleKey, Authorization: `Bearer ${this.config.serviceRoleKey}` });
  }
  request(method, url, headers, body) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = { hostname: urlObj.hostname, port: urlObj.port || 443, path: urlObj.pathname + urlObj.search, method, headers, timeout: 30000 };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) reject(new Error(`API error ${res.statusCode}: ${JSON.stringify(parsed)}`));
            else resolve(parsed);
          } catch {
            if (res.statusCode >= 400) reject(new Error(`API error ${res.statusCode}: ${data}`));
            else resolve(data);
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

// ============================================================
// Supabase Connector
// ============================================================
class SupabaseConnector {
  constructor() { this.client = new SupabaseClient(); }
  async callTool(name, args) {
    this.client.reloadConfig();
    if (!this.client.isConfigured()) {
      return { error: true, message: 'Supabase not configured. Set supabase.accessToken or supabase.projectUrl + supabase.serviceRoleKey in settings.' };
    }
    try {
      switch (name) {
        case 'list_projects': return await this.listProjects(args);
        case 'get_project': return await this.getProject(args);
        case 'execute_query': return await this.executeQuery(args);
        case 'list_tables': return await this.listTables(args);
        case 'describe_table': return await this.describeTable(args);
        case 'manage_auth': return await this.manageAuth(args);
        case 'apply_migration': return await this.applyMigration(args);
        case 'list_storage_buckets': return await this.listStorageBuckets(args);
        default: throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      return { error: true, message: err.message || 'Unknown error', toolName: name };
    }
  }
  async listProjects(args) {
    const { includePaused = true } = args;
    const projects = await this.client.managementGet('/v1/projects');
    const filtered = includePaused ? projects : projects.filter(p => p.status !== 'inactive');
    return { total: filtered.length, projects: filtered.map(p => ({ id: p.id, ref: p.ref, name: p.name, status: p.status, region: p.region, createdAt: p.created_at })) };
  }
  async getProject(args) {
    const project = await this.client.managementGet(`/v1/projects/${args.projectId}`);
    return { id: project.id, ref: project.ref, name: project.name, status: project.status, region: project.region, endpoint: project.endpoint };
  }
  async executeQuery(args) {
    const { sql, projectId, readOnly = false } = args;
    if (readOnly) {
      const n = sql.trim().toUpperCase();
      if (!n.startsWith('SELECT') && !n.startsWith('WITH') && !n.startsWith('EXPLAIN')) {
        return { error: true, message: 'Only SELECT/WITH/EXPLAIN queries allowed in read-only mode.' };
      }
    }
    const result = await this.client.queryDatabase(sql, projectId);
    return { sql, rows: Array.isArray(result) ? result : result.rows || result, rowCount: Array.isArray(result) ? result.length : result.rows?.length || 0 };
  }
  async listTables(args) {
    const { projectId, schema = 'public', includeColumns = true } = args;
    const sql = includeColumns
      ? `SELECT t.table_name, t.table_type, c.column_name, c.data_type, c.is_nullable, c.column_default FROM information_schema.tables t LEFT JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE t.table_schema = '${schema}' ORDER BY t.table_name, c.ordinal_position`
      : `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = '${schema}' ORDER BY table_name`;
    const result = await this.client.queryDatabase(sql, projectId);
    if (includeColumns && Array.isArray(result)) {
      const tables = {};
      for (const row of result) {
        if (!tables[row.table_name]) tables[row.table_name] = { name: row.table_name, type: row.table_type, columns: [] };
        if (row.column_name) tables[row.table_name].columns.push({ name: row.column_name, type: row.data_type, nullable: row.is_nullable === 'YES', default: row.column_default });
      }
      return { schema, tables: Object.values(tables) };
    }
    return { schema, tables: result };
  }
  async describeTable(args) {
    const { tableName, schema = 'public', projectId } = args;
    const [columns, constraints, indexes] = await Promise.all([
      this.client.queryDatabase(`SELECT column_name, data_type, is_nullable, column_default, udt_name FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${tableName}' ORDER BY ordinal_position`, projectId),
      this.client.queryDatabase(`SELECT tc.constraint_type, tc.constraint_name, kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.table_schema = '${schema}' AND tc.table_name = '${tableName}'`, projectId),
      this.client.queryDatabase(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = '${schema}' AND tablename = '${tableName}'`, projectId),
    ]);
    return { schema, tableName, columns, constraints, indexes };
  }
  async manageAuth(args) {
    const { action, userId, email, password, role = 'authenticated', page = 1, perPage = 50 } = args;
    switch (action) {
      case 'list_users': {
        const result = await this.client.authGet(`/admin/users?page=${page}&per_page=${perPage}`);
        return { users: result.users?.map(u => ({ id: u.id, email: u.email, role: u.role, createdAt: u.created_at })), total: result.total || result.users?.length || 0 };
      }
      case 'get_user': {
        if (!userId) return { error: true, message: 'userId required' };
        const user = await this.client.authGet(`/admin/users/${userId}`);
        return { id: user.id, email: user.email, role: user.role };
      }
      case 'create_user': {
        if (!email) return { error: true, message: 'email required' };
        const user = await this.client.authPost('/admin/users', { email, password: password || undefined, email_confirm: true, app_metadata: { role } });
        return { created: true, id: user.id, email: user.email };
      }
      case 'delete_user': {
        if (!userId) return { error: true, message: 'userId required' };
        await this.client.authDelete(`/admin/users/${userId}`);
        return { deleted: true, userId };
      }
      case 'list_roles': {
        const result = await this.client.queryDatabase("SELECT rolname, rolsuper, rolcanlogin FROM pg_roles WHERE rolname NOT LIKE 'pg_%' ORDER BY rolname");
        return { roles: result };
      }
      default: return { error: true, message: `Unknown auth action: ${action}` };
    }
  }
  async applyMigration(args) {
    const { name, sql, projectId } = args;
    const ref = projectId || this.client.getDefaultProjectId();
    if (!ref) throw new Error('No project ID configured.');
    const result = await this.client.managementPost(`/v1/projects/${ref}/database/migrations`, { name, query: sql });
    return { migrationName: name, applied: true, result };
  }
  async listStorageBuckets(args) {
    const buckets = await this.client.storageGet('/bucket', args.projectId);
    return { buckets: Array.isArray(buckets) ? buckets.map(b => ({ id: b.id, name: b.name, public: b.public, createdAt: b.created_at })) : buckets };
  }
}

// ============================================================
// Extension Activation
// ============================================================
async function activate(context) {
  const connector = new SupabaseConnector();
  const mcpTools = [];
  for (const tool of TOOLS_DEF) {
    const prefixedName = `sb_${tool.name}`;
    mcpTools.push({
      name: prefixedName,
      description: tool.description,
      inputSchema: tool.inputSchema,
      handler: async (input) => {
        const result = await connector.callTool(tool.name, input);
        if (typeof result === 'string') { try { return JSON.parse(result); } catch { return result; } }
        return result;
      },
    });
  }
  const provider = await vscode.trae.registerMcpProvider('supabase-connector', 'Supabase Connector', mcpTools);
  context.subscriptions.push(provider);
  context.subscriptions.push(vscode.commands.registerCommand('supabase.checkConfig', async () => {
    const client = new SupabaseClient();
    const configured = client.isConfigured();
    const projectId = client.getDefaultProjectId();
    vscode.window.showInformationMessage(configured ? `Supabase configured. Project: ${projectId || 'N/A'}` : 'Supabase not configured.');
  }));
}

function deactivate() { }
