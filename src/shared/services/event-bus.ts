/**
 * 事件总线核心服务实现
 * 实现事件驱动架构的核心功能
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  BaseEvent,
  CreateEventParams,
  EventHandler,
  EventHandlerConfig,
  RegisteredHandler,
  SubscriptionToken,
  SubscribeOptions,
  IEventBus,
  IEventBusWithMiddleware,
  EventBusConfig,
  EventMiddleware,
  EventMiddlewareContext,
  EventMiddlewareNext,
  EventHistoryItem,
  IEventHistory,
  EventPriority,
} from '../types/event-bus';
import {
  DEFAULT_EVENT_BUS_CONFIG,
  isBaseEvent,
  isCreateEventParams,
} from '../types/event-bus';

// ============================================================================
// 事件工厂函数
// ============================================================================

/**
 * 生成唯一的事件ID
 */
export function generateEventId(): string {
  return uuidv4();
}

/**
 * 生成唯一的订阅ID
 */
export function generateSubscriptionId(): string {
  return `sub_${uuidv4()}`;
}

/**
 * 创建事件对象
 */
export function createEvent<T>(params: CreateEventParams<T>): BaseEvent<T> {
  return {
    id: generateEventId(),
    type: params.type,
    payload: params.payload,
    timestamp: Date.now(),
    source: params.source,
    priority: params.priority,
    metadata: params.metadata,
  };
}

// ============================================================================
// 事件历史记录实现
// ============================================================================

/**
 * 事件历史记录实现
 */
export class EventHistory implements IEventHistory {
  private history: EventHistoryItem[] = [];
  private maxLength: number;

  constructor(maxLength: number = 1000) {
    this.maxLength = maxLength;
  }

  add<T>(item: EventHistoryItem<T>): void {
    this.history.push(item as EventHistoryItem);
    if (this.history.length > this.maxLength) {
      this.history.shift();
    }
  }

  getAll(): EventHistoryItem[] {
    return [...this.history];
  }

  getByType(eventType: string): EventHistoryItem[] {
    return this.history.filter((item) => item.event.type === eventType);
  }

  clear(): void {
    this.history = [];
  }

  size(): number {
    return this.history.length;
  }
}

// ============================================================================
// 防抖/节流工具
// ============================================================================

/**
 * 创建防抖函数
 */
function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (...args: Parameters<T>): void {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, wait);
  };
}

/**
 * 创建节流函数
 */
function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let lastTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (...args: Parameters<T>): void {
    const now = Date.now();
    const remaining = wait - (now - lastTime);

    if (remaining <= 0 || remaining > wait) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastTime = now;
      func(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastTime = Date.now();
        timeoutId = null;
        func(...args);
      }, remaining);
    }
  };
}

// ============================================================================
// 通配符匹配工具
// ============================================================================

/**
 * 检查事件类型是否匹配通配符模式
 * 支持的通配符：
 * - '*' 匹配单层级
 * - '**' 匹配多层级
 */
function matchWildcard(pattern: string, eventType: string): boolean {
  // 完全匹配
  if (pattern === eventType) {
    return true;
  }

  // 匹配所有事件
  if (pattern === '*' || pattern === '**') {
    return true;
  }

  const patternParts = pattern.split(':');
  const eventParts = eventType.split(':');

  let pi = 0;
  let ei = 0;

  while (pi < patternParts.length && ei < eventParts.length) {
    const patternPart = patternParts[pi];

    if (patternPart === '**') {
      // ** 匹配剩余所有层级
      if (pi === patternParts.length - 1) {
        return true;
      }
      // 尝试匹配下一个非 ** 的模式部分
      pi++;
      const nextPattern = patternParts[pi];
      while (ei < eventParts.length) {
        if (eventParts[ei] === nextPattern || nextPattern === '*') {
          break;
        }
        ei++;
      }
    } else if (patternPart === '*') {
      // * 匹配单个层级
      pi++;
      ei++;
    } else if (patternPart === eventParts[ei]) {
      // 完全匹配
      pi++;
      ei++;
    } else {
      return false;
    }
  }

  // 检查是否完全匹配
  return pi === patternParts.length && ei === eventParts.length;
}

// ============================================================================
// 事件总线实现
// ============================================================================

/**
 * 事件总线核心实现
 */
