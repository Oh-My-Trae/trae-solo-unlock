/**
 * SQL Queries - SQL 查询封装
 * 提供预定义的查询方法用于数据分析
 */

import type {
  ChatSession,
  ChatMessage,
  TokenCount,
  TimelineData,
  FileHotspot,
  FileTimelineEntry,
  TokenBySession,
  TokenByDate,
  QueryFrequency,
  HourlyActivity,
} from '../types';

export class QueryBuilder {
  // ============================================================
  // 聊天分析查询
  // ============================================================

  /**
   * 构建聊天会话统计查询
   */
  static buildChatSummaryQuery(): string {
    return `
      SELECT
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(*) as total_messages,
        MIN(timestamp) as earliest_message,
        MAX(timestamp) as latest_message,
        AVG(message_count) as avg_messages_per_session
      FROM chat_sessions
    `;
  }

  /**
   * 构建成功率统计查询
   */
  static buildSuccessRateQuery(dateRange?: { start: string; end: string }): string {
    let query = `
      SELECT
        status,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM chat_messages), 2) as percentage
      FROM chat_messages
    `;

    if (dateRange) {
      query += ` WHERE timestamp BETWEEN '${dateRange.start}' AND '${dateRange.end}'`;
    }

    query += ` GROUP BY status`;

    return query;
  }

  /**
   * 构建响应时间统计查询
   */
  static buildResponseTimeQuery(): string {
    return `
      SELECT
        AVG(response_time) as avg_response_time,
        MIN(response_time) as min_response_time,
        MAX(response_time) as max_response_time,
        (
          SELECT response_time FROM chat_messages
          ORDER BY response_time
          LIMIT 1 OFFSET (SELECT COUNT(*) / 2 FROM chat_messages)
        ) as median_response_time
      FROM chat_messages
      WHERE role = 'assistant' AND status = 'success'
    `;
  }

  /**
   * 构建高频查询模式查询
   */
  static buildTopQueriesQuery(limit: number = 10): string {
    return `
      SELECT
        SUBSTR(content, 1, 100) as query_preview,
        COUNT(*) as frequency,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM chat_messages WHERE role = 'user'), 2) as percentage
      FROM chat_messages
      WHERE role = 'user'
      GROUP BY SUBSTR(content, 1, 100)
      ORDER BY frequency DESC
      LIMIT ?
    `;
  }

  /**
   * 构建每小时活动统计查询
   */
  static buildHourlyActivityQuery(): string {
    return `
      SELECT
        CAST(strftime('%H', timestamp, 'unixepoch') AS INTEGER) as hour,
        COUNT(*) as message_count,
        COUNT(DISTINCT session_id) as session_count
      FROM chat_messages
      GROUP BY hour
      ORDER BY hour
    `;
  }

  /**
   * 构建每日活动时间线查询
   */
  static buildTimelineQuery(days: number = 30): string {
    return `
      SELECT
        DATE(timestamp, 'unixepoch') as date,
        COUNT(DISTINCT session_id) as sessions,
        COUNT(*) as messages,
        SUM(CASE WHEN role = 'user' THEN input_tokens ELSE 0 END) as input_tokens,
        SUM(CASE WHEN role = 'assistant' THEN output_tokens ELSE 0 END) as output_tokens,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
      FROM chat_messages
      WHERE timestamp >= strftime('%s', 'now', '-' || ? || ' days')
      GROUP BY DATE(timestamp, 'unixepoch')
      ORDER BY date
    `;
  }

  // ============================================================
  // 文件追踪查询
  // ============================================================

  /**
   * 构建热点文件查询
   */
  static buildHotspotFilesQuery(limit: number = 20): string {
    return `
      SELECT
        file_path,
        COUNT(*) as modification_count,
        MAX(modified_at) as last_modified,
        language,
        SUM(lines_added) as total_lines_added,
        SUM(lines_removed) as total_lines_removed
      FROM file_modifications
      GROUP BY file_path
      ORDER BY modification_count DESC
      LIMIT ?
    `;
  }

  /**
   * 构建文件修改时间线查询
   */
  static buildFileTimelineQuery(days: number = 7): string {
    return `
      SELECT
        DATE(modified_at, 'unixepoch') as date,
        COUNT(DISTINCT file_path) as files_modified,
        COUNT(*) as modifications,
        GROUP_CONCAT(DISTINCT file_path) as top_files
      FROM file_modifications
      WHERE modified_at >= strftime('%s', 'now', '-' || ? || ' days')
      GROUP BY DATE(modified_at, 'unixepoch')
      ORDER BY date
    `;
  }

  /**
   * 构建文件类型分布查询
   */
  static buildFileTypeDistributionQuery(): string {
    return `
      SELECT
        extension,
        language,
        COUNT(DISTINCT file_path) as file_count,
        COUNT(*) as modification_count,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM file_modifications), 2) as percentage
      FROM file_modifications
      GROUP BY extension, language
      ORDER BY modification_count DESC
    `;
  }

