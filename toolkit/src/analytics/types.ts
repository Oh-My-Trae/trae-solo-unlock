/**
 * TRAE SOLO CN Analytics Toolkit - Type Definitions
 * 数据洞察与分析面板的类型定义
 */

// ============================================================
// 基础类型
// ============================================================

export interface Timestamp {
  unix: number;
  iso: string;
  date: Date;
}

export interface DateRange {
  start: Date;
  end: Date;
}

// ============================================================
// 数据库相关类型
// ============================================================

export interface DatabaseConfig {
  path: string;
  type: 'sqlite' | 'leveldb' | 'encrypted';
  description: string;
}

export interface WorkspaceStorage {
  id: string;
  path: string;
  databasePath: string;
  workspace: WorkspaceInfo;
}

export interface WorkspaceInfo {
  folders: Array<{ path: string }>;
  settings: Record<string, any>;
}

// ============================================================
// 聊天/对话相关类型 (SubTask 10.1 & 10.3)
// ============================================================

export interface ChatSession {
  sessionId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  messageCount: number;
  messages: ChatMessage[];
  metadata: SessionMetadata;
}

export interface ChatMessage {
  messageId: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Timestamp;
  tokenCount?: TokenCount;
  model?: string;
  status: MessageStatus;
  tools?: ToolUsage[];
  metadata?: {
    duration?: number;
    [key: string]: any;
  };
}

export interface TokenCount {
  input: number;
  output: number;
  total: number;
}

export interface SessionMetadata {
  workspaceId: string;
  customModeId?: string;
  model?: string;
  totalTokens: number;
  duration: number; // 毫秒
}

export type MessageStatus = 'success' | 'error' | 'cancelled' | 'pending';

export interface ToolUsage {
  toolName: string;
  input: string;
  output: string;
  duration: number;
  success: boolean;
}

// ============================================================
// 分析结果类型
// ============================================================

export interface ChatAnalysisResult {
  summary: ChatSummary;
  successRate: SuccessRateAnalysis;
  responseTime: ResponseTimeAnalysis;
  patterns: PatternAnalysis;
  categories: CategoryAnalysis;
  timeline: TimelineData[];
}

export interface ChatSummary {
  totalSessions: number;
  totalMessages: number;
  dateRange: DateRange;
  averageMessagesPerSession: number;
}

export interface SuccessRateAnalysis {
  overallSuccessRate: number;
  successCount: number;
  errorCount: number;
  cancelledCount: number;
  errorDistribution: Record<string, number>;
}

export interface ResponseTimeAnalysis {
  average: number;
  median: number;
  min: number;
  max: number;
  p95: number;
  p99: number;
  distribution: Array<{ range: string; count: number }>;
}

export interface PatternAnalysis {
  topQueries: QueryFrequency[];
  peakHours: HourlyActivity[];
  dayOfWeekActivity: DayOfWeekStats[];
}

export interface QueryFrequency {
  query: string;
  count: number;
  percentage: number;
  category?: string;
}

export interface HourlyActivity {
  hour: number;
  messageCount: number;
  sessionCount: number;
}

export interface DayOfWeekStats {
  dayOfWeek: number; // 0-6, 0 = Sunday
  dayName: string;
  messageCount: number;
  sessionCount: number;
}

export interface CategoryAnalysis {
  categories: Record<string, CategoryStat>;
  topCategories: CategoryStat[];
}

export interface CategoryStat {
  name: string;
  count: number;
  percentage: number;
  examples: string[];
}

export interface TimelineData {
  date: string;
  sessions: number;
  messages: number;
  tokens: number;
  errors: number;
}

// ============================================================
// 文件追踪相关类型 (SubTask 10.4)
// ============================================================

export interface FileTrackingResult {
  hotspots: FileHotspot[];
  timeline: FileTimelineEntry[];
  fileTypeDistribution: FileTypeDistribution;
  changeStatistics: ChangeStatistics;
}

export interface FileHotspot {
  filePath: string;
  modificationCount: number;
  lastModified: Timestamp;
  project: string;
  language: string;
  estimatedChanges: ChangeEstimate;
}

export interface ChangeEstimate {
  linesAdded: number;
  linesRemoved: number;
  netChange: number;
}

export interface FileTimelineEntry {
  date: string;
  filesModified: number;
  modifications: number;
  topFiles: string[];
}

export interface FileTypeDistribution {
  types: Record<string, FileTypeStat>;
  sorted: FileTypeStat[];
}

export interface FileTypeStat {
  extension: string;
  language: string;
  fileCount: number;
  modificationCount: number;
  percentage: number;
}

