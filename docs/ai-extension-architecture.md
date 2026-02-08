# AI功能扩展架构设计

## 1. 设计目标

### 1.1 核心原则
- **松耦合**：AI模块与宠物核心系统独立，通过抽象接口通信
- **可插拔**：每个AI能力可独立启用/禁用，不影响其他功能
- **事件驱动**：使用事件总线实现模块间异步通信
- **渐进增强**：基础宠物功能无AI时仍可独立运行

### 1.2 架构概览
```
┌─────────────────────────────────────────────────────────────────────────┐
│                           桌面宠物应用                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐         ┌──────────────────────────────────────┐  │
│  │   宠物核心系统    │◄──────►│           事件总线 (Event Bus)         │  │
│  │  - 3D渲染       │  事件    │  - 发布/订阅模式                       │  │
│  │  - 动画状态机    │  通信    │  - 类型安全的事件定义                   │  │
│  │  - 用户交互     │         │  - 异步事件处理                        │  │
│  └─────────────────┘         └──────────────┬───────────────────────┘  │
│                                              │                          │
│                              ┌───────────────┼───────────────┐          │
│                              │               │               │          │
│                              ▼               ▼               ▼          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      能力接口层 (Capability Layer)                 │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐    │  │
│  │  │ IChatTrait │ │IMemoryTrait│ │IToolsTrait │ │IAgentTrait │    │  │
│  │  └──────┬─────┘ └──────┬─────┘ └──────┬─────┘ └──────┬─────┘    │  │
│  └─────────┼──────────────┼──────────────┼──────────────┼──────────┘  │
│            │              │              │              │              │
│            ▼              ▼              ▼              ▼              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        AI 功能模块                                 │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │  │
│  │  │   MCP    │  │  Skills  │  │  Memory  │  │  Agent   │         │  │
│  │  │ Servers  │  │  System  │  │  System  │  │  System  │         │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 事件总线设计 (Event Bus)

### 2.1 事件总线核心接口
```typescript
// src/shared/types/event-bus.ts

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
```

### 2.2 预定义事件类型
```typescript
// src/shared/types/events.ts

import { IEvent, EventMeta } from './event-bus';

/**
 * ========================================
 * 宠物系统事件
 * ========================================
 */

/** 宠物状态变化 */
export interface PetStateChangedEvent {
  previousState: string;
  currentState: string;
  trigger: string;
}

/** 宠物动作执行 */
export interface PetActionEvent {
  action: string;
  params?: Record<string, unknown>;
  duration?: number;
}

/** 用户交互事件 */
export interface UserInteractionEvent {
  type: 'click' | 'drag' | 'hover' | 'doubleClick' | 'rightClick';
  position: { x: number; y: number };
  target?: string;
}

/** 宠物情绪变化 */
export interface PetMoodChangedEvent {
  previousMood: string;
  currentMood: string;
  intensity: number; // 0-1
}

/**
 * ========================================
 * AI 对话事件
 * ========================================
 */

/** 用户消息 */
export interface UserMessageEvent {
  content: string;
  type: 'text' | 'voice';
  timestamp: number;
}

/** AI响应开始 */
export interface AIResponseStartEvent {
  requestId: string;
  provider: string;
}

/** AI响应流式输出 */
export interface AIResponseChunkEvent {
  requestId: string;
  chunk: string;
  isComplete: boolean;
}

/** AI响应完成 */
export interface AIResponseCompleteEvent {
  requestId: string;
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

/** AI响应错误 */
export interface AIResponseErrorEvent {
  requestId: string;
  error: string;
  code?: string;
}

/**
 * ========================================
 * 工具执行事件
 * ========================================
 */

/** 工具调用请求 */
export interface ToolCallRequestEvent {
  requestId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

/** 工具执行结果 */
export interface ToolCallResultEvent {
  requestId: string;
  toolName: string;
  result: unknown;
  success: boolean;
  error?: string;
}

/**
 * ========================================
 * 记忆系统事件
 * ========================================
 */

/** 记忆存储 */
export interface MemoryStoreEvent {
  key: string;
  value: unknown;
  namespace: string;
  ttl?: number;
}

/** 记忆检索 */
export interface MemoryRetrieveEvent {
  query: string;
  namespace: string;
  limit: number;
}

/** 记忆检索结果 */
export interface MemoryRetrieveResultEvent {
  query: string;
  results: Array<{
    content: string;
    score: number;
    metadata: Record<string, unknown>;
  }>;
}

/**
 * ========================================
 * Agent 事件
 * ========================================
 */

/** Agent任务开始 */
export interface AgentTaskStartEvent {
  taskId: string;
  goal: string;
  context?: Record<string, unknown>;
}

/** Agent思考过程 */
export interface AgentThinkingEvent {
  taskId: string;
  thought: string;
  step: number;
}

/** Agent执行动作 */
export interface AgentActionEvent {
  taskId: string;
  action: string;
  params: Record<string, unknown>;
}

/** Agent任务完成 */
export interface AgentTaskCompleteEvent {
  taskId: string;
  result: unknown;
  steps: number;
}

/**
 * ========================================
 * MCP 事件
 * ========================================
 */

/** MCP服务器连接 */
export interface MCPServerConnectedEvent {
  serverId: string;
  name: string;
  capabilities: string[];
}

/** MCP服务器断开 */
export interface MCPServerDisconnectedEvent {
  serverId: string;
  reason?: string;
}

/** MCP工具可用 */
export interface MCPToolAvailableEvent {
  serverId: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * ========================================
 * 系统事件
 * ========================================
 */

/** 模块加载完成 */
export interface ModuleLoadedEvent {
  moduleName: string;
  version: string;
}

/** 配置变更 */
export interface ConfigChangedEvent {
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

/** 错误事件 */
export interface ErrorEvent {
  source: string;
  error: Error;
  context?: Record<string, unknown>;
}

/**
 * 事件类型映射
 */
export interface EventTypeMap {
  // 宠物事件
  'pet:state:changed': PetStateChangedEvent;
  'pet:action': PetActionEvent;
  'pet:interaction': UserInteractionEvent;
  'pet:mood:changed': PetMoodChangedEvent;
  
  // AI对话事件
  'ai:message:user': UserMessageEvent;
  'ai:response:start': AIResponseStartEvent;
  'ai:response:chunk': AIResponseChunkEvent;
  'ai:response:complete': AIResponseCompleteEvent;
  'ai:response:error': AIResponseErrorEvent;
  
  // 工具事件
  'tool:call:request': ToolCallRequestEvent;
  'tool:call:result': ToolCallResultEvent;
  
  // 记忆事件
  'memory:store': MemoryStoreEvent;
  'memory:retrieve': MemoryRetrieveEvent;
  'memory:retrieve:result': MemoryRetrieveResultEvent;
  
  // Agent事件
  'agent:task:start': AgentTaskStartEvent;
  'agent:thinking': AgentThinkingEvent;
  'agent:action': AgentActionEvent;
  'agent:task:complete': AgentTaskCompleteEvent;
  
  // MCP事件
  'mcp:server:connected': MCPServerConnectedEvent;
  'mcp:server:disconnected': MCPServerDisconnectedEvent;
  'mcp:tool:available': MCPToolAvailableEvent;
  
  // 系统事件
  'system:module:loaded': ModuleLoadedEvent;
  'system:config:changed': ConfigChangedEvent;
  'system:error': ErrorEvent;
}

/**
 * 类型安全的事件发布器
 */
export interface TypedEventEmitter {
  emit<K extends keyof EventTypeMap>(
    type: K,
    data: EventTypeMap[K]
  ): Promise<void>;
  
