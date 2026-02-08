/**
 * 事件总线类型定义
 * 定义事件驱动架构的核心类型
 */

// ============================================================================
// 事件基础类型
// ============================================================================

/**
 * 事件唯一标识符
 */
export type EventId = string;

/**
 * 事件优先级
 */
export enum EventPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * 事件基础接口 - 所有事件必须实现
 */
export interface BaseEvent<T = unknown> {
  /** 事件唯一ID */
  id: EventId;
  /** 事件类型标识 */
  type: string;
  /** 事件负载数据 */
  payload: T;
  /** 事件时间戳 */
  timestamp: number;
  /** 事件来源标识 */
  source?: string;
  /** 事件优先级 */
  priority?: EventPriority;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 事件创建参数
 */
export interface CreateEventParams<T = unknown> {
  type: string;
  payload: T;
  source?: string;
  priority?: EventPriority;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 事件处理器类型
// ============================================================================

/**
 * 事件处理器函数类型
 */
export type EventHandler<T = unknown> = (event: BaseEvent<T>) => void | Promise<void>;

/**
 * 事件处理器配置
 */
export interface EventHandlerConfig {
  /** 处理器唯一ID */
  id: string;
  /** 是否只触发一次 */
  once?: boolean;
  /** 处理器优先级 (数字越大越先执行) */
  priority?: number;
  /** 是否异步执行 */
  async?: boolean;
  /** 错误处理策略 */
  errorStrategy?: 'ignore' | 'log' | 'throw';
}

/**
 * 已注册的事件处理器
 */
export interface RegisteredHandler<T = unknown> {
  handler: EventHandler<T>;
  config: EventHandlerConfig;
}

// ============================================================================
// 事件订阅类型
// ============================================================================

/**
 * 订阅令牌 - 用于取消订阅
 */
export interface SubscriptionToken {
  /** 订阅ID */
  id: string;
  /** 事件类型 */
  eventType: string;
  /** 取消订阅函数 */
  unsubscribe: () => void;
}

/**
 * 订阅选项
 */
export interface SubscribeOptions {
  /** 处理器ID (用于调试和日志) */
  handlerId?: string;
  /** 是否只触发一次后自动取消订阅 */
  once?: boolean;
  /** 处理器优先级 */
  priority?: number;
  /** 过滤函数 - 返回 true 时才触发处理器 */
  filter?: <T>(event: BaseEvent<T>) => boolean;
  /** 防抖时间 (毫秒) */
  debounce?: number;
  /** 节流时间 (毫秒) */
  throttle?: number;
}

// ============================================================================
// 事件总线接口
// ============================================================================

/**
 * 事件总线核心接口
 */
export interface IEventBus {
  /**
   * 发布事件
   * @param event 事件对象或创建参数
   * @returns 发布是否成功
   */
  emit<T>(event: BaseEvent<T> | CreateEventParams<T>): boolean;

  /**
   * 异步发布事件并等待所有处理器完成
   * @param event 事件对象或创建参数
   * @returns 所有处理器执行结果
   */
  emitAsync<T>(event: BaseEvent<T> | CreateEventParams<T>): Promise<void>;

  /**
   * 订阅事件
   * @param eventType 事件类型
   * @param handler 事件处理器
   * @param options 订阅选项
   * @returns 订阅令牌
   */
  on<T>(eventType: string, handler: EventHandler<T>, options?: SubscribeOptions): SubscriptionToken;

  /**
   * 订阅事件 (只触发一次)
   * @param eventType 事件类型
   * @param handler 事件处理器
   * @param options 订阅选项
   * @returns 订阅令牌
   */
  once<T>(eventType: string, handler: EventHandler<T>, options?: Omit<SubscribeOptions, 'once'>): SubscriptionToken;

  /**
   * 取消订阅
   * @param token 订阅令牌或事件类型
   * @param handler 可选的处理器 (当第一个参数为事件类型时使用)
   */
  off(token: SubscriptionToken | string, handler?: EventHandler): void;

  /**
   * 移除指定事件类型的所有处理器
   * @param eventType 事件类型
   */
  removeAllListeners(eventType?: string): void;

  /**
   * 获取指定事件类型的处理器数量
   * @param eventType 事件类型
   */
  listenerCount(eventType: string): number;

  /**
   * 获取所有已注册的事件类型
   */
  eventTypes(): string[];

  /**
   * 等待特定事件触发
   * @param eventType 事件类型
   * @param timeout 超时时间 (毫秒)，0 表示无限等待
   * @param filter 可选的过滤函数
   */
  waitFor<T>(eventType: string, timeout?: number, filter?: (event: BaseEvent<T>) => boolean): Promise<BaseEvent<T>>;