export interface ChangeStatistics {
  totalModifications: number;
  totalFilesAffected: number;
  averageModificationsPerFile: number;
  mostActiveDay: string;
  modificationsByDay: Record<string, number>;
}

// ============================================================
// Token 统计相关类型 (SubTask 10.5)
// ============================================================

export interface TokenStatisticsResult {
  summary: TokenSummary;
  bySession: TokenBySession[];
  byModel: TokenByModel[];
  byDate: TokenByDate[];
  costEstimation: CostEstimation;
  optimizationSuggestions: OptimizationSuggestion[];
}

export interface TokenSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  averageTokensPerSession: number;
  averageTokensPerMessage: number;
  peakUsageDay: string;
  dailyAverage: number;
}

export interface TokenBySession {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  messageCount: number;
  date: string;
}

export interface TokenByModel {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  sessionCount: number;
  cost: number;
  percentage: number;
}

export interface TokenByDate {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  sessionCount: number;
  cost: number;
}

export interface CostEstimation {
  totalCost: number;
  currency: string;
  byModel: ModelCostBreakdown[];
  monthlyProjection: MonthlyProjection;
  yearlyProjection: YearlyProjection;
}

export interface ModelCostBreakdown {
  model: string;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  inputPrice: number; // per 1K tokens
  outputPrice: number; // per 1K tokens
}

export interface MonthlyProjection {
  currentMonth: { cost: number; tokens: number };
  projectedMonthEnd: { cost: number; tokens: number };
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface YearlyProjection {
  projectedAnnualCost: number;
  projectedAnnualTokens: number;
  monthlyAverage: number;
}

export interface OptimizationSuggestion {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: OptimizationCategory;
  title: string;
  description: string;
  currentImpact: string;
  potentialSaving: string;
  implementation: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export type OptimizationCategory =
  | 'context_length'
  | 'model_selection'
  | 'caching'
  | 'prompt_optimization'
  | 'batching'
  | 'other';

// ============================================================
// 仪表板/UI 相关类型 (SubTask 10.6)
// ============================================================

export interface DashboardConfig {
  refreshInterval: number;
  theme: 'light' | 'dark' | 'auto';
  defaultView: DashboardView;
  exportFormat: ExportFormat;
}

export type DashboardView =
  | 'overview'
  | 'chat-analysis'
  | 'file-tracking'
  | 'token-statistics'
  | 'settings';

export type ExportFormat = 'console' | 'json' | 'csv' | 'markdown' | 'pdf';

export interface DashboardData {
  chatAnalysis: ChatAnalysisResult | null;
  fileTracking: FileTrackingResult | null;
  tokenStats: TokenStatisticsResult | null;
  lastUpdated: Timestamp;
  dataSources: DataSourceStatus[];
}

export interface DataSourceStatus {
  name: string;
  connected: boolean;
  lastSync: Timestamp | null;
  recordCount: number;
  error?: string;
}

// ============================================================
// CLI 命令相关类型
// ============================================================

export interface CommandOptions {
  output?: string;
  format?: ExportFormat;
  limit?: number;
  dateRange?: DateRange;
  filter?: Record<string, any>;
  sort?: string;
  groupBy?: string;
  verbose?: boolean;
}

export interface CommandResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  executionTime: number;
  timestamp: Timestamp;
}

// ============================================================
// CKG 数据库 Schema 类型 (SubTask 10.2)
// ============================================================

export interface CKGSchema {
  tables: CKGTable[];
  relationships: Relationship[];
  indexes: CKGIndex[];
}

export interface CKGTable {
  name: string;
  columns: CKGColumn[];
  rowCount?: number;
  description: string;
}

export interface CKGColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: string;
  description: string;
}

export interface Relationship {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

export interface CKGIndex {
  name: string;
  tableName: string;
  columns: string[];
  unique: boolean;
}

// ============================================================
// 配置和常量
// ============================================================

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'default': { input: 0.001, output: 0.002 },
};

export const FILE_TYPE_MAP: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript React',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript React',
  '.py': 'Python',
  '.go': 'Go',
  '.java': 'Java',
  '.rs': 'Rust',
  '.cpp': 'C++',
  '.c': 'C',
  '.cs': 'C#',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
  '.scala': 'Scala',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.md': 'Markdown',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.xml': 'XML',
  '.sql': 'SQL',
  '.sh': 'Shell',
  '.bash': 'Bash',
  '.ps1': 'PowerShell',
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.less': 'Less',
};
