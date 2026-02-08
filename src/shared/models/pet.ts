/**
 * Pet 实体数据访问层
 * T033: 创建 Pet 实体数据访问层
 * 
 * 提供 Pet 实体的 CRUD 操作和数据库访问方法
 */

import {
  Pet,
  CreatePetInput,
  UpdatePetInput,
  PetAnimationState,
  BaseEntity,
} from '../types/models';
import {
  DatabaseService,
  getGlobalDatabaseService,
  generateUUID,
  now,
  timestampToDate,
  dateToTimestamp,
} from '../services/database';

// ============================================================================
// 常量定义
// ============================================================================

/** 默认宠物名称 */
export const DEFAULT_PET_NAME = 'My Pet';

/** 默认位置 */
export const DEFAULT_POSITION = { x: 100, y: 100 };

/** 默认缩放比例 */
export const DEFAULT_SCALE = 1.0;

/** 默认显示器索引 */
export const DEFAULT_DISPLAY_INDEX = 0;

/** 默认动画状态 */
export const DEFAULT_ANIMATION_STATE: PetAnimationState = 'idle';

// ============================================================================
// 数据库行类型
// ============================================================================

/**
 * 数据库中的 Pet 行结构
 */
interface PetRow {
  id: string;
  name: string;
  current_skin_id: string | null;
  position_x: number;
  position_y: number;
  display_index: number;
  animation_state: string;
  scale: number;
  is_visible: number; // SQLite 中 boolean 存储为 0/1
  created_at: number; // 时间戳（毫秒）
  updated_at: number;
}

// ============================================================================
// 转换函数
// ============================================================================

/**
 * 将数据库行转换为 Pet 实体
 */
function rowToPet(row: PetRow): Pet {
  return {
    id: row.id,
    name: row.name,
    currentSkinId: row.current_skin_id,
    positionX: row.position_x,
    positionY: row.position_y,
    displayIndex: row.display_index,
    animationState: row.animation_state as PetAnimationState,
    scale: row.scale,
    isVisible: row.is_visible === 1,
    createdAt: timestampToDate(row.created_at)!,
    updatedAt: timestampToDate(row.updated_at)!,
  };
}

/**
 * 验证动画状态是否有效
 */
function isValidAnimationState(state: string): state is PetAnimationState {
  const validStates: PetAnimationState[] = [
    'idle', 'thinking', 'happy', 'sad', 'confused',
    'curious', 'drag', 'listening', 'celebrating', 'sleepy',
  ];
  return validStates.includes(state as PetAnimationState);
}

// ============================================================================
// Pet 仓库类
// ============================================================================

/**
 * Pet 实体仓库接口
 */
export interface IPetRepository {
  /** 创建新宠物 */
  create(input: CreatePetInput): Pet;
  
  /** 根据 ID 获取宠物 */
  findById(id: string): Pet | null;
  
  /** 获取所有宠物 */
  findAll(): Pet[];
  
  /** 获取第一个（主）宠物 */
  findFirst(): Pet | null;
  
  /** 更新宠物 */
  update(id: string, input: UpdatePetInput): Pet | null;
  
  /** 更新宠物位置 */
  updatePosition(id: string, x: number, y: number, displayIndex?: number): Pet | null;
  
  /** 更新宠物动画状态 */
  updateAnimationState(id: string, state: PetAnimationState): Pet | null;
  
  /** 更新宠物皮肤 */
  updateSkin(id: string, skinId: string | null): Pet | null;
  
  /** 设置宠物可见性 */
  setVisibility(id: string, isVisible: boolean): Pet | null;
  
  /** 删除宠物 */
  delete(id: string): boolean;
  
  /** 获取宠物数量 */
  count(): number;
  
  /** 检查宠物是否存在 */
  exists(id: string): boolean;
  
  /** 确保存在默认宠物 */
  ensureDefaultPet(): Pet;
}

/**
 * Pet 实体仓库实现
 */
