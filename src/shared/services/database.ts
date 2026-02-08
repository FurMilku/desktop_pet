/**
 * SQLite 数据库服务
 * 使用 better-sqlite3 提供同步数据库操作
 * T009: 实现 SQLite 数据库服务
 */

import Database, { Database as DatabaseType, Statement, RunResult, Transaction } from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 数据库配置选项
 */
export interface DatabaseOptions {
  /** 数据库文件路径（相对于 userData 或绝对路径） */
  filename?: string;
  /** 是否为内存数据库 */
  inMemory?: boolean;
  /** 是否只读模式 */
  readonly?: boolean;
  /** 是否启用 WAL 模式 */
  walMode?: boolean;
  /** 是否启用外键约束 */
  foreignKeys?: boolean;
  /** 是否在打开时创建备份 */
  backupOnOpen?: boolean;
  /** 详细日志回调 */
  verbose?: (message: string) => void;
}

/**
 * 查询结果类型
 */
export type QueryResult<T> = T[];

/**
 * 单行查询结果类型
 */
export type SingleResult<T> = T | undefined;

/**
 * 数据库连接状态
 */
export type DatabaseState = 'closed' | 'open' | 'error';

/**
 * 事务回调函数类型
 */
export type TransactionCallback<T> = () => T;

/**
 * 数据库服务接口
 */
export interface IDatabaseService {
  /** 获取数据库连接状态 */
  readonly state: DatabaseState;
  /** 获取数据库文件路径 */
  readonly filepath: string | null;
  
  /** 打开数据库连接 */
  open(): void;
  /** 关闭数据库连接 */
  close(): void;
  
  /** 执行 SQL 语句（无返回值） */
  exec(sql: string): void;
  /** 执行单条 SQL 语句，返回运行结果 */
  run(sql: string, ...params: unknown[]): RunResult;
  /** 查询所有匹配的行 */
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): QueryResult<T>;
  /** 查询单行 */
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): SingleResult<T>;
  /** 查询单个值 */
  pluck<T = unknown>(sql: string, ...params: unknown[]): T | undefined;
  
  /** 准备语句 */
  prepare(sql: string): Statement;
  
  /** 在事务中执行 */
  transaction<T>(fn: TransactionCallback<T>): T;
  /** 在立即事务中执行 */
  immediateTransaction<T>(fn: TransactionCallback<T>): T;
  /** 在独占事务中执行 */
  exclusiveTransaction<T>(fn: TransactionCallback<T>): T;
  
  /** 创建数据库备份 */
  backup(backupPath?: string): string;
  /** 检查数据库完整性 */
  integrityCheck(): boolean;
  /** 获取数据库统计信息 */
  getStats(): DatabaseStats;
}

/**
 * 数据库统计信息
 */
export interface DatabaseStats {
  /** 数据库文件大小（字节） */
  fileSize: number;
  /** 页面数量 */
  pageCount: number;
  /** 页面大小（字节） */
  pageSize: number;
  /** 空闲页面数量 */
  freePageCount: number;
  /** WAL 模式是否启用 */
  walMode: boolean;
  /** 外键约束是否启用 */
  foreignKeys: boolean;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_OPTIONS: Required<DatabaseOptions> = {
  filename: 'pet.db',
  inMemory: false,
  readonly: false,
  walMode: true,
  foreignKeys: true,
  backupOnOpen: false,
  verbose: () => {}, // 默认不输出日志
};

// ============================================================================
// 数据库服务实现
// ============================================================================

/**
 * SQLite 数据库服务类
 */
export class DatabaseService implements IDatabaseService {
  private db: DatabaseType | null = null;
  private options: Required<DatabaseOptions>;
  private _state: DatabaseState = 'closed';
  private _filepath: string | null = null;

  constructor(options: DatabaseOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    
    // 计算数据库文件路径
    if (!this.options.inMemory) {
      this._filepath = this.resolvePath(this.options.filename);
    }
  }

  // --------------------------------------------------------------------------
  // 属性
  // --------------------------------------------------------------------------

  get state(): DatabaseState {
    return this._state;
  }

  get filepath(): string | null {
    return this._filepath;
  }

  /**
   * 获取原始数据库实例（用于高级操作）
   */
  get raw(): DatabaseType {
    this.ensureOpen();
    return this.db!;
  }

  // --------------------------------------------------------------------------
  // 生命周期方法
  // --------------------------------------------------------------------------