  /**
   * 构建特定文件历史查询
   */
  static buildFileHistoryQuery(filePath: string): string {
    return `
      SELECT
        modified_at,
        lines_added,
        lines_removed,
        commit_hash,
        message as commit_message,
        author
      FROM file_modifications
      WHERE file_path = ?
      ORDER BY modified_at DESC
    `;
  }

  // ============================================================
  // Token 统计查询
  // ============================================================

  /**
   * 构建 Token 消耗总览查询
   */
  static buildTokenSummaryQuery(): string {
    return `
      SELECT
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(input_tokens + output_tokens) as total_tokens,
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(*) as total_messages,
        AVG(input_tokens + output_tokens) as avg_tokens_per_message
      FROM chat_messages
    `;
  }

  /**
   * 按会话分组 Token 统计
   */
  static buildTokenBySessionQuery(): string {
    return `
      SELECT
        session_id,
        SUM(CASE WHEN role = 'user' THEN input_tokens ELSE 0 END) as input_tokens,
        SUM(CASE WHEN role = 'assistant' THEN output_tokens ELSE 0 END) as output_tokens,
        SUM(input_tokens + output_tokens) as total_tokens,
        COUNT(*) as message_count,
        DATE(MIN(timestamp), 'unixepoch') as date
      FROM chat_messages
      GROUP BY session_id
      ORDER BY total_tokens DESC
    `;
  }

  /**
   * 按模型分组 Token 统计
   */
  static buildTokenByModelQuery(): string {
    return `
      SELECT
        model,
        SUM(CASE WHEN role = 'user' THEN input_tokens ELSE 0 END) as input_tokens,
        SUM(CASE WHEN role = 'assistant' THEN output_tokens ELSE 0 END) as output_tokens,
        SUM(input_tokens + output_tokens) as total_tokens,
        COUNT(DISTINCT session_id) as session_count
      FROM chat_messages
      WHERE model IS NOT NULL
      GROUP BY model
      ORDER BY total_tokens DESC
    `;
  }

  /**
   * 按日期分组 Token 统计
   */
  static buildTokenByDateQuery(days: number = 30): string {
    return `
      SELECT
        DATE(timestamp, 'unixepoch') as date,
        SUM(CASE WHEN role = 'user' THEN input_tokens ELSE 0 END) as input_tokens,
        SUM(CASE WHEN role = 'assistant' THEN output_tokens ELSE 0 END) as output_tokens,
        SUM(input_tokens + output_tokens) as total_tokens,
        COUNT(DISTINCT session_id) as session_count
      FROM chat_messages
      WHERE timestamp >= strftime('%s', 'now', '-' || ? || ' days')
      GROUP BY DATE(timestamp, 'unixepoch')
      ORDER BY date
    `;
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 从原始数据构建聊天会话对象
   */
  static buildChatSessionFromRaw(raw: any): ChatSession {
    return {
      sessionId: raw.session_id || raw.id,
      createdAt: this.parseTimestamp(raw.created_at || raw.timestamp),
      updatedAt: this.parseTimestamp(raw.updated_at || raw.timestamp),
      messageCount: raw.message_count || 0,
      messages: [],
      metadata: {
        workspaceId: raw.workspace_id,
        customModeId: raw.custom_mode_id,
        model: raw.model,
        totalTokens: raw.total_tokens || 0,
        duration: raw.duration || 0,
      },
    };
  }

  /**
   * 从原始数据构建消息对象
   */
  static buildChatMessageFromRaw(raw: any): ChatMessage {
    return {
      messageId: raw.message_id || raw.id,
      sessionId: raw.session_id,
      role: raw.role,
      content: raw.content,
      timestamp: this.parseTimestamp(raw.timestamp),
      tokenCount: raw.input_tokens || raw.output_tokens ? {
        input: raw.input_tokens || 0,
        output: raw.output_tokens || 0,
        total: (raw.input_tokens || 0) + (raw.output_tokens || 0),
      } : undefined,
      model: raw.model,
      status: raw.status || 'success',
      tools: raw.tools ? JSON.parse(raw.tools) : undefined,
    };
  }

  /**
   * 解析时间戳
   */
  private static parseTimestamp(timestamp: any): any {
    if (!timestamp) {
      return {
        unix: 0,
        iso: new Date(0).toISOString(),
        date: new Date(0),
      };
    }

    const date = typeof timestamp === 'number'
      ? new Date(timestamp * 1000) // Unix 时间戳（秒）
      : new Date(timestamp); // ISO 格式

    return {
      unix: Math.floor(date.getTime() / 1000),
      iso: date.toISOString(),
      date,
    };
  }
}
