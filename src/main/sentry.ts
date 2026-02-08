/**
 * Sentry 错误追踪服务
 * 
 * 提供崩溃报告和错误监控功能：
 * - 自动捕获未处理异常
 * - 自动捕获未处理的 Promise 拒绝
 * - 性能监控
 * - 用户反馈收集
 * - 与 electron-log 集成
 */

import * as Sentry from '@sentry/electron/main';
import { app } from 'electron';
import { logger } from './logger';

// Sentry 配置选项
interface SentryConfig {
  /** Sentry DSN */
  dsn: string;
  /** 环境标识 */
  environment: 'development' | 'staging' | 'production';
  /** 是否启用 */
  enabled: boolean;
  /** 采样率 (0-1) */
  sampleRate: number;
  /** 追踪采样率 (0-1) */
  tracesSampleRate: number;
  /** 是否发送默认 PII */
  sendDefaultPii: boolean;
  /** 调试模式 */
  debug: boolean;
}

// 默认配置
const DEFAULT_CONFIG: SentryConfig = {
  dsn: '', // 需要从环境变量或配置文件读取
  environment: 'development',
  enabled: false,
  sampleRate: 1.0,
  tracesSampleRate: 0.2,
  sendDefaultPii: false,
  debug: false,
};

// 当前配置
let currentConfig: SentryConfig = { ...DEFAULT_CONFIG };
let isInitialized = false;

/**
 * 初始化 Sentry
 */
export function initSentry(config: Partial<SentryConfig> = {}): void {
  // 从环境变量读取 DSN（如果未提供）
  const dsn = config.dsn || process.env.SENTRY_DSN || '';
  
  currentConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    dsn,
    environment: (process.env.NODE_ENV as SentryConfig['environment']) || config.environment || 'development',
    enabled: config.enabled ?? (dsn !== '' && process.env.NODE_ENV === 'production'),
  };
  
  if (!currentConfig.enabled || !currentConfig.dsn) {
    logger.info('Sentry disabled - no DSN provided or explicitly disabled', {
      module: 'Sentry',
      action: 'init',
    });
    return;
  }
  
  try {
    Sentry.init({
      dsn: currentConfig.dsn,
      environment: currentConfig.environment,
      release: `desktop-pet@${app.getVersion()}`,
      sampleRate: currentConfig.sampleRate,
      tracesSampleRate: currentConfig.tracesSampleRate,
      sendDefaultPii: currentConfig.sendDefaultPii,
      debug: currentConfig.debug,
      
      // 在发送前处理事件
      beforeSend(event, hint) {
        // 记录到本地日志
        const error = hint.originalException;
        if (error instanceof Error) {
          logger.error('Sentry capturing error', { module: 'Sentry' }, error);
        }
        
        // 在开发环境下可以选择不发送
        if (currentConfig.environment === 'development' && !currentConfig.debug) {
          return null;
        }
        
        return event;
      },
      
      // 在发送前处理事务（性能追踪）
      beforeSendTransaction(transaction) {
        // 可以在这里过滤或修改事务
        return transaction;
      },
      
      // 集成配置
      integrations: [
        // 主进程集成默认已包含
      ],
    });
    
    // 设置用户上下文
    Sentry.setUser({
      id: getAnonymousUserId(),
    });
    
    // 设置标签
    Sentry.setTags({
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
    });
    
    isInitialized = true;
    
    logger.info('Sentry initialized', {
      module: 'Sentry',
      action: 'init',
      environment: currentConfig.environment,
      release: `desktop-pet@${app.getVersion()}`,
    });
  } catch (error) {
    logger.error('Failed to initialize Sentry', { module: 'Sentry', action: 'init' }, error);
  }
}

/**
 * 获取匿名用户ID（基于机器标识）
 */
function getAnonymousUserId(): string {
  // 使用 Electron 的机器ID或生成一个持久化的匿名ID
  const machineId = require('crypto')
    .createHash('sha256')
    .update(app.getPath('userData'))
    .digest('hex')
    .substring(0, 16);
  
  return `anon_${machineId}`;
}

/**
 * Sentry 服务
 */