  on<K extends keyof EventTypeMap>(
    type: K,
    listener: (event: IEvent<EventTypeMap[K]>) => void
  ): Subscription;
}
```

### 2.3 事件总线实现
```typescript
// src/shared/services/event-bus.ts

import { v4 as uuidv4 } from 'uuid';
import {
  IEventBus,
  IEventChannel,
  IEvent,
  EventMeta,
  EventPriority,
  EventListener,
  Subscription,
  SubscriptionOptions
} from '../types/event-bus';

/**
 * 事件实现
 */
class Event<T> implements IEvent<T> {
  constructor(
    public readonly type: string,
    public readonly data: T,
    public readonly meta: EventMeta
  ) {}

  cancel(): void {
    if (this.meta.cancelable) {
      (this.meta as any).cancelled = true;
    }
  }
}

/**
 * 订阅实现
 */
class SubscriptionImpl implements Subscription {
  private _isUnsubscribed = false;

  constructor(private unsubscribeCallback: () => void) {}

  get isUnsubscribed(): boolean {
    return this._isUnsubscribed;
  }

  unsubscribe(): void {
    if (!this._isUnsubscribed) {
      this._isUnsubscribed = true;
      this.unsubscribeCallback();
    }
  }
}

/**
 * 监听器包装
 */
interface ListenerWrapper<T = unknown> {
  listener: EventListener<T>;
  options: SubscriptionOptions;
}

/**
 * 事件总线实现
 */
export class EventBus implements IEventBus {
  private listeners: Map<string, ListenerWrapper[]> = new Map();
  private channels: Map<string, EventChannel> = new Map();

  async emit<T>(
    type: string,
    data: T,
    options?: Partial<EventMeta>
  ): Promise<void> {
    const meta: EventMeta = {
      id: uuidv4(),
      timestamp: Date.now(),
      source: options?.source ?? 'unknown',
      priority: options?.priority ?? EventPriority.NORMAL,
      cancelable: options?.cancelable ?? false,
      cancelled: false
    };

    const event = new Event(type, data, meta);
    const wrappers = this.listeners.get(type) || [];

    // 按优先级排序
    const sortedWrappers = [...wrappers].sort(
      (a, b) => (b.options.priority || 0) - (a.options.priority || 0)
    );

    for (const wrapper of sortedWrappers) {
      if (event.meta.cancelled) break;

      // 应用过滤器
      if (wrapper.options.filter && !wrapper.options.filter(event)) {
        continue;
      }

      try {
        await wrapper.listener(event);
      } catch (error) {
        console.error(`Event listener error for ${type}:`, error);
      }

      // 处理once选项
      if (wrapper.options.once) {
        this.removeListener(type, wrapper);
      }
    }
  }

  on<T>(
    type: string,
    listener: EventListener<T>,
    options: SubscriptionOptions = {}
  ): Subscription {
    const wrapper: ListenerWrapper<T> = { listener, options };

    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(wrapper as ListenerWrapper);

    return new SubscriptionImpl(() => this.removeListener(type, wrapper as ListenerWrapper));
  }

  once<T>(type: string, listener: EventListener<T>): Subscription {
    return this.on(type, listener, { once: true });
  }

  off<T>(type: string, listener: EventListener<T>): void {
    const wrappers = this.listeners.get(type);
    if (wrappers) {
      const index = wrappers.findIndex(w => w.listener === listener);
      if (index !== -1) {
        wrappers.splice(index, 1);
      }
    }
  }

  async waitFor<T>(type: string, timeout?: number): Promise<IEvent<T>> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;

      const subscription = this.once<T>(type, (event) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(event);
      });

      if (timeout) {
        timeoutId = setTimeout(() => {
          subscription.unsubscribe();
          reject(new Error(`Timeout waiting for event: ${type}`));
        }, timeout);
      }
    });
  }

  channel(namespace: string): IEventChannel {
    if (!this.channels.has(namespace)) {
      this.channels.set(namespace, new EventChannel(namespace, this));
    }
    return this.channels.get(namespace)!;
  }

  private removeListener(type: string, wrapper: ListenerWrapper): void {
    const wrappers = this.listeners.get(type);
    if (wrappers) {
      const index = wrappers.indexOf(wrapper);
      if (index !== -1) {
        wrappers.splice(index, 1);
      }
    }
  }
}

/**
 * 事件通道实现
 */
class EventChannel implements IEventChannel {
  private subscriptions: Subscription[] = [];

  constructor(
    public readonly namespace: string,
    private bus: IEventBus
  ) {}

  async emit<T>(type: string, data: T): Promise<void> {
    const namespacedType = `${this.namespace}:${type}`;
    await this.bus.emit(namespacedType, data, { source: this.namespace });
  }

  on<T>(type: string, listener: EventListener<T>): Subscription {
    const namespacedType = `${this.namespace}:${type}`;
    const subscription = this.bus.on(namespacedType, listener);
    this.subscriptions.push(subscription);
    return subscription;
  }

  off<T>(type: string, listener: EventListener<T>): void {
    const namespacedType = `${this.namespace}:${type}`;
    this.bus.off(namespacedType, listener);
  }

  dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions = [];
  }
}

// 全局单例
let globalEventBus: EventBus | null = null;

export function getEventBus(): IEventBus {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  return globalEventBus;
}
```

---

## 3. 能力接口设计 (Capability/Trait)

### 3.1 能力接口定义
```typescript
// src/shared/types/capabilities.ts

/**
 * 能力元数据
 */
export interface CapabilityMeta {
  /** 能力ID */
  id: string;
  /** 能力名称 */
  name: string;
  /** 版本 */
  version: string;
  /** 描述 */
  description: string;
  /** 依赖的其他能力 */
  dependencies?: string[];
  /** 是否可选 */
  optional?: boolean;
}

/**
 * 能力状态
 */
export enum CapabilityStatus {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  ERROR = 'error',
  DISABLED = 'disabled'
}

/**
 * 基础能力接口
 */
export interface ICapability {
  /** 能力元数据 */
  readonly meta: CapabilityMeta;
  /** 当前状态 */
  readonly status: CapabilityStatus;
  /** 初始化 */
  initialize(): Promise<void>;
  /** 销毁 */
  dispose(): Promise<void>;
  /** 健康检查 */
  healthCheck(): Promise<boolean>;
}

/**
 * ========================================
 * 对话能力 (Chat Trait)
 * ========================================
 */
export interface IChatCapability extends ICapability {
  /**
   * 发送消息并获取响应
   */
  chat(message: string, options?: ChatOptions): Promise<ChatResponse>;

  /**
   * 流式对话
   */
  streamChat(message: string, options?: ChatOptions): AsyncGenerator<string>;

  /**
   * 获取对话历史
   */
  getHistory(): ChatMessage[];

  /**
   * 清除对话历史
   */
  clearHistory(): void;

  /**
   * 设置系统提示词
   */
  setSystemPrompt(prompt: string): void;
}

export interface ChatOptions {
  /** 温度参数 */
  temperature?: number;
  /** 最大token数 */
  maxTokens?: number;
  /** 停止词 */
  stopSequences?: string[];
  /** 工具列表 */
  tools?: ToolDefinition[];
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  timestamp: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * ========================================
 * 记忆能力 (Memory Trait)
 * ========================================
 */
export interface IMemoryCapability extends ICapability {
  /**
   * 存储记忆
   */
  store(key: string, value: unknown, options?: MemoryOptions): Promise<void>;

  /**
   * 获取记忆
   */
  retrieve(key: string): Promise<unknown | null>;

  /**
   * 语义搜索
   */
  search(query: string, options?: SearchOptions): Promise<MemorySearchResult[]>;

  /**
   * 删除记忆
   */
  delete(key: string): Promise<void>;

  /**
   * 清空命名空间
   */
  clear(namespace?: string): Promise<void>;

