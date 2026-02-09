/**
 * Message 实体数据访问层
 * T050: 创建 Message 实体数据访问层
 * 
 * 单条对话消息，包含角色、内容和时间信息
 */

import { IDatabaseService, generateUUID, now, timestampToDate } from '../services/database';
import { MessageRole } from '../types/models';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 数据库行类型（SQLite 返回的原始数据）
 */
interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tokens: number | null;
  tool_calls: string | null;
  tool_result: string | null;
  created_at: number;
}

/**
 * 工具调用记录
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * 消息角色类型
 */
export type MessageRoleType = 'user' | 'assistant' | 'system' | 'tool';

/**
 * 完整的消息实体
 */
export interface MessageEntity {
  id: string;
  conversationId: string;
  role: MessageRoleType;
  content: string;
  tokens: number | null;
  toolCalls: ToolCall[] | null;
  toolResult: ToolResult | null;
  createdAt: Date;
}

/**
 * 创建消息的输入参数
 */
export interface CreateMessageParams {
  conversationId: string;
  role: MessageRoleType;
  content: string;
  tokens?: number | null;
  toolCalls?: ToolCall[] | null;
  toolResult?: ToolResult | null;
}

/**
 * 更新消息的输入参数
 */
export interface UpdateMessageParams {
  content?: string;
  tokens?: number | null;
  toolCalls?: ToolCall[] | null;
  toolResult?: ToolResult | null;
}

/**
 * 消息查询参数
 */
export interface MessageQueryOptions {
  limit?: number;
  offset?: number;
  orderDirection?: 'ASC' | 'DESC';
  role?: MessageRoleType;
  beforeId?: string;
  afterId?: string;
}

// ============================================================================
// 行转换函数
// ============================================================================

/**
 * 将数据库行转换为 MessageEntity
 */
function rowToEntity(row: MessageRow): MessageEntity {
  let toolCalls: ToolCall[] | null = null;
  let toolResult: ToolResult | null = null;

  // 解析 JSON 字段
  if (row.tool_calls) {
    try {
      toolCalls = JSON.parse(row.tool_calls);
    } catch {
      toolCalls = null;
    }
  }

  if (row.tool_result) {
    try {
      toolResult = JSON.parse(row.tool_result);
    } catch {
      toolResult = null;
    }
  }

  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as MessageRoleType,
    content: row.content,
    tokens: row.tokens,
    toolCalls,
    toolResult,
    createdAt: timestampToDate(row.created_at) || new Date(),
  };
}

// ============================================================================
// MessageModel 类
// ============================================================================

/**
 * Message 数据访问对象
 */
export class MessageModel {
  private db: IDatabaseService;

  constructor(database: IDatabaseService) {
    this.db = database;
  }

  // --------------------------------------------------------------------------
  // CRUD 操作
  // --------------------------------------------------------------------------

