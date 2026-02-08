/**
 * PetSkin 实体数据访问层
 * T034: 创建 PetSkin 实体数据访问层
 * 
 * 提供 PetSkin 实体的 CRUD 操作和数据库访问方法
 */

import {
  PetSkin,
  CreatePetSkinInput,
  SkinSource,
} from '../types/models';
import {
  DatabaseService,
  getGlobalDatabaseService,
  generateUUID,
  now,
  timestampToDate,
} from '../services/database';

// ============================================================================
// 常量定义
// ============================================================================

/** 默认皮肤名称 */
export const DEFAULT_SKIN_NAME = 'Default Pet';

/** 默认模型路径 */
export const DEFAULT_MODEL_PATH = 'assets/models/default-pet.glb';

/** 内置皮肤来源 */
export const BUILTIN_SOURCE: SkinSource = 'builtin';

// ============================================================================
// 数据库行类型
// ============================================================================

/**
 * 数据库中的 PetSkin 行结构
 */
interface PetSkinRow {
  id: string;
  name: string;
  model_path: string;
  thumbnail_path: string | null;
  source: string;
  breed_info: string | null;
  is_default: number; // SQLite 中 boolean 存储为 0/1
  created_at: number; // 时间戳（毫秒）
  updated_at: number;
}

// ============================================================================
// 转换函数
// ============================================================================

/**
 * 将数据库行转换为 PetSkin 实体
 */
function rowToPetSkin(row: PetSkinRow): PetSkin {
  return {
    id: row.id,
    name: row.name,
    modelPath: row.model_path,
    thumbnailPath: row.thumbnail_path,
    source: row.source as SkinSource,
    breedInfo: row.breed_info,
    isDefault: row.is_default === 1,
    createdAt: timestampToDate(row.created_at)!,
    updatedAt: timestampToDate(row.updated_at)!,
  };
}

/**
 * 验证皮肤来源是否有效
 */
export function isValidSkinSource(source: string): source is SkinSource {
  const validSources: SkinSource[] = ['builtin', 'generated', 'imported'];
  return validSources.includes(source as SkinSource);
}

// ============================================================================
// PetSkin 仓库类
// ============================================================================

/**
 * PetSkin 更新输入参数
 */
export interface UpdatePetSkinInput {
  name?: string;
  modelPath?: string;
  thumbnailPath?: string | null;
  source?: SkinSource;
  breedInfo?: string | null;
  isDefault?: boolean;
}

/**
 * PetSkin 实体仓库接口
 */
export interface IPetSkinRepository {
  /** 创建新皮肤 */
  create(input: CreatePetSkinInput): PetSkin;
  
  /** 根据 ID 获取皮肤 */
  findById(id: string): PetSkin | null;
  
  /** 获取所有皮肤 */
  findAll(): PetSkin[];
  
  /** 获取默认皮肤 */
  findDefault(): PetSkin | null;
  
  /** 根据来源获取皮肤列表 */
  findBySource(source: SkinSource): PetSkin[];
  
  /** 更新皮肤 */
  update(id: string, input: UpdatePetSkinInput): PetSkin | null;
  
  /** 设置默认皮肤 */
  setDefault(id: string): PetSkin | null;
  
  /** 删除皮肤 */
  delete(id: string): boolean;
  
  /** 获取皮肤数量 */
  count(): number;
  
  /** 根据来源获取皮肤数量 */
  countBySource(source: SkinSource): number;
  
  /** 检查皮肤是否存在 */
  exists(id: string): boolean;
  
  /** 确保存在默认皮肤 */
  ensureDefaultSkin(): PetSkin;
}

/**
 * PetSkin 实体仓库实现
 */
export class PetSkinRepository implements IPetSkinRepository {
  private db: DatabaseService;

  constructor(db?: DatabaseService) {
    this.db = db || getGlobalDatabaseService();
  }

