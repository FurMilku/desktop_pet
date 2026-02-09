/**
 * 数据库迁移服务
 * T010: 创建数据库 schema 和迁移脚本
 * 
 * 负责：
 * - 数据库 schema 创建和版本管理
 * - 迁移脚本执行
 * - 数据库升级和降级
 */

import { DatabaseService, generateUUID, now, DatabaseError } from './database';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 迁移脚本接口
 */
export interface Migration {
  /** 迁移版本号 */
  version: number;
  /** 迁移描述 */
  description: string;
  /** 升级脚本 */
  up: (db: DatabaseService) => void;
  /** 降级脚本（可选） */
  down?: (db: DatabaseService) => void;
}

/**
 * 迁移状态
 */
export interface MigrationStatus {
  /** 当前数据库版本 */
  currentVersion: number;
  /** 目标版本 */
  targetVersion: number;
  /** 待执行的迁移 */
  pendingMigrations: number[];
  /** 是否需要迁移 */
  needsMigration: boolean;
}

/**
 * 迁移记录
 */
export interface MigrationRecord {
  version: number;
  applied_at: number;
  description: string | null;
}

/**
 * 迁移服务配置
 */
export interface MigrationServiceOptions {
  /** 是否在迁移前自动备份 */
  backupBeforeMigration?: boolean;
  /** 是否允许降级 */
  allowDowngrade?: boolean;
  /** 迁移执行回调 */
  onMigrationStart?: (version: number, description: string) => void;
  /** 迁移完成回调 */
  onMigrationComplete?: (version: number) => void;
  /** 迁移错误回调 */
  onMigrationError?: (version: number, error: Error) => void;
}

// ============================================================================
// 迁移定义
// ============================================================================

