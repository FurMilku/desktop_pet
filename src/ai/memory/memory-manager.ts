/**
 * Memory 能力管理器
 * T086: 实现 Memory 管理器
 * 
 * 管理短期记忆（对话上下文）和长期记忆（用户偏好、历史交互）
 * 提供20轮对话上下文保持能力
 */

import { IDatabaseService, generateUUID, now, timestampToDate } from '../../shared/services/database';
import { ChatMessage } from '../chat/chat-manager';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 记忆类型
 */
export type MemoryType = 
  | 'conversation'      // 对话上下文
  | 'user_preference'   // 用户偏好
  | 'interaction'       // 交互历史
  | 'fact'              // 学习到的事实
  | 'skill_usage';      // 技能使用记录

/**
 * 记忆重要性等级
 */
export type MemoryImportance = 'low' | 'medium' | 'high' | 'critical';

/**
 * 记忆条目
 */
export interface MemoryEntry {
  id: string;
  type: MemoryType;
  key: string;
  value: string;
  importance: MemoryImportance;
  accessCount: number;
  lastAccessedAt: Date;
  expiresAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 创建记忆条目输入
 */
export interface CreateMemoryInput {
  type: MemoryType;
  key: string;
  value: string;
  importance?: MemoryImportance;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * 更新记忆条目输入
 */
export interface UpdateMemoryInput {
  value?: string;
  importance?: MemoryImportance;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
}

/**
 * 记忆查询参数
 */
export interface MemoryQueryParams {
  type?: MemoryType;
  keyPattern?: string;
  importance?: MemoryImportance;
  includeExpired?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * 对话上下文选项
 */
export interface ConversationContextOptions {
  /** 最大轮数（默认20） */
  maxTurns?: number;
  /** 是否包含系统消息 */
  includeSystem?: boolean;
  /** 最大 token 数（近似） */
  maxTokens?: number;
}

/**
 * 短期记忆条目（内存中）
 */
interface ShortTermMemoryEntry {
  conversationId: string;
  messages: ChatMessage[];
  lastUpdated: Date;
  metadata: Record<string, unknown>;
}

/**
 * 记忆统计信息
 */
export interface MemoryStats {
  shortTermCount: number;
  longTermCount: number;
  totalAccessCount: number;
  averageImportance: number;
  oldestMemory: Date | null;
  newestMemory: Date | null;
}

/**
 * Memory 管理器接口
 */
export interface IMemoryManager {
  // 短期记忆（对话上下文）
  getConversationContext(conversationId: string, options?: ConversationContextOptions): ChatMessage[];
  addToConversation(conversationId: string, message: ChatMessage): void;
  clearConversation(conversationId: string): void;
  
  // 长期记忆
  store(input: CreateMemoryInput): MemoryEntry;
  retrieve(key: string, type?: MemoryType): MemoryEntry | null;
  update(id: string, input: UpdateMemoryInput): MemoryEntry | null;
  delete(id: string): boolean;
  search(params: MemoryQueryParams): MemoryEntry[];
  
  // 用户偏好快捷方法
  setPreference(key: string, value: unknown): void;
  getPreference<T>(key: string, defaultValue?: T): T | undefined;
  
  // 事实记忆
  learnFact(key: string, fact: string, importance?: MemoryImportance): void;
  recallFact(key: string): string | null;
  
  // 记忆管理
  cleanup(): number;
  getStats(): MemoryStats;
}

// ============================================================================
// 数据库表定义
// ============================================================================

const CREATE_MEMORY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  importance TEXT NOT NULL DEFAULT 'medium',
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at INTEGER NOT NULL,
  expires_at INTEGER,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(type, key)
)`;

const CREATE_MEMORY_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
CREATE INDEX IF NOT EXISTS idx_memories_expires ON memories(expires_at);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
`;

// ============================================================================
// MemoryManager 实现
// ============================================================================

/**
 * Memory 能力管理器
 * 管理短期记忆（内存）和长期记忆（数据库）
 */
export class MemoryManager implements IMemoryManager {
  /** 短期记忆存储（内存中的对话上下文） */
  private shortTermMemory: Map<string, ShortTermMemoryEntry> = new Map();
  
