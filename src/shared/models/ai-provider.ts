/**
 * AIProvider 实体数据访问层
 * T051: 创建 AIProvider 实体数据访问层
 * 
 * 提供 AI 提供商配置的 CRUD 操作
 * API密钥通过 keytar 存储在系统凭证管理器中
 */

import {
  IDatabaseService,
  generateUUID,
  now,
  timestampToDate,
} from '../services/database';
import {
  AIProvider,
  AIProviderType,
  AIProviderStatus,
  CreateAIProviderInput,
  UpdateAIProviderInput,
} from '../types/models';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 数据库行类型（snake_case）
 */
interface AIProviderRow {
  id: string;
  name: string;
  type: string;
  model: string;
  base_url: string | null;
  is_local: number;
  max_tokens: number;
  temperature: number;
  priority: number;
  enabled: number;
  status: string;
  last_used_at: number | null;
  config: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * 扩展的 AIProvider 实体（包含数据模型中的额外字段）
 */
export interface AIProviderEntity extends AIProvider {
  /** 模型名称 */
  model: string;
  /** 是否为本地模型 */
  isLocal: boolean;
  /** 最大输出token数 */
  maxTokens: number;
  /** 温度参数 */
  temperature: number;
  /** 降级优先级（数字越小优先级越高） */
  priority: number;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 创建 AIProvider 输入参数（扩展）
 */
export interface CreateAIProviderEntityInput extends CreateAIProviderInput {
  model?: string;
  isLocal?: boolean;
  maxTokens?: number;
  temperature?: number;
  priority?: number;
  enabled?: boolean;
}

/**
 * 更新 AIProvider 输入参数（扩展）
 */
export interface UpdateAIProviderEntityInput extends UpdateAIProviderInput {
  model?: string;
  isLocal?: boolean;
  maxTokens?: number;
  temperature?: number;
  priority?: number;
  enabled?: boolean;
}

/**
 * AIProvider 查询过滤器
 */
export interface AIProviderFilter {
  type?: AIProviderType;
  status?: AIProviderStatus;
  enabled?: boolean;
  isLocal?: boolean;
  isDefault?: boolean;
}

// ============================================================================
// 数据转换函数
// ============================================================================

/**
 * 数据库行转实体对象
 */
function rowToEntity(row: AIProviderRow): AIProviderEntity {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AIProviderType,
    baseUrl: row.base_url,
    modelId: row.model, // 兼容 models.ts 中的 modelId
    model: row.model,
    isLocal: row.is_local === 1,
    maxTokens: row.max_tokens,
    temperature: row.temperature,
    priority: row.priority,
    enabled: row.enabled === 1,
    isDefault: row.priority === 0, // priority 0 表示默认
    status: row.status as AIProviderStatus,
    lastUsedAt: timestampToDate(row.last_used_at),
    config: row.config,
    createdAt: timestampToDate(row.created_at)!,
    updatedAt: timestampToDate(row.updated_at)!,
  };
}

/**
 * 实体对象转数据库行（部分字段）
 */
function entityToRow(
  entity: Partial<CreateAIProviderEntityInput & UpdateAIProviderEntityInput>
): Partial<AIProviderRow> {
  const row: Partial<AIProviderRow> = {};

  if (entity.name !== undefined) row.name = entity.name;
  if (entity.type !== undefined) row.type = entity.type;
  if (entity.modelId !== undefined) row.model = entity.modelId;
  if (entity.model !== undefined) row.model = entity.model;
  if (entity.baseUrl !== undefined) row.base_url = entity.baseUrl;
  if (entity.isLocal !== undefined) row.is_local = entity.isLocal ? 1 : 0;
  if (entity.maxTokens !== undefined) row.max_tokens = entity.maxTokens;
  if (entity.temperature !== undefined) row.temperature = entity.temperature;
  if (entity.priority !== undefined) row.priority = entity.priority;
  if (entity.enabled !== undefined) row.enabled = entity.enabled ? 1 : 0;
  if (entity.status !== undefined) row.status = entity.status;
  if (entity.config !== undefined) {
    row.config = typeof entity.config === 'string' 
      ? entity.config 
      : JSON.stringify(entity.config);
  }

  return row;
}

// ============================================================================
// AIProviderModel 类
// ============================================================================

/**
 * AIProvider 数据模型
 * 提供 AI 提供商配置的 CRUD 操作
 */
export class AIProviderModel {
  constructor(private db: IDatabaseService) {}

  // --------------------------------------------------------------------------
  // 创建操作
  // --------------------------------------------------------------------------

