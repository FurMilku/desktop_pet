/**
 * IPC 处理器基础框架
 *
 * 提供统一的 IPC 通道注册和管理机制：
 * - 统一的错误处理中间件
 * - 请求验证
 * - 日志记录集成
 * - 性能监控
 * - 速率限制支持
 *
 * @see contracts/ipc-api.md
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow, webContents } from 'electron';
import { ipcLogger } from './logger';

// ============================================================================
// Error Types and Constants
// ============================================================================

/**
 * IPC 错误接口
 */
export interface IPCError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * IPC 错误码常量
 */
export const IPCErrorCodes = {
  /** 资源不存在 */
  ERR_NOT_FOUND: 'ERR_NOT_FOUND',
  /** 输入参数无效 */
  ERR_INVALID_INPUT: 'ERR_INVALID_INPUT',
  /** 网络错误 */
  ERR_NETWORK: 'ERR_NETWORK',
  /** AI服务不可用 */
  ERR_AI_UNAVAILABLE: 'ERR_AI_UNAVAILABLE',
  /** API密钥未设置 */
  ERR_API_KEY_MISSING: 'ERR_API_KEY_MISSING',
  /** 权限不足 */
  ERR_PERMISSION_DENIED: 'ERR_PERMISSION_DENIED',
  /** 操作超时 */
  ERR_TIMEOUT: 'ERR_TIMEOUT',
  /** 操作被取消 */
  ERR_CANCELLED: 'ERR_CANCELLED',
  /** 内部错误 */
  ERR_INTERNAL: 'ERR_INTERNAL',
  /** 速率限制 */
  ERR_RATE_LIMITED: 'ERR_RATE_LIMITED',
} as const;

export type IPCErrorCode = (typeof IPCErrorCodes)[keyof typeof IPCErrorCodes];

/**
 * IPC 错误类
 */
export class IPCException extends Error implements IPCError {
  public readonly code: IPCErrorCode;
  public readonly details?: unknown;

  constructor(code: IPCErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'IPCException';
    this.code = code;
    this.details = details;
  }

  /**
   * 转换为可序列化的错误对象
   */
  toJSON(): IPCError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

// ============================================================================
// Handler Types
// ============================================================================

/**
 * IPC 处理器上下文
 */
export interface IPCHandlerContext {
  /** 调用事件 */
  event: IpcMainInvokeEvent;
  /** 发送者窗口（如果可用） */
  window: BrowserWindow | null;
  /** 通道名称 */
  channel: string;
  /** 请求开始时间 */
  startTime: number;
}

/**
 * IPC 处理器函数类型
 */
export type IPCHandler<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  context: IPCHandlerContext,
  ...args: TArgs
) => Promise<TResult> | TResult;

/**
 * IPC 中间件类型
 */
export type IPCMiddleware = (
  context: IPCHandlerContext,
  next: () => Promise<unknown>
) => Promise<unknown>;

/**
 * 处理器注册选项
 */
export interface HandlerOptions {
  /** 是否启用速率限制 */
  rateLimit?: {
    /** 时间窗口（毫秒） */
    windowMs: number;
    /** 最大请求数 */
    maxRequests: number;
  };
  /** 参数验证器 */
  validate?: (...args: unknown[]) => boolean | string;
  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * 已注册的处理器信息
 */
interface RegisteredHandler {
  channel: string;
  handler: IPCHandler;
  options: HandlerOptions;
  module: string;
}

// ============================================================================
// Rate Limiter
// ============================================================================

/**
 * 简单的内存速率限制器
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  /**
   * 检查是否允许请求
   * @param key 限制键（通常是 channel + webContentsId）
   * @param windowMs 时间窗口
   * @param maxRequests 最大请求数
   */
  check(key: string, windowMs: number, maxRequests: number): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];

    // 过滤掉过期的时间戳
    const validTimestamps = timestamps.filter((t) => now - t < windowMs);

    if (validTimestamps.length >= maxRequests) {
      return false;
    }

    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);

    return true;
  }

  /**
   * 清理过期记录
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = 60000; // 1分钟

    for (const [key, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter((t) => now - t < maxAge);
      if (validTimestamps.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validTimestamps);
      }
    }
  }
}

// ============================================================================
// IPC Handler Registry
// ============================================================================

/**
 * IPC 处理器注册表
 *
 * 管理所有 IPC 处理器的注册、中间件和生命周期
 */
class IPCHandlerRegistry {
  private handlers: Map<string, RegisteredHandler> = new Map();
  private middlewares: IPCMiddleware[] = [];
  private rateLimiter = new RateLimiter();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private initialized = false;

  /**
   * 初始化注册表
   */
  init(): void {
    if (this.initialized) {
      ipcLogger.warn('IPC handler registry already initialized');
      return;
    }

    // 启动速率限制器清理定时器
    this.cleanupInterval = setInterval(() => {
      this.rateLimiter.cleanup();
    }, 60000); // 每分钟清理一次

    this.initialized = true;
    ipcLogger.info('IPC handler registry initialized', {
      action: 'init',
    });
  }