  /**
   * 打开数据库连接
   */
  open(): void {
    if (this._state === 'open') {
      return;
    }

    try {
      // 确保目录存在
      if (this._filepath) {
        const dir = path.dirname(this._filepath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        // 创建备份（如果配置启用）
        if (this.options.backupOnOpen && fs.existsSync(this._filepath)) {
          this.createBackup(this._filepath);
        }
      }

      // 创建数据库连接
      const dbPath = this.options.inMemory ? ':memory:' : this._filepath!;
      this.db = new Database(dbPath, {
        readonly: this.options.readonly,
        verbose: this.options.verbose,
      });

      // 配置数据库
      this.configureDatabase();
      
      this._state = 'open';
      this.options.verbose?.(`Database opened: ${dbPath}`);
    } catch (error) {
      this._state = 'error';
      throw new DatabaseError(`Failed to open database: ${error}`, error);
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this._state === 'closed' || !this.db) {
      return;
    }

    try {
      // 执行 checkpoint 以确保 WAL 数据写入主数据库
      if (this.options.walMode) {
        try {
          this.db.pragma('wal_checkpoint(TRUNCATE)');
        } catch {
          // 忽略 checkpoint 错误
        }
      }
      
      this.db.close();
      this.db = null;
      this._state = 'closed';
      this.options.verbose?.('Database closed');
    } catch (error) {
      this._state = 'error';
      throw new DatabaseError(`Failed to close database: ${error}`, error);
    }
  }

  // --------------------------------------------------------------------------
  // 查询方法
  // --------------------------------------------------------------------------

  /**
   * 执行 SQL 语句（无返回值，用于多语句执行）
   */
  exec(sql: string): void {
    this.ensureOpen();
    try {
      this.db!.exec(sql);
    } catch (error) {
      throw new DatabaseError(`Failed to execute SQL: ${error}`, error);
    }
  }

  /**
   * 执行单条 SQL 语句，返回运行结果
   */
  run(sql: string, ...params: unknown[]): RunResult {
    this.ensureOpen();
    try {
      const stmt = this.db!.prepare(sql);
      return stmt.run(...params);
    } catch (error) {
      throw new DatabaseError(`Failed to run SQL: ${error}`, error);
    }
  }

  /**
   * 查询所有匹配的行
   */
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): QueryResult<T> {
    this.ensureOpen();
    try {
      const stmt = this.db!.prepare(sql);
      return stmt.all(...params) as T[];
    } catch (error) {
      throw new DatabaseError(`Failed to query all: ${error}`, error);
    }
  }

  /**
   * 查询单行
   */
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): SingleResult<T> {
    this.ensureOpen();
    try {
      const stmt = this.db!.prepare(sql);
      return stmt.get(...params) as T | undefined;
    } catch (error) {
      throw new DatabaseError(`Failed to query get: ${error}`, error);
    }
  }

  /**
   * 查询单个值（第一列的值）
   */
  pluck<T = unknown>(sql: string, ...params: unknown[]): T | undefined {
    this.ensureOpen();
    try {
      const stmt = this.db!.prepare(sql);
      stmt.pluck(true);
      return stmt.get(...params) as T | undefined;
    } catch (error) {
      throw new DatabaseError(`Failed to query pluck: ${error}`, error);
    }
  }

  /**
   * 准备语句
   */
  prepare(sql: string): Statement {
    this.ensureOpen();
    try {
      return this.db!.prepare(sql);
    } catch (error) {
      throw new DatabaseError(`Failed to prepare statement: ${error}`, error);
    }
  }

  // --------------------------------------------------------------------------
  // 事务方法
  // --------------------------------------------------------------------------

  /**
   * 在事务中执行（默认 DEFERRED）
   */
  transaction<T>(fn: TransactionCallback<T>): T {
    this.ensureOpen();
    const transaction = this.db!.transaction(fn);
    return transaction();
  }

  /**
   * 在立即事务中执行（IMMEDIATE）
   */
  immediateTransaction<T>(fn: TransactionCallback<T>): T {
    this.ensureOpen();
    const transaction = this.db!.transaction(fn);
    return transaction.immediate();
  }

  /**
   * 在独占事务中执行（EXCLUSIVE）
   */
  exclusiveTransaction<T>(fn: TransactionCallback<T>): T {
    this.ensureOpen();
    const transaction = this.db!.transaction(fn);
    return transaction.exclusive();
  }

  // --------------------------------------------------------------------------
  // 工具方法
  // --------------------------------------------------------------------------