export const sentry = {
  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return isInitialized;
  },
  
  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return currentConfig.enabled && isInitialized;
  },
  
  /**
   * 捕获异常
   */
  captureException(error: Error | unknown, context?: Record<string, unknown>): string | undefined {
    if (!sentry.isEnabled()) {
      return undefined;
    }
    
    try {
      const eventId = Sentry.captureException(error, {
        extra: context,
      });
      
      logger.debug('Exception captured', {
        module: 'Sentry',
        action: 'captureException',
        eventId,
      });
      
      return eventId;
    } catch (err) {
      logger.error('Failed to capture exception', { module: 'Sentry' }, err);
      return undefined;
    }
  },
  
  /**
   * 捕获消息
   */
  captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, unknown>): string | undefined {
    if (!sentry.isEnabled()) {
      return undefined;
    }
    
    try {
      const eventId = Sentry.captureMessage(message, {
        level,
        extra: context,
      });
      
      logger.debug('Message captured', {
        module: 'Sentry',
        action: 'captureMessage',
        eventId,
        level,
      });
      
      return eventId;
    } catch (err) {
      logger.error('Failed to capture message', { module: 'Sentry' }, err);
      return undefined;
    }
  },
  
  /**
   * 添加面包屑（操作追踪）
   */
  addBreadcrumb(breadcrumb: Sentry.Breadcrumb): void {
    if (!sentry.isEnabled()) {
      return;
    }
    
    try {
      Sentry.addBreadcrumb(breadcrumb);
    } catch (err) {
      logger.error('Failed to add breadcrumb', { module: 'Sentry' }, err);
    }
  },
  
  /**
   * 设置用户信息
   */
  setUser(user: Sentry.User | null): void {
    if (!sentry.isEnabled()) {
      return;
    }
    
    try {
      Sentry.setUser(user);
      
      logger.debug('User context updated', {
        module: 'Sentry',
        action: 'setUser',
        userId: user?.id,
      });
    } catch (err) {
      logger.error('Failed to set user', { module: 'Sentry' }, err);
    }
  },
  
  /**
   * 设置标签
   */
  setTag(key: string, value: string): void {
    if (!sentry.isEnabled()) {
      return;
    }
    
    try {
      Sentry.setTag(key, value);
    } catch (err) {
      logger.error('Failed to set tag', { module: 'Sentry' }, err);
    }
  },
  
  /**
   * 设置额外上下文
   */
  setExtra(key: string, value: unknown): void {
    if (!sentry.isEnabled()) {
      return;
    }
    
    try {
      Sentry.setExtra(key, value);
    } catch (err) {
      logger.error('Failed to set extra', { module: 'Sentry' }, err);
    }
  },
  
  /**
   * 设置上下文
   */
  setContext(name: string, context: Record<string, unknown> | null): void {
    if (!sentry.isEnabled()) {
      return;
    }
    
    try {
      Sentry.setContext(name, context);
    } catch (err) {
      logger.error('Failed to set context', { module: 'Sentry' }, err);
    }
  },
  
  /**
   * 开始事务（性能追踪）
   */
  startTransaction(context: Sentry.TransactionContext): Sentry.Transaction | undefined {
    if (!sentry.isEnabled()) {
      return undefined;
    }
    
    try {
      return Sentry.startTransaction(context);
    } catch (err) {
      logger.error('Failed to start transaction', { module: 'Sentry' }, err);
      return undefined;
    }
  },
  
  /**
   * 在作用域中运行
   */
  withScope(callback: (scope: Sentry.Scope) => void): void {
    if (!sentry.isEnabled()) {
      return;
    }
    
    try {
      Sentry.withScope(callback);
    } catch (err) {
      logger.error('Failed to run with scope', { module: 'Sentry' }, err);
    }
  },
  
  /**
   * 刷新（确保所有事件发送）
   */
  async flush(timeout?: number): Promise<boolean> {
    if (!sentry.isEnabled()) {
      return true;
    }
    
    try {
      return await Sentry.flush(timeout);
    } catch (err) {
      logger.error('Failed to flush', { module: 'Sentry' }, err);
      return false;
    }
  },
  
  /**
   * 关闭 Sentry
   */
  async close(timeout?: number): Promise<boolean> {
    if (!sentry.isEnabled()) {
      return true;
    }
    
    try {
      const result = await Sentry.close(timeout);
      isInitialized = false;
      
      logger.info('Sentry closed', {
        module: 'Sentry',
        action: 'close',
      });
      
      return result;
    } catch (err) {
      logger.error('Failed to close Sentry', { module: 'Sentry' }, err);
      return false;
    }
  },
  
  /**
   * 获取当前配置
   */
  getConfig(): Readonly<SentryConfig> {
    return { ...currentConfig };
  },
};

/**
 * 创建与 electron-log 集成的错误处理器
 * 用于在 logger 中自动捕获错误到 Sentry
 */
export function createLoggerIntegration() {
  return {
    /**
     * 记录错误并发送到 Sentry
     */
    error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
      logger.error(message, { module: 'App' }, error);
      
      if (error instanceof Error) {
        sentry.captureException(error, {
          message,
          ...context,
        });
      }
    },
    
    /**
     * 记录警告并添加面包屑
     */
    warn(message: string, context?: Record<string, unknown>): void {
      logger.warn(message, { module: 'App' });
      
      sentry.addBreadcrumb({
        category: 'warning',
        message,
        level: 'warning',
        data: context,
      });
    },
  };
}

// 默认导出
export default sentry;