  /**
   * 获取统计信息
   */
  stats(): Promise<MemoryStats>;
}

export interface MemoryOptions {
  /** 命名空间 */
  namespace?: string;
  /** 过期时间(ms) */
  ttl?: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** 是否生成嵌入向量 */
  embed?: boolean;
}

export interface SearchOptions {
  /** 命名空间 */
  namespace?: string;
  /** 返回数量 */
  limit?: number;
  /** 最小相似度阈值 */
  threshold?: number;
  /** 元数据过滤 */
  filter?: Record<string, unknown>;
}

export interface MemorySearchResult {
  key: string;
  content: unknown;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryStats {
  totalEntries: number;
  namespaces: string[];
  storageSize: number;
}

/**
 * ========================================
 * 工具能力 (Tools Trait)
 * ========================================
 */
export interface IToolsCapability extends ICapability {
  /**
   * 注册工具
   */
  registerTool(definition: ToolDefinition, handler: ToolHandler): void;

  /**
   * 注销工具
   */
  unregisterTool(name: string): void;

  /**
   * 获取所有工具
   */
  getTools(): ToolDefinition[];

  /**
   * 执行工具
   */
  executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;

  /**
   * 批量执行工具
   */
  executeTools(calls: ToolCall[]): Promise<ToolResult[]>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ParameterSchema>;
    required?: string[];
  };
}

export interface ParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: unknown[];
  items?: ParameterSchema;
  properties?: Record<string, ParameterSchema>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  name: string;
  result: unknown;
  success: boolean;
  error?: string;
  duration?: number;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * ========================================
 * Agent能力 (Agent Trait)
 * ========================================
 */
export interface IAgentCapability extends ICapability {
  /**
   * 执行任务
   */
  executeTask(goal: string, context?: AgentContext): Promise<AgentResult>;

  /**
   * 取消任务
   */
  cancelTask(taskId: string): Promise<void>;

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): TaskStatus | null;

  /**
   * 订阅任务进度
   */
  onProgress(taskId: string, callback: (progress: AgentProgress) => void): void;
}

export interface AgentContext {
  /** 初始工具 */
  tools?: string[];
  /** 最大步骤数 */
  maxSteps?: number;
  /** 超时时间 */
  timeout?: number;
  /** 自定义变量 */
  variables?: Record<string, unknown>;
}

export interface AgentResult {
  taskId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  steps: AgentStep[];
  totalDuration: number;
}

export interface AgentStep {
  index: number;
  thought: string;
  action?: {
    tool: string;
    args: Record<string, unknown>;
  };
  observation?: string;
  duration: number;
}

export interface AgentProgress {
  taskId: string;
  currentStep: number;
  totalSteps?: number;
  thought?: string;
  action?: string;
}

export interface TaskStatus {
  taskId: string;
  state: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;
  startTime: number;
  endTime?: number;
}

/**
 * ========================================
 * MCP能力 (MCP Trait)
 * ========================================
 */
export interface IMCPCapability extends ICapability {
  /**
   * 连接MCP服务器
   */
  connect(config: MCPServerConfig): Promise<MCPConnection>;

  /**
   * 断开连接
   */
  disconnect(serverId: string): Promise<void>;

  /**
   * 获取所有连接
   */
  getConnections(): MCPConnection[];

  /**
   * 获取可用工具
   */
  getAvailableTools(serverId?: string): MCPTool[];

  /**
   * 获取可用资源
   */
  getAvailableResources(serverId?: string): MCPResource[];

  /**
   * 调用MCP工具
   */
  callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;

  /**
   * 访问MCP资源
   */
  accessResource(serverId: string, uri: string): Promise<unknown>;
}

export interface MCPServerConfig {
  /** 服务器名称 */
  name: string;
  /** 传输方式 */
  transport: 'stdio' | 'sse' | 'websocket';
  /** 命令 (stdio模式) */
  command?: string;
  /** 参数 (stdio模式) */
  args?: string[];
  /** URL (sse/websocket模式) */
  url?: string;
  /** 环境变量 */
  env?: Record<string, string>;
}

export interface MCPConnection {
  id: string;
  name: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  capabilities: string[];
  tools: MCPTool[];
  resources: MCPResource[];
}

export interface MCPTool {
  serverId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  serverId: string;
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * ========================================
 * Skills能力 (Skills Trait)
 * ========================================
 */
export interface ISkillsCapability extends ICapability {
  /**
   * 加载技能
   */
  loadSkill(name: string): Promise<Skill>;

  /**
   * 卸载技能
   */
  unloadSkill(name: string): Promise<void>;

  /**
   * 获取已加载技能
   */
  getLoadedSkills(): Skill[];

  /**
   * 获取可用技能列表
   */
  getAvailableSkills(): SkillMeta[];

  /**
   * 执行技能
   */
  executeSkill(name: string, input: string): Promise<SkillResult>;

  /**
   * 匹配技能
   */
  matchSkill(input: string): SkillMatch | null;
}

export interface SkillMeta {
  name: string;
  description: string;
  triggers: string[];
  version: string;
}

export interface Skill extends SkillMeta {
  status: 'loaded' | 'unloaded' | 'error';
  instructions: string;
  examples?: string[];
}

export interface SkillMatch {
  skillName: string;
  confidence: number;
  trigger: string;
}

export interface SkillResult {
  skillName: string;
  success: boolean;
  output?: string;
  actions?: SkillAction[];
  error?: string;
}

export interface SkillAction {
  type: 'message' | 'tool' | 'pet_action';
  payload: unknown;
}
```

### 3.2 能力注册与管理
```typescript
// src/shared/types/capability-registry.ts

import {
  ICapability,
  CapabilityStatus,
  IChatCapability,
  IMemoryCapability,
  IToolsCapability,
  IAgentCapability,
  IMCPCapability,
  ISkillsCapability
} from './capabilities';

/**
 * 能力类型标识
 */
export const CapabilityTypes = {
  CHAT: 'ai.capability.chat',
  MEMORY: 'ai.capability.memory',
  TOOLS: 'ai.capability.tools',
  AGENT: 'ai.capability.agent',
  MCP: 'ai.capability.mcp',
  SKILLS: 'ai.capability.skills'
} as const;

export type CapabilityType = typeof CapabilityTypes[keyof typeof CapabilityTypes];

/**
 * 能力类型映射
 */
export interface CapabilityTypeMap {
  [CapabilityTypes.CHAT]: IChatCapability;
  [CapabilityTypes.MEMORY]: IMemoryCapability;
  [CapabilityTypes.TOOLS]: IToolsCapability;
  [CapabilityTypes.AGENT]: IAgentCapability;
  [CapabilityTypes.MCP]: IMCPCapability;
  [CapabilityTypes.SKILLS]: ISkillsCapability;
}

/**
 * 能力注册表接口
 */
export interface ICapabilityRegistry {
  /**
   * 注册能力
   */
  register<T extends CapabilityType>(
    type: T,
    capability: CapabilityTypeMap[T]
  ): void;

  /**
   * 注销能力
   */
  unregister(type: CapabilityType): void;

  /**
   * 获取能力
   */
  get<T extends CapabilityType>(type: T): CapabilityTypeMap[T] | null;

  /**
   * 检查能力是否可用
   */
  has(type: CapabilityType): boolean;

  /**
   * 获取所有已注册能力
   */
  getAll(): Map<CapabilityType, ICapability>;

  /**
   * 初始化所有能力
   */
  initializeAll(): Promise<void>;

  /**
   * 销毁所有能力
   */
  disposeAll(): Promise<void>;

  /**
   * 获取能力状态
   */
  getStatus(type: CapabilityType): CapabilityStatus | null;

  /**
   * 等待能力就绪
   */
  waitForReady(type: CapabilityType, timeout?: number): Promise<void>;
}
```

### 3.3 能力注册表实现
```typescript
// src/shared/services/capability-registry.ts

import {
  ICapability,
  CapabilityStatus
} from '../types/capabilities';
import {
  ICapabilityRegistry,
  CapabilityType,
  CapabilityTypeMap
} from '../types/capability-registry';
import { getEventBus } from './event-bus';

/**
 * 能力注册表实现
 */
export class CapabilityRegistry implements ICapabilityRegistry {
  private capabilities: Map<CapabilityType, ICapability> = new Map();
  private eventBus = getEventBus();