  /** 默认最大对话轮数 */
  private readonly defaultMaxTurns = 20;
  
  /** 短期记忆过期时间（30分钟） */
  private readonly shortTermExpiry = 30 * 60 * 1000;
  
  /** 是否已初始化 */
  private initialized = false;

  constructor(private db: IDatabaseService) {}

  // --------------------------------------------------------------------------
  // 初始化
  // --------------------------------------------------------------------------

  /**
   * 初始化 Memory 管理器
   * 创建数据库表和索引
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 创建记忆表
    this.db.exec(CREATE_MEMORY_TABLE_SQL);
    this.db.exec(CREATE_MEMORY_INDEX_SQL);
    
    // 清理过期记忆
    this.cleanup();
    
    this.initialized = true;
  }

  // --------------------------------------------------------------------------
  // 短期记忆（对话上下文）
  // --------------------------------------------------------------------------

  /**
   * 获取对话上下文
   * 实现20轮对话保持能力
   */
  getConversationContext(
    conversationId: string, 
    options: ConversationContextOptions = {}
  ): ChatMessage[] {
    const {
      maxTurns = this.defaultMaxTurns,
      includeSystem = true,
      maxTokens,
    } = options;

    const entry = this.shortTermMemory.get(conversationId);
    if (!entry) {
      return [];
    }

    // 更新最后访问时间
    entry.lastUpdated = new Date();

    let messages = [...entry.messages];

    // 过滤系统消息（如果不需要）
    if (!includeSystem) {
      messages = messages.filter(m => m.role !== 'system');
    }

    // 分离系统消息和对话消息
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // 计算轮数（一轮 = 用户消息 + 助手回复）
    // 从后往前保留最近的对话轮
    let keptMessages: ChatMessage[] = [];
    let turnCount = 0;
    
    for (let i = conversationMessages.length - 1; i >= 0 && turnCount < maxTurns; i--) {
      const msg = conversationMessages[i];
      keptMessages.unshift(msg);
      
      // 用户消息计为新的一轮开始
      if (msg.role === 'user') {
        turnCount++;
      }
    }

    // 如果有 token 限制，进一步裁剪
    if (maxTokens) {
      keptMessages = this.trimToTokenLimit(keptMessages, maxTokens);
    }

    // 合并系统消息和保留的对话消息
    return [...systemMessages, ...keptMessages];
  }

  /**
   * 添加消息到对话上下文
   */
  addToConversation(conversationId: string, message: ChatMessage): void {
    let entry = this.shortTermMemory.get(conversationId);
    
    if (!entry) {
      entry = {
        conversationId,
        messages: [],
        lastUpdated: new Date(),
        metadata: {},
      };
      this.shortTermMemory.set(conversationId, entry);
    }

    entry.messages.push(message);
    entry.lastUpdated = new Date();

    // 自动清理过期的短期记忆
    this.cleanupShortTermMemory();
  }

  /**
   * 清除对话上下文
   */
  clearConversation(conversationId: string): void {
    this.shortTermMemory.delete(conversationId);
  }

  /**
   * 批量添加消息到对话（用于恢复上下文）
   */
  setConversationMessages(conversationId: string, messages: ChatMessage[]): void {
    this.shortTermMemory.set(conversationId, {
      conversationId,
      messages: [...messages],
      lastUpdated: new Date(),
      metadata: {},
    });
  }

  // --------------------------------------------------------------------------
  // 长期记忆（数据库存储）
  // --------------------------------------------------------------------------

