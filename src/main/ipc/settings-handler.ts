/**
 * Settings API IPC 处理器
 *
 * 实现设置管理相关的 IPC 通道处理：
 * - settings:get - 获取单个设置值
 * - settings:set - 设置值
 * - settings:get-all - 获取所有设置
 * - settings:reset - 重置设置
 * - settings:changed - 设置变化事件（Main → Renderer）
 *
 * @see contracts/ipc-api.md - Section 5: Settings API
 */

import {
  createModuleHandlers,
  IPCException,
  IPCErrorCodes,
  emitToRenderer,
  validators,
} from '../ipc-handlers';
import { ipcLogger } from '../logger';
import { DatabaseService, getGlobalDatabaseService } from '../../shared/services/database';

// ============================================================================
// Types
// ============================================================================

/**
 * 设置键类型
 * @see contracts/ipc-api.md - SettingKey
 */
export type SettingKey =
  | 'window.alwaysOnTop'
  | 'window.startMinimized'
  | 'window.opacity'
  | 'pet.idleTimeout'
  | 'pet.animationSpeed'
  | 'ai.defaultProvider'
  | 'ai.streamingEnabled'
  | 'chat.mode'
  | 'chat.maxHistory'
  | 'voice.enabled'
  | 'voice.autoSpeak'
  | 'voice.language'
  | 'system.autoStart'
  | 'system.checkUpdates'
  | 'telemetry.enabled'
  | 'mcp.enabledServers'
  | 'skills.enabledSkills';

/**
 * 设置分组结构
 * @see contracts/ipc-api.md - Settings interface
 */
export interface Settings {
  window: {
    alwaysOnTop: boolean;
    startMinimized: boolean;
    opacity: number;
  };
  pet: {
    idleTimeout: number;
    animationSpeed: number;
  };
  ai: {
    defaultProvider: string;
    streamingEnabled: boolean;
  };
  chat: {
    mode: 'bubble' | 'window';
    maxHistory: number;
  };
  voice: {
    enabled: boolean;
    autoSpeak: boolean;
    language: string;
  };
  system: {
    autoStart: boolean;
    checkUpdates: boolean;
  };
  telemetry: {
    enabled: boolean;
  };
  mcp: {
    enabledServers: string[];
  };
  skills: {
    enabledSkills: string[];
  };
}

/**
 * 数据库中的设置记录
 */
interface SettingRecord {
  key: string;
  value: string;
  updated_at: number;
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * 默认设置值
 */
const DEFAULT_SETTINGS: Settings = {
  window: {
    alwaysOnTop: true,
    startMinimized: false,
    opacity: 1.0,
  },
  pet: {
    idleTimeout: 30000, // 30秒
    animationSpeed: 1.0,
  },
  ai: {
    defaultProvider: 'openai',
    streamingEnabled: true,
  },
  chat: {
    mode: 'bubble',
    maxHistory: 20,
  },
  voice: {
    enabled: false,
    autoSpeak: false,
    language: 'zh-CN',
  },
  system: {
    autoStart: false,
    checkUpdates: true,
  },
  telemetry: {
    enabled: false,
  },
  mcp: {
    enabledServers: [],
  },
  skills: {
    enabledSkills: [],
  },
};

/**
 * 有效的设置键列表
 */
const VALID_SETTING_KEYS: SettingKey[] = [
  'window.alwaysOnTop',
  'window.startMinimized',
  'window.opacity',
  'pet.idleTimeout',
  'pet.animationSpeed',
  'ai.defaultProvider',
  'ai.streamingEnabled',
  'chat.mode',
  'chat.maxHistory',
  'voice.enabled',
  'voice.autoSpeak',
  'voice.language',
  'system.autoStart',
  'system.checkUpdates',
  'telemetry.enabled',
  'mcp.enabledServers',
  'skills.enabledSkills',
];

// ============================================================================
// Settings Service
// ============================================================================

/**
 * 设置服务
 * 提供设置的存取和管理功能
 */
class SettingsService {
  private db: DatabaseService;
  private cache: Map<string, unknown> = new Map();
  private initialized = false;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  /**
   * 初始化设置服务
   */
  init(): void {
    if (this.initialized) {
      return;
    }

    // 确保数据库已打开
    if (this.db.state !== 'open') {
      this.db.open();
    }

    // 确保 Settings 表存在
    this.ensureTable();

    // 加载所有设置到缓存
    this.loadCache();

    this.initialized = true;
    ipcLogger.info('Settings service initialized', { action: 'init' });
  }

