import * as vscode from 'vscode';
import * as https from 'node:https';
import * as http from 'node:http';

// ============================================================
// Tool Definitions
// ============================================================

const TOOLS_DEF = [
  {
    name: 'list_projects',
    description:
      'List all Supabase projects associated with the configured account. Returns project IDs, names, regions, and status.',
    inputSchema: {
      type: 'object',
      properties: {
        includePaused: {
          type: 'boolean',
          description: 'Whether to include paused projects. Default: true.',
        },
      },
    },
  },
  {
    name: 'get_project',
    description:
      'Get detailed information about a specific Supabase project including database connection strings, API URLs, and settings.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Supabase project ID (ref). Can be obtained from list_projects.',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'execute_query',
    description:
      'Execute a SQL query on the Supabase database. Supports SELECT, INSERT, UPDATE, DELETE, and DDL statements. Returns results as JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'SQL query to execute. Use parameterized queries for safety.',
        },
        projectId: {
          type: 'string',
          description: 'Project ID. If omitted, uses the default project from configuration.',
        },
        readOnly: {
          type: 'boolean',
          description: 'If true, only SELECT queries are allowed. Default: false.',
        },
      },
      required: ['sql'],
    },
  },
  {
    name: 'list_tables',
    description:
      'List all tables in the Supabase database with row counts, column information, and relationships.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID. If omitted, uses the default project.',
        },
        schema: {
          type: 'string',
          description: 'Database schema to list tables from. Default: "public".',
        },
        includeColumns: {
          type: 'boolean',
          description: 'Whether to include column details. Default: true.',
        },
      },
    },
  },
  {
    name: 'describe_table',
    description:
      'Get detailed schema information for a specific table: columns, types, constraints, indexes, and foreign keys.',
    inputSchema: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table to describe.',
        },
        schema: {
          type: 'string',
          description: 'Schema name. Default: "public".',
        },
        projectId: {
          type: 'string',
          description: 'Project ID. If omitted, uses the default project.',
        },
      },
      required: ['tableName'],
    },
  },
  {
    name: 'manage_auth',
    description:
      'Manage Supabase Auth: list users, get user details, create users, or delete users.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list_users', 'get_user', 'create_user', 'delete_user', 'list_roles'],
          description: 'Auth management action.',
        },
        userId: {
          type: 'string',
          description: 'User ID for get_user or delete_user actions.',
        },
        email: {
          type: 'string',
          description: 'Email for create_user action.',
        },
        password: {
          type: 'string',
          description: 'Password for create_user action.',
        },
        role: {
          type: 'string',
          description: 'Role for create_user action. Default: "authenticated".',
        },
        page: {
          type: 'number',
          description: 'Page number for list_users. Default: 1.',
        },
        perPage: {
          type: 'number',
          description: 'Items per page for list_users. Default: 50.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'apply_migration',
    description:
      'Apply a SQL migration to the Supabase database. Creates a named migration and applies it.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Migration name (e.g., "create_users_table").',
        },
        sql: {
          type: 'string',
          description: 'SQL migration content.',
        },
        projectId: {
          type: 'string',
          description: 'Project ID. If omitted, uses the default project.',
        },
      },
      required: ['name', 'sql'],
    },
  },
  {
    name: 'list_storage_buckets',
    description:
      'List all storage buckets in the Supabase project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID. If omitted, uses the default project.',
        },
      },
    },
  },
];

// ============================================================
// Supabase API Client
// ============================================================

interface SupabaseConfig {
  accessToken: string;
  projectUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  defaultLimit: number;
}