export class PetRepository implements IPetRepository {
  private db: DatabaseService;

  constructor(db?: DatabaseService) {
    this.db = db || getGlobalDatabaseService();
  }

  /**
   * 创建新宠物
   */
  create(input: CreatePetInput): Pet {
    const id = generateUUID();
    const timestamp = now();
    
    const sql = `
      INSERT INTO pets (
        id, name, current_skin_id, position_x, position_y,
        display_index, animation_state, scale, is_visible,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      id,
      input.name,
      null, // current_skin_id 初始为 null
      input.positionX ?? DEFAULT_POSITION.x,
      input.positionY ?? DEFAULT_POSITION.y,
      input.displayIndex ?? DEFAULT_DISPLAY_INDEX,
      DEFAULT_ANIMATION_STATE,
      input.scale ?? DEFAULT_SCALE,
      1, // is_visible 默认为 true
      timestamp,
      timestamp,
    ];
    
    this.db.run(sql, ...values);
    
    return this.findById(id)!;
  }

  /**
   * 根据 ID 获取宠物
   */
  findById(id: string): Pet | null {
    const sql = 'SELECT * FROM pets WHERE id = ?';
    const row = this.db.get<PetRow>(sql, id);
    return row ? rowToPet(row) : null;
  }

  /**
   * 获取所有宠物
   */
  findAll(): Pet[] {
    const sql = 'SELECT * FROM pets ORDER BY created_at ASC';
    const rows = this.db.all<PetRow>(sql);
    return rows.map(rowToPet);
  }

  /**
   * 获取第一个（主）宠物
   */
  findFirst(): Pet | null {
    const sql = 'SELECT * FROM pets ORDER BY created_at ASC LIMIT 1';
    const row = this.db.get<PetRow>(sql);
    return row ? rowToPet(row) : null;
  }

  /**
   * 更新宠物
   */
  update(id: string, input: UpdatePetInput): Pet | null {
    // 检查宠物是否存在
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
    
    if (input.currentSkinId !== undefined) {
      updates.push('current_skin_id = ?');
      values.push(input.currentSkinId);
    }
    
    if (input.positionX !== undefined) {
      updates.push('position_x = ?');
      values.push(input.positionX);
    }
    
    if (input.positionY !== undefined) {
      updates.push('position_y = ?');
      values.push(input.positionY);
    }
    
    if (input.displayIndex !== undefined) {
      updates.push('display_index = ?');
      values.push(input.displayIndex);
    }
    
    if (input.animationState !== undefined) {
      if (!isValidAnimationState(input.animationState)) {
        throw new Error(`Invalid animation state: ${input.animationState}`);
      }
      updates.push('animation_state = ?');
      values.push(input.animationState);
    }
    
    if (input.scale !== undefined) {
      updates.push('scale = ?');
      values.push(input.scale);
    }
    
    if (input.isVisible !== undefined) {
      updates.push('is_visible = ?');
      values.push(input.isVisible ? 1 : 0);
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
    
    const sql = `UPDATE pets SET ${updates.join(', ')} WHERE id = ?`;
    this.db.run(sql, ...values);
    
    return this.findById(id);
  }

  /**
   * 更新宠物位置
   */
  updatePosition(id: string, x: number, y: number, displayIndex?: number): Pet | null {
    const input: UpdatePetInput = {
      positionX: x,
      positionY: y,
    };
    
    if (displayIndex !== undefined) {
      input.displayIndex = displayIndex;
    }
    
    return this.update(id, input);
  }

  /**
   * 更新宠物动画状态
   */
  updateAnimationState(id: string, state: PetAnimationState): Pet | null {
    return this.update(id, { animationState: state });
  }

  /**
   * 更新宠物皮肤
   */
  updateSkin(id: string, skinId: string | null): Pet | null {
    return this.update(id, { currentSkinId: skinId });
  }

  /**
   * 设置宠物可见性
   */
  setVisibility(id: string, isVisible: boolean): Pet | null {
    return this.update(id, { isVisible });
  }

  /**
   * 删除宠物
   */
  delete(id: string): boolean {
    const sql = 'DELETE FROM pets WHERE id = ?';
    const result = this.db.run(sql, id);
    return result.changes > 0;
  }

  /**
   * 获取宠物数量
   */
  count(): number {
    const sql = 'SELECT COUNT(*) as count FROM pets';
    const result = this.db.get<{ count: number }>(sql);
    return result?.count ?? 0;
  }

  /**
   * 检查宠物是否存在
   */
  exists(id: string): boolean {
    const sql = 'SELECT 1 FROM pets WHERE id = ? LIMIT 1';
    const result = this.db.get(sql, id);
    return result !== undefined;
  }

  /**
   * 确保存在默认宠物
   * 如果数据库中没有宠物，则创建一个默认宠物
   */
  ensureDefaultPet(): Pet {
    const existing = this.findFirst();
    if (existing) {
      return existing;
    }
    
    return this.create({
      name: DEFAULT_PET_NAME,
      positionX: DEFAULT_POSITION.x,
      positionY: DEFAULT_POSITION.y,
      displayIndex: DEFAULT_DISPLAY_INDEX,
      scale: DEFAULT_SCALE,
    });
  }
}

// ============================================================================
// 单例与工厂
// ============================================================================

/** 全局 Pet 仓库实例 */
let globalPetRepository: PetRepository | null = null;

/**
 * 获取全局 Pet 仓库实例
 * @param db 数据库服务（可选）
 */
export function getPetRepository(db?: DatabaseService): PetRepository {
  if (!globalPetRepository) {
    globalPetRepository = new PetRepository(db);
  }
  return globalPetRepository;
}

/**
 * 重置全局 Pet 仓库（用于测试）
 */
export function resetPetRepository(): void {
  globalPetRepository = null;
}

/**
 * 创建新的 Pet 仓库实例（用于测试或特殊场景）
 */
export function createPetRepository(db: DatabaseService): PetRepository {
  return new PetRepository(db);
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 创建默认宠物配置
 */
export function createDefaultPetConfig(): CreatePetInput {
  return {
    name: DEFAULT_PET_NAME,
    positionX: DEFAULT_POSITION.x,
    positionY: DEFAULT_POSITION.y,
    displayIndex: DEFAULT_DISPLAY_INDEX,
    scale: DEFAULT_SCALE,
  };
}

/**
 * 验证 Pet 输入参数
 */
export function validatePetInput(input: CreatePetInput | UpdatePetInput): string[] {
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
  
  // 验证位置
  if ('positionX' in input && input.positionX !== undefined) {
    if (typeof input.positionX !== 'number' || isNaN(input.positionX)) {
      errors.push('Position X must be a valid number');
    }
  }
  
  if ('positionY' in input && input.positionY !== undefined) {
    if (typeof input.positionY !== 'number' || isNaN(input.positionY)) {
      errors.push('Position Y must be a valid number');
    }
  }
  
  // 验证缩放
  if ('scale' in input && input.scale !== undefined) {
    if (typeof input.scale !== 'number' || isNaN(input.scale)) {
      errors.push('Scale must be a valid number');
    } else if (input.scale <= 0) {
      errors.push('Scale must be greater than 0');
    } else if (input.scale > 10) {
      errors.push('Scale must be 10 or less');
    }
  }
  
  // 验证显示器索引
  if ('displayIndex' in input && input.displayIndex !== undefined) {
    if (!Number.isInteger(input.displayIndex)) {
      errors.push('Display index must be an integer');
    } else if (input.displayIndex < 0) {
      errors.push('Display index must be 0 or greater');
    }
  }
  
  // 验证动画状态
  if ('animationState' in input && input.animationState !== undefined) {
    if (!isValidAnimationState(input.animationState)) {
      errors.push(`Invalid animation state: ${input.animationState}`);
    }
  }
  
  return errors;
}