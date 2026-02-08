/**
 * 事件总线核心类型定义
 * @module shared/types/event-bus
 */

/**
 * 事件优先级
 */
export enum EventPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

/**
 * 事件元数据
 */
export interface EventMeta {
  /** 事件唯一ID */
  id: string;
  /** 事件时间戳 */
  timestamp: number;
  /** 事件来源模块 */
  source: string;
  /** 事件优先级 */
  priority: EventPriority;
  /** 是否可取消 */
  cancelable: boolean;
  /** 是否已取消 */
  cancelled: boolean;
}

/**
 * 基础事件接口
 */
export interface IEvent<T = unknown> {
  /** 事件类型 */
  readonly type: string;
  /** 事件数据 */
  readonly data: T;
  /** 事件元数据 */
  readonly meta: EventMeta;
  /** 取消事件 */
  cancel(): void;
}

/**
 * 事件监听器
 */
export type EventListener<T = unknown> = (event: IEvent<T>) => void | Promise<void>;

/**
 * 事件订阅选项
 */
export interface SubscriptionOptions {
  /** 执行优先级 */
  priority?: EventPriority;
  /** 只触发一次 */
  once?: boolean;
  /** 过滤条件 */
  filter?: (event: IEvent) => boolean;
}

/**
 * 事件订阅句柄
 */
export interface Subscription {
  /** 取消订阅 */
  unsubscribe(): void;
  /** 是否已取消 */
  readonly isUnsubscribed: boolean;
}

/**
 * 事件总线接口
 */
export interface IEventBus {
  /**
   * 发布事件
   * @param type 事件类型
   * @param data 事件数据
   * @param options 发布选项
   */
  emit<T>(type: string, data: T, options?: Partial<EventMeta>): Promise<void>;

  /**
   * 订阅事件
   * @param type 事件类型
   * @param listener 监听器
   * @param options 订阅选项
   */
  on<T>(type: string, listener: EventListener<T>, options?: SubscriptionOptions): Subscription;

  /**
   * 订阅一次事件
   * @param type 事件类型
   * @param listener 监听器
   */
  once<T>(type: string, listener: EventListener<T>): Subscription;

  /**
   * 取消订阅
   * @param type 事件类型
   * @param listener 监听器
   */
  off<T>(type: string, listener: EventListener<T>): void;

  /**
   * 等待事件
   * @param type 事件类型
   * @param timeout 超时时间(ms)
   */
  waitFor<T>(type: string, timeout?: number): Promise<IEvent<T>>;

  /**
   * 创建事件通道
   * @param namespace 命名空间
   */
  channel(namespace: string): IEventChannel;
}

/**
 * 事件通道 - 用于模块隔离
 */
export interface IEventChannel {
  readonly namespace: string;
  emit<T>(type: string, data: T): Promise<void>;
  on<T>(type: string, listener: EventListener<T>): Subscription;
  off<T>(type: string, listener: EventListener<T>): void;
  dispose(): void;
}