/**
 * 所有迁移脚本
 * 按版本号顺序排列
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: '初始化数据库 schema',
    up: (db: DatabaseService) => {
      // 创建版本追踪表
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT
        );
      `);

      // 创建宠物表
      db.exec(`
        CREATE TABLE IF NOT EXISTS pets (
          id TEXT PRIMARY KEY DEFAULT 'default',
          position_x INTEGER NOT NULL DEFAULT 100,
          position_y INTEGER NOT NULL DEFAULT 100,
          position_monitor INTEGER DEFAULT 0,
          current_skin_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (current_skin_id) REFERENCES pet_skins(id) ON DELETE SET NULL
        );
      `);

      // 创建 AI 提供商表
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_providers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('openai', 'claude', 'ollama', 'custom')),
          model TEXT NOT NULL,
          base_url TEXT,
          is_local INTEGER DEFAULT 0,
          max_tokens INTEGER DEFAULT 4096,
          temperature REAL DEFAULT 0.7,
          priority INTEGER DEFAULT 0,
          enabled INTEGER DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_provider_priority ON ai_providers(priority ASC, enabled DESC);
      `);

      // 创建对话表
      db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          title TEXT,
          ai_provider_id TEXT,
          system_prompt TEXT,
          context_length INTEGER DEFAULT 20,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (ai_provider_id) REFERENCES ai_providers(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_conversation_updated ON conversations(updated_at DESC);
      `);

      // 创建消息表
      db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          tokens INTEGER,
          tool_calls TEXT,
          tool_result TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_message_conversation ON messages(conversation_id, created_at ASC);
      `);

      // 创建提醒表
      db.exec(`
        CREATE TABLE IF NOT EXISTS reminders (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          trigger_time INTEGER NOT NULL,
          repeat_rule TEXT,
          repeat_end INTEGER,
          completed INTEGER DEFAULT 0,
          snoozed_until INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reminder_trigger ON reminders(trigger_time ASC) WHERE completed = 0;
        CREATE INDEX IF NOT EXISTS idx_reminder_completed ON reminders(completed, updated_at DESC);
      `);

      // 创建宠物皮肤表
      db.exec(`
        CREATE TABLE IF NOT EXISTS pet_skins (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          source_type TEXT NOT NULL CHECK(source_type IN ('builtin', 'photo', 'imported')),
          original_photo_path TEXT,
          model_path TEXT NOT NULL,
          thumbnail_path TEXT,
          breed TEXT,
          breed_confidence REAL,
          rig_data TEXT,
          animation_mappings TEXT,
          is_active INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      // 创建用户设置表
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    },
    down: (db: DatabaseService) => {
      db.exec(`
        DROP TABLE IF EXISTS settings;
        DROP TABLE IF EXISTS pet_skins;
        DROP TABLE IF EXISTS reminders;
        DROP TABLE IF EXISTS messages;
        DROP TABLE IF EXISTS conversations;
        DROP TABLE IF EXISTS ai_providers;
        DROP TABLE IF EXISTS pets;
        DROP TABLE IF EXISTS schema_version;
      `);
    },
  },
  {
    version: 2,
    description: '添加 ai_providers 缺失的列',
    up: (db: DatabaseService) => {
      // 添加 status 列
      db.exec(`
        ALTER TABLE ai_providers ADD COLUMN status TEXT DEFAULT 'inactive';
      `);
      
      // 添加 last_used_at 列
      db.exec(`
        ALTER TABLE ai_providers ADD COLUMN last_used_at INTEGER;
      `);
      
      // 添加 config 列
      db.exec(`
        ALTER TABLE ai_providers ADD COLUMN config TEXT;
      `);
    },
    down: (db: DatabaseService) => {
      // SQLite 不支持 DROP COLUMN，需要重建表
      // 这里简化处理，降级时不做任何操作
      console.warn('Downgrade from version 2 requires manual table rebuild');
    },
  },
  {
    version: 3,
    description: '插入默认数据',
    up: (db: DatabaseService) => {
      const timestamp = now();

      // 插入默认宠物
      db.run(`
        INSERT OR IGNORE INTO pets (id, position_x, position_y, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?)
      `, 'default', 100, 100, timestamp, timestamp);

      // 插入默认 AI 提供商
      const providers = [
        { id: 'openai-gpt4', name: 'OpenAI GPT-4', type: 'openai', model: 'gpt-4-turbo', isLocal: 0, priority: 1 },
        { id: 'claude-sonnet', name: 'Claude 3.5 Sonnet', type: 'claude', model: 'claude-3-5-sonnet-20241022', isLocal: 0, priority: 2 },
        { id: 'ollama-llama', name: 'Ollama Llama', type: 'ollama', model: 'llama3.2', isLocal: 1, priority: 10 },
      ];

      for (const p of providers) {
        db.run(`
          INSERT OR IGNORE INTO ai_providers (id, name, type, model, is_local, priority, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, p.id, p.name, p.type, p.model, p.isLocal, p.priority, timestamp, timestamp);
      }

      // 插入默认皮肤
      db.run(`
        INSERT OR IGNORE INTO pet_skins (id, name, source_type, model_path, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, 'default-cat', '默认小猫', 'builtin', 'assets/models/default-pet.glb', 1, timestamp, timestamp);

      // 插入默认设置
      const defaultSettings: Array<{ key: string; value: string }> = [
        { key: 'window.alwaysOnTop', value: 'true' },
        { key: 'window.startMinimized', value: 'false' },
        { key: 'window.opacity', value: '1.0' },
        { key: 'pet.idleTimeout', value: '300000' },
        { key: 'pet.animationSpeed', value: '1.0' },
        { key: 'ai.defaultProvider', value: '"openai-gpt4"' },
        { key: 'ai.streamingEnabled', value: 'true' },
        { key: 'chat.mode', value: '"bubble"' },
        { key: 'chat.maxHistory', value: '20' },
        { key: 'voice.enabled', value: 'false' },
        { key: 'voice.autoSpeak', value: 'false' },
        { key: 'voice.language', value: '"zh-CN"' },
        { key: 'system.autoStart', value: 'false' },
        { key: 'system.checkUpdates', value: 'true' },
        { key: 'telemetry.enabled', value: 'true' },
        { key: 'mcp.enabledServers', value: '["system-tools","reminder","notes","weather-api","calendar"]' },
        { key: 'skills.enabledSkills', value: '["weather","reminder","notes","app-launcher","calendar","quick-search"]' },
      ];

      for (const setting of defaultSettings) {
        db.run(`
          INSERT OR IGNORE INTO settings (key, value, updated_at)
          VALUES (?, ?, ?)
        `, setting.key, setting.value, timestamp);
      }
    },
    down: (db: DatabaseService) => {
      db.exec(`
        DELETE FROM settings;
        DELETE FROM pet_skins WHERE id = 'default-cat';
        DELETE FROM ai_providers WHERE id IN ('openai-gpt4', 'claude-sonnet', 'ollama-llama');
        DELETE FROM pets WHERE id = 'default';
      `);
    },
  },
];

/**
 * 获取最新迁移版本号
 */