  /**
   * 创建新的 AI 提供商
   * @param input 创建参数
   * @returns 创建的提供商实体
   */
  create(input: CreateAIProviderEntityInput): AIProviderEntity {
    const id = input.name.toLowerCase().replace(/\s+/g, '-') + '-' + generateUUID().slice(0, 8);
    const timestamp = now();

    const sql = `
      INSERT INTO ai_providers (
        id, name, type, model, base_url, is_local, max_tokens, 
        temperature, priority, enabled, status, config, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.db.run(
      sql,
      id,
      input.name,
      input.type,
      input.modelId || input.model || '',
      input.baseUrl || null,
      input.isLocal ? 1 : 0,
      input.maxTokens ?? 4096,
      input.temperature ?? 0.7,
      input.priority ?? 100, // 默认低优先级
      input.enabled !== false ? 1 : 0,
      'inactive',
      input.config ? JSON.stringify(input.config) : null,
      timestamp,
      timestamp
    );

    return this.findById(id)!;
  }

  /**
   * 创建预置的 AI 提供商配置
   * @param presets 预置配置数组
   */
  createPresets(presets: Array<{
    id: string;
    name: string;
    type: AIProviderType;
    model: string;
    isLocal?: boolean;
    priority?: number;
    baseUrl?: string;
  }>): void {
    const timestamp = now();
    const sql = `
      INSERT OR IGNORE INTO ai_providers (
        id, name, type, model, base_url, is_local, max_tokens, 
        temperature, priority, enabled, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.db.transaction(() => {
      for (const preset of presets) {
        this.db.run(
          sql,
          preset.id,
          preset.name,
          preset.type,
          preset.model,
          preset.baseUrl || null,
          preset.isLocal ? 1 : 0,
          4096,
          0.7,
          preset.priority ?? 0,
          1, // enabled
          'inactive',
          timestamp,
          timestamp
        );
      }
    });
  }

  // --------------------------------------------------------------------------
  // 查询操作
  // --------------------------------------------------------------------------

  /**
   * 根据 ID 查找提供商
   * @param id 提供商 ID
   * @returns 提供商实体或 undefined
   */
  findById(id: string): AIProviderEntity | undefined {
    const sql = 'SELECT * FROM ai_providers WHERE id = ?';
    const row = this.db.get<AIProviderRow>(sql, id);
    return row ? rowToEntity(row) : undefined;
  }

  /**
   * 查找所有提供商
   * @param filter 可选过滤条件
   * @returns 提供商数组
   */
  findAll(filter?: AIProviderFilter): AIProviderEntity[] {
    let sql = 'SELECT * FROM ai_providers WHERE 1=1';
    const params: unknown[] = [];

    if (filter?.type !== undefined) {
      sql += ' AND type = ?';
      params.push(filter.type);
    }
    if (filter?.status !== undefined) {
      sql += ' AND status = ?';
      params.push(filter.status);
    }
    if (filter?.enabled !== undefined) {
      sql += ' AND enabled = ?';
      params.push(filter.enabled ? 1 : 0);
    }
    if (filter?.isLocal !== undefined) {
      sql += ' AND is_local = ?';
      params.push(filter.isLocal ? 1 : 0);
    }

    sql += ' ORDER BY priority ASC, name ASC';

    const rows = this.db.all<AIProviderRow>(sql, ...params);
    return rows.map(rowToEntity);
  }

  /**
   * 查找所有启用的提供商（按优先级排序）
   * @returns 启用的提供商数组
   */
  findEnabled(): AIProviderEntity[] {
    const sql = `
      SELECT * FROM ai_providers 
      WHERE enabled = 1 
      ORDER BY priority ASC
    `;
    const rows = this.db.all<AIProviderRow>(sql);
    return rows.map(rowToEntity);
  }

  /**
   * 查找默认提供商（优先级最高的启用提供商）
   * @returns 默认提供商或 undefined
   */
  findDefault(): AIProviderEntity | undefined {
    const sql = `
      SELECT * FROM ai_providers 
      WHERE enabled = 1 
      ORDER BY priority ASC 
      LIMIT 1
    `;
    const row = this.db.get<AIProviderRow>(sql);
    return row ? rowToEntity(row) : undefined;
  }

  /**
   * 根据类型查找提供商
   * @param type 提供商类型
   * @returns 提供商数组
   */
  findByType(type: AIProviderType): AIProviderEntity[] {
    const sql = `
      SELECT * FROM ai_providers 
      WHERE type = ? 
      ORDER BY priority ASC
    `;
    const rows = this.db.all<AIProviderRow>(sql, type);
    return rows.map(rowToEntity);
  }

  /**
   * 查找本地提供商
   * @returns 本地提供商数组
   */
  findLocal(): AIProviderEntity[] {
    const sql = `
      SELECT * FROM ai_providers 
      WHERE is_local = 1 AND enabled = 1
      ORDER BY priority ASC
    `;
    const rows = this.db.all<AIProviderRow>(sql);
    return rows.map(rowToEntity);
  }

  /**
   * 查找云端提供商
   * @returns 云端提供商数组
   */
  findCloud(): AIProviderEntity[] {
    const sql = `
      SELECT * FROM ai_providers 
      WHERE is_local = 0 AND enabled = 1
      ORDER BY priority ASC
    `;
    const rows = this.db.all<AIProviderRow>(sql);
    return rows.map(rowToEntity);
  }

  /**
   * 获取提供商数量
   * @param filter 可选过滤条件
   * @returns 数量
   */
  count(filter?: AIProviderFilter): number {
    let sql = 'SELECT COUNT(*) FROM ai_providers WHERE 1=1';
    const params: unknown[] = [];

    if (filter?.type !== undefined) {
      sql += ' AND type = ?';
      params.push(filter.type);
    }
    if (filter?.enabled !== undefined) {
      sql += ' AND enabled = ?';
      params.push(filter.enabled ? 1 : 0);
    }

    return this.db.pluck<number>(sql, ...params) || 0;
  }

  // --------------------------------------------------------------------------
  // 更新操作
  // --------------------------------------------------------------------------

  /**
   * 更新提供商
   * @param id 提供商 ID
   * @param input 更新参数
   * @returns 更新后的实体或 undefined
   */
  update(id: string, input: UpdateAIProviderEntityInput): AIProviderEntity | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;

    const row = entityToRow(input);
    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const [key, value] of Object.entries(row)) {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }

    if (setClauses.length === 0) {
      return existing;
    }

    setClauses.push('updated_at = ?');
    params.push(now());
    params.push(id);

    const sql = `UPDATE ai_providers SET ${setClauses.join(', ')} WHERE id = ?`;
    this.db.run(sql, ...params);

    return this.findById(id);
  }

  /**
   * 更新提供商状态
   * @param id 提供商 ID
   * @param status 新状态
   */
  updateStatus(id: string, status: AIProviderStatus): void {
    const sql = 'UPDATE ai_providers SET status = ?, updated_at = ? WHERE id = ?';
    this.db.run(sql, status, now(), id);
  }

  /**
   * 记录提供商最后使用时间
   * @param id 提供商 ID
   */
  recordUsage(id: string): void {
    const timestamp = now();
    const sql = `
      UPDATE ai_providers 
      SET last_used_at = ?, status = 'active', updated_at = ? 
      WHERE id = ?
    `;
    this.db.run(sql, timestamp, timestamp, id);
  }

  /**
   * 设置默认提供商
   * @param id 提供商 ID
   */
  setDefault(id: string): void {
    this.db.transaction(() => {
      // 将所有提供商优先级设为非零
      this.db.run(`
        UPDATE ai_providers 
        SET priority = priority + 1, updated_at = ? 
        WHERE priority = 0
      `, now());

      // 将指定提供商设为最高优先级
      this.db.run(`
        UPDATE ai_providers 
        SET priority = 0, updated_at = ? 
        WHERE id = ?
      `, now(), id);
    });
  }

  /**
   * 启用提供商
   * @param id 提供商 ID
   */
  enable(id: string): void {
    const sql = 'UPDATE ai_providers SET enabled = 1, updated_at = ? WHERE id = ?';
    this.db.run(sql, now(), id);
  }

  /**
   * 禁用提供商
   * @param id 提供商 ID
   */
  disable(id: string): void {
    const sql = 'UPDATE ai_providers SET enabled = 0, status = ?, updated_at = ? WHERE id = ?';
    this.db.run(sql, 'inactive', now(), id);
  }

  /**
   * 更新提供商优先级
   * @param id 提供商 ID
   * @param priority 新优先级
   */
  updatePriority(id: string, priority: number): void {
    const sql = 'UPDATE ai_providers SET priority = ?, updated_at = ? WHERE id = ?';
    this.db.run(sql, priority, now(), id);
  }

  // --------------------------------------------------------------------------
  // 删除操作
  // --------------------------------------------------------------------------

  /**
   * 删除提供商
   * @param id 提供商 ID
   * @returns 是否删除成功
   */
  delete(id: string): boolean {
    const sql = 'DELETE FROM ai_providers WHERE id = ?';
    const result = this.db.run(sql, id);
    return result.changes > 0;
  }