export class EventBus implements IEventBusWithMiddleware {
  private config: Required<EventBusConfig>;
  private handlers: Map<string, RegisteredHandler[]> = new Map();
  private middlewares: EventMiddleware[] = [];
  private history: EventHistory | null = null;
  private destroyed = false;

  constructor(config?: Partial<EventBusConfig>) {
    this.config = { ...DEFAULT_EVENT_BUS_CONFIG, ...config };

    if (this.config.enableHistory) {
      this.history = new EventHistory(this.config.historyMaxLength);
    }
  }

  // ============================================================================
  // IEventBus 实现
  // ============================================================================

  emit<T>(eventOrParams: BaseEvent<T> | CreateEventParams<T>): boolean {
    if (this.destroyed) {
      this.logWarning('EventBus is destroyed, cannot emit events');
      return false;
    }

    const event = this.normalizeEvent(eventOrParams);
    
    try {
      // 同步执行中间件和处理器
      this.executeWithMiddleware(event);
      return true;
    } catch (error) {
      this.handleError(error as Error, event);
      return false;
    }
  }

  async emitAsync<T>(eventOrParams: BaseEvent<T> | CreateEventParams<T>): Promise<void> {
    if (this.destroyed) {
      throw new Error('EventBus is destroyed, cannot emit events');
    }

    const event = this.normalizeEvent(eventOrParams);
    await this.executeWithMiddlewareAsync(event);
  }

  on<T>(
    eventType: string,
    handler: EventHandler<T>,
    options?: SubscribeOptions
  ): SubscriptionToken {
    if (this.destroyed) {
      throw new Error('EventBus is destroyed, cannot subscribe');
    }

    const subscriptionId = options?.handlerId || generateSubscriptionId();
    
    // 应用防抖或节流
    let wrappedHandler = handler;
    if (options?.debounce) {
      wrappedHandler = debounce(handler as (...args: unknown[]) => unknown, options.debounce) as EventHandler<T>;
    } else if (options?.throttle) {
      wrappedHandler = throttle(handler as (...args: unknown[]) => unknown, options.throttle) as EventHandler<T>;
    }

    const registeredHandler: RegisteredHandler<T> = {
      handler: wrappedHandler,
      config: {
        id: subscriptionId,
        once: options?.once ?? false,
        priority: options?.priority ?? 0,
        async: true,
        errorStrategy: this.config.defaultErrorStrategy,
      },
    };

    // 添加过滤器到处理器
    if (options?.filter) {
      const originalHandler = registeredHandler.handler;
      const filter = options.filter;
      registeredHandler.handler = ((event: BaseEvent<T>) => {
        if (filter(event)) {
          return originalHandler(event);
        }
      }) as EventHandler<T>;
    }

    // 获取或创建处理器列表
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    const handlerList = this.handlers.get(eventType)!;

    // 检查监听器数量限制
    if (handlerList.length >= this.config.maxListeners) {
      this.logWarning(
        `MaxListeners (${this.config.maxListeners}) exceeded for event type: ${eventType}`
      );
    }

    // 按优先级排序插入
    const insertIndex = handlerList.findIndex(
      (h) => (h.config.priority ?? 0) < (registeredHandler.config.priority ?? 0)
    );
    if (insertIndex === -1) {
      handlerList.push(registeredHandler as RegisteredHandler);
    } else {
      handlerList.splice(insertIndex, 0, registeredHandler as RegisteredHandler);
    }

    // 返回订阅令牌
    const token: SubscriptionToken = {
      id: subscriptionId,
      eventType,
      unsubscribe: () => this.off(token),
    };

    this.logDebug(`Subscribed to ${eventType} with id ${subscriptionId}`);
    return token;
  }

  once<T>(
    eventType: string,
    handler: EventHandler<T>,
    options?: Omit<SubscribeOptions, 'once'>
  ): SubscriptionToken {
    return this.on(eventType, handler, { ...options, once: true });
  }

  off(tokenOrEventType: SubscriptionToken | string, handler?: EventHandler): void {
    if (this.destroyed) {
      return;
    }

    if (typeof tokenOrEventType === 'string') {
      // 按事件类型和处理器移除
      const eventType = tokenOrEventType;
      if (!handler) {
        this.logWarning('Handler is required when unsubscribing by event type');
        return;
      }

      const handlerList = this.handlers.get(eventType);
      if (handlerList) {
        const index = handlerList.findIndex((h) => h.handler === handler);
        if (index !== -1) {
          handlerList.splice(index, 1);
          this.logDebug(`Unsubscribed from ${eventType}`);
        }
      }
    } else {
      // 按订阅令牌移除
      const token = tokenOrEventType;
      const handlerList = this.handlers.get(token.eventType);
      if (handlerList) {
        const index = handlerList.findIndex((h) => h.config.id === token.id);
        if (index !== -1) {
          handlerList.splice(index, 1);
          this.logDebug(`Unsubscribed ${token.id} from ${token.eventType}`);
        }
      }
    }
  }