  /**
   * 存储记忆条目
   */
  store(input: CreateMemoryInput): MemoryEntry {
    const id = generateUUID();
    const timestamp = now();
    const importance = input.importance || 'medium';
    const metadata = input.metadata ? JSON.stringify(input.metadata) : null;
    const expiresAt = input.expiresAt ? input.expiresAt.getTime() : null;

    // 使用 INSERT OR REPLACE 处理重复键
    this.db.run(`
      INSERT OR REPLACE INTO memories 
      (id, type, key, value, importance, access_count, last_accessed_at, expires_at, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `, id, input.type, input.key, input.value, importance, timestamp, expiresAt, metadata, timestamp, timestamp);

    return this.rowToEntry({
      id,
      type: input.type,
      key: input.key,
      value: input.value,
      importance,
      access_count: 0,
      last_accessed_at: timestamp,
      expires_at: expiresAt,
      metadata,
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  /**
   * 检索记忆条目
   */
  retrieve(key: string, type?: MemoryType): MemoryEntry | null {
    let sql = 'SELECT * FROM memories WHERE key = ?';
    const params: unknown[] = [key];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' AND (expires_at IS NULL OR expires_at > ?)';
    params.push(now());

    const row = this.db.get<MemoryRow>(sql, ...params);
    
    if (!row) {
      return null;
    }

    // 更新访问计数和时间
    this.db.run(`
      UPDATE memories 
      SET access_count = access_count + 1, last_accessed_at = ?, updated_at = ?
      WHERE id = ?
    `, now(), now(), row.id);

    return this.rowToEntry({
      ...row,
      access_count: row.access_count + 1,
      last_accessed_at: now(),
    });
  }

  /**
   * 更新记忆条目
   */
  update(id: string, input: UpdateMemoryInput): MemoryEntry | null {
    const existing = this.db.get<MemoryRow>('SELECT * FROM memories WHERE id = ?', id);
    
    if (!existing) {
      return null;
    }

    const updates: string[] = ['updated_at = ?'];
    const params: unknown[] = [now()];

    if (input.value !== undefined) {
      updates.push('value = ?');
      params.push(input.value);
    }

    if (input.importance !== undefined) {
      updates.push('importance = ?');
      params.push(input.importance);
    }

    if (input.expiresAt !== undefined) {
      updates.push('expires_at = ?');
      params.push(input.expiresAt ? input.expiresAt.getTime() : null);
    }

    if (input.metadata !== undefined) {
      updates.push('metadata = ?');
      params.push(JSON.stringify(input.metadata));
    }

    params.push(id);

    this.db.run(`UPDATE memories SET ${updates.join(', ')} WHERE id = ?`, ...params);

    return this.retrieve(existing.key, existing.type as MemoryType);
  }

  /**
   * 删除记忆条目
   */
  delete(id: string): boolean {
    const result = this.db.run('DELETE FROM memories WHERE id = ?', id);
    return result.changes > 0;
  }

  /**
   * 搜索记忆条目
   */
  search(params: MemoryQueryParams): MemoryEntry[] {
    let sql = 'SELECT * FROM memories WHERE 1=1';
    const queryParams: unknown[] = [];

    if (params.type) {
      sql += ' AND type = ?';
      queryParams.push(params.type);
    }

    if (params.keyPattern) {
      sql += ' AND key LIKE ?';
      queryParams.push(`%${params.keyPattern}%`);
    }

    if (params.importance) {
      sql += ' AND importance = ?';
      queryParams.push(params.importance);
    }

    if (!params.includeExpired) {
      sql += ' AND (expires_at IS NULL OR expires_at > ?)';
      queryParams.push(now());
    }

    sql += ' ORDER BY last_accessed_at DESC';

    if (params.limit) {
      sql += ' LIMIT ?';
      queryParams.push(params.limit);
    }

    if (params.offset) {
      sql += ' OFFSET ?';
      queryParams.push(params.offset);
    }

    const rows = this.db.all<MemoryRow>(sql, ...queryParams);
    return rows.map(row => this.rowToEntry(row));
  }

  // --------------------------------------------------------------------------
  // 用户偏好快捷方法
  // --------------------------------------------------------------------------

  /**
   * 设置用户偏好
   */
  setPreference(key: string, value: unknown): void {
    this.store({
      type: 'user_preference',
      key: `pref:${key}`,
      value: JSON.stringify(value),
      importance: 'high',
    });
  }

  /**
   * 获取用户偏好
   */
  getPreference<T>(key: string, defaultValue?: T): T | undefined {
    const entry = this.retrieve(`pref:${key}`, 'user_preference');
    
    if (!entry) {
      return defaultValue;
    }

    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return defaultValue;
    }
  }

  /**
   * 获取所有用户偏好
   */
  getAllPreferences(): Record<string, unknown> {
    const entries = this.search({
      type: 'user_preference',
      keyPattern: 'pref:',
    });

    const preferences: Record<string, unknown> = {};
    for (const entry of entries) {
      const key = entry.key.replace('pref:', '');
      try {
        preferences[key] = JSON.parse(entry.value);
      } catch {
        preferences[key] = entry.value;
      }
    }

    return preferences;
  }

  // --------------------------------------------------------------------------
  // 事实记忆
  // --------------------------------------------------------------------------

  /**
   * 学习事实
   */
  learnFact(key: string, fact: string, importance: MemoryImportance = 'medium'): void {
    this.store({
      type: 'fact',
      key: `fact:${key}`,
      value: fact,
      importance,
    });
  }

  /**
   * 回忆事实
   */
  recallFact(key: string): string | null {
    const entry = this.retrieve(`fact:${key}`, 'fact');
    return entry?.value || null;
  }

  /**
   * 搜索相关事实
   */
  searchFacts(keyword: string, limit: number = 10): MemoryEntry[] {
    return this.search({
      type: 'fact',
      keyPattern: keyword,
      limit,
    });
  }

  // --------------------------------------------------------------------------
  // 交互历史
  // --------------------------------------------------------------------------

  /**
   * 记录交互
   */
  recordInteraction(action: string, details: Record<string, unknown>): void {
    const key = `interaction:${Date.now()}:${action}`;
    this.store({
      type: 'interaction',
      key,
      value: JSON.stringify(details),
      importance: 'low',
      // 交互历史30天后过期
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      metadata: { action },
    });
  }

  /**
   * 获取最近交互
   */
  getRecentInteractions(limit: number = 20): MemoryEntry[] {
    return this.search({
      type: 'interaction',
      limit,
    });
  }

  // --------------------------------------------------------------------------
  // 技能使用记录
  // --------------------------------------------------------------------------

  /**
   * 记录技能使用
   */
  recordSkillUsage(skillName: string, success: boolean, details?: Record<string, unknown>): void {
    const key = `skill:${skillName}`;
    const existing = this.retrieve(key, 'skill_usage');
    
    const usageData = existing ? JSON.parse(existing.value) : {
      totalUses: 0,
      successCount: 0,
      failureCount: 0,
      lastUsed: null,
    };

    usageData.totalUses++;
    if (success) {
      usageData.successCount++;
    } else {
      usageData.failureCount++;
    }
    usageData.lastUsed = new Date().toISOString();
    usageData.lastDetails = details;

    this.store({
      type: 'skill_usage',
      key,
      value: JSON.stringify(usageData),
      importance: 'medium',
    });
  }

  /**
   * 获取技能使用统计
   */
  getSkillUsageStats(skillName: string): Record<string, unknown> | null {
    const entry = this.retrieve(`skill:${skillName}`, 'skill_usage');
    if (!entry) {
      return null;
    }
    
    try {
      return JSON.parse(entry.value);
    } catch {
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // 记忆管理
  // --------------------------------------------------------------------------

  /**
   * 清理过期记忆
   * @returns 清理的记忆条目数量
   */
  cleanup(): number {
    // 清理过期的长期记忆
    const result = this.db.run(
      'DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < ?',
      now()
    );

    // 清理短期记忆
    this.cleanupShortTermMemory();

    return result.changes;
  }

  /**
   * 获取记忆统计信息
   */
  getStats(): MemoryStats {
    // 短期记忆统计
    const shortTermCount = this.shortTermMemory.size;

    // 长期记忆统计
    const stats = this.db.get<{
      count: number;
      total_access: number;
      oldest: number | null;
      newest: number | null;
    }>(`
      SELECT 
        COUNT(*) as count,
        SUM(access_count) as total_access,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM memories
      WHERE expires_at IS NULL OR expires_at > ?
    `, now());

    // 计算平均重要性
    const importanceStats = this.db.get<{ avg_importance: number }>(`
      SELECT 
        AVG(CASE 
          WHEN importance = 'critical' THEN 4
          WHEN importance = 'high' THEN 3
          WHEN importance = 'medium' THEN 2
          ELSE 1
        END) as avg_importance
      FROM memories
      WHERE expires_at IS NULL OR expires_at > ?
    `, now());

    return {
      shortTermCount,
      longTermCount: stats?.count || 0,
      totalAccessCount: stats?.total_access || 0,
      averageImportance: importanceStats?.avg_importance || 0,
      oldestMemory: stats?.oldest ? timestampToDate(stats.oldest) : null,
      newestMemory: stats?.newest ? timestampToDate(stats.newest) : null,
    };
  }

  /**
   * 导出所有记忆（用于备份）
   */
  exportMemories(): { shortTerm: ShortTermMemoryEntry[]; longTerm: MemoryEntry[] } {
    const shortTerm = Array.from(this.shortTermMemory.values());
    const longTerm = this.search({ includeExpired: false, limit: 10000 });
    
    return { shortTerm, longTerm };
  }

  /**
   * 导入记忆（用于恢复）
   */
  importMemories(data: { shortTerm?: ShortTermMemoryEntry[]; longTerm?: MemoryEntry[] }): void {
    // 导入短期记忆
    if (data.shortTerm) {
      for (const entry of data.shortTerm) {
        this.shortTermMemory.set(entry.conversationId, entry);
      }
    }

    // 导入长期记忆
    if (data.longTerm) {
      for (const entry of data.longTerm) {
        this.store({
          type: entry.type,
          key: entry.key,
          value: entry.value,
          importance: entry.importance,
          expiresAt: entry.expiresAt || undefined,
          metadata: entry.metadata || undefined,
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 私有方法
  // --------------------------------------------------------------------------

  /**
   * 清理过期的短期记忆
   */
  private cleanupShortTermMemory(): void {
    const expiryTime = Date.now() - this.shortTermExpiry;
    
    for (const [conversationId, entry] of this.shortTermMemory) {
      if (entry.lastUpdated.getTime() < expiryTime) {
        this.shortTermMemory.delete(conversationId);
      }
    }
  }

  /**
   * 根据 token 限制裁剪消息
   * 使用简单的字符计数估算（约4字符 = 1 token）
   */
  private trimToTokenLimit(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
    const CHARS_PER_TOKEN = 4;
    let totalChars = 0;
    const result: ChatMessage[] = [];

    // 从后往前添加消息，确保保留最新的对话
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgChars = msg.content.length + (msg.role.length * 2);
      
      if (totalChars + msgChars > maxTokens * CHARS_PER_TOKEN) {
        break;
      }
      
      totalChars += msgChars;
      result.unshift(msg);
    }

    return result;
  }

  /**
   * 数据库行转记忆条目
   */
  private rowToEntry(row: MemoryRow): MemoryEntry {
    return {
      id: row.id,
      type: row.type as MemoryType,
      key: row.key,
      value: row.value,
      importance: row.importance as MemoryImportance,
      accessCount: row.access_count,
      lastAccessedAt: timestampToDate(row.last_accessed_at) || new Date(),
      expiresAt: row.expires_at ? timestampToDate(row.expires_at) : null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: timestampToDate(row.created_at) || new Date(),
      updatedAt: timestampToDate(row.updated_at) || new Date(),
    };
  }
}

// ============================================================================
// 内部类型
// ============================================================================

/**
 * 数据库行类型
 */
interface MemoryRow {
  id: string;
  type: string;
  key: string;
  value: string;
  importance: string;
  access_count: number;
  last_accessed_at: number;
  expires_at: number | null;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 MemoryManager 实例
 */
export function createMemoryManager(db: IDatabaseService): MemoryManager {
  return new MemoryManager(db);
}

/**
 * 全局 MemoryManager 实例
 */
let globalMemoryManager: MemoryManager | null = null;

/**
 * 获取全局 MemoryManager 实例
 */
export function getGlobalMemoryManager(db: IDatabaseService): MemoryManager {
  if (!globalMemoryManager) {
    globalMemoryManager = new MemoryManager(db);
  }
  return globalMemoryManager;
}

/**
 * 重置全局 MemoryManager（用于测试）
 */
export function resetGlobalMemoryManager(): void {
  globalMemoryManager = null;
}