  /**
   * 删除所有自定义提供商（保留预置）
   * @param presetIds 预置提供商 ID 列表
   */
  deleteCustom(presetIds: string[]): void {
    if (presetIds.length === 0) return;

    const placeholders = presetIds.map(() => '?').join(', ');
    const sql = `DELETE FROM ai_providers WHERE id NOT IN (${placeholders})`;
    this.db.run(sql, ...presetIds);
  }

  // --------------------------------------------------------------------------
  // 降级策略相关
  // --------------------------------------------------------------------------

  /**
   * 获取下一个可用的提供商（用于降级）
   * @param excludeIds 排除的提供商 ID 列表
   * @returns 下一个可用的提供商或 undefined
   */
  getNextAvailable(excludeIds: string[] = []): AIProviderEntity | undefined {
    let sql = `
      SELECT * FROM ai_providers 
      WHERE enabled = 1 AND status != 'error'
    `;
    const params: unknown[] = [];

    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(', ');
      sql += ` AND id NOT IN (${placeholders})`;
      params.push(...excludeIds);
    }

    sql += ' ORDER BY priority ASC LIMIT 1';

    const row = this.db.get<AIProviderRow>(sql, ...params);
    return row ? rowToEntity(row) : undefined;
  }

  /**
   * 获取降级序列（按优先级排序的可用提供商列表）
   * @param preferLocal 是否优先本地提供商
   * @returns 提供商数组
   */
  getFallbackSequence(preferLocal: boolean = false): AIProviderEntity[] {
    let sql: string;
    
    if (preferLocal) {
      // 本地优先：先本地后云端
      sql = `
        SELECT * FROM ai_providers 
        WHERE enabled = 1 AND status != 'error'
        ORDER BY is_local DESC, priority ASC
      `;
    } else {
      // 云端优先：按优先级排序
      sql = `
        SELECT * FROM ai_providers 
        WHERE enabled = 1 AND status != 'error'
        ORDER BY priority ASC
      `;
    }

    const rows = this.db.all<AIProviderRow>(sql);
    return rows.map(rowToEntity);
  }

  /**
   * 标记提供商为错误状态
   * @param id 提供商 ID
   * @param errorMessage 错误信息（存储在 config 中）
   */
  markError(id: string, errorMessage?: string): void {
    const timestamp = now();
    const existing = this.findById(id);
    
    let config = existing?.config ? JSON.parse(existing.config) : {};
    config.lastError = errorMessage;
    config.lastErrorAt = new Date().toISOString();

    const sql = `
      UPDATE ai_providers 
      SET status = 'error', config = ?, updated_at = ? 
      WHERE id = ?
    `;
    this.db.run(sql, JSON.stringify(config), timestamp, id);
  }

  /**
   * 清除提供商错误状态
   * @param id 提供商 ID
   */
  clearError(id: string): void {
    const existing = this.findById(id);
    
    let config = existing?.config ? JSON.parse(existing.config) : {};
    delete config.lastError;
    delete config.lastErrorAt;

    const sql = `
      UPDATE ai_providers 
      SET status = 'inactive', config = ?, updated_at = ? 
      WHERE id = ?
    `;
    this.db.run(sql, JSON.stringify(config), now(), id);
  }

  /**
   * 重置所有提供商状态为非活跃
   * 通常在应用启动时调用
   */
  resetAllStatus(): void {
    const sql = `
      UPDATE ai_providers 
      SET status = 'inactive', updated_at = ? 
      WHERE status = 'active'
    `;
    this.db.run(sql, now());
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 AIProviderModel 实例
 * @param db 数据库服务
 * @returns AIProviderModel 实例
 */
export function createAIProviderModel(db: IDatabaseService): AIProviderModel {
  return new AIProviderModel(db);
}

// ============================================================================
// 预置提供商配置
// ============================================================================

/**
 * 默认预置提供商
 */
export const DEFAULT_PROVIDERS = [
  {
    id: 'openai-gpt4',
    name: 'OpenAI GPT-4',
    type: 'openai' as AIProviderType,
    model: 'gpt-4-turbo',
    isLocal: false,
    priority: 1,
  },
  {
    id: 'claude-sonnet',
    name: 'Claude 3.5 Sonnet',
    type: 'claude' as AIProviderType,
    model: 'claude-3-5-sonnet-20241022',
    isLocal: false,
    priority: 2,
  },
  {
    id: 'ollama-llama',
    name: 'Ollama Llama',
    type: 'ollama' as AIProviderType,
    model: 'llama3.2',
    isLocal: true,
    priority: 10,
    baseUrl: 'http://localhost:11434',
  },
];