class SupabaseClient {
  private config: SupabaseConfig;
  private managementApiBase = 'https://api.supabase.com';

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): SupabaseConfig {
    const conf = vscode.workspace.getConfiguration('supabase');
    return {
      accessToken: conf.get<string>('accessToken', ''),
      projectUrl: conf.get<string>('projectUrl', ''),
      serviceRoleKey: conf.get<string>('serviceRoleKey', ''),
      anonKey: conf.get<string>('anonKey', ''),
      defaultLimit: conf.get<number>('defaultLimit', 100),
    };
  }

  reloadConfig(): void {
    this.config = this.loadConfig();
  }

  isConfigured(): boolean {
    return !!(this.config.accessToken || (this.config.projectUrl && this.config.serviceRoleKey));
  }

  getDefaultProjectId(): string | null {
    if (!this.config.projectUrl) return null;
    // Extract project ref from URL: https://xxxxx.supabase.co
    const match = this.config.projectUrl.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/);
    return match ? match[1] : null;
  }

  // Management API calls (using access token)
  async managementGet(path: string): Promise<any> {
    return this.request('GET', `${this.managementApiBase}${path}`, {
      Authorization: `Bearer ${this.config.accessToken}`,
    });
  }

  async managementPost(path: string, body: any): Promise<any> {
    return this.request('POST', `${this.managementApiBase}${path}`, {
      Authorization: `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
    }, body);
  }

  async managementDelete(path: string): Promise<any> {
    return this.request('DELETE', `${this.managementApiBase}${path}`, {
      Authorization: `Bearer ${this.config.accessToken}`,
    });
  }

  // Database SQL execution via PostgREST / REST
  async executeSql(sql: string, projectId?: string): Promise<any> {
    const ref = projectId || this.getDefaultProjectId();
    if (!ref) throw new Error('No project ID configured. Set supabase.projectUrl or provide projectId.');

    return this.request('POST', `https://${ref}.supabase.co/rest/v1/rpc/exec_sql`, {
      apikey: this.config.serviceRoleKey,
      Authorization: `Bearer ${this.config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    }, { query: sql });
  }

  // Direct database query via management API
  async queryDatabase(sql: string, projectId?: string): Promise<any> {
    const ref = projectId || this.getDefaultProjectId();
    if (!ref) throw new Error('No project ID configured.');

    return this.managementPost(`/v1/projects/${ref}/database/query`, { query: sql });
  }

  // Auth Admin API
  async authGet(path: string, projectId?: string): Promise<any> {
    const ref = projectId || this.getDefaultProjectId();
    if (!ref) throw new Error('No project ID configured.');

    return this.request('GET', `https://${ref}.supabase.co/auth/v1${path}`, {
      apikey: this.config.serviceRoleKey,
      Authorization: `Bearer ${this.config.serviceRoleKey}`,
    });
  }

  async authPost(path: string, body: any, projectId?: string): Promise<any> {
    const ref = projectId || this.getDefaultProjectId();
    if (!ref) throw new Error('No project ID configured.');

    return this.request('POST', `https://${ref}.supabase.co/auth/v1${path}`, {
      apikey: this.config.serviceRoleKey,
      Authorization: `Bearer ${this.config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    }, body);
  }

  async authDelete(path: string, projectId?: string): Promise<any> {
    const ref = projectId || this.getDefaultProjectId();
    if (!ref) throw new Error('No project ID configured.');

    return this.request('DELETE', `https://${ref}.supabase.co/auth/v1${path}`, {
      apikey: this.config.serviceRoleKey,
      Authorization: `Bearer ${this.config.serviceRoleKey}`,
    });
  }

  // Storage API
  async storageGet(path: string, projectId?: string): Promise<any> {
    const ref = projectId || this.getDefaultProjectId();
    if (!ref) throw new Error('No project ID configured.');

    return this.request('GET', `https://${ref}.supabase.co/storage/v1${path}`, {
      apikey: this.config.serviceRoleKey,
      Authorization: `Bearer ${this.config.serviceRoleKey}`,
    });
  }

  // Generic HTTP request
  private request(method: string, url: string, headers: Record<string, string>, body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method,
        headers,
        timeout: 30000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`API error ${res.statusCode}: ${JSON.stringify(parsed)}`));
            } else {
              resolve(parsed);
            }
          } catch {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`API error ${res.statusCode}: ${data}`));
            } else {
              resolve(data);
            }
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }
}

// ============================================================
// Supabase Connector
// ============================================================

class SupabaseConnector {
  private client: SupabaseClient;

  constructor() {
    this.client = new SupabaseClient();
  }