  /**
   * 创建新消息
   */
  create(params: CreateMessageParams): MessageEntity {
    const id = generateUUID();
    const timestamp = now();

    // 序列化 JSON 字段
    const toolCallsJson = params.toolCalls ? JSON.stringify(params.toolCalls) : null;
    const toolResultJson = params.toolResult ? JSON.stringify(params.toolResult) : null;

    this.db.run(
      `INSERT INTO messages (id, conversation_id, role, content, tokens, tool_calls, tool_result, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      params.conversationId,
      params.role,
      params.content,
      params.tokens ?? null,
      toolCallsJson,
      toolResultJson,
      timestamp
    );

    // 更新对话的 updated_at
    this.db.run(
      `UPDATE conversations SET updated_at = ? WHERE id = ?`,
      timestamp,
      params.conversationId
    );

    return this.findById(id)!;
  }

  /**
   * 批量创建消息
   */
  createMany(messages: CreateMessageParams[]): MessageEntity[] {
    if (messages.length === 0) return [];

    return this.db.transaction(() => {
      const results: MessageEntity[] = [];
      const timestamp = now();
      const conversationIds = new Set<string>();

      for (const params of messages) {
        const id = generateUUID();
        const toolCallsJson = params.toolCalls ? JSON.stringify(params.toolCalls) : null;
        const toolResultJson = params.toolResult ? JSON.stringify(params.toolResult) : null;

        this.db.run(
          `INSERT INTO messages (id, conversation_id, role, content, tokens, tool_calls, tool_result, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          params.conversationId,
          params.role,
          params.content,
          params.tokens ?? null,
          toolCallsJson,
          toolResultJson,
          timestamp
        );

        conversationIds.add(params.conversationId);
        results.push(this.findById(id)!);
      }

      // 更新所有相关对话的 updated_at
      for (const conversationId of conversationIds) {
        this.db.run(
          `UPDATE conversations SET updated_at = ? WHERE id = ?`,
          timestamp,
          conversationId
        );
      }

      return results;
    });
  }

  /**
   * 根据 ID 查找消息
   */
  findById(id: string): MessageEntity | null {
    const row = this.db.get<MessageRow>(
      `SELECT * FROM messages WHERE id = ?`,
      id
    );
    return row ? rowToEntity(row) : null;
  }

  /**
   * 根据对话 ID 查找所有消息
   */
  findByConversationId(
    conversationId: string,
    options: MessageQueryOptions = {}
  ): MessageEntity[] {
    const {
      limit = 100,
      offset = 0,
      orderDirection = 'ASC',
      role,
    } = options;

    let sql = `SELECT * FROM messages WHERE conversation_id = ?`;
    const params: unknown[] = [conversationId];

    // 添加角色过滤
    if (role) {
      sql += ` AND role = ?`;
      params.push(role);
    }

    // 添加排序和分页
    sql += ` ORDER BY created_at ${orderDirection}`;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this.db.all<MessageRow>(sql, ...params);
    return rows.map(rowToEntity);
  }

  /**
   * 获取对话的最近 N 条消息
   */
  findRecent(conversationId: string, limit: number = 20): MessageEntity[] {
    const rows = this.db.all<MessageRow>(
      `SELECT * FROM messages 
       WHERE conversation_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
      conversationId,
      limit
    );
    // 反转以保持时间顺序
    return rows.map(rowToEntity).reverse();
  }

  /**
   * 获取对话的最近 N 轮对话消息（用于上下文）
   * 一轮 = 一个 user + 一个 assistant 消息
   */
  findRecentTurns(conversationId: string, turns: number = 20): MessageEntity[] {
    // 计算需要获取的消息数量（每轮2条，加上可能的 system 消息）
    const maxMessages = turns * 2 + 5; // 额外5条以防有 system 或 tool 消息
    
    const rows = this.db.all<MessageRow>(
      `SELECT * FROM messages 
       WHERE conversation_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
      conversationId,
      maxMessages
    );

    // 反转以保持时间顺序
    const messages = rows.map(rowToEntity).reverse();

    // 计算实际轮数并截取
    let currentTurns = 0;
    let startIndex = 0;

    // 从后向前计数轮数
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'user') {
        currentTurns++;
        if (currentTurns > turns) {
          startIndex = i + 1;
          break;
        }
      }
    }

    // 包含开头的 system 消息（如果有）
    if (startIndex > 0 && messages[0].role === 'system') {
      return [messages[0], ...messages.slice(startIndex)];
    }

    return messages.slice(startIndex);
  }

  /**
   * 获取最后一条消息
   */
  findLast(conversationId: string): MessageEntity | null {
    const row = this.db.get<MessageRow>(
      `SELECT * FROM messages 
       WHERE conversation_id = ? 
       ORDER BY created_at DESC 
       LIMIT 1`,
      conversationId
    );
    return row ? rowToEntity(row) : null;
  }

  /**
   * 获取最后一条指定角色的消息
   */
  findLastByRole(conversationId: string, role: MessageRoleType): MessageEntity | null {
    const row = this.db.get<MessageRow>(
      `SELECT * FROM messages 
       WHERE conversation_id = ? AND role = ?
       ORDER BY created_at DESC 
       LIMIT 1`,
      conversationId,
      role
    );
    return row ? rowToEntity(row) : null;
  }

  /**
   * 更新消息
   */
  update(id: string, params: UpdateMessageParams): MessageEntity | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (params.content !== undefined) {
      updates.push('content = ?');
      values.push(params.content);
    }
    if (params.tokens !== undefined) {
      updates.push('tokens = ?');
      values.push(params.tokens);
    }
    if (params.toolCalls !== undefined) {
      updates.push('tool_calls = ?');
      values.push(params.toolCalls ? JSON.stringify(params.toolCalls) : null);
    }
    if (params.toolResult !== undefined) {
      updates.push('tool_result = ?');
      values.push(params.toolResult ? JSON.stringify(params.toolResult) : null);
    }

    if (updates.length === 0) {
      return existing;
    }

    values.push(id);

    this.db.run(
      `UPDATE messages SET ${updates.join(', ')} WHERE id = ?`,
      ...values
    );

    return this.findById(id);
  }

  /**
   * 删除消息
   */
  delete(id: string): boolean {
    const result = this.db.run(
      `DELETE FROM messages WHERE id = ?`,
      id
    );
    return result.changes > 0;
  }

  /**
   * 删除对话的所有消息
   */
  deleteByConversationId(conversationId: string): number {
    const result = this.db.run(
      `DELETE FROM messages WHERE conversation_id = ?`,
      conversationId
    );
    return result.changes;
  }

  // --------------------------------------------------------------------------
  // 统计与查询
  // --------------------------------------------------------------------------

  /**
   * 获取对话的消息数量
   */
  countByConversationId(conversationId: string): number {
    return this.db.pluck<number>(
      `SELECT COUNT(*) FROM messages WHERE conversation_id = ?`,
      conversationId
    ) ?? 0;
  }

  /**
   * 获取对话的轮数（user 消息数量）
   */
  countTurns(conversationId: string): number {
    return this.db.pluck<number>(
      `SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND role = 'user'`,
      conversationId
    ) ?? 0;
  }

  /**
   * 获取对话的 token 总数
   */
  getTotalTokens(conversationId: string): number {
    return this.db.pluck<number>(
      `SELECT COALESCE(SUM(tokens), 0) FROM messages WHERE conversation_id = ?`,
      conversationId
    ) ?? 0;
  }

  /**
   * 检查消息是否存在
   */
  exists(id: string): boolean {
    const count = this.db.pluck<number>(
      `SELECT COUNT(*) FROM messages WHERE id = ?`,
      id
    );
    return (count ?? 0) > 0;
  }

  /**
   * 获取包含工具调用的消息
   */
  findWithToolCalls(conversationId: string): MessageEntity[] {
    const rows = this.db.all<MessageRow>(
      `SELECT * FROM messages 
       WHERE conversation_id = ? AND tool_calls IS NOT NULL 
       ORDER BY created_at ASC`,
      conversationId
    );
    return rows.map(rowToEntity);
  }

  /**
   * 搜索消息内容
   */
  searchContent(query: string, options: { conversationId?: string; limit?: number } = {}): MessageEntity[] {
    const { conversationId, limit = 50 } = options;

    let sql = `SELECT * FROM messages WHERE content LIKE ?`;
    const params: unknown[] = [`%${query}%`];

    if (conversationId) {
      sql += ` AND conversation_id = ?`;
      params.push(conversationId);
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = this.db.all<MessageRow>(sql, ...params);
    return rows.map(rowToEntity);
  }

  // --------------------------------------------------------------------------
  // 上下文管理
  // --------------------------------------------------------------------------

  /**
   * 获取用于 AI 请求的上下文消息
   * 遵循 SC-006: 保持最近20轮对话上下文
   */
  getContextMessages(
    conversationId: string,
    maxTurns: number = 20,
    includeSystemPrompt: boolean = true
  ): MessageEntity[] {
    // 获取对话的系统提示词设置
    let contextLength = maxTurns;
    const conversationRow = this.db.get<{ context_length: number }>(
      `SELECT context_length FROM conversations WHERE id = ?`,
      conversationId
    );
    if (conversationRow) {
      contextLength = conversationRow.context_length;
    }

    const messages = this.findRecentTurns(conversationId, contextLength);

    // 如果不需要系统提示词，过滤掉
    if (!includeSystemPrompt) {
      return messages.filter(m => m.role !== 'system');
    }

    return messages;
  }

  /**
   * 估算消息的 token 数量（简单估算）
   */
  estimateTokens(content: string): number {
    // 简单估算：中文约 1.5 字符/token，英文约 4 字符/token
    // 混合估算使用 2.5 字符/token
    return Math.ceil(content.length / 2.5);
  }

  /**
   * 创建消息并自动估算 token
   */
  createWithTokenEstimate(params: Omit<CreateMessageParams, 'tokens'>): MessageEntity {
    return this.create({
      ...params,
      tokens: this.estimateTokens(params.content),
    });
  }

  // --------------------------------------------------------------------------
  // 批量操作
  // --------------------------------------------------------------------------

  /**
   * 批量删除消息
   */
  deleteMany(ids: string[]): number {
    if (ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(', ');
    const result = this.db.run(
      `DELETE FROM messages WHERE id IN (${placeholders})`,
      ...ids
    );
    return result.changes;
  }

  /**
   * 清理对话中超过指定轮数的旧消息
   */
  cleanupOldMessages(conversationId: string, keepTurns: number = 50): number {
    // 获取需要保留的消息 ID
    const messagesToKeep = this.findRecentTurns(conversationId, keepTurns);
    const keepIds = messagesToKeep.map(m => m.id);

    if (keepIds.length === 0) {
      return 0;
    }

    const placeholders = keepIds.map(() => '?').join(', ');
    const result = this.db.run(
      `DELETE FROM messages WHERE conversation_id = ? AND id NOT IN (${placeholders})`,
      conversationId,
      ...keepIds
    );
    return result.changes;
  }

  /**
   * 导出对话消息（用于备份或迁移）
   */
  exportConversation(conversationId: string): Array<{
    role: MessageRoleType;
    content: string;
    toolCalls?: ToolCall[];
    toolResult?: ToolResult;
    createdAt: string;
  }> {
    const messages = this.findByConversationId(conversationId, { orderDirection: 'ASC' });
    return messages.map(m => ({
      role: m.role,
      content: m.content,
      ...(m.toolCalls && { toolCalls: m.toolCalls }),
      ...(m.toolResult && { toolResult: m.toolResult }),
      createdAt: m.createdAt.toISOString(),
    }));
  }

  /**
   * 导入消息到对话
   */
  importMessages(
    conversationId: string,
    messages: Array<{ role: MessageRoleType; content: string; toolCalls?: ToolCall[]; toolResult?: ToolResult }>
  ): MessageEntity[] {
    return this.createMany(
      messages.map(m => ({
        conversationId,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls ?? null,
        toolResult: m.toolResult ?? null,
      }))
    );
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 MessageModel 实例
 */
export function createMessageModel(database: IDatabaseService): MessageModel {
  return new MessageModel(database);
}

// ============================================================================
// 默认导出
// ============================================================================

export default MessageModel;