/**
 * T049 [P] [US3] Conversation 实体数据访问层
 *
 * 对话实体的CRUD操作和业务逻辑
 */

import type {
  Conversation,
  CreateConversationInput,
  ConversationQueryParams,
  PaginatedResult,
} from '../types/models';
import { getDatabaseService } from '../services/database';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 数据库中的对话记录格式
 */
interface ConversationRow {
  id: string;
  title: string;
  pet_id: string;
  provider_id: string | null;
  message_count: number;
  last_message_at: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

/**
 * 对话更新输入
 */
export interface UpdateConversationInput {
  title?: string;
  providerId?: string | null;
  messageCount?: number;
  lastMessageAt?: Date | null;
  isArchived?: boolean;
}

/**
 * 对话统计信息
 */
export interface ConversationStats {
  totalConversations: number;
  activeConversations: number;
  archivedConversations: number;
  totalMessages: number;
  averageMessagesPerConversation: number;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 生成唯一ID
 */
function generateId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * 将数据库行转换为 Conversation 对象
 */
function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    petId: row.pet_id,
    providerId: row.provider_id,
    messageCount: row.message_count,
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : null,
    isArchived: row.is_archived === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * 生成默认对话标题
 */
function generateDefaultTitle(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeStr = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `对话 ${dateStr} ${timeStr}`;
}

// ============================================================================
// ConversationModel 类
// ============================================================================

/**
 * 对话数据访问层
 */
export class ConversationModel {
  /**
   * 创建新对话
   */
  async create(input: CreateConversationInput): Promise<Conversation> {
    const db = getDatabaseService();
    const id = generateId();
    const now = new Date().toISOString();
    const title = input.title || generateDefaultTitle();

    await db.run(
      `INSERT INTO conversations (id, title, pet_id, provider_id, message_count, last_message_at, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, NULL, 0, ?, ?)`,
      [id, title, input.petId, input.providerId || null, now, now]
    );

    const conversation = await this.findById(id);
    if (!conversation) {
      throw new Error('Failed to create conversation');
    }

    return conversation;
  }

  /**
   * 根据ID查找对话
   */
  async findById(id: string): Promise<Conversation | null> {
    const db = getDatabaseService();
    const row = await db.get<ConversationRow>(
      'SELECT * FROM conversations WHERE id = ?',
      [id]
    );

    return row ? rowToConversation(row) : null;
  }