  public async callTool(name: string, args: any): Promise<any> {
    this.client.reloadConfig();

    if (!this.client.isConfigured()) {
      return {
        error: true,
        message: 'Supabase is not configured. Please set supabase.accessToken or supabase.projectUrl + supabase.serviceRoleKey in settings.',
        setupGuide: '1. Go to VS Code Settings > Supabase Connector\n2. Set accessToken from https://supabase.com/dashboard/account/tokens\n3. Or set projectUrl and serviceRoleKey for direct database access',
      };
    }

    try {
      switch (name) {
        case 'list_projects':
          return await this.listProjects(args);
        case 'get_project':
          return await this.getProject(args);
        case 'execute_query':
          return await this.executeQuery(args);
        case 'list_tables':
          return await this.listTables(args);
        case 'describe_table':
          return await this.describeTable(args);
        case 'manage_auth':
          return await this.manageAuth(args);
        case 'apply_migration':
          return await this.applyMigration(args);
        case 'list_storage_buckets':
          return await this.listStorageBuckets(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err: any) {
      return {
        error: true,
        message: err.message || 'Unknown error',
        toolName: name,
      };
    }
  }

  private async listProjects(args: any): Promise<any> {
    const { includePaused = true } = args;
    const projects = await this.client.managementGet('/v1/projects');
    const filtered = includePaused ? projects : projects.filter((p: any) => p.status !== 'inactive');
    return {
      total: filtered.length,
      projects: filtered.map((p: any) => ({
        id: p.id,
        ref: p.ref,
        name: p.name,
        status: p.status,
        region: p.region,
        database: p.database,
        createdAt: p.created_at,
      })),
    };
  }

  private async getProject(args: any): Promise<any> {
    const { projectId } = args;
    const project = await this.client.managementGet(`/v1/projects/${projectId}`);
    return {
      id: project.id,
      ref: project.ref,
      name: project.name,
      status: project.status,
      region: project.region,
      database: project.database,
      endpoint: project.endpoint,
      anonKey: project.anon_key,
      serviceKey: project.service_key,
      createdAt: project.created_at,
    };
  }

  private async executeQuery(args: any): Promise<any> {
    const { sql, projectId, readOnly = false } = args;

    if (readOnly) {
      const normalizedSql = sql.trim().toUpperCase();
      if (!normalizedSql.startsWith('SELECT') && !normalizedSql.startsWith('WITH') && !normalizedSql.startsWith('EXPLAIN')) {
        return {
          error: true,
          message: 'Only SELECT/WITH/EXPLAIN queries are allowed in read-only mode.',
          sql,
        };
      }
    }

    const result = await this.client.queryDatabase(sql, projectId);
    return {
      sql,
      rows: Array.isArray(result) ? result : result.rows || result,
      rowCount: Array.isArray(result) ? result.length : result.rows?.length || 0,
    };
  }

  private async listTables(args: any): Promise<any> {
    const { projectId, schema = 'public', includeColumns = true } = args;
    const sql = includeColumns
      ? `SELECT t.table_name, t.table_type,
          c.column_name, c.data_type, c.is_nullable, c.column_default,
          c.character_maximum_length, c.numeric_precision
         FROM information_schema.tables t
         LEFT JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
         WHERE t.table_schema = '${schema}'
         ORDER BY t.table_name, c.ordinal_position`
      : `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = '${schema}' ORDER BY table_name`;

    const result = await this.client.queryDatabase(sql, projectId);

    if (includeColumns && Array.isArray(result)) {
      // Group by table
      const tables: Record<string, any> = {};
      for (const row of result) {
        const tableName = row.table_name;
        if (!tables[tableName]) {
          tables[tableName] = { name: tableName, type: row.table_type, columns: [] };
        }
        if (row.column_name) {
          tables[tableName].columns.push({
            name: row.column_name,
            type: row.data_type,
            nullable: row.is_nullable === 'YES',
            default: row.column_default,
            maxLength: row.character_maximum_length,
            precision: row.numeric_precision,
          });
        }
      }
      return { schema, tables: Object.values(tables) };
    }

    return { schema, tables: result };
  }

  private async describeTable(args: any): Promise<any> {
    const { tableName, schema = 'public', projectId } = args;

    const columnSql = `SELECT column_name, data_type, is_nullable, column_default,
      character_maximum_length, numeric_precision, udt_name
      FROM information_schema.columns
      WHERE table_schema = '${schema}' AND table_name = '${tableName}'
      ORDER BY ordinal_position`;

    const constraintSql = `SELECT tc.constraint_type, tc.constraint_name,
      kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = '${schema}' AND tc.table_name = '${tableName}'`;

    const indexSql = `SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = '${schema}' AND tablename = '${tableName}'`;

    const [columns, constraints, indexes] = await Promise.all([
      this.client.queryDatabase(columnSql, projectId),
      this.client.queryDatabase(constraintSql, projectId),
      this.client.queryDatabase(indexSql, projectId),
    ]);

    return {
      schema,
      tableName,
      columns,
      constraints,
      indexes,
    };
  }

  private async manageAuth(args: any): Promise<any> {
    const { action, userId, email, password, role = 'authenticated', page = 1, perPage = 50 } = args;

    switch (action) {
      case 'list_users': {
        const result = await this.client.authGet(`/admin/users?page=${page}&per_page=${perPage}`);
        return {
          users: result.users?.map((u: any) => ({
            id: u.id,
            email: u.email,
            role: u.role,
            createdAt: u.created_at,
            lastSignIn: u.last_sign_in_at,
            emailConfirmed: u.email_confirmed_at != null,
          })),
          total: result.total || result.users?.length || 0,
          page,
          perPage,
        };
      }

      case 'get_user': {
        if (!userId) return { error: true, message: 'userId is required for get_user' };
        const user = await this.client.authGet(`/admin/users/${userId}`);
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          appMetadata: user.app_metadata,
          userMetadata: user.user_metadata,
          createdAt: user.created_at,
        };
      }

      case 'create_user': {
        if (!email) return { error: true, message: 'email is required for create_user' };
        const user = await this.client.authPost('/admin/users', {
          email,
          password: password || undefined,
          email_confirm: true,
          app_metadata: { role },
        });
        return { created: true, id: user.id, email: user.email };
      }

      case 'delete_user': {
        if (!userId) return { error: true, message: 'userId is required for delete_user' };
        await this.client.authDelete(`/admin/users/${userId}`);
        return { deleted: true, userId };
      }

      case 'list_roles': {
        const sql = 'SELECT rolname, rolsuper, rolcanlogin FROM pg_roles WHERE rolname NOT LIKE \'pg_%\' ORDER BY rolname';
        const result = await this.client.queryDatabase(sql);
        return { roles: result };
      }

      default:
        return { error: true, message: `Unknown auth action: ${action}` };
    }
  }

  private async applyMigration(args: any): Promise<any> {
    const { name, sql, projectId } = args;
    const ref = projectId || this.client.getDefaultProjectId();
    if (!ref) throw new Error('No project ID configured.');

    const result = await this.client.managementPost(`/v1/projects/${ref}/database/migrations`, {
      name,
      query: sql,
    });

    return {
      migrationName: name,
      applied: true,
      result,
    };
  }

  private async listStorageBuckets(args: any): Promise<any> {
    const { projectId } = args;
    const buckets = await this.client.storageGet('/bucket', projectId);
    return {
      buckets: Array.isArray(buckets)
        ? buckets.map((b: any) => ({
            id: b.id,
            name: b.name,
            public: b.public,
            createdAt: b.created_at,
            fileSizeLimit: b.file_size_limit,
            allowedMimeTypes: b.allowed_mime_types,
          }))
        : buckets,
    };
  }
}

// ============================================================
// Extension Activation
// ============================================================

export async function activate(context: vscode.ExtensionContext) {
  const connector = new SupabaseConnector();
  const mcpTools: vscode.McpToolDefinition[] = [];

  for (const tool of TOOLS_DEF) {
    const prefixedName = `sb_${tool.name}`;
    mcpTools.push({
      name: prefixedName,
      description: tool.description,
      inputSchema: tool.inputSchema,
      handler: async (input: any) => {
        const result = await connector.callTool(tool.name, input);
        if (typeof result === 'string') {
          try {
            return JSON.parse(result);
          } catch {
            return result;
          }
        }
        return result;
      },
    });
  }

  const provider = await vscode.trae.registerMcpProvider(
    'supabase-connector',
    'Supabase Connector',
    mcpTools,
  );

  context.subscriptions.push(provider);

  // Register VS Code commands
  context.subscriptions.push(
    vscode.commands.registerCommand('supabase.checkConfig', async () => {
      const client = new SupabaseClient();
      const configured = client.isConfigured();
      const projectId = client.getDefaultProjectId();
      vscode.window.showInformationMessage(
        configured
          ? `Supabase configured. Project: ${projectId || 'N/A'}`
          : 'Supabase not configured. Please set access token or project URL in settings.',
      );
    }),
  );
}

export function deactivate() {
  // Cleanup
}