  /**
   * 创建数据库备份
   * @param backupPath 备份文件路径（可选，默认在 backups 目录）
   * @returns 备份文件路径
   */
  backup(backupPath?: string): string {
    this.ensureOpen();
    
    const targetPath = backupPath || this.getDefaultBackupPath();
    
    // 确保备份目录存在
    const backupDir = path.dirname(targetPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    try {
      // 使用 better-sqlite3 的 backup API
      this.db!.backup(targetPath);
      this.options.verbose?.(`Database backup created: ${targetPath}`);
      return targetPath;
    } catch (error) {
      throw new DatabaseError(`Failed to create backup: ${error}`, error);
    }
  }

  /**
   * 检查数据库完整性
   */
  integrityCheck(): boolean {
    this.ensureOpen();
    try {
      const result = this.pluck<string>('PRAGMA integrity_check');
      return result === 'ok';
    } catch (error) {
      throw new DatabaseError(`Integrity check failed: ${error}`, error);
    }
  }

  /**
   * 获取数据库统计信息
   */
  getStats(): DatabaseStats {
    this.ensureOpen();
    
    const pageCount = this.pluck<number>('PRAGMA page_count') || 0;
    const pageSize = this.pluck<number>('PRAGMA page_size') || 4096;
    const freePageCount = this.pluck<number>('PRAGMA freelist_count') || 0;
    const journalMode = this.pluck<string>('PRAGMA journal_mode') || '';
    const foreignKeys = this.pluck<number>('PRAGMA foreign_keys') || 0;
    
    let fileSize = 0;
    if (this._filepath && fs.existsSync(this._filepath)) {
      const stats = fs.statSync(this._filepath);
      fileSize = stats.size;
    }
    
    return {
      fileSize,
      pageCount,
      pageSize,
      freePageCount,
      walMode: journalMode.toLowerCase() === 'wal',
      foreignKeys: foreignKeys === 1,
    };
  }

  // --------------------------------------------------------------------------
  // 私有方法
  // --------------------------------------------------------------------------

  /**
   * 确保数据库已打开
   */
  private ensureOpen(): void {
    if (this._state !== 'open' || !this.db) {
      throw new DatabaseError('Database is not open');
    }
  }

  /**
   * 配置数据库选项
   */
  private configureDatabase(): void {
    if (!this.db) return;
    
    // 启用外键约束
    if (this.options.foreignKeys) {
      this.db.pragma('foreign_keys = ON');
    }
    
    // 启用 WAL 模式
    if (this.options.walMode && !this.options.readonly) {
      this.db.pragma('journal_mode = WAL');
    }
    
    // 设置同步模式为 NORMAL（WAL 模式下安全且性能好）
    if (this.options.walMode) {
      this.db.pragma('synchronous = NORMAL');
    }
    
    // 设置忙等待超时（5秒）
    this.db.pragma('busy_timeout = 5000');
    
    // 启用内存映射（提高读取性能）
    this.db.pragma('mmap_size = 268435456'); // 256MB
  }

  /**
   * 解析数据库文件路径
   */
  private resolvePath(filename: string): string {
    // 如果是绝对路径，直接返回
    if (path.isAbsolute(filename)) {
      return filename;
    }
    
    // 否则相对于 userData 目录
    try {
      const userDataPath = app.getPath('userData');
      return path.join(userDataPath, filename);
    } catch {
      // 如果 app 未准备好（如测试环境），使用当前目录
      return path.join(process.cwd(), 'data', filename);
    }
  }

  /**
   * 获取默认备份路径
   */
  private getDefaultBackupPath(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = this._filepath 
      ? path.basename(this._filepath, '.db')
      : 'database';
    
    try {
      const userDataPath = app.getPath('userData');
      return path.join(userDataPath, 'backups', `${filename}.${timestamp}.bak`);
    } catch {
      return path.join(process.cwd(), 'data', 'backups', `${filename}.${timestamp}.bak`);
    }
  }

  /**
   * 创建备份（内部使用）
   */
  private createBackup(sourcePath: string): void {
    const backupPath = this.getDefaultBackupPath();
    const backupDir = path.dirname(backupPath);
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    fs.copyFileSync(sourcePath, backupPath);
    this.options.verbose?.(`Pre-open backup created: ${backupPath}`);
  }
}

// ============================================================================
// 错误类
// ============================================================================

/**
 * 数据库错误
 */
export class DatabaseError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DatabaseError';
    this.cause = cause;
    
    // 保持正确的原型链
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

// ============================================================================
// 单例与工厂
// ============================================================================

/** 全局数据库服务实例 */
let globalDatabaseService: DatabaseService | null = null;

/**
 * 获取全局数据库服务实例
 * @param options 数据库选项（仅在首次调用时生效）
 */
export function getGlobalDatabaseService(options?: DatabaseOptions): DatabaseService {
  if (!globalDatabaseService) {
    globalDatabaseService = new DatabaseService(options);
  }
  return globalDatabaseService;
}

/**
 * 重置全局数据库服务（用于测试）
 */
export function resetGlobalDatabaseService(): void {
  if (globalDatabaseService) {
    try {
      globalDatabaseService.close();
    } catch {
      // 忽略关闭错误
    }
    globalDatabaseService = null;
  }
}

/**
 * 创建内存数据库（用于测试）
 */
export function createInMemoryDatabase(): DatabaseService {
  return new DatabaseService({ inMemory: true });
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 将 Date 对象转换为 SQLite 时间戳（毫秒）
 */
export function dateToTimestamp(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.getTime();
}

/**
 * 将 SQLite 时间戳（毫秒）转换为 Date 对象
 */
export function timestampToDate(timestamp: number | null | undefined): Date | null {
  if (timestamp === null || timestamp === undefined) return null;
  return new Date(timestamp);
}

/**
 * 生成 UUID v4
 */
export function generateUUID(): string {
  // 使用 crypto 模块生成安全的 UUID
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  
  // 设置版本 (4) 和变体位
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 当前时间戳（毫秒）
 */
export function now(): number {
  return Date.now();
}