  /**
   * 确保设置表存在
   */
  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);
  }

  /**
   * 加载所有设置到缓存
   */
  private loadCache(): void {
    const records = this.db.all<SettingRecord>('SELECT key, value FROM settings');
    
    this.cache.clear();
    for (const record of records) {
      try {
        this.cache.set(record.key, JSON.parse(record.value));
      } catch {
        ipcLogger.warn(`Failed to parse setting value for key: ${record.key}`, {
          action: 'loadCache',
          key: record.key,
        });
      }
    }
  }

  /**
   * 获取默认值
   */
  private getDefaultValue<T>(key: SettingKey): T {
    const [group, name] = key.split('.') as [keyof Settings, string];
    const groupDefaults = DEFAULT_SETTINGS[group];
    
    if (groupDefaults && name in groupDefaults) {
      return (groupDefaults as Record<string, unknown>)[name] as T;
    }
    
    throw new IPCException(
      IPCErrorCodes.ERR_NOT_FOUND,
      `No default value for setting: ${key}`
    );
  }

  /**
   * 获取单个设置值
   */
  get<T>(key: SettingKey): T {
    // 验证键
    if (!VALID_SETTING_KEYS.includes(key)) {
      throw new IPCException(
        IPCErrorCodes.ERR_INVALID_INPUT,
        `Invalid setting key: ${key}`
      );
    }

    // 从缓存获取
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    // 返回默认值
    return this.getDefaultValue<T>(key);
  }

  /**
   * 设置值
   */
  set<T>(key: SettingKey, value: T): void {
    // 验证键
    if (!VALID_SETTING_KEYS.includes(key)) {
      throw new IPCException(
        IPCErrorCodes.ERR_INVALID_INPUT,
        `Invalid setting key: ${key}`
      );
    }

    // 验证值类型
    this.validateValue(key, value);

    // 序列化值
    const serializedValue = JSON.stringify(value);
    const now = Date.now();

    // 更新或插入数据库
    this.db.run(
      `INSERT INTO settings (key, value, updated_at) 
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      serializedValue,
      now
    );

    // 更新缓存
    this.cache.set(key, value);

    // 发送变化事件到渲染进程
    emitToRenderer('settings:changed', key, value);

    ipcLogger.debug(`Setting updated: ${key}`, {
      action: 'set',
      key,
      value: typeof value === 'string' && value.length > 100 ? `${value.slice(0, 100)}...` : value,
    });
  }

  /**
   * 获取所有设置
   */
  getAll(): Settings {
    const result = { ...DEFAULT_SETTINGS } as Settings;

    // 遍历所有有效键，获取值
    for (const key of VALID_SETTING_KEYS) {
      const [group, name] = key.split('.') as [keyof Settings, string];
      const value = this.get(key);
      
      if (result[group] && typeof result[group] === 'object') {
        (result[group] as Record<string, unknown>)[name] = value;
      }
    }

    return result;
  }

  /**
   * 重置设置
   */
  reset(key?: SettingKey): void {
    if (key) {
      // 重置单个设置
      if (!VALID_SETTING_KEYS.includes(key)) {
        throw new IPCException(
          IPCErrorCodes.ERR_INVALID_INPUT,
          `Invalid setting key: ${key}`
        );
      }

      // 从数据库删除
      this.db.run('DELETE FROM settings WHERE key = ?', key);
      
      // 从缓存删除
      this.cache.delete(key);

      // 获取默认值并发送变化事件
      const defaultValue = this.getDefaultValue(key);
      emitToRenderer('settings:changed', key, defaultValue);

      ipcLogger.debug(`Setting reset: ${key}`, { action: 'reset', key });
    } else {
      // 重置所有设置
      this.db.run('DELETE FROM settings');
      this.cache.clear();

      // 发送所有设置的变化事件
      for (const settingKey of VALID_SETTING_KEYS) {
        const defaultValue = this.getDefaultValue(settingKey);
        emitToRenderer('settings:changed', settingKey, defaultValue);
      }

      ipcLogger.info('All settings reset', { action: 'resetAll' });
    }
  }

  /**
   * 验证设置值类型
   */
  private validateValue(key: SettingKey, value: unknown): void {
    const [group, name] = key.split('.') as [keyof Settings, string];
    const defaultValue = (DEFAULT_SETTINGS[group] as Record<string, unknown>)?.[name];

    if (defaultValue === undefined) {
      return; // 无法验证
    }

    const expectedType = Array.isArray(defaultValue) ? 'array' : typeof defaultValue;
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (expectedType !== actualType) {
      throw new IPCException(
        IPCErrorCodes.ERR_INVALID_INPUT,
        `Invalid value type for ${key}: expected ${expectedType}, got ${actualType}`
      );
    }

    // 特殊验证
    switch (key) {
      case 'window.opacity':
        if (typeof value === 'number' && (value < 0 || value > 1)) {
          throw new IPCException(
            IPCErrorCodes.ERR_INVALID_INPUT,
            'window.opacity must be between 0 and 1'
          );
        }
        break;

      case 'chat.mode':
        if (value !== 'bubble' && value !== 'window') {
          throw new IPCException(
            IPCErrorCodes.ERR_INVALID_INPUT,
            "chat.mode must be 'bubble' or 'window'"
          );
        }
        break;

      case 'pet.animationSpeed':
        if (typeof value === 'number' && (value < 0.1 || value > 3)) {
          throw new IPCException(
            IPCErrorCodes.ERR_INVALID_INPUT,
            'pet.animationSpeed must be between 0.1 and 3'
          );
        }
        break;

      case 'chat.maxHistory':
        if (typeof value === 'number' && (value < 1 || value > 100)) {
          throw new IPCException(
            IPCErrorCodes.ERR_INVALID_INPUT,
            'chat.maxHistory must be between 1 and 100'
          );
        }
        break;
    }
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

let settingsService: SettingsService | null = null;

/**
 * 获取设置服务实例
 */
function getSettingsService(): SettingsService {
  if (!settingsService) {
    const db = getGlobalDatabaseService();
    settingsService = new SettingsService(db);
    settingsService.init();
  }
  return settingsService;
}

/**
 * 注册 Settings API IPC 处理器
 */
export function registerSettingsHandlers(): void {
  const handlers = createModuleHandlers('Settings');

  // settings:get - 获取单个设置值
  handlers.register(
    'settings:get',
    async (ctx, key: SettingKey) => {
      const service = getSettingsService();
      return service.get(key);
    },
    {
      validate: validators.string('key'),
    }
  );

  // settings:set - 设置值
  handlers.register(
    'settings:set',
    async (ctx, key: SettingKey, value: unknown) => {
      const service = getSettingsService();
      service.set(key, value);
    },
    {
      validate: (key, value) => {
        const keyResult = validators.string('key')(key);
        if (keyResult !== true) return keyResult;
        
        if (value === undefined) {
          return 'value is required';
        }
        return true;
      },
    }
  );

  // settings:get-all - 获取所有设置
  handlers.register('settings:get-all', async () => {
    const service = getSettingsService();
    return service.getAll();
  });

  // settings:reset - 重置设置
  handlers.register(
    'settings:reset',
    async (ctx, key?: SettingKey) => {
      const service = getSettingsService();
      service.reset(key);
    },
    {
      validate: (key) => {
        // key 是可选的
        if (key !== undefined && typeof key !== 'string') {
          return 'key must be a string';
        }
        return true;
      },
    }
  );

  ipcLogger.info('Settings API handlers registered', {
    action: 'register',
    module: 'Settings',
    channels: handlers.getChannels(),
  });
}

/**
 * 重置设置服务（用于测试）
 */
export function resetSettingsService(): void {
  settingsService = null;
}

// ============================================================================
// Exports
// ============================================================================

export { SettingsService, DEFAULT_SETTINGS, VALID_SETTING_KEYS };