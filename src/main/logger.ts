/**
 * 日志服务 - electron-log
 * 
 * 提供统一的日志记录功能：
 * - 多级别日志 (debug, info, warn, error)
 * - 文件和控制台输出
 * - 结构化日志格式
 * - Sentry 错误追踪集成
 * - 日志轮转和清理
 */

import log from 'electron-log';
import { app } from 'electron';
import * as path from 'path';

// 日志元数据接口
interface LogMeta {
  module?: string;
  action?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

// 日志配置选项
interface LoggerConfig {
  /** 日志级别 */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** 是否启用文件日志 */
  fileEnabled: boolean;
  /** 是否启用控制台日志 */
  consoleEnabled: boolean;
  /** 日志文件最大大小 (MB) */
  maxFileSize: number;
  /** 日志文件保留天数 */
  maxFiles: number;
}

// 默认配置
const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  fileEnabled: true,
  consoleEnabled: true,
  maxFileSize: 10, // 10MB
  maxFiles: 7, // 保留7天
};

// 当前配置
let currentConfig: LoggerConfig = { ...DEFAULT_CONFIG };

// 会话ID - 每次应用启动生成
const sessionId = generateSessionId();

/**
 * 生成会话ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * 格式化日志消息
 */
function formatLogMessage(message: string, meta?: LogMeta): string {
  const parts: string[] = [];
  
  if (meta?.module) {
    parts.push(`[${meta.module}]`);
  }
  
  if (meta?.action) {
    parts.push(`(${meta.action})`);
  }
  
  parts.push(message);
  
  // 添加其他元数据
  const extraMeta = { ...meta };
  delete extraMeta.module;
  delete extraMeta.action;
  delete extraMeta.userId;
  delete extraMeta.sessionId;
  
  if (Object.keys(extraMeta).length > 0) {
    parts.push(JSON.stringify(extraMeta));
  }
  
  return parts.join(' ');
}

/**
 * 初始化日志服务
 */
export function initLogger(config: Partial<LoggerConfig> = {}): void {
  currentConfig = { ...DEFAULT_CONFIG, ...config };
  
  // 设置日志级别
  log.transports.file.level = currentConfig.level;
  log.transports.console.level = currentConfig.level;
  
  // 配置文件传输
  if (currentConfig.fileEnabled) {
    log.transports.file.maxSize = currentConfig.maxFileSize * 1024 * 1024; // 转换为字节
    
    // 设置日志文件路径
    const logPath = path.join(app.getPath('userData'), 'logs');
    log.transports.file.resolvePathFn = () => path.join(logPath, 'main.log');
    
    // 设置日志格式
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  } else {
    log.transports.file.level = false;
  }
  
  // 配置控制台传输
  if (currentConfig.consoleEnabled) {
    log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';
  } else {
    log.transports.console.level = false;
  }
  
  // 捕获未处理的异常和Promise拒绝
  log.catchErrors({
    showDialog: false,
    onError: (error) => {
      logger.error('Uncaught exception', { module: 'System' }, error);
    },
  });
  
  logger.info('Logger initialized', { 
    module: 'Logger',
    action: 'init',
    sessionId,
    config: currentConfig,
  });
}

/**
 * 日志记录器
 */
export const logger = {
  /**
   * 调试日志
   */
  debug(message: string, meta?: LogMeta, ...args: unknown[]): void {
    const formattedMessage = formatLogMessage(message, { ...meta, sessionId });
    log.debug(formattedMessage, ...args);
  },
  
  /**
   * 信息日志
   */
  info(message: string, meta?: LogMeta, ...args: unknown[]): void {
    const formattedMessage = formatLogMessage(message, { ...meta, sessionId });
    log.info(formattedMessage, ...args);
  },
  
  /**
   * 警告日志
   */
  warn(message: string, meta?: LogMeta, ...args: unknown[]): void {
    const formattedMessage = formatLogMessage(message, { ...meta, sessionId });
    log.warn(formattedMessage, ...args);
  },
  
  /**
   * 错误日志
   */
  error(message: string, meta?: LogMeta, error?: Error | unknown, ...args: unknown[]): void {
    const formattedMessage = formatLogMessage(message, { ...meta, sessionId });
    
    if (error instanceof Error) {
      log.error(formattedMessage, {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }, ...args);
    } else if (error !== undefined) {
      log.error(formattedMessage, error, ...args);
    } else {
      log.error(formattedMessage, ...args);
    }
  },
  
  /**
   * 创建模块专用日志记录器
   */
  createModuleLogger(moduleName: string) {
    return {
      debug: (message: string, meta?: Omit<LogMeta, 'module'>, ...args: unknown[]) =>
        logger.debug(message, { ...meta, module: moduleName }, ...args),
      
      info: (message: string, meta?: Omit<LogMeta, 'module'>, ...args: unknown[]) =>
        logger.info(message, { ...meta, module: moduleName }, ...args),
      
      warn: (message: string, meta?: Omit<LogMeta, 'module'>, ...args: unknown[]) =>
        logger.warn(message, { ...meta, module: moduleName }, ...args),
      
      error: (message: string, meta?: Omit<LogMeta, 'module'>, error?: Error | unknown, ...args: unknown[]) =>
        logger.error(message, { ...meta, module: moduleName }, error, ...args),
    };
  },
  
  /**
   * 获取当前会话ID
   */
  getSessionId(): string {
    return sessionId;
  },
  
  /**
   * 获取日志文件路径
   */
  getLogPath(): string {
    return log.transports.file.getFile()?.path || '';
  },
  
  /**
   * 获取当前配置
   */
  getConfig(): Readonly<LoggerConfig> {
    return { ...currentConfig };
  },
  
  /**
   * 更新日志级别
   */
  setLevel(level: LoggerConfig['level']): void {
    currentConfig.level = level;
    log.transports.file.level = level;
    log.transports.console.level = level;
    
    logger.info('Log level changed', { 
      module: 'Logger',
      action: 'setLevel',
      level,
    });
  },
};

// 预定义模块日志记录器
export const mainLogger = logger.createModuleLogger('Main');
export const windowLogger = logger.createModuleLogger('Window');
export const aiLogger = logger.createModuleLogger('AI');
export const petLogger = logger.createModuleLogger('Pet');
export const ipcLogger = logger.createModuleLogger('IPC');
export const dbLogger = logger.createModuleLogger('Database');

// 默认导出
export default logger;