export function getLatestMigrationVersion(): number {
  if (MIGRATIONS.length === 0) {
    return 0;
  }
  return Math.max(...MIGRATIONS.map(m => m.version));
}

// ============================================================================
// 迁移服务类
// ============================================================================

/**
 * 数据库迁移服务
 */
export class MigrationService {
  private db: DatabaseService;
  private options: Required<MigrationServiceOptions>;

  constructor(db: DatabaseService, options: MigrationServiceOptions = {}) {
    this.db = db;
    this.options = {
      backupBeforeMigration: true,
      allowDowngrade: false,
      onMigrationStart: () => {},
      onMigrationComplete: () => {},
      onMigrationError: () => {},
      ...options,
    };
  }

  /**
   * 获取当前数据库版本
   */
  getCurrentVersion(): number {
    try {
      // 检查 schema_version 表是否存在
      const tableExists = this.db.pluck<number>(`
        SELECT COUNT(*) FROM sqlite_master 
        WHERE type='table' AND name='schema_version'
      `);

      if (!tableExists) {
        return 0;
      }

      // 获取最新版本
      const version = this.db.pluck<number>(`
        SELECT MAX(version) FROM schema_version
      `);

      return version ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * 获取迁移状态
   */
  getStatus(): MigrationStatus {
    const currentVersion = this.getCurrentVersion();
    const targetVersion = getLatestMigrationVersion();

    const pendingMigrations = MIGRATIONS
      .filter(m => m.version > currentVersion)
      .map(m => m.version)
      .sort((a, b) => a - b);

    return {
      currentVersion,
      targetVersion,
      pendingMigrations,
      needsMigration: pendingMigrations.length > 0,
    };
  }

  /**
   * 获取已应用的迁移记录
   */
  getAppliedMigrations(): MigrationRecord[] {
    try {
      const tableExists = this.db.pluck<number>(`
        SELECT COUNT(*) FROM sqlite_master 
        WHERE type='table' AND name='schema_version'
      `);

      if (!tableExists) {
        return [];
      }

      return this.db.all<MigrationRecord>(`
        SELECT version, applied_at, description 
        FROM schema_version 
        ORDER BY version ASC
      `);
    } catch {
      return [];
    }
  }

  /**
   * 执行迁移到最新版本
   */
  migrateToLatest(): void {
    const targetVersion = getLatestMigrationVersion();
    this.migrateTo(targetVersion);
  }

  /**
   * 执行迁移到指定版本
   */
  migrateTo(targetVersion: number): void {
    const currentVersion = this.getCurrentVersion();

    if (targetVersion === currentVersion) {
      return; // 已经是目标版本
    }

    if (targetVersion < currentVersion && !this.options.allowDowngrade) {
      throw new MigrationError(
        `Downgrade not allowed: current=${currentVersion}, target=${targetVersion}`
      );
    }

    // 创建备份
    if (this.options.backupBeforeMigration) {
      try {
        this.db.backup();
      } catch (error) {
        // 备份失败时记录但继续执行
        console.warn('Backup before migration failed:', error);
      }
    }

    if (targetVersion > currentVersion) {
      // 升级
      this.upgrade(currentVersion, targetVersion);
    } else {
      // 降级
      this.downgrade(currentVersion, targetVersion);
    }
  }

  /**
   * 重置数据库（危险操作）
   * 删除所有表并重新创建
   */
  reset(): void {
    // 获取所有降级脚本并按版本倒序执行
    const appliedMigrations = this.getAppliedMigrations();
    const versions = appliedMigrations.map(m => m.version).sort((a, b) => b - a);

    for (const version of versions) {
      const migration = MIGRATIONS.find(m => m.version === version);
      if (migration?.down) {
        migration.down(this.db);
      }
    }

    // 删除版本表
    this.db.exec('DROP TABLE IF EXISTS schema_version');
  }

  /**
   * 初始化数据库
   * 如果是新数据库，创建所有 schema
   * 如果是已有数据库，执行待处理的迁移
   */
  initialize(): void {
    const status = this.getStatus();

    if (status.currentVersion === 0) {
      // 新数据库，执行所有迁移
      this.migrateToLatest();
    } else if (status.needsMigration) {
      // 已有数据库，执行待处理的迁移
      this.migrateToLatest();
    }
    // 否则已经是最新版本，无需操作
  }

  // --------------------------------------------------------------------------
  // 私有方法
  // --------------------------------------------------------------------------

  /**
   * 执行升级迁移
   */
  private upgrade(fromVersion: number, toVersion: number): void {
    const migrationsToRun = MIGRATIONS
      .filter(m => m.version > fromVersion && m.version <= toVersion)
      .sort((a, b) => a.version - b.version);

    for (const migration of migrationsToRun) {
      this.runMigration(migration, 'up');
    }
  }

  /**
   * 执行降级迁移
   */
  private downgrade(fromVersion: number, toVersion: number): void {
    const migrationsToRun = MIGRATIONS
      .filter(m => m.version <= fromVersion && m.version > toVersion && m.down)
      .sort((a, b) => b.version - a.version);

    for (const migration of migrationsToRun) {
      this.runMigration(migration, 'down');
    }
  }

  /**
   * 执行单个迁移
   */
  private runMigration(migration: Migration, direction: 'up' | 'down'): void {
    this.options.onMigrationStart(migration.version, migration.description);

    try {
      // 在事务中执行迁移
      this.db.exclusiveTransaction(() => {
        if (direction === 'up') {
          migration.up(this.db);
          this.recordMigration(migration.version, migration.description);
        } else if (migration.down) {
          migration.down(this.db);
          this.removeMigrationRecord(migration.version);
        }
      });

      this.options.onMigrationComplete(migration.version);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.onMigrationError(migration.version, err);
      throw new MigrationError(
        `Migration ${direction} failed for version ${migration.version}: ${err.message}`,
        migration.version,
        err
      );
    }
  }

  /**
   * 记录迁移版本
   */
  private recordMigration(version: number, description: string): void {
    // 确保 schema_version 表存在
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL,
        description TEXT
      );
    `);

    this.db.run(`
      INSERT INTO schema_version (version, applied_at, description)
      VALUES (?, ?, ?)
    `, version, now(), description);
  }

  /**
   * 移除迁移记录
   */
  private removeMigrationRecord(version: number): void {
    this.db.run('DELETE FROM schema_version WHERE version = ?', version);
  }
}

// ============================================================================
// 错误类
// ============================================================================

/**
 * 迁移错误
 */
export class MigrationError extends Error {
  public readonly version?: number;
  public readonly cause?: Error;

  constructor(message: string, version?: number, cause?: Error) {
    super(message);
    this.name = 'MigrationError';
    this.version = version;
    this.cause = cause;
    Object.setPrototypeOf(this, MigrationError.prototype);
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建迁移服务并初始化数据库
 */
export function initializeDatabase(db: DatabaseService, options?: MigrationServiceOptions): MigrationService {
  const migrationService = new MigrationService(db, options);
  migrationService.initialize();
  return migrationService;
}

/**
 * 检查数据库是否需要迁移
 */
export function checkMigrationNeeded(db: DatabaseService): MigrationStatus {
  const migrationService = new MigrationService(db);
  return migrationService.getStatus();
}

/**
 * 获取数据库 schema 版本信息
 */
export function getSchemaInfo(db: DatabaseService): {
  currentVersion: number;
  latestVersion: number;
  appliedMigrations: MigrationRecord[];
} {
  const migrationService = new MigrationService(db);
  return {
    currentVersion: migrationService.getCurrentVersion(),
    latestVersion: getLatestMigrationVersion(),
    appliedMigrations: migrationService.getAppliedMigrations(),
  };
}

/**
 * 获取当前数据库 schema 版本
 */
export function getCurrentSchemaVersion(db: DatabaseService): number {
  const migrationService = new MigrationService(db);
  return migrationService.getCurrentVersion();
}

/**
 * 执行数据库迁移到最新版本
 */
export function runMigrations(db: DatabaseService, options?: MigrationServiceOptions): void {
  const migrationService = new MigrationService(db, options);
  migrationService.migrateToLatest();
}