  /**
   * 销毁注册表
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // 移除所有处理器
    for (const channel of this.handlers.keys()) {
      ipcMain.removeHandler(channel);
    }

    this.handlers.clear();
    this.middlewares = [];
    this.initialized = false;

    ipcLogger.info('IPC handler registry destroyed', {
      action: 'destroy',
    });
  }

  /**
   * 添加中间件
   */
  use(middleware: IPCMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * 注册处理器
   * @param module 模块名称（用于日志和组织）
   * @param channel IPC 通道名称
   * @param handler 处理器函数
   * @param options 处理器选项
   */
  register<TArgs extends unknown[] = unknown[], TResult = unknown>(
    module: string,
    channel: string,
    handler: IPCHandler<TArgs, TResult>,
    options: HandlerOptions = {}
  ): void {
    if (this.handlers.has(channel)) {
      ipcLogger.warn(`Handler for channel "${channel}" already registered, replacing`, {
        action: 'register',
        channel,
        module,
      });
      ipcMain.removeHandler(channel);
    }

    // 存储处理器信息
    this.handlers.set(channel, {
      channel,
      handler: handler as IPCHandler,
      options,
      module,
    });

    // 注册到 ipcMain
    ipcMain.handle(channel, async (event, ...args) => {
      return this.handleRequest(channel, event, args);
    });

    ipcLogger.debug(`Handler registered: ${channel}`, {
      action: 'register',
      channel,
      module,
      hasRateLimit: !!options.rateLimit,
      hasValidation: !!options.validate,
      timeout: options.timeout,
    });
  }

  /**
   * 批量注册处理器
   */
  registerAll(
    module: string,
    handlers: Record<string, IPCHandler | [IPCHandler, HandlerOptions]>
  ): void {
    for (const [channel, handlerOrTuple] of Object.entries(handlers)) {
      if (Array.isArray(handlerOrTuple)) {
        const [handler, options] = handlerOrTuple;
        this.register(module, channel, handler, options);
      } else {
        this.register(module, channel, handlerOrTuple);
      }
    }
  }

  /**
   * 移除处理器
   */
  unregister(channel: string): boolean {
    if (!this.handlers.has(channel)) {
      return false;
    }

    ipcMain.removeHandler(channel);
    this.handlers.delete(channel);

    ipcLogger.debug(`Handler unregistered: ${channel}`, {
      action: 'unregister',
      channel,
    });

    return true;
  }

  /**
   * 处理 IPC 请求
   */
  private async handleRequest(
    channel: string,
    event: IpcMainInvokeEvent,
    args: unknown[]
  ): Promise<unknown> {
    const startTime = Date.now();
    const registered = this.handlers.get(channel);

    if (!registered) {
      ipcLogger.error(`No handler for channel: ${channel}`, {
        action: 'handle',
        channel,
      });
      throw new IPCException(IPCErrorCodes.ERR_INTERNAL, `No handler for channel: ${channel}`);
    }

    const { handler, options, module } = registered;

    // 获取发送者窗口
    const window = BrowserWindow.fromWebContents(event.sender);

    // 创建上下文
    const context: IPCHandlerContext = {
      event,
      window,
      channel,
      startTime,
    };

    try {
      // 速率限制检查
      if (options.rateLimit) {
        const key = `${channel}:${event.sender.id}`;
        const allowed = this.rateLimiter.check(
          key,
          options.rateLimit.windowMs,
          options.rateLimit.maxRequests
        );

        if (!allowed) {
          ipcLogger.warn(`Rate limit exceeded for ${channel}`, {
            action: 'rateLimit',
            channel,
            module,
            webContentsId: event.sender.id,
          });
          throw new IPCException(
            IPCErrorCodes.ERR_RATE_LIMITED,
            'Rate limit exceeded, please try again later'
          );
        }
      }

      // 参数验证
      if (options.validate) {
        const validationResult = options.validate(...args);
        if (validationResult !== true) {
          const errorMessage =
            typeof validationResult === 'string'
              ? validationResult
              : 'Invalid input parameters';
          throw new IPCException(IPCErrorCodes.ERR_INVALID_INPUT, errorMessage);
        }
      }

      // 执行中间件链和处理器
      const executeHandler = async () => {
        return handler(context, ...args);
      };

      // 构建中间件链
      let index = 0;
      const executeMiddleware = async (): Promise<unknown> => {
        if (index < this.middlewares.length) {
          const middleware = this.middlewares[index++];
          return middleware(context, executeMiddleware);
        }
        return executeHandler();
      };

      // 执行（可选超时）
      let result: unknown;
      if (options.timeout) {
        result = await Promise.race([
          executeMiddleware(),
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(
                new IPCException(IPCErrorCodes.ERR_TIMEOUT, `Request timeout after ${options.timeout}ms`)
              );
            }, options.timeout);
          }),
        ]);
      } else {
        result = await executeMiddleware();
      }

      // 记录成功
      const duration = Date.now() - startTime;
      ipcLogger.debug(`IPC call completed: ${channel}`, {
        action: 'success',
        channel,
        module,
        duration,
      });

      return result;
    } catch (error) {
      // 记录错误
      const duration = Date.now() - startTime;

      if (error instanceof IPCException) {
        ipcLogger.warn(`IPC call failed: ${channel}`, {
          action: 'error',
          channel,
          module,
          duration,
          errorCode: error.code,
          errorMessage: error.message,
        });
        throw error.toJSON();
      }

      // 未知错误
      ipcLogger.error(
        `IPC call error: ${channel}`,
        {
          action: 'error',
          channel,
          module,
          duration,
        },
        error as Error
      );

      throw {
        code: IPCErrorCodes.ERR_INTERNAL,
        message: error instanceof Error ? error.message : 'Unknown error',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      } as IPCError;
    }
  }

  /**
   * 获取已注册的通道列表
   */
  getRegisteredChannels(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * 检查通道是否已注册
   */
  hasChannel(channel: string): boolean {
    return this.handlers.has(channel);
  }

  /**
   * 获取模块的所有通道
   */
  getModuleChannels(module: string): string[] {
    const channels: string[] = [];
    for (const [channel, info] of this.handlers.entries()) {
      if (info.module === module) {
        channels.push(channel);
      }
    }
    return channels;
  }
}