  register<T extends CapabilityType>(
    type: T,
    capability: CapabilityTypeMap[T]
  ): void {
    if (this.capabilities.has(type)) {
      console.warn(`Capability ${type} already registered, replacing...`);
    }
    this.capabilities.set(type, capability);
    
    this.eventBus.emit('system:module:loaded', {
      moduleName: type,
      version: capability.meta.version
    });
  }

  unregister(type: CapabilityType): void {
    const capability = this.capabilities.get(type);
    if (capability) {
      capability.dispose();
      this.capabilities.delete(type);
    }
  }

  get<T extends CapabilityType>(type: T): CapabilityTypeMap[T] | null {
    return (this.capabilities.get(type) as CapabilityTypeMap[T]) || null;
  }

  has(type: CapabilityType): boolean {
    const capability = this.capabilities.get(type);
    return capability !== undefined && capability.status === CapabilityStatus.READY;
  }

  getAll(): Map<CapabilityType, ICapability> {
    return new Map(this.capabilities);
  }

  async initializeAll(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    // 按依赖顺序排序
    const sorted = this.topologicalSort();

    for (const type of sorted) {
      const capability = this.capabilities.get(type);
      if (capability && capability.status === CapabilityStatus.UNINITIALIZED) {
        initPromises.push(
          capability.initialize().catch(error => {
            console.error(`Failed to initialize capability ${type}:`, error);
            this.eventBus.emit('system:error', {
              source: type,
              error,
              context: { phase: 'initialization' }
            });
          })
        );
      }
    }

    await Promise.all(initPromises);
  }

  async disposeAll(): Promise<void> {
    const disposePromises: Promise<void>[] = [];

    for (const [type, capability] of this.capabilities) {
      disposePromises.push(
        capability.dispose().catch(error => {
          console.error(`Failed to dispose capability ${type}:`, error);
        })
      );
    }

    await Promise.all(disposePromises);
    this.capabilities.clear();
  }

  getStatus(type: CapabilityType): CapabilityStatus | null {
    const capability = this.capabilities.get(type);
    return capability?.status ?? null;
  }