  removeAllListeners(eventType?: string): void {
    if (this.destroyed) {
      return;
    }

    if (eventType) {
      this.handlers.delete(eventType);
      this.logDebug(`Removed all listeners for ${eventType}`);
    } else {
      this.handlers.clear();
      this.logDebug('Removed all listeners');
    }
  }

  listenerCount(eventType: string): number {
    if (this.config.wildcardSupport) {
      let count = 0;
      for (const [type, handlers] of this.handlers) {
        if (matchWildcard(type, eventType) || matchWildcard(eventType, type)) {
          count += handlers.length;
        }
      }
      return count;
    }
    return this.handlers.get(eventType)?.length ?? 0;
  }

  eventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  async waitFor<T>(
    eventType: string,
    timeout: number = 0,
    filter?: (event: BaseEvent<T>) => boolean
  ): Promise<BaseEvent<T>> {
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const token = this.on<T>(eventType, (event) => {
        if (filter && !filter(event)) {
          return;
        }

        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        token.unsubscribe();
        resolve(event);
      });

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          token.unsubscribe();
          reject(new Error(`Timeout waiting for event: ${eventType}`));
        }, timeout);
      }
    });
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.handlers.clear();
    this.middlewares = [];
    this.history?.clear();
    this.destroyed = true;
    this.logDebug('EventBus destroyed');
  }

  // ============================================================================
  // IEventBusWithMiddleware 实现
  // ============================================================================

  use(middleware: EventMiddleware): void {
    if (this.destroyed) {
      throw new Error('EventBus is destroyed, cannot add middleware');
    }
    this.middlewares.push(middleware);
    this.logDebug('Middleware added');
  }

  removeMiddleware(middleware: EventMiddleware): void {
    const index = this.middlewares.indexOf(middleware);
    if (index !== -1) {
      this.middlewares.splice(index, 1);
      this.logDebug('Middleware removed');
    }
  }

  // ============================================================================
  // 公共辅助方法
  // ============================================================================

  /**
   * 获取事件历史
   */
  getHistory(): IEventHistory | null {
    return this.history;
  }

  /**
   * 获取配置
   */
  getConfig(): Required<EventBusConfig> {
    return { ...this.config };
  }

  /**
   * 检查是否已销毁
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 标准化事件对象
   */
  private normalizeEvent<T>(eventOrParams: BaseEvent<T> | CreateEventParams<T>): BaseEvent<T> {
    if (isBaseEvent(eventOrParams)) {
      return eventOrParams;
    }
    if (isCreateEventParams(eventOrParams)) {
      return createEvent(eventOrParams);
    }
    throw new Error('Invalid event or params');
  }

  /**
   * 获取匹配的处理器
   */
  private getMatchingHandlers<T>(eventType: string): RegisteredHandler<T>[] {
    const matchingHandlers: RegisteredHandler<T>[] = [];

    if (this.config.wildcardSupport) {
      for (const [pattern, handlers] of this.handlers) {
        if (matchWildcard(pattern, eventType)) {
          matchingHandlers.push(...(handlers as RegisteredHandler<T>[]));
        }
      }
    } else {
      const handlers = this.handlers.get(eventType);
      if (handlers) {
        matchingHandlers.push(...(handlers as RegisteredHandler<T>[]));
      }
    }

    // 按优先级排序
    return matchingHandlers.sort(
      (a, b) => (b.config.priority ?? 0) - (a.config.priority ?? 0)
    );
  }

  /**
   * 同步执行中间件和处理器
   */
  private executeWithMiddleware<T>(event: BaseEvent<T>): void {
    const startTime = Date.now();
    const errors: Error[] = [];

    const context: EventMiddlewareContext<T> = {
      event,
      eventBus: this,
      metadata: {},
    };

    // 执行中间件链
    let middlewareIndex = 0;
    const executeNext = (): void => {
      if (middlewareIndex < this.middlewares.length) {
        const middleware = this.middlewares[middlewareIndex++];
        try {
          // 同步执行中间件（忽略 Promise）
          middleware(context, () => {
            executeNext();
            return Promise.resolve();
          });
        } catch (error) {
          errors.push(error as Error);
          executeNext();
        }
      } else {
        // 执行处理器
        this.executeHandlers(event, errors);
      }
    };

    executeNext();

    // 记录历史
    if (this.history) {
      const processingTime = Date.now() - startTime;
      const handlerCount = this.getMatchingHandlers(event.type).length;
      this.history.add({
        event,
        handlerCount,
        processingTime,
        errors,
      });
    }
  }

  /**
   * 异步执行中间件和处理器
   */
  private async executeWithMiddlewareAsync<T>(event: BaseEvent<T>): Promise<void> {
    const startTime = Date.now();
    const errors: Error[] = [];

    const context: EventMiddlewareContext<T> = {
      event,
      eventBus: this,
      metadata: {},
    };

    // 创建中间件执行链
    let middlewareIndex = this.middlewares.length - 1;

    const createNext = (currentIndex: number): EventMiddlewareNext => {
      return async () => {
        if (currentIndex < 0) {
          // 执行处理器
          await this.executeHandlersAsync(event, errors);
          return;
        }

        const middleware = this.middlewares[currentIndex];
        try {
          await middleware(context, createNext(currentIndex - 1));
        } catch (error) {
          errors.push(error as Error);
          await createNext(currentIndex - 1)();
        }
      };
    };

    await createNext(middlewareIndex)();

    // 记录历史
    if (this.history) {
      const processingTime = Date.now() - startTime;
      const handlerCount = this.getMatchingHandlers(event.type).length;
      this.history.add({
        event,
        handlerCount,
        processingTime,
        errors,
      });
    }

    // 如果有错误且配置为抛出
    if (errors.length > 0 && this.config.defaultErrorStrategy === 'throw') {
      throw errors[0];
    }
  }

  /**
   * 同步执行处理器
   */
  private executeHandlers<T>(event: BaseEvent<T>, errors: Error[]): void {
    const handlers = this.getMatchingHandlers<T>(event.type);
    const handlersToRemove: RegisteredHandler<T>[] = [];

    for (const registeredHandler of handlers) {
      try {
        const result = registeredHandler.handler(event);
        // 如果返回 Promise，不等待（同步模式）
        if (result instanceof Promise) {
          result.catch((error) => {
            this.handleError(error, event, registeredHandler);
          });
        }

        if (registeredHandler.config.once) {
          handlersToRemove.push(registeredHandler);
        }
      } catch (error) {
        errors.push(error as Error);
        this.handleError(error as Error, event, registeredHandler);
      }
    }

    // 移除一次性处理器
    for (const handler of handlersToRemove) {
      this.removeHandler(event.type, handler);
    }
  }

  /**
   * 异步执行处理器
   */
  private async executeHandlersAsync<T>(event: BaseEvent<T>, errors: Error[]): Promise<void> {
    const handlers = this.getMatchingHandlers<T>(event.type);
    const handlersToRemove: RegisteredHandler<T>[] = [];

    // 创建带超时的处理器执行
    const executeWithTimeout = async (
      handler: RegisteredHandler<T>
    ): Promise<void> => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Handler timeout after ${this.config.handlerTimeout}ms`));
        }, this.config.handlerTimeout);
      });

      const handlerPromise = (async () => {
        const result = handler.handler(event);
        if (result instanceof Promise) {
          await result;
        }
      })();

      await Promise.race([handlerPromise, timeoutPromise]);
    };

    // 按优先级分组并行执行
    const handlerPromises = handlers.map(async (registeredHandler) => {
      try {
        await executeWithTimeout(registeredHandler);

        if (registeredHandler.config.once) {
          handlersToRemove.push(registeredHandler);
        }
      } catch (error) {
        errors.push(error as Error);
        this.handleError(error as Error, event, registeredHandler);
      }
    });

    await Promise.all(handlerPromises);

    // 移除一次性处理器
    for (const handler of handlersToRemove) {
      this.removeHandler(event.type, handler);
    }
  }

  /**
   * 移除处理器
   */
  private removeHandler<T>(eventType: string, handler: RegisteredHandler<T>): void {
    const handlerList = this.handlers.get(eventType);
    if (handlerList) {
      const index = handlerList.findIndex((h) => h.config.id === handler.config.id);
      if (index !== -1) {
        handlerList.splice(index, 1);
      }
    }
  }

  /**
   * 错误处理
   */
  private handleError<T>(
    error: Error,
    event: BaseEvent<T>,
    handler?: RegisteredHandler<T>
  ): void {
    const strategy = handler?.config.errorStrategy ?? this.config.defaultErrorStrategy;

    switch (strategy) {
      case 'throw':
        throw error;
      case 'log':
        this.logError(
          `Error handling event ${event.type}${handler ? ` in handler ${handler.config.id}` : ''}:`,
          error
        );
        break;
      case 'ignore':
      default:
        // 静默忽略
        break;
    }
  }

  /**
   * 调试日志
   */
  private logDebug(message: string): void {
    if (this.config.debug) {
      console.debug(`[EventBus] ${message}`);
    }
  }

  /**
   * 警告日志
   */
  private logWarning(message: string): void {
    console.warn(`[EventBus] ${message}`);
  }

  /**
   * 错误日志
   */
  private logError(message: string, error: Error): void {
    console.error(`[EventBus] ${message}`, error);
  }
}

// ============================================================================
// 单例工厂
// ============================================================================

let globalEventBus: EventBus | null = null;

/**
 * 获取全局事件总线实例
 */
export function getGlobalEventBus(config?: Partial<EventBusConfig>): EventBus {
  if (!globalEventBus || globalEventBus.isDestroyed()) {
    globalEventBus = new EventBus(config);
  }
  return globalEventBus;
}

/**
 * 重置全局事件总线
 */
export function resetGlobalEventBus(): void {
  if (globalEventBus) {
    globalEventBus.destroy();
    globalEventBus = null;
  }
}

// ============================================================================
// 类型化事件辅助函数
// ============================================================================

import type { EventPayloadMap, AllEventTypes } from '../types/events';

/**
 * 创建类型化的事件发布函数
 */
export function createTypedEmitter(eventBus: IEventBus) {
  return function emit<T extends AllEventTypes>(
    type: T,
    payload: EventPayloadMap[T],
    options?: Omit<CreateEventParams<EventPayloadMap[T]>, 'type' | 'payload'>
  ): boolean {
    return eventBus.emit({
      type,
      payload,
      ...options,
    });
  };
}

/**
 * 创建类型化的事件订阅函数
 */
export function createTypedSubscriber(eventBus: IEventBus) {
  return function on<T extends AllEventTypes>(
    type: T,
    handler: EventHandler<EventPayloadMap[T]>,
    options?: SubscribeOptions
  ): SubscriptionToken {
    return eventBus.on(type, handler, options);
  };
}

// ============================================================================
// 预定义中间件
// ============================================================================

/**
 * 日志中间件 - 记录所有事件
 */
export const loggingMiddleware: EventMiddleware = async (context, next) => {
  const { event } = context;
  const startTime = Date.now();
  
  console.log(`[Event] ${event.type} started`, {
    id: event.id,
    payload: event.payload,
    source: event.source,
  });

  await next();

  const duration = Date.now() - startTime;
  console.log(`[Event] ${event.type} completed in ${duration}ms`);
};

/**
 * 验证中间件 - 验证事件负载
 */
export function createValidationMiddleware(
  validators: Map<string, (payload: unknown) => boolean>
): EventMiddleware {
  return async (context, next) => {
    const { event } = context;
    const validator = validators.get(event.type);

    if (validator && !validator(event.payload)) {
      throw new Error(`Invalid payload for event type: ${event.type}`);
    }

    await next();
  };
}

/**
 * 性能监控中间件
 */
export function createPerformanceMiddleware(
  onSlowEvent: (eventType: string, duration: number) => void,
  threshold: number = 100
): EventMiddleware {
  return async (context, next) => {
    const startTime = Date.now();
    await next();
    const duration = Date.now() - startTime;

    if (duration > threshold) {
      onSlowEvent(context.event.type, duration);
    }
  };
}

/**
 * 错误边界中间件
 */
export function createErrorBoundaryMiddleware(
  onError: (error: Error, eventType: string) => void
): EventMiddleware {
  return async (context, next) => {
    try {
      await next();
    } catch (error) {
      onError(error as Error, context.event.type);
      // 不重新抛出，防止错误传播
    }
  };
}

// ============================================================================
// 导出默认实例
// ============================================================================

export default EventBus;