// ============================================================================
// Event Emitter Utilities
// ============================================================================

/**
 * 向渲染进程发送事件
 * @param channel 通道名称
 * @param args 事件参数
 */
export function emitToRenderer(channel: string, ...args: unknown[]): void {
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed()) {
      contents.send(channel, ...args);
    }
  }
}

/**
 * 向指定窗口发送事件
 * @param window 目标窗口
 * @param channel 通道名称
 * @param args 事件参数
 */
export function emitToWindow(
  window: BrowserWindow | null,
  channel: string,
  ...args: unknown[]
): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, ...args);
  }
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * 创建类型验证器
 */
export const validators = {
  /**
   * 验证字符串类型
   */
  string:
    (name: string, required = true) =>
    (value: unknown): boolean | string => {
      if (value === undefined || value === null) {
        return required ? `${name} is required` : true;
      }
      return typeof value === 'string' || `${name} must be a string`;
    },

  /**
   * 验证数字类型
   */
  number:
    (name: string, options?: { min?: number; max?: number; required?: boolean }) =>
    (value: unknown): boolean | string => {
      const required = options?.required ?? true;
      if (value === undefined || value === null) {
        return required ? `${name} is required` : true;
      }
      if (typeof value !== 'number' || isNaN(value)) {
        return `${name} must be a number`;
      }
      if (options?.min !== undefined && value < options.min) {
        return `${name} must be at least ${options.min}`;
      }
      if (options?.max !== undefined && value > options.max) {
        return `${name} must be at most ${options.max}`;
      }
      return true;
    },

  /**
   * 验证布尔类型
   */
  boolean:
    (name: string, required = true) =>
    (value: unknown): boolean | string => {
      if (value === undefined || value === null) {
        return required ? `${name} is required` : true;
      }
      return typeof value === 'boolean' || `${name} must be a boolean`;
    },

  /**
   * 验证对象类型
   */
  object:
    (name: string, required = true) =>
    (value: unknown): boolean | string => {
      if (value === undefined || value === null) {
        return required ? `${name} is required` : true;
      }
      return (typeof value === 'object' && !Array.isArray(value)) || `${name} must be an object`;
    },

  /**
   * 验证数组类型
   */
  array:
    (name: string, required = true) =>
    (value: unknown): boolean | string => {
      if (value === undefined || value === null) {
        return required ? `${name} is required` : true;
      }
      return Array.isArray(value) || `${name} must be an array`;
    },

  /**
   * 组合多个验证器
   */
  combine:
    (...validators: Array<(value: unknown) => boolean | string>) =>
    (...args: unknown[]): boolean | string => {
      for (let i = 0; i < validators.length; i++) {
        const result = validators[i](args[i]);
        if (result !== true) {
          return result;
        }
      }
      return true;
    },
};

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * 全局 IPC 处理器注册表实例
 */
export const ipcHandlers = new IPCHandlerRegistry();

// ============================================================================
// Module Handler Registration Helpers
// ============================================================================

/**
 * 创建模块处理器注册函数
 * @param moduleName 模块名称
 */
export function createModuleHandlers(moduleName: string) {
  return {
    /**
     * 注册单个处理器
     */
    register: <TArgs extends unknown[] = unknown[], TResult = unknown>(
      channel: string,
      handler: IPCHandler<TArgs, TResult>,
      options?: HandlerOptions
    ) => {
      ipcHandlers.register(moduleName, channel, handler, options);
    },

    /**
     * 批量注册处理器
     */
    registerAll: (handlers: Record<string, IPCHandler | [IPCHandler, HandlerOptions]>) => {
      ipcHandlers.registerAll(moduleName, handlers);
    },

    /**
     * 获取模块通道列表
     */
    getChannels: () => {
      return ipcHandlers.getModuleChannels(moduleName);
    },
  };
}

// ============================================================================
// Default Export
// ============================================================================

export default ipcHandlers;