  /**
   * 创建新皮肤
   */
  create(input: CreatePetSkinInput): PetSkin {
    const id = generateUUID();
    const timestamp = now();
    
    // 验证来源
    if (!isValidSkinSource(input.source)) {
      throw new Error(`Invalid skin source: ${input.source}`);
    }
    
    // 如果设置为默认，先清除其他默认皮肤
    if (input.isDefault) {
      this.clearDefault();
    }
    
    const sql = `
      INSERT INTO pet_skins (
        id, name, model_path, thumbnail_path, source,
        breed_info, is_default, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      id,
      input.name,
      input.modelPath,
      input.thumbnailPath ?? null,
      input.source,
      input.breedInfo ?? null,
      input.isDefault ? 1 : 0,
      timestamp,
      timestamp,
    ];
    
    this.db.run(sql, ...values);
    
    return this.findById(id)!;
  }

  /**
   * 根据 ID 获取皮肤
   */
  findById(id: string): PetSkin | null {
    const sql = 'SELECT * FROM pet_skins WHERE id = ?';
    const row = this.db.get<PetSkinRow>(sql, id);
    return row ? rowToPetSkin(row) : null;
  }

  /**
   * 获取所有皮肤
   */
  findAll(): PetSkin[] {
    const sql = 'SELECT * FROM pet_skins ORDER BY created_at ASC';
    const rows = this.db.all<PetSkinRow>(sql);
    return rows.map(rowToPetSkin);
  }

  /**
   * 获取默认皮肤
   */
  findDefault(): PetSkin | null {
    const sql = 'SELECT * FROM pet_skins WHERE is_default = 1 LIMIT 1';
    const row = this.db.get<PetSkinRow>(sql);
    return row ? rowToPetSkin(row) : null;
  }

  /**
   * 根据来源获取皮肤列表
   */
  findBySource(source: SkinSource): PetSkin[] {
    if (!isValidSkinSource(source)) {
      throw new Error(`Invalid skin source: ${source}`);
    }
    
    const sql = 'SELECT * FROM pet_skins WHERE source = ? ORDER BY created_at ASC';
    const rows = this.db.all<PetSkinRow>(sql, source);
    return rows.map(rowToPetSkin);
  }

  /**
   * 更新皮肤
   */
  update(id: string, input: UpdatePetSkinInput): PetSkin | null {
    // 检查皮肤是否存在
    if (!this.exists(id)) {
      return null;
    }
    
    // 构建动态更新语句
    const updates: string[] = [];
    const values: unknown[] = [];
    
    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    
    if (input.modelPath !== undefined) {
      updates.push('model_path = ?');
      values.push(input.modelPath);
    }
    
    if (input.thumbnailPath !== undefined) {
      updates.push('thumbnail_path = ?');
      values.push(input.thumbnailPath);
    }
    
    if (input.source !== undefined) {
      if (!isValidSkinSource(input.source)) {
        throw new Error(`Invalid skin source: ${input.source}`);
      }
      updates.push('source = ?');
      values.push(input.source);
    }
    
    if (input.breedInfo !== undefined) {
      updates.push('breed_info = ?');
      values.push(input.breedInfo);
    }
    
    if (input.isDefault !== undefined) {
      // 如果设置为默认，先清除其他默认皮肤
      if (input.isDefault) {
        this.clearDefault();
      }
      updates.push('is_default = ?');
      values.push(input.isDefault ? 1 : 0);
    }
    
    // 如果没有要更新的字段，直接返回当前实体
    if (updates.length === 0) {
      return this.findById(id);
    }
    
    // 添加 updated_at
    updates.push('updated_at = ?');
    values.push(now());
    
    // 添加 WHERE 条件的 id
    values.push(id);
    
    const sql = `UPDATE pet_skins SET ${updates.join(', ')} WHERE id = ?`;
    this.db.run(sql, ...values);
    
    return this.findById(id);
  }

  /**
   * 设置默认皮肤
   */
  setDefault(id: string): PetSkin | null {
    // 检查皮肤是否存在
    if (!this.exists(id)) {
      return null;
    }
    
    // 使用事务确保原子性
    return this.db.transaction(() => {
      // 清除现有默认皮肤
      this.clearDefault();
      
      // 设置新的默认皮肤
      const sql = 'UPDATE pet_skins SET is_default = 1, updated_at = ? WHERE id = ?';
      this.db.run(sql, now(), id);
      
      return this.findById(id);
    });
  }

  /**
   * 删除皮肤
   */
  delete(id: string): boolean {
    // 检查是否为默认皮肤
    const skin = this.findById(id);
    if (skin?.isDefault) {
      throw new Error('Cannot delete the default skin');
    }
    
    const sql = 'DELETE FROM pet_skins WHERE id = ?';
    const result = this.db.run(sql, id);
    return result.changes > 0;
  }

  /**
   * 获取皮肤数量
   */
  count(): number {
    const sql = 'SELECT COUNT(*) as count FROM pet_skins';
    const result = this.db.get<{ count: number }>(sql);
    return result?.count ?? 0;
  }

  /**
   * 根据来源获取皮肤数量
   */
  countBySource(source: SkinSource): number {
    if (!isValidSkinSource(source)) {
      throw new Error(`Invalid skin source: ${source}`);
    }
    
    const sql = 'SELECT COUNT(*) as count FROM pet_skins WHERE source = ?';
    const result = this.db.get<{ count: number }>(sql, source);
    return result?.count ?? 0;
  }

  /**
   * 检查皮肤是否存在
   */
  exists(id: string): boolean {
    const sql = 'SELECT 1 FROM pet_skins WHERE id = ? LIMIT 1';
    const result = this.db.get(sql, id);
    return result !== undefined;
  }

  /**
   * 确保存在默认皮肤
   * 如果数据库中没有皮肤，则创建一个默认皮肤
   */
  ensureDefaultSkin(): PetSkin {
    // 先尝试获取默认皮肤
    const defaultSkin = this.findDefault();
    if (defaultSkin) {
      return defaultSkin;
    }
    
    // 如果没有默认皮肤，但有其他皮肤，将第一个设为默认
    const allSkins = this.findAll();
    if (allSkins.length > 0) {
      return this.setDefault(allSkins[0].id)!;
    }
    
    // 没有任何皮肤，创建默认皮肤
    return this.create({
      name: DEFAULT_SKIN_NAME,
      modelPath: DEFAULT_MODEL_PATH,
      source: BUILTIN_SOURCE,
      isDefault: true,
    });
  }

  /**
   * 清除所有默认皮肤标记（内部使用）
   */
  private clearDefault(): void {
    const sql = 'UPDATE pet_skins SET is_default = 0, updated_at = ? WHERE is_default = 1';
    this.db.run(sql, now());
  }
}

// ============================================================================
// 单例与工厂
// ============================================================================

/** 全局 PetSkin 仓库实例 */
let globalPetSkinRepository: PetSkinRepository | null = null;

/**
 * 获取全局 PetSkin 仓库实例
 * @param db 数据库服务（可选）
 */
export function getPetSkinRepository(db?: DatabaseService): PetSkinRepository {
  if (!globalPetSkinRepository) {
    globalPetSkinRepository = new PetSkinRepository(db);
  }
  return globalPetSkinRepository;
}

/**
 * 重置全局 PetSkin 仓库（用于测试）
 */
export function resetPetSkinRepository(): void {
  globalPetSkinRepository = null;
}

/**
 * 创建新的 PetSkin 仓库实例（用于测试或特殊场景）
 */
export function createPetSkinRepository(db: DatabaseService): PetSkinRepository {
  return new PetSkinRepository(db);
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 创建默认皮肤配置
 */
export function createDefaultSkinConfig(): CreatePetSkinInput {
  return {
    name: DEFAULT_SKIN_NAME,
    modelPath: DEFAULT_MODEL_PATH,
    source: BUILTIN_SOURCE,
    isDefault: true,
  };
}

/**
 * 验证 PetSkin 输入参数
 */
export function validatePetSkinInput(input: CreatePetSkinInput | UpdatePetSkinInput): string[] {
  const errors: string[] = [];
  
  // 验证名称
  if ('name' in input && input.name !== undefined) {
    if (typeof input.name !== 'string') {
      errors.push('Name must be a string');
    } else if (input.name.trim().length === 0) {
      errors.push('Name cannot be empty');
    } else if (input.name.length > 100) {
      errors.push('Name must be 100 characters or less');
    }
  }
  
  // 验证模型路径
  if ('modelPath' in input && input.modelPath !== undefined) {
    if (typeof input.modelPath !== 'string') {
      errors.push('Model path must be a string');
    } else if (input.modelPath.trim().length === 0) {
      errors.push('Model path cannot be empty');
    }
  }
  
  // 验证缩略图路径
  if ('thumbnailPath' in input && input.thumbnailPath !== undefined && input.thumbnailPath !== null) {
    if (typeof input.thumbnailPath !== 'string') {
      errors.push('Thumbnail path must be a string');
    }
  }
  
  // 验证来源
  if ('source' in input && input.source !== undefined) {
    if (!isValidSkinSource(input.source)) {
      errors.push(`Invalid skin source: ${input.source}. Must be one of: builtin, generated, imported`);
    }
  }
  
  // 验证品种信息
  if ('breedInfo' in input && input.breedInfo !== undefined && input.breedInfo !== null) {
    if (typeof input.breedInfo !== 'string') {
      errors.push('Breed info must be a string');
    }
    // 验证是否为有效 JSON
    try {
      JSON.parse(input.breedInfo);
    } catch {
      errors.push('Breed info must be valid JSON');
    }
  }
  
  return errors;
}

/**
 * 解析品种信息 JSON
 */
export function parseBreedInfo(breedInfoJson: string | null): Record<string, unknown> | null {
  if (!breedInfoJson) {
    return null;
  }
  
  try {
    return JSON.parse(breedInfoJson);
  } catch {
    return null;
  }
}

/**
 * 序列化品种信息为 JSON
 */
export function serializeBreedInfo(breedInfo: Record<string, unknown> | null): string | null {
  if (!breedInfo) {
    return null;
  }
  
  return JSON.stringify(breedInfo);
}