  /**
   * 查询对话列表
   */
  async findMany(params: ConversationQueryParams = {}): Promise<PaginatedResult<Conversation>> {
    const db = getDatabaseService();
    const {
      petId,
      isArchived,
      page = 1,
      pageSize = 20,
      sortBy = 'updated_at',
      sortOrder = 'desc',
    } = params;

    // 构建WHERE子句
    const conditions: string[] = [];
    const queryParams: (string | number)[] = [];

    if (petId) {
      conditions.push('pet_id = ?');
      queryParams.push(petId);
    }

    if (isArchived !== undefined) {
      conditions.push('is_archived = ?');
      queryParams.push(isArchived ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 验证排序字段
    const allowedSortFields = ['created_at', 'updated_at', 'title', 'message_count', 'last_message_at'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'updated_at';
    const sortDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // 获取总数
    const countResult = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM conversations ${whereClause}`,
      queryParams
    );
    const total = countResult?.count || 0;

    // 计算分页
    const offset = (page - 1) * pageSize;
    const totalPages = Math.ceil(total / pageSize);

    // 获取数据
    const rows = await db.all<ConversationRow>(
      `SELECT * FROM conversations ${whereClause} ORDER BY ${sortField} ${sortDirection} LIMIT ? OFFSET ?`,
      [...queryParams, pageSize, offset]
    );

    return {
      data: rows.map(rowToConversation),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * 获取宠物的所有对话
   */
  async findByPetId(petId: string, includeArchived = false): Promise<Conversation[]> {
    const db = getDatabaseService();
    let query = 'SELECT * FROM conversations WHERE pet_id = ?';
    const params: (string | number)[] = [petId];

    if (!includeArchived) {
      query += ' AND is_archived = 0';
    }

    query += ' ORDER BY updated_at DESC';

    const rows = await db.all<ConversationRow>(query, params);
    return rows.map(rowToConversation);
  }

  /**
   * 获取最近的对话
   */
  async findRecent(limit = 10, petId?: string): Promise<Conversation[]> {
    const db = getDatabaseService();
    let query = 'SELECT * FROM conversations WHERE is_archived = 0';
    const params: (string | number)[] = [];

    if (petId) {
      query += ' AND pet_id = ?';
      params.push(petId);
    }

    query += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(limit);

    const rows = await db.all<ConversationRow>(query, params);
    return rows.map(rowToConversation);
  }

  /**
   * 更新对话
   */
  async update(id: string, input: UpdateConversationInput): Promise<Conversation | null> {
    const db = getDatabaseService();
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [new Date().toISOString()];

    if (input.title !== undefined) {
      updates.push('title = ?');
      params.push(input.title);
    }

    if (input.providerId !== undefined) {
      updates.push('provider_id = ?');
      params.push(input.providerId);
    }

    if (input.messageCount !== undefined) {
      updates.push('message_count = ?');
      params.push(input.messageCount);
    }

    if (input.lastMessageAt !== undefined) {
      updates.push('last_message_at = ?');
      params.push(input.lastMessageAt ? input.lastMessageAt.toISOString() : null);
    }

    if (input.isArchived !== undefined) {
      updates.push('is_archived = ?');
      params.push(input.isArchived ? 1 : 0);
    }

    params.push(id);

    await db.run(
      `UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return this.findById(id);
  }

  /**
   * 更新对话标题
   */
  async updateTitle(id: string, title: string): Promise<Conversation | null> {
    return this.update(id, { title });
  }

  /**
   * 增加消息计数
   */
  async incrementMessageCount(id: string): Promise<void> {
    const db = getDatabaseService();
    const now = new Date().toISOString();

    await db.run(
      `UPDATE conversations SET message_count = message_count + 1, last_message_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id]
    );
  }

  /**
   * 归档对话
   */
  async archive(id: string): Promise<Conversation | null> {
    return this.update(id, { isArchived: true });
  }

  /**
   * 取消归档对话
   */
  async unarchive(id: string): Promise<Conversation | null> {
    return this.update(id, { isArchived: false });
  }

  /**
   * 删除对话
   */
  async delete(id: string): Promise<boolean> {
    const db = getDatabaseService();
    
    // 先删除关联的消息
    await db.run('DELETE FROM messages WHERE conversation_id = ?', [id]);
    
    // 再删除对话
    const result = await db.run('DELETE FROM conversations WHERE id = ?', [id]);
    return (result?.changes ?? 0) > 0;
  }

  /**
   * 批量删除对话
   */
  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const db = getDatabaseService();
    const placeholders = ids.map(() => '?').join(', ');

    // 先删除关联的消息
    await db.run(
      `DELETE FROM messages WHERE conversation_id IN (${placeholders})`,
      ids
    );

    // 再删除对话
    const result = await db.run(
      `DELETE FROM conversations WHERE id IN (${placeholders})`,
      ids
    );

    return result?.changes ?? 0;
  }

  /**
   * 删除宠物的所有对话
   */
  async deleteByPetId(petId: string): Promise<number> {
    const db = getDatabaseService();

    // 获取所有对话ID
    const conversations = await db.all<{ id: string }>(
      'SELECT id FROM conversations WHERE pet_id = ?',
      [petId]
    );

    if (conversations.length === 0) {
      return 0;
    }

    const ids = conversations.map(c => c.id);
    return this.deleteMany(ids);
  }

  /**
   * 清理旧的已归档对话
   */
  async cleanupOldArchived(olderThanDays = 30): Promise<number> {
    const db = getDatabaseService();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // 获取要删除的对话ID
    const conversations = await db.all<{ id: string }>(
      'SELECT id FROM conversations WHERE is_archived = 1 AND updated_at < ?',
      [cutoffDate.toISOString()]
    );

    if (conversations.length === 0) {
      return 0;
    }

    const ids = conversations.map(c => c.id);
    return this.deleteMany(ids);
  }

  /**
   * 获取对话统计信息
   */
  async getStats(petId?: string): Promise<ConversationStats> {
    const db = getDatabaseService();
    
    let whereClause = '';
    const params: string[] = [];

    if (petId) {
      whereClause = 'WHERE pet_id = ?';
      params.push(petId);
    }

    // 获取对话统计
    const convStats = await db.get<{
      total: number;
      active: number;
      archived: number;
      total_messages: number;
    }>(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_archived = 0 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_archived = 1 THEN 1 ELSE 0 END) as archived,
        SUM(message_count) as total_messages
       FROM conversations ${whereClause}`,
      params
    );

    const total = convStats?.total || 0;
    const totalMessages = convStats?.total_messages || 0;

    return {
      totalConversations: total,
      activeConversations: convStats?.active || 0,
      archivedConversations: convStats?.archived || 0,
      totalMessages,
      averageMessagesPerConversation: total > 0 ? totalMessages / total : 0,
    };
  }

  /**
   * 搜索对话（按标题）
   */
  async search(query: string, petId?: string, limit = 20): Promise<Conversation[]> {
    const db = getDatabaseService();
    const searchPattern = `%${query}%`;
    
    let sql = 'SELECT * FROM conversations WHERE title LIKE ?';
    const params: (string | number)[] = [searchPattern];

    if (petId) {
      sql += ' AND pet_id = ?';
      params.push(petId);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(limit);

    const rows = await db.all<ConversationRow>(sql, params);
    return rows.map(rowToConversation);
  }

  /**
   * 检查对话是否存在
   */
  async exists(id: string): Promise<boolean> {
    const db = getDatabaseService();
    const result = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM conversations WHERE id = ?',
      [id]
    );
    return (result?.count ?? 0) > 0;
  }

  /**
   * 获取对话数量
   */
  async count(petId?: string, includeArchived = false): Promise<number> {
    const db = getDatabaseService();
    
    let query = 'SELECT COUNT(*) as count FROM conversations WHERE 1=1';
    const params: (string | number)[] = [];

    if (petId) {
      query += ' AND pet_id = ?';
      params.push(petId);
    }

    if (!includeArchived) {
      query += ' AND is_archived = 0';
    }

    const result = await db.get<{ count: number }>(query, params);
    return result?.count ?? 0;
  }

  /**
   * 获取或创建默认对话
   */
  async getOrCreateDefault(petId: string, providerId?: string): Promise<Conversation> {
    // 尝试获取最近的未归档对话
    const recent = await this.findRecent(1, petId);
    if (recent.length > 0) {
      return recent[0];
    }

    // 创建新对话
    return this.create({
      petId,
      providerId,
      title: generateDefaultTitle(),
    });
  }
}

// ============================================================================
// 单例导出
// ============================================================================

let conversationModel: ConversationModel | null = null;

/**
 * 获取 ConversationModel 单例
 */
export function getConversationModel(): ConversationModel {
  if (!conversationModel) {
    conversationModel = new ConversationModel();
  }
  return conversationModel;
}

/**
 * 重置 ConversationModel 单例（用于测试）
 */
export function resetConversationModel(): void {
  conversationModel = null;
}

// 默认导出
export default ConversationModel;