  /**
   * 销毁事件总线，清理所有订阅
   */
  destroy(): void;
}

// ============================================================================
// 事件总线配置
// ============================================================================

/**
 * 事件总线配置选项
 */
export interface EventBusConfig {
  /** 最大监听器数量 (每个事件类型) */
  maxListeners?: number;
  /** 是否启用调试模式 */
  debug?: boolean;
  /** 是否启用事件历史记录 */
  enableHistory?: boolean;
  /** 历史记录最大长度 */
  historyMaxLength?: number;
  /** 默认错误处理策略 */
  defaultErrorStrategy?: 'ignore' | 'log' | 'throw';
  /** 通配符支持 */
  wildcardSupport?: boolean;
  /** 事件处理超时时间 (毫秒) */
  handlerTimeout?: number;
}

/**
 * 默认事件总线配置
 */
export const DEFAULT_EVENT_BUS_CONFIG: Required<EventBusConfig> = {
  maxListeners: 100,
  debug: false,
  enableHistory: false,
  historyMaxLength: 1000,
  defaultErrorStrategy: 'log',
  wildcardSupport: true,
  handlerTimeout: 30000,
};

// ============================================================================
// 事件历史记录类型
// ============================================================================

/**
 * 事件历史记录项
 */
export interface EventHistoryItem<T = unknown> {
  event: BaseEvent<T>;
  handlerCount: number;
  processingTime: number;
  errors: Error[];
}

/**
 * 事件历史记录接口
 */
export interface IEventHistory {
  /** 添加记录 */
  add<T>(item: EventHistoryItem<T>): void;
  /** 获取所有记录 */
  getAll(): EventHistoryItem[];
  /** 按事件类型获取记录 */
  getByType(eventType: string): EventHistoryItem[];
  /** 清空历史 */
  clear(): void;
  /** 获取记录数量 */
  size(): number;
}

// ============================================================================
// 事件中间件类型
// ============================================================================

/**
 * 事件中间件上下文
 */
export interface EventMiddlewareContext<T = unknown> {
  event: BaseEvent<T>;
  eventBus: IEventBus;
  metadata: Record<string, unknown>;
}

/**
 * 中间件下一步函数
 */
export type EventMiddlewareNext = () => Promise<void>;

/**
 * 事件中间件函数类型
 */
export type EventMiddleware<T = unknown> = (
  context: EventMiddlewareContext<T>,
  next: EventMiddlewareNext
) => Promise<void>;

/**
 * 支持中间件的事件总线接口
 */
export interface IEventBusWithMiddleware extends IEventBus {
  /**
   * 添加中间件
   * @param middleware 中间件函数
   */
  use(middleware: EventMiddleware): void;

  /**
   * 移除中间件
   * @param middleware 中间件函数
   */
  removeMiddleware(middleware: EventMiddleware): void;
}

// ============================================================================
// 跨进程事件类型 (Electron IPC)
// ============================================================================

/**
 * IPC 事件通道名称
 */
export type IPCChannel = string;

/**
 * IPC 事件方向
 */
export type IPCDirection = 'main-to-renderer' | 'renderer-to-main' | 'bidirectional';

/**
 * IPC 事件定义
 */
export interface IPCEventDefinition<T = unknown> {
  channel: IPCChannel;
  direction: IPCDirection;
  payloadType?: T;
}

/**
 * IPC 事件总线接口 (跨进程通信)
 */
export interface IIPCEventBus {
  /**
   * 发送事件到主进程
   * @param channel IPC 通道
   * @param payload 事件负载
   */
  sendToMain<T>(channel: IPCChannel, payload: T): void;

  /**
   * 发送事件到渲染进程
   * @param channel IPC 通道
   * @param payload 事件负载
   * @param webContentsId 可选的 webContents ID
   */
  sendToRenderer<T>(channel: IPCChannel, payload: T, webContentsId?: number): void;

  /**
   * 监听来自主进程的事件
   * @param channel IPC 通道
   * @param handler 处理器
   */
  onFromMain<T>(channel: IPCChannel, handler: (payload: T) => void): () => void;

  /**
   * 监听来自渲染进程的事件
   * @param channel IPC 通道
   * @param handler 处理器
   */
  onFromRenderer<T>(channel: IPCChannel, handler: (event: Electron.IpcMainEvent, payload: T) => void): () => void;

  /**
   * 调用主进程方法并等待响应
   * @param channel IPC 通道
   * @param payload 请求负载
   */
  invoke<TRequest, TResponse>(channel: IPCChannel, payload: TRequest): Promise<TResponse>;

  /**
   * 处理来自渲染进程的调用
   * @param channel IPC 通道
   * @param handler 处理器
   */
  handle<TRequest, TResponse>(
    channel: IPCChannel,
    handler: (event: Electron.IpcMainInvokeEvent, payload: TRequest) => Promise<TResponse> | TResponse
  ): void;
}

// ============================================================================
// 类型守卫
// ============================================================================

/**
 * 检查是否为有效的 BaseEvent
 */
export function isBaseEvent<T>(obj: unknown): obj is BaseEvent<T> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'type' in obj &&
    'payload' in obj &&
    'timestamp' in obj
  );
}

/**
 * 检查是否为 CreateEventParams
 */
export function isCreateEventParams<T>(obj: unknown): obj is CreateEventParams<T> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'type' in obj &&
    'payload' in obj &&
    !('id' in obj) &&
    !('timestamp' in obj)
  );
}

// ============================================================================
// 工厂函数类型
// ============================================================================

/**
 * 事件工厂函数类型
 */
export type EventFactory<T> = (payload: T, options?: Partial<CreateEventParams<T>>) => BaseEvent<T>;

/**
 * 创建类型化事件工厂
 */
export interface TypedEventFactory<TPayload> {
  type: string;
  create: (payload: TPayload, options?: Omit<CreateEventParams<TPayload>, 'type' | 'payload'>) => BaseEvent<TPayload>;
}