  async waitForReady(type: CapabilityType, timeout = 30000): Promise<void> {
    const capability = this.capabilities.get(type);
    if (!capability) {
      throw new Error(`Capability ${type} not registered`);
    }

    if (capability.status === CapabilityStatus.READY) {
      return;
    }

    const startTime = Date.now();
    while (capability.status !== CapabilityStatus.READY) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Timeout waiting for capability ${type}`);
      }
      if (capability.status === CapabilityStatus.ERROR) {
        throw new Error(`Capability ${type} failed to initialize`);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * 拓扑排序 - 按依赖顺序
   */
  private topologicalSort(): CapabilityType[] {
    const result: CapabilityType[] = [];
    const visited = new Set<CapabilityType>();
    const visiting = new Set<CapabilityType>();

    const visit = (type: CapabilityType) => {
      if (visited.has(type)) return;
      if (visiting.has(type)) {
        throw new Error(`Circular dependency detected for capability ${type}`);
      }

      visiting.add(type);
      const capability = this.capabilities.get(type);
      
      if (capability?.meta.dependencies) {
        for (const dep of capability.meta.dependencies) {
          visit(dep as CapabilityType);
        }
      }

      visiting.delete(type);
      visited.add(type);
      result.push(type);
    };

    for (const type of this.capabilities.keys()) {
      visit(type);
    }

    return result;
  }
}

// 全局单例
let globalRegistry: CapabilityRegistry | null = null;

export function getCapabilityRegistry(): ICapabilityRegistry {
  if (!globalRegistry) {
    globalRegistry = new CapabilityRegistry();
  }
  return globalRegistry;
}
```

---

## 4. AI功能模块设计

### 4.1 MCP Server管理器
```typescript
// src/ai/mcp/mcp-manager.ts

import { spawn, ChildProcess } from 'child_process';
import {
  IMCPCapability,
  MCPServerConfig,
  MCPConnection,
  MCPTool,
  MCPResource,
  CapabilityMeta,
  CapabilityStatus
} from '../../shared/types/capabilities';
import { getEventBus } from '../../shared/services/event-bus';

/**
 * MCP服务器管理器
 */
export class MCPManager implements IMCPCapability {
  readonly meta: CapabilityMeta = {
    id: 'ai.capability.mcp',
    name: 'MCP Manager',
    version: '1.0.0',
    description: 'Model Context Protocol服务器管理'
  };

  private _status: CapabilityStatus = CapabilityStatus.UNINITIALIZED;
  private connections: Map<string, MCPConnectionImpl> = new Map();
  private eventBus = getEventBus();

  get status(): CapabilityStatus {
    return this._status;
  }

  async initialize(): Promise<void> {
    this._status = CapabilityStatus.INITIALIZING;
    // 加载配置的MCP服务器
    // TODO: 从配置文件加载
    this._status = CapabilityStatus.READY;
  }

  async dispose(): Promise<void> {
    for (const [id] of this.connections) {
      await this.disconnect(id);
    }
    this._status = CapabilityStatus.DISABLED;
  }

  async healthCheck(): Promise<boolean> {
    return this._status === CapabilityStatus.READY;
  }

  async connect(config: MCPServerConfig): Promise<MCPConnection> {
    const connection = new MCPConnectionImpl(config);
    await connection.start();
    
    this.connections.set(connection.id, connection);
    
    this.eventBus.emit('mcp:server:connected', {
      serverId: connection.id,
      name: config.name,
      capabilities: connection.capabilities
    });

    // 注册工具事件
    for (const tool of connection.tools) {
      this.eventBus.emit('mcp:tool:available', {
        serverId: connection.id,
        toolName: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      });
    }

    return connection;
  }

  async disconnect(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (connection) {
      await connection.stop();
      this.connections.delete(serverId);
      
      this.eventBus.emit('mcp:server:disconnected', {
        serverId,
        reason: 'manual disconnect'
      });
    }
  }

  getConnections(): MCPConnection[] {
    return Array.from(this.connections.values());
  }

  getAvailableTools(serverId?: string): MCPTool[] {
    if (serverId) {
      const connection = this.connections.get(serverId);
      return connection?.tools ?? [];
    }
    return Array.from(this.connections.values()).flatMap(c => c.tools);
  }

  getAvailableResources(serverId?: string): MCPResource[] {
    if (serverId) {
      const connection = this.connections.get(serverId);
      return connection?.resources ?? [];
    }
    return Array.from(this.connections.values()).flatMap(c => c.resources);
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`MCP server ${serverId} not found`);
    }
    return connection.callTool(toolName, args);
  }

  async accessResource(serverId: string, uri: string): Promise<unknown> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`MCP server ${serverId} not found`);
    }
    return connection.accessResource(uri);
  }
}

/**
 * MCP连接实现
 */
class MCPConnectionImpl implements MCPConnection {
  id: string;
  name: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error' = 'disconnected';
  capabilities: string[] = [];
  tools: MCPTool[] = [];
  resources: MCPResource[] = [];

  private process: ChildProcess | null = null;
  private config: MCPServerConfig;

  constructor(config: MCPServerConfig) {
    this.id = `mcp_${Date.now()}`;
    this.name = config.name;
    this.config = config;
  }

  async start(): Promise<void> {
    this.status = 'connecting';

    if (this.config.transport === 'stdio') {
      await this.startStdioTransport();
    } else {
      throw new Error(`Transport ${this.config.transport} not yet implemented`);
    }

    this.status = 'connected';
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.status = 'disconnected';
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    // 发送JSON-RPC请求到MCP服务器
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args }
    };

    return this.sendRequest(request);
  }

  async accessResource(uri: string): Promise<unknown> {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'resources/read',
      params: { uri }
    };

    return this.sendRequest(request);
  }

  private async startStdioTransport(): Promise<void> {
    if (!this.config.command) {
      throw new Error('Command required for stdio transport');
    }

    this.process = spawn(this.config.command, this.config.args || [], {
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // 初始化MCP协议
    await this.initializeProtocol();
  }

  private async initializeProtocol(): Promise<void> {
    // 发送初始化请求
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {}
        },
        clientInfo: {
          name: 'DesktopPet',
          version: '1.0.0'
        }
      }
    };

    const response = await this.sendRequest(initRequest);
    
    // 解析服务器能力
    if (response.capabilities) {
      this.capabilities = Object.keys(response.capabilities);
    }

    // 获取工具列表
    const toolsResponse = await this.sendRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });
    
    this.tools = (toolsResponse.tools || []).map((t: any) => ({
      serverId: this.id,
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }));

    // 获取资源列表
    const resourcesResponse = await this.sendRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/list',
      params: {}
    });

    this.resources = (resourcesResponse.resources || []).map((r: any) => ({
      serverId: this.id,
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType
    }));

    // 发送initialized通知
    this.sendNotification({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });
  }

  private sendRequest(request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin || !this.process?.stdout) {
        reject(new Error('Process not running'));
        return;
      }

      const message = JSON.stringify(request) + '\n';
      
      const onData = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === request.id) {
            this.process?.stdout?.off('data', onData);
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result);
            }
          }
        } catch (e) {
          // 继续等待完整响应
        }
      };

      this.process.stdout.on('data', onData);
      this.process.stdin.write(message);
    });
  }

  private sendNotification(notification: any): void {
    if (this.process?.stdin) {
      const message = JSON.stringify(notification) + '\n';
      this.process.stdin.write(message);
    }
  }
}
```

### 4.2 Skills系统
```typescript
// src/ai/skills/skills-manager.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ISkillsCapability,
  Skill,
  SkillMeta,
  SkillMatch,
  SkillResult,
  SkillAction,
  CapabilityMeta,
  CapabilityStatus
} from '../../shared/types/capabilities';
import { getEventBus } from '../../shared/services/event-bus';

/**
 * Skills系统管理器
 */
export class SkillsManager implements ISkillsCapability {
  readonly meta: CapabilityMeta = {
    id: 'ai.capability.skills',
    name: 'Skills Manager',
    version: '1.0.0',
    description: '技能系统管理',
    dependencies: ['ai.capability.chat']
  };

  private _status: CapabilityStatus = CapabilityStatus.UNINITIALIZED;
  private loadedSkills: Map<string, Skill> = new Map();
  private availableSkills: SkillMeta[] = [];
  private skillsDir: string;
  private eventBus = getEventBus();

  get status(): CapabilityStatus {
    return this._status;
  }

  constructor(skillsDir: string = './skills') {
    this.skillsDir = skillsDir;
  }

  async initialize(): Promise<void> {
    this._status = CapabilityStatus.INITIALIZING;
    
    try {
      // 扫描技能目录
      await this.scanSkillsDirectory();
      this._status = CapabilityStatus.READY;
    } catch (error) {
      this._status = CapabilityStatus.ERROR;
      throw error;
    }
  }

  async dispose(): Promise<void> {
    for (const [name] of this.loadedSkills) {
      await this.unloadSkill(name);
    }
    this._status = CapabilityStatus.DISABLED;
  }

  async healthCheck(): Promise<boolean> {
    return this._status === CapabilityStatus.READY;
  }

  async loadSkill(name: string): Promise<Skill> {
    const meta = this.availableSkills.find(s => s.name === name);
    if (!meta) {
      throw new Error(`Skill ${name} not found`);
    }

    const skillPath = path.join(this.skillsDir, name, 'skill.md');
    const content = await fs.readFile(skillPath, 'utf-8');
    
    const skill: Skill = {
      ...meta,
      status: 'loaded',
      instructions: this.parseInstructions(content),
      examples: this.parseExamples(content)
    };

    this.loadedSkills.set(name, skill);
    return skill;
  }

  async unloadSkill(name: string): Promise<void> {
    this.loadedSkills.delete(name);
  }

  getLoadedSkills(): Skill[] {
    return Array.from(this.loadedSkills.values());
  }

  getAvailableSkills(): SkillMeta[] {
    return [...this.availableSkills];
  }

  async executeSkill(name: string, input: string): Promise<SkillResult> {
    const skill = this.loadedSkills.get(name);
    if (!skill) {
      // 尝试加载
      await this.loadSkill(name);
    }

    const loadedSkill = this.loadedSkills.get(name)!;

    // 这里将技能指令与用户输入组合，发送给LLM
    // 实际实现需要通过Chat能力执行
    const result: SkillResult = {
      skillName: name,
      success: true,
      output: `Executed skill: ${name}`,
      actions: []
    };

    return result;
  }

  matchSkill(input: string): SkillMatch | null {
    const inputLower = input.toLowerCase();
    
    for (const skill of this.loadedSkills.values()) {
      for (const trigger of skill.triggers) {
        if (inputLower.includes(trigger.toLowerCase())) {
          return {
            skillName: skill.name,
            confidence: 0.8,
            trigger
          };
        }
      }
    }

    return null;
  }

  private async scanSkillsDirectory(): Promise<void> {
    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metaPath = path.join(this.skillsDir, entry.name, 'meta.json');
          try {
            const metaContent = await fs.readFile(metaPath, 'utf-8');
            const meta = JSON.parse(metaContent) as SkillMeta;
            this.availableSkills.push(meta);
          } catch {
            // 跳过无效技能目录
          }
        }
      }
    } catch {
      // 技能目录不存在
      await fs.mkdir(this.skillsDir, { recursive: true });
    }
  }

  private parseInstructions(content: string): string {
    // 解析markdown中的指令部分
    const instructionsMatch = content.match(/## Instructions\n([\s\S]*?)(?=##|$)/);
    return instructionsMatch?.[1]?.trim() ?? content;
  }

  private parseExamples(content: string): string[] {
    // 解析示例部分
    const examplesMatch = content.match(/## Examples\n([\s\S]*?)(?=##|$)/);
    if (!examplesMatch) return [];
    
    const examples: string[] = [];
    const lines = examplesMatch[1].split('\n');
    for (const line of lines) {
      if (line.startsWith('- ')) {
        examples.push(line.substring(2).trim());
      }
    }
    return examples;
  }
}
```

### 4.3 Memory系统
```typescript
// src/ai/memory/memory-manager.ts

import {
  IMemoryCapability,
  MemoryOptions,
  SearchOptions,
  MemorySearchResult,
  MemoryStats,
  CapabilityMeta,
  CapabilityStatus
} from '../../shared/types/capabilities';
import { getEventBus } from '../../shared/services/event-bus';

/**
 * 记忆条目
 */
interface MemoryEntry {
  key: string;
  value: unknown;
  namespace: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
  createdAt: number;
  expiresAt?: number;
}

/**
 * Memory系统管理器
 */
export class MemoryManager implements IMemoryCapability {
  readonly meta: CapabilityMeta = {
    id: 'ai.capability.memory',
    name: 'Memory Manager',
    version: '1.0.0',
    description: '记忆与知识管理系统'
  };

  private _status: CapabilityStatus = CapabilityStatus.UNINITIALIZED;
  private storage: Map<string, MemoryEntry> = new Map();
  private eventBus = getEventBus();
  private embeddingModel: EmbeddingModel | null = null;

  get status(): CapabilityStatus {
    return this._status;
  }

  async initialize(): Promise<void> {
    this._status = CapabilityStatus.INITIALIZING;
    
    // 初始化嵌入模型
    // TODO: 可配置使用本地或远程嵌入模型
    
    // 加载持久化存储
    await this.loadFromDisk();
    
    this._status = CapabilityStatus.READY;
  }

  async dispose(): Promise<void> {
    await this.saveToDisk();
    this.storage.clear();
    this._status = CapabilityStatus.DISABLED;
  }

  async healthCheck(): Promise<boolean> {
    return this._status === CapabilityStatus.READY;
  }

  async store(key: string, value: unknown, options?: MemoryOptions): Promise<void> {
    const namespace = options?.namespace ?? 'default';
    const fullKey = `${namespace}:${key}`;

    const entry: MemoryEntry = {
      key,
      value,
      namespace,
      metadata: options?.metadata ?? {},
      createdAt: Date.now(),
      expiresAt: options?.ttl ? Date.now() + options.ttl : undefined
    };

    // 如果需要语义搜索，生成嵌入向量
    if (options?.embed && typeof value === 'string') {
      entry.embedding = await this.generateEmbedding(value);
    }

    this.storage.set(fullKey, entry);

    this.eventBus.emit('memory:store', {
      key,
      value,
      namespace,
      ttl: options?.ttl
    });
  }

  async retrieve(key: string): Promise<unknown | null> {
    // 在所有命名空间中查找
    for (const [fullKey, entry] of this.storage) {
      if (entry.key === key) {
        // 检查是否过期
        if (entry.expiresAt && entry.expiresAt < Date.now()) {
          this.storage.delete(fullKey);
          return null;
        }
        return entry.value;
      }
    }
    return null;
  }

  async search(query: string, options?: SearchOptions): Promise<MemorySearchResult[]> {
    const namespace = options?.namespace;
    const limit = options?.limit ?? 10;
    const threshold = options?.threshold ?? 0.5;

    this.eventBus.emit('memory:retrieve', {
      query,
      namespace: namespace ?? 'all',
      limit
    });

    // 生成查询的嵌入向量
    const queryEmbedding = await this.generateEmbedding(query);
    
    const results: MemorySearchResult[] = [];

    for (const [fullKey, entry] of this.storage) {
      // 命名空间过滤
      if (namespace && entry.namespace !== namespace) continue;

      // 检查过期
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        this.storage.delete(fullKey);
        continue;
      }

      // 如果有嵌入向量，计算相似度
      if (entry.embedding && queryEmbedding) {
        const score = this.cosineSimilarity(queryEmbedding, entry.embedding);
        if (score >= threshold) {
          results.push({
            key: entry.key,
            content: entry.value,
            score,
            metadata: entry.metadata
          });
        }
      } else {
        // 简单的文本匹配
        const content = String(entry.value).toLowerCase();
        if (content.includes(query.toLowerCase())) {
          results.push({
            key: entry.key,
            content: entry.value,
            score: 0.5,
            metadata: entry.metadata
          });
        }
      }
    }

    // 按分数排序并限制数量
    results.sort((a, b) => b.score - a.score);
    const limitedResults = results.slice(0, limit);

    this.eventBus.emit('memory:retrieve:result', {
      query,
      results: limitedResults
    });

    return limitedResults;
  }

  async delete(key: string): Promise<void> {
    for (const [fullKey, entry] of this.storage) {
      if (entry.key === key) {
        this.storage.delete(fullKey);
      }
    }
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      for (const [fullKey, entry] of this.storage) {
        if (entry.namespace === namespace) {
          this.storage.delete(fullKey);
        }
      }
    } else {
      this.storage.clear();
    }
  }

  async stats(): Promise<MemoryStats> {
    const namespaces = new Set<string>();
    let totalSize = 0;

    for (const entry of this.storage.values()) {
      namespaces.add(entry.namespace);
      totalSize += JSON.stringify(entry).length;
    }

    return {
      totalEntries: this.storage.size,
      namespaces: Array.from(namespaces),
      storageSize: totalSize
    };
  }

  /**
   * 生成嵌入向量
   */
  private async generateEmbedding(text: string): Promise<number[] | undefined> {
    if (!this.embeddingModel) return undefined;
    return this.embeddingModel.embed(text);
  }

  /**
   * 余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  private async loadFromDisk(): Promise<void> {
    // TODO: 实现持久化加载
  }

  private async saveToDisk(): Promise<void> {
    // TODO: 实现持久化保存
  }
}

/**
 * 嵌入模型接口
 */
interface EmbeddingModel {
  embed(text: string): Promise<number[]>;
}
```

### 4.4 Agent系统
```typescript
// src/ai/agent/agent-manager.ts

import { v4 as uuidv4 } from 'uuid';
import {
  IAgentCapability,
  AgentContext,
  AgentResult,
  AgentStep,
  AgentProgress,
  TaskStatus,
  CapabilityMeta,
  CapabilityStatus
} from '../../shared/types/capabilities';
import { getEventBus } from '../../shared/services/event-bus';
import { getCapabilityRegistry } from '../../shared/services/capability-registry';
import { CapabilityTypes } from '../../shared/types/capability-registry';

/**
 * Agent任务
 */
interface AgentTask {
  id: string;
  goal: string;
  context: AgentContext;
  status: TaskStatus;
  steps: AgentStep[];
  startTime: number;
  endTime?: number;
  abortController: AbortController;
}

/**
 * Agent系统管理器
 */
export class AgentManager implements IAgentCapability {
  readonly meta: CapabilityMeta = {
    id: 'ai.capability.agent',
    name: 'Agent Manager',
    version: '1.0.0',
    description: '智能代理系统',
    dependencies: ['ai.capability.chat', 'ai.capability.tools', 'ai.capability.memory']
  };

  private _status: CapabilityStatus = CapabilityStatus.UNINITIALIZED;
  private tasks: Map<string, AgentTask> = new Map();
  private progressCallbacks: Map<string, ((progress: AgentProgress) => void)[]> = new Map();
  private eventBus = getEventBus();

  get status(): CapabilityStatus {
    return this._status;
  }

  async initialize(): Promise<void> {
    this._status = CapabilityStatus.INITIALIZING;
    // 等待依赖的能力就绪
    const registry = getCapabilityRegistry();
    await registry.waitForReady(CapabilityTypes.CHAT);
    await registry.waitForReady(CapabilityTypes.TOOLS);
    this._status = CapabilityStatus.READY;
  }

  async dispose(): Promise<void> {
    // 取消所有运行中的任务
    for (const [taskId] of this.tasks) {
      await this.cancelTask(taskId);
    }
    this._status = CapabilityStatus.DISABLED;
  }

  async healthCheck(): Promise<boolean> {
    return this._status === CapabilityStatus.READY;
  }

  async executeTask(goal: string, context?: AgentContext): Promise<AgentResult> {
    const taskId = uuidv4();
    const task: AgentTask = {
      id: taskId,
      goal,
      context: context ?? {},
      status: {
        taskId,
        state: 'pending',
        currentStep: 0,
        startTime: Date.now()
      },
      steps: [],
      startTime: Date.now(),
      abortController: new AbortController()
    };

    this.tasks.set(taskId, task);

    this.eventBus.emit('agent:task:start', {
      taskId,
      goal,
      context
    });

    try {
      task.status.state = 'running';
      const result = await this.runAgentLoop(task);
      task.status.state = 'completed';
      task.endTime = Date.now();
      task.status.endTime = task.endTime;
      return result;
    } catch (error) {
      task.status.state = 'failed';
      task.endTime = Date.now();
      task.status.endTime = task.endTime;
      return {
        taskId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        steps: task.steps,
        totalDuration: task.endTime - task.startTime
      };
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.abortController.abort();
      task.status.state = 'cancelled';
      task.endTime = Date.now();
      task.status.endTime = task.endTime;
    }
  }

  getTaskStatus(taskId: string): TaskStatus | null {
    return this.tasks.get(taskId)?.status ?? null;
  }

  onProgress(taskId: string, callback: (progress: AgentProgress) => void): void {
    if (!this.progressCallbacks.has(taskId)) {
      this.progressCallbacks.set(taskId, []);
    }
    this.progressCallbacks.get(taskId)!.push(callback);
  }

  /**
   * Agent主循环 (ReAct模式)
   */
  private async runAgentLoop(task: AgentTask): Promise<AgentResult> {
    const maxSteps = task.context.maxSteps ?? 10;
    const registry = getCapabilityRegistry();
    const chatCapability = registry.get(CapabilityTypes.CHAT)!;
    const toolsCapability = registry.get(CapabilityTypes.TOOLS)!;

    const systemPrompt = this.buildSystemPrompt(task);
    chatCapability.setSystemPrompt(systemPrompt);

    let currentStep = 0;
    let finalResult: unknown = null;

    while (currentStep < maxSteps) {
      // 检查是否被取消
      if (task.abortController.signal.aborted) {
        throw new Error('Task cancelled');
      }

      currentStep++;
      task.status.currentStep = currentStep;

      // 思考阶段
      const thoughtPrompt = this.buildThoughtPrompt(task, currentStep);
      const thoughtResponse = await chatCapability.chat(thoughtPrompt);

      const thought = this.parseThought(thoughtResponse.content);
      
      this.eventBus.emit('agent:thinking', {
        taskId: task.id,
        thought: thought.reasoning,
        step: currentStep
      });

      this.emitProgress(task.id, {
        taskId: task.id,
        currentStep,
        totalSteps: maxSteps,
        thought: thought.reasoning
      });

      // 检查是否完成
      if (thought.isComplete) {
        finalResult = thought.finalAnswer;
        break;
      }

      // 执行动作
      if (thought.action) {
        const stepStart = Date.now();

        this.eventBus.emit('agent:action', {
          taskId: task.id,
          action: thought.action.tool,
          params: thought.action.args
        });

        try {
          const toolResult = await toolsCapability.executeTool(
            thought.action.tool,
            thought.action.args
          );

          const step: AgentStep = {
            index: currentStep,
            thought: thought.reasoning,
            action: thought.action,
            observation: JSON.stringify(toolResult.result),
            duration: Date.now() - stepStart
          };

          task.steps.push(step);
        } catch (error) {
          const step: AgentStep = {
            index: currentStep,
            thought: thought.reasoning,
            action: thought.action,
            observation: `Error: ${error instanceof Error ? error.message : String(error)}`,
            duration: Date.now() - stepStart
          };

          task.steps.push(step);
        }
      }
    }

    this.eventBus.emit('agent:task:complete', {
      taskId: task.id,
      result: finalResult,
      steps: currentStep
    });

    return {
      taskId: task.id,
      success: true,
      result: finalResult,
      steps: task.steps,
      totalDuration: Date.now() - task.startTime
    };
  }

  private buildSystemPrompt(task: AgentTask): string {
    const registry = getCapabilityRegistry();
    const toolsCapability = registry.get(CapabilityTypes.TOOLS);
    const tools = toolsCapability?.getTools() ?? [];

    return `你是一个智能助手，帮助用户完成任务。

你可以使用以下工具：
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

在每个步骤中，你需要：
1. 思考：分析当前状态和下一步行动
2. 行动：选择一个工具执行，或者给出最终答案
3. 观察：查看工具执行结果

回复格式：
思考：[你的推理过程]
行动：[工具名称]
参数：[JSON格式的参数]

或者如果任务完成：
思考：[你的推理过程]
最终答案：[答案内容]
`;
  }

  private buildThoughtPrompt(task: AgentTask, step: number): string {
    let prompt = `任务目标：${task.goal}\n\n`;

    if (task.steps.length > 0) {
      prompt += '历史步骤：\n';
      for (const s of task.steps) {
        prompt += `步骤${s.index}：\n`;
        prompt += `思考：${s.thought}\n`;
        if (s.action) {
          prompt += `行动：${s.action.tool}(${JSON.stringify(s.action.args)})\n`;
        }
        if (s.observation) {
          prompt += `观察：${s.observation}\n`;
        }
        prompt += '\n';
      }
    }

    prompt += `\n现在是步骤${step}，请继续：`;
    return prompt;
  }

  private parseThought(response: string): {
    reasoning: string;
    isComplete: boolean;
    finalAnswer?: string;
    action?: { tool: string; args: Record<string, unknown> };
  } {
    const result = {
      reasoning: '',
      isComplete: false,
      finalAnswer: undefined as string | undefined,
      action: undefined as { tool: string; args: Record<string, unknown> } | undefined
    };

    // 解析思考
    const thoughtMatch = response.match(/思考[：:]\s*([\s\S]*?)(?=行动|最终答案|$)/i);
    if (thoughtMatch) {
      result.reasoning = thoughtMatch[1].trim();
    }

    // 检查是否有最终答案
    const finalMatch = response.match(/最终答案[：:]\s*([\s\S]*?)$/i);
    if (finalMatch) {
      result.isComplete = true;
      result.finalAnswer = finalMatch[1].trim();
      return result;
    }

    // 解析行动
    const actionMatch = response.match(/行动[：:]\s*(\w+)/i);
    const paramsMatch = response.match(/参数[：:]\s*(\{[\s\S]*?\})/i);

    if (actionMatch) {
      result.action = {
        tool: actionMatch[1],
        args: paramsMatch ? JSON.parse(paramsMatch[1]) : {}
      };
    }

    return result;
  }

  private emitProgress(taskId: string, progress: AgentProgress): void {
    const callbacks = this.progressCallbacks.get(taskId) ?? [];
    for (const callback of callbacks) {
      callback(progress);
    }
  }
}
```

---

## 5. 与宠物系统集成

### 5.1 集成架构
```typescript
// src/pet/pet-ai-bridge.ts

import { getEventBus } from '../shared/services/event-bus';
import { getCapabilityRegistry } from '../shared/services/capability-registry';
import { CapabilityTypes } from '../shared/types/capability-registry';
import {
  PetStateChangedEvent,
  PetActionEvent,
  UserInteractionEvent,
  UserMessageEvent
} from '../shared/types/events';

/**
 * 宠物-AI桥接器
 * 连接宠物核心系统与AI功能模块
 */
export class PetAIBridge {
  private eventBus = getEventBus();
  private registry = getCapabilityRegistry();
  private petChannel = this.eventBus.channel('pet');
  private aiChannel = this.eventBus.channel('ai');

  /**
   * 初始化桥接器
   */
  async initialize(): Promise<void> {
    // 监听用户交互，转发给AI
    this.petChannel.on<UserInteractionEvent>('interaction', async (event) => {
      await this.handleUserInteraction(event.data);
    });

    // 监听AI响应，触发宠物动作
    this.aiChannel.on<AIResponseCompleteEvent>('response:complete', async (event) => {
      await this.handleAIResponse(event.data);
    });

    // 监听工具执行结果，更新宠物状态
    this.eventBus.on<ToolCallResultEvent>('tool:call:result', async (event) => {
      await this.handleToolResult(event.data);
    });
  }

  /**
   * 发送消息给AI
   */
  async sendMessage(content: string): Promise<void> {
    const event: UserMessageEvent = {
      content,
      type: 'text',
      timestamp: Date.now()
    };

    await this.eventBus.emit('ai:message:user', event);

    // 触发宠物"思考"动作
    await this.triggerPetAction('thinking');

    // 获取Chat能力并发送
    const chatCapability = this.registry.get(CapabilityTypes.CHAT);
    if (chatCapability) {
      const response = await chatCapability.chat(content);
      // 响应会通过事件系统传递
    }
  }

  /**
   * 处理用户交互
   */
  private async handleUserInteraction(interaction: UserInteractionEvent): Promise<void> {
    switch (interaction.type) {
      case 'click':
        // 点击宠物，可能触发对话
        break;
      case 'doubleClick':
        // 双击打开对话窗口
        break;
      case 'drag':
        // 拖拽移动宠物
        break;
    }
  }

  /**
   * 处理AI响应
   */
  private async handleAIResponse(response: AIResponseCompleteEvent): Promise<void> {
    // 根据响应内容调整宠物表情和动作
    const sentiment = this.analyzeSentiment(response.content);
    
    switch (sentiment) {
      case 'happy':
        await this.triggerPetAction('bounce', { expression: 'happy' });
        break;
      case 'sad':
        await this.triggerPetAction('droop', { expression: 'sad' });
        break;
      default:
        await this.triggerPetAction('idle', { expression: 'neutral' });
    }
  }

  /**
   * 处理工具执行结果
   */
  private async handleToolResult(result: ToolCallResultEvent): Promise<void> {
    if (result.success) {
      // 工具执行成功，宠物表现出完成任务的样子
      await this.triggerPetAction('celebrate');
    } else {
      // 工具执行失败，宠物表现出困惑
      await this.triggerPetAction('confused');
    }
  }

  /**
   * 触发宠物动作
   */
  private async triggerPetAction(
    action: string,
    params?: Record<string, unknown>
  ): Promise<void> {
    const event: PetActionEvent = {
      action,
      params,
      duration: 1000
    };

    await this.petChannel.emit('action', event);
  }

  /**
   * 简单的情感分析
   */
  private analyzeSentiment(content: string): 'happy' | 'sad' | 'neutral' {
    const happyKeywords = ['开心', '好的', '太棒了', '！', '😊'];
    const sadKeywords = ['抱歉', '不好意思', '无法', '失败'];

    for (const keyword of happyKeywords) {
      if (content.includes(keyword)) return 'happy';
    }

    for (const keyword of sadKeywords) {
      if (content.includes(keyword)) return 'sad';
    }

    return 'neutral';
  }
}

// 导入缺失的类型
import {
  AIResponseCompleteEvent,
  ToolCallResultEvent
} from '../shared/types/events';
```

### 5.2 AI服务初始化
```typescript
// src/main/ai-service.ts

import { getCapabilityRegistry } from '../shared/services/capability-registry';
import { CapabilityTypes } from '../shared/types/capability-registry';
import { MCPManager } from '../ai/mcp/mcp-manager';
import { SkillsManager } from '../ai/skills/skills-manager';
import { MemoryManager } from '../ai/memory/memory-manager';
import { AgentManager } from '../ai/agent/agent-manager';
import { PetAIBridge } from '../pet/pet-ai-bridge';

/**
 * AI服务初始化器
 */
export class AIService {
  private registry = getCapabilityRegistry();
  private bridge: PetAIBridge;

  constructor() {
    this.bridge = new PetAIBridge();
  }

  /**
   * 初始化所有AI能力
   */
  async initialize(): Promise<void> {
    console.log('Initializing AI services...');

    // 注册MCP能力
    const mcpManager = new MCPManager();
    this.registry.register(CapabilityTypes.MCP, mcpManager);

    // 注册Skills能力
    const skillsManager = new SkillsManager('./skills');
    this.registry.register(CapabilityTypes.SKILLS, skillsManager);

    // 注册Memory能力
    const memoryManager = new MemoryManager();
    this.registry.register(CapabilityTypes.MEMORY, memoryManager);

    // 注册Agent能力
    const agentManager = new AgentManager();
    this.registry.register(CapabilityTypes.AGENT, agentManager);

    // 初始化所有能力
    await this.registry.initializeAll();

    // 初始化桥接器
    await this.bridge.initialize();

    console.log('AI services initialized successfully');
  }

  /**
   * 关闭所有AI服务
   */
  async shutdown(): Promise<void> {
    await this.registry.disposeAll();
  }

  /**
   * 发送消息
   */
  async chat(message: string): Promise<void> {
    await this.bridge.sendMessage(message);
  }
}
```

---

## 6. 目录结构

```
src/
├── ai/                          # AI功能模块
│   ├── mcp/                     # MCP Server管理
│   │   └── mcp-manager.ts
│   ├── skills/                  # Skills系统
│   │   └── skills-manager.ts
│   ├── memory/                  # Memory系统
│   │   └── memory-manager.ts
│   ├── agent/                   # Agent系统
│   │   └── agent-manager.ts
│   └── chat/                    # Chat能力实现
│       ├── chat-manager.ts
│       └── providers/
│           ├── openai-provider.ts
│           ├── claude-provider.ts
│           └── ollama-provider.ts
│
├── shared/                      # 共享代码
│   ├── types/                   # 类型定义
│   │   ├── event-bus.ts         # 事件总线类型
│   │   ├── events.ts            # 事件定义
│   │   ├── capabilities.ts      # 能力接口
│   │   └── capability-registry.ts
│   └── services/                # 共享服务
│       ├── event-bus.ts         # 事件总线实现
│       └── capability-registry.ts
│
├── pet/                         # 宠物核心系统
│   ├── pet-ai-bridge.ts         # AI桥接器
│   └── ...
│
├── main/                        # 主进程
│   ├── ai-service.ts            # AI服务
│   └── ...
│
└── skills/                      # 技能定义目录
    ├── weather/
    │   ├── meta.json
    │   └── skill.md
    ├── reminder/
    │   ├── meta.json
    │   └── skill.md
    └── ...
```

---

## 7. 使用示例

### 7.1 基本使用
```typescript
import { AIService } from './main/ai-service';
import { getEventBus } from './shared/services/event-bus';

// 初始化AI服务
const aiService = new AIService();
await aiService.initialize();

// 监听AI响应
const eventBus = getEventBus();
eventBus.on('ai:response:complete', (event) => {
  console.log('AI Response:', event.data.content);
});

// 发送消息
await aiService.chat('今天天气怎么样？');
```

### 7.2 使用MCP
```typescript
import { getCapabilityRegistry } from './shared/services/capability-registry';
import { CapabilityTypes } from './shared/types/capability-registry';

const registry = getCapabilityRegistry();
const mcpCapability = registry.get(CapabilityTypes.MCP);

// 连接MCP服务器
await mcpCapability.connect({
  name: 'filesystem',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir']
});

// 调用MCP工具
const result = await mcpCapability.callTool('filesystem', 'read_file', {
  path: '/path/to/file.txt'
});
```

### 7.3 使用Agent
```typescript
const agentCapability = registry.get(CapabilityTypes.AGENT);

// 订阅进度
agentCapability.onProgress('task_123', (progress) => {
  console.log(`Step ${progress.currentStep}: ${progress.thought}`);
});

// 执行任务
const result = await agentCapability.executeTask(
  '帮我整理桌面上的文件，按类型分类',
  { maxSteps: 20 }
);

console.log('Task completed:', result.success);
```

---

## 8. 总结

本架构设计实现了：

1. **松耦合设计**：通过事件总线和能力接口，AI模块与宠物核心系统完全解耦
2. **可扩展性**：新的AI能力可以通过实现接口并注册到能力注册表来添加
3. **类型安全**：完整的TypeScript类型定义，确保编译时类型检查
4. **事件驱动**：所有模块间通信通过事件总线，支持异步处理和解耦
5. **模块化**：MCP、Skills、Memory、Agent各自独立，可按需启用

关键优势：
- 宠物核心功能无AI时仍可独立运行
- AI功能可按需加载，不影响启动性能
- 支持多种AI后端（OpenAI、Claude、Ollama）
- 通过MCP协议扩展工具能力
- Skills系统提供预定义的任务模板
- Memory系统支持语义搜索和知识持久化
- Agent系统支持复杂的多步骤任务执行