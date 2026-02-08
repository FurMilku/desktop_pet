# Event Bus Contract: 桌面3D小宠物

**Feature**: 001-desktop-3d-pet  
**Created**: 2026-02-08  
**Version**: 1.0.0

## Overview

本文档定义了桌面3D小宠物应用的事件总线合约，包括事件总线接口、所有预定义事件类型及其数据结构的TypeScript类型定义。

事件总线是AI扩展架构的通信核心，实现模块间的异步解耦通信。

## Event Bus Interface

### Core Event Bus Types

```typescript
/**
 * 事件优先级
 */
enum EventPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

/**
 * 事件元数据
 */
interface EventMeta {
  /** 事件唯一ID */
  id: string;
  /** 事件时间戳 */
  timestamp: number;
  /** 事件来源模块 */
  source: string;
  /** 事件优先级 */
  priority: EventPriority;
  /** 事件通道（命名空间） */
  channel?: string;
}

/**
 * 基础事件结构
 */
interface BaseEvent<T = unknown> {
  /** 事件类型 */
  type: string;
  /** 事件数据 */
  payload: T;
  /** 事件元数据 */
  meta: EventMeta;
}

/**
 * 事件处理器
 */
type EventHandler<T = unknown> = (event: BaseEvent<T>) => void | Promise<void>;

/**
 * 订阅选项
 */
interface SubscribeOptions {
  /** 事件通道过滤 */
  channel?: string;
  /** 最低优先级过滤 */
  minPriority?: EventPriority;
  /** 仅处理一次后自动取消订阅 */
  once?: boolean;
}

/**
 * 发布选项
 */
interface PublishOptions {
  /** 事件优先级 */
  priority?: EventPriority;
  /** 事件通道 */
  channel?: string;
  /** 事件来源 */
  source?: string;
}

/**
 * 取消订阅函数
 */
type Unsubscribe = () => void;
```

### Event Bus Interface

```typescript
/**
 * 事件总线接口
 */
interface IEventBus {
  /**
   * 订阅事件
   * @param eventType 事件类型
   * @param handler 事件处理器
   * @param options 订阅选项
   * @returns 取消订阅函数
   */
  subscribe<T>(
    eventType: string,
    handler: EventHandler<T>,
    options?: SubscribeOptions
  ): Unsubscribe;

  /**
   * 发布事件
   * @param eventType 事件类型
   * @param payload 事件数据
   * @param options 发布选项
   */
  publish<T>(
    eventType: string,
    payload: T,
    options?: PublishOptions
  ): void;

  /**
   * 异步发布事件（等待所有处理器完成）
   * @param eventType 事件类型
   * @param payload 事件数据
   * @param options 发布选项
   */
  publishAsync<T>(
    eventType: string,
    payload: T,
    options?: PublishOptions
  ): Promise<void>;

  /**
   * 订阅一次性事件
   * @param eventType 事件类型
   * @param handler 事件处理器
   * @param options 订阅选项
   */
  once<T>(
    eventType: string,
    handler: EventHandler<T>,
    options?: Omit<SubscribeOptions, 'once'>
  ): Unsubscribe;

  /**
   * 取消指定类型的所有订阅
   * @param eventType 事件类型
   */
  unsubscribeAll(eventType: string): void;

  /**
   * 创建命名空间事件总线
   * @param channel 通道名称
   */
  createChannel(channel: string): IEventBus;

  /**
   * 销毁事件总线
   */
  dispose(): void;
}
```

## Event Type Constants

```typescript
/**
 * 宠物相关事件类型
 */
const PetEvents = {
  /** 宠物状态变化 */
  STATE_CHANGED: 'pet:state:changed',
  /** 宠物动作执行 */
  ACTION: 'pet:action',
  /** 用户交互事件 */
  INTERACTION: 'pet:interaction',
  /** 宠物情绪变化 */
  MOOD_CHANGED: 'pet:mood:changed',
} as const;

/**
 * AI对话相关事件类型
 */
const AIEvents = {
  /** 用户消息 */
  MESSAGE_USER: 'ai:message:user',
  /** AI响应开始 */
  RESPONSE_START: 'ai:response:start',
  /** AI响应流式输出 */
  RESPONSE_CHUNK: 'ai:response:chunk',
  /** AI响应完成 */
  RESPONSE_COMPLETE: 'ai:response:complete',
  /** AI响应错误 */
  RESPONSE_ERROR: 'ai:response:error',
} as const;

/**
 * 工具相关事件类型
 */
const ToolEvents = {
  /** 工具调用请求 */
  CALL_REQUEST: 'tool:call:request',
  /** 工具执行结果 */
  CALL_RESULT: 'tool:call:result',
} as const;

/**
 * 记忆相关事件类型
 */
const MemoryEvents = {
  /** 记忆存储 */
  STORE: 'memory:store',
  /** 记忆检索 */
  RETRIEVE: 'memory:retrieve',
} as const;

/**
 * Agent相关事件类型
 */
const AgentEvents = {
  /** Agent任务开始 */
  TASK_START: 'agent:task:start',
  /** Agent思考过程 */
  THINKING: 'agent:thinking',
  /** Agent执行动作 */
  ACTION: 'agent:action',
  /** Agent任务完成 */
  TASK_COMPLETE: 'agent:task:complete',
} as const;

/**
 * MCP相关事件类型
 */
const MCPEvents = {
  /** MCP服务器连接 */
  SERVER_CONNECTED: 'mcp:server:connected',
  /** MCP服务器断开 */
  SERVER_DISCONNECTED: 'mcp:server:disconnected',
  /** MCP工具可用 */
  TOOL_AVAILABLE: 'mcp:tool:available',
} as const;

/**
 * 系统相关事件类型
 */
const SystemEvents = {
  /** 模块加载完成 */
  MODULE_LOADED: 'system:module:loaded',
  /** 配置变更 */
  CONFIG_CHANGED: 'system:config:changed',
  /** 错误事件 */
  ERROR: 'system:error',
} as const;

/**
 * 所有事件类型常量
 */
const EventTypes = {
  Pet: PetEvents,
  AI: AIEvents,
  Tool: ToolEvents,
  Memory: MemoryEvents,
  Agent: AgentEvents,
  MCP: MCPEvents,
  System: SystemEvents,
} as const;
```

## Event Payload Types

### Pet Events

```typescript
/**
 * 宠物动画状态
 */
type PetAnimationState = 
  | 'idle'        // 待机
  | 'thinking'    // 思考
  | 'happy'       // 开心
  | 'sad'         // 难过
  | 'confused'    // 困惑
  | 'drag'        // 拖拽
  | 'listening'   // 倾听
  | 'celebrating' // 庆祝
  | 'sleepy'      // 瞌睡
  | 'curious';    // 好奇

/**
 * 宠物情绪状态
 */
type PetMood = 'happy' | 'neutral' | 'sad' | 'excited' | 'tired';

/**
 * 宠物状态变化事件数据
 */
interface PetStateChangedPayload {
  /** 前一个动画状态 */
  previousState: PetAnimationState;
  /** 当前动画状态 */
  currentState: PetAnimationState;
  /** 状态变化原因 */
  reason: string;
}

/**
 * 宠物动作事件数据
 */
interface PetActionPayload {
  /** 动作名称 */
  action: PetAnimationState;
  /** 动作持续时间(ms) */
  duration?: number;
  /** 是否循环播放 */
  loop?: boolean;
}

/**
 * 用户交互类型
 */
type InteractionType = 
  | 'click'       // 单击
  | 'double_click' // 双击
  | 'drag_start'  // 开始拖拽
  | 'drag_move'   // 拖拽移动
  | 'drag_end'    // 结束拖拽
  | 'right_click' // 右键点击
  | 'hover';      // 悬停

/**
 * 用户交互事件数据
 */
interface PetInteractionPayload {
  /** 交互类型 */
  type: InteractionType;
  /** 交互位置(屏幕坐标) */
  position: { x: number; y: number };
  /** 附加数据 */
  data?: Record<string, unknown>;
}

/**
 * 宠物情绪变化事件数据
 */
interface PetMoodChangedPayload {
  /** 前一个情绪 */
  previousMood: PetMood;
  /** 当前情绪 */
  currentMood: PetMood;
  /** 情绪值(0-100) */
  moodValue: number;
}
```

### AI Events

```typescript
/**
 * 消息角色
 */
type MessageRole = 'user' | 'assistant' | 'system';

/**
 * 用户消息事件数据
 */
interface AIMessageUserPayload {
  /** 消息ID */
  messageId: string;
  /** 消息内容 */
  content: string;
  /** 对话ID */
  conversationId: string;
  /** 是否为语音输入 */
  isVoice?: boolean;
}

/**
 * AI响应开始事件数据
 */
interface AIResponseStartPayload {
  /** 消息ID */
  messageId: string;
  /** 对话ID */
  conversationId: string;
  /** AI模型名称 */
  model: string;
}

/**
 * AI响应流式输出事件数据
 */
interface AIResponseChunkPayload {
  /** 消息ID */
  messageId: string;
  /** 当前文本片段 */
  chunk: string;
  /** 累积的完整文本 */
  accumulated: string;
  /** 是否为最后一个片段 */
  isLast: boolean;
}

/**
 * AI响应完成事件数据
 */
interface AIResponseCompletePayload {
  /** 消息ID */
  messageId: string;
  /** 对话ID */
  conversationId: string;
  /** 完整回复内容 */
  content: string;
  /** 情感分析结果 */
  sentiment?: 'positive' | 'negative' | 'neutral';
  /** 使用的token数 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * AI响应错误事件数据
 */
interface AIResponseErrorPayload {
  /** 消息ID */
  messageId: string;
  /** 对话ID */
  conversationId: string;
  /** 错误代码 */
  errorCode: string;
  /** 错误消息 */
  errorMessage: string;
  /** 是否可重试 */
  retryable: boolean;
}
```

### Tool Events

```typescript
/**
 * 工具调用请求事件数据
 */
interface ToolCallRequestPayload {
  /** 调用ID */
  callId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
  /** 来源(agent/skill/user) */
  source: 'agent' | 'skill' | 'user';
}

/**
 * 工具执行结果状态
 */
type ToolResultStatus = 'success' | 'error' | 'timeout' | 'cancelled';

/**
 * 工具执行结果事件数据
 */
interface ToolCallResultPayload {
  /** 调用ID */
  callId: string;
  /** 工具名称 */
  toolName: string;
  /** 执行状态 */
  status: ToolResultStatus;
  /** 执行结果 */
  result?: unknown;
  /** 错误信息 */
  error?: string;
  /** 执行耗时(ms) */
  duration: number;
}
```

### Memory Events

```typescript
/**
 * 记忆存储事件数据
 */
interface MemoryStorePayload {
  /** 记忆键 */
  key: string;
  /** 命名空间 */
  namespace?: string;
  /** 是否包含嵌入向量 */
  hasEmbedding: boolean;
  /** 过期时间 */
  ttl?: number;
}

/**
 * 记忆检索事件数据
 */
interface MemoryRetrievePayload {
  /** 查询内容 */
  query: string;
  /** 命名空间 */
  namespace?: string;
  /** 检索方式 */
  method: 'key' | 'semantic';
  /** 检索结果数量 */
  resultCount: number;
}
```

### Agent Events

```typescript
/**
 * Agent任务状态
 */
type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Agent任务开始事件数据
 */
interface AgentTaskStartPayload {
  /** 任务ID */
  taskId: string;
  /** 任务目标 */
  goal: string;
  /** 最大执行步骤 */
  maxSteps: number;
}

/**
 * Agent思考事件数据
 */
interface AgentThinkingPayload {
  /** 任务ID */
  taskId: string;
  /** 当前步骤 */
  step: number;
  /** 思考内容 */
  thought: string;
}

/**
 * Agent动作事件数据
 */
interface AgentActionPayload {
  /** 任务ID */
  taskId: string;
  /** 当前步骤 */
  step: number;
  /** 动作类型 */
  actionType: 'tool_call' | 'final_answer';
  /** 动作详情 */
  action: {
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    answer?: string;
  };
}

/**
 * Agent任务完成事件数据
 */
interface AgentTaskCompletePayload {
  /** 任务ID */
  taskId: string;
  /** 任务状态 */
  status: AgentTaskStatus;
  /** 最终结果 */
  result?: string;
  /** 执行的步骤数 */
  stepsExecuted: number;
  /** 总耗时(ms) */
  totalDuration: number;
  /** 错误信息(如果失败) */
  error?: string;
}
```

### MCP Events

```typescript
/**
 * MCP传输类型
 */
type MCPTransportType = 'stdio' | 'sse' | 'websocket';

/**
 * MCP服务器连接事件数据
 */
interface MCPServerConnectedPayload {
  /** 服务器名称 */
  serverName: string;
  /** 传输类型 */
  transport: MCPTransportType;
  /** 服务器版本 */
  version?: string;
  /** 可用工具数量 */
  toolCount: number;
  /** 可用资源数量 */
  resourceCount: number;
}

/**
 * MCP服务器断开事件数据
 */
interface MCPServerDisconnectedPayload {
  /** 服务器名称 */
  serverName: string;
  /** 断开原因 */
  reason: 'manual' | 'error' | 'timeout' | 'shutdown';
  /** 错误详情(如果是错误断开) */
  error?: string;
}

/**
 * MCP工具可用事件数据
 */
interface MCPToolAvailablePayload {
  /** 服务器名称 */
  serverName: string;
  /** 工具名称 */
  toolName: string;
  /** 工具描述 */
  description: string;
  /** 输入参数Schema */
  inputSchema: Record<string, unknown>;
}
```

### System Events

```typescript
/**
 * 模块状态
 */
type ModuleStatus = 'loading' | 'loaded' | 'error' | 'disabled';

/**
 * 模块加载完成事件数据
 */
interface SystemModuleLoadedPayload {
  /** 模块名称 */
  moduleName: string;
  /** 模块状态 */
  status: ModuleStatus;
  /** 加载耗时(ms) */
  loadTime: number;
  /** 依赖模块 */
  dependencies?: string[];
}

/**
 * 配置变更事件数据
 */
interface SystemConfigChangedPayload {
  /** 配置键 */
  key: string;
  /** 前一个值 */
  previousValue: unknown;
  /** 新值 */
  newValue: unknown;
  /** 变更来源 */
  source: 'user' | 'system' | 'migration';
}

/**
 * 错误级别
 */
type ErrorLevel = 'warning' | 'error' | 'critical';

/**
 * 系统错误事件数据
 */
interface SystemErrorPayload {
  /** 错误ID */
  errorId: string;
  /** 错误级别 */
  level: ErrorLevel;
  /** 错误模块 */
  module: string;
  /** 错误消息 */
  message: string;
  /** 错误堆栈 */
  stack?: string;
  /** 附加上下文 */
  context?: Record<string, unknown>;
}
```

## Event Type Map

```typescript
/**
 * 事件类型到数据类型的映射
 * 用于类型安全的事件发布和订阅
 */
interface EventPayloadMap {
  // Pet Events
  [PetEvents.STATE_CHANGED]: PetStateChangedPayload;
  [PetEvents.ACTION]: PetActionPayload;
  [PetEvents.INTERACTION]: PetInteractionPayload;
  [PetEvents.MOOD_CHANGED]: PetMoodChangedPayload;

  // AI Events
  [AIEvents.MESSAGE_USER]: AIMessageUserPayload;
  [AIEvents.RESPONSE_START]: AIResponseStartPayload;
  [AIEvents.RESPONSE_CHUNK]: AIResponseChunkPayload;
  [AIEvents.RESPONSE_COMPLETE]: AIResponseCompletePayload;
  [AIEvents.RESPONSE_ERROR]: AIResponseErrorPayload;

  // Tool Events
  [ToolEvents.CALL_REQUEST]: ToolCallRequestPayload;
  [ToolEvents.CALL_RESULT]: ToolCallResultPayload;

  // Memory Events
  [MemoryEvents.STORE]: MemoryStorePayload;
  [MemoryEvents.RETRIEVE]: MemoryRetrievePayload;

  // Agent Events
  [AgentEvents.TASK_START]: AgentTaskStartPayload;
  [AgentEvents.THINKING]: AgentThinkingPayload;
  [AgentEvents.ACTION]: AgentActionPayload;
  [AgentEvents.TASK_COMPLETE]: AgentTaskCompletePayload;

  // MCP Events
  [MCPEvents.SERVER_CONNECTED]: MCPServerConnectedPayload;
  [MCPEvents.SERVER_DISCONNECTED]: MCPServerDisconnectedPayload;
  [MCPEvents.TOOL_AVAILABLE]: MCPToolAvailablePayload;

  // System Events
  [SystemEvents.MODULE_LOADED]: SystemModuleLoadedPayload;
  [SystemEvents.CONFIG_CHANGED]: SystemConfigChangedPayload;
  [SystemEvents.ERROR]: SystemErrorPayload;
}

/**
 * 类型安全的事件总线接口
 */
interface ITypedEventBus {
  subscribe<K extends keyof EventPayloadMap>(
    eventType: K,
    handler: EventHandler<EventPayloadMap[K]>,
    options?: SubscribeOptions
  ): Unsubscribe;

  publish<K extends keyof EventPayloadMap>(
    eventType: K,
    payload: EventPayloadMap[K],
    options?: PublishOptions
  ): void;

  publishAsync<K extends keyof EventPayloadMap>(
    eventType: K,
    payload: EventPayloadMap[K],
    options?: PublishOptions
  ): Promise<void>;

  once<K extends keyof EventPayloadMap>(
    eventType: K,
    handler: EventHandler<EventPayloadMap[K]>,
    options?: Omit<SubscribeOptions, 'once'>
  ): Unsubscribe;
}
```

## Usage Examples

### Basic Event Subscription

```typescript
// 订阅宠物状态变化事件
const unsubscribe = eventBus.subscribe(
  PetEvents.STATE_CHANGED,
  (event) => {
    console.log(`Pet state changed from ${event.payload.previousState} to ${event.payload.currentState}`);
  }
);

// 取消订阅
unsubscribe();
```

### Publishing Events

```typescript
// 发布用户交互事件
eventBus.publish(
  PetEvents.INTERACTION,
  {
    type: 'click',
    position: { x: 100, y: 200 }
  },
  { priority: EventPriority.HIGH }
);
```

### Using Channels

```typescript
// 创建AI专用通道
const aiChannel = eventBus.createChannel('ai');

// 在AI通道上订阅事件
aiChannel.subscribe(AIEvents.RESPONSE_CHUNK, (event) => {
  console.log('AI chunk:', event.payload.chunk);
});
```

### One-time Event Handling

```typescript
// 只处理一次任务完成事件
eventBus.once(AgentEvents.TASK_COMPLETE, (event) => {
  console.log(`Task ${event.payload.taskId} completed with status: ${event.payload.status}`);
});
```

## Performance Requirements

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 事件发布延迟 | < 1ms | 同步发布到队列的时间 |
| 处理器调用延迟 | < 5ms | 从发布到处理器开始执行 |
| 最大订阅者数/事件类型 | 100 | 单个事件类型的最大订阅者 |
| 内存占用 | < 10MB | 事件总线空闲时内存占用 |
| 事件队列深度 | 1000 | 最大待处理事件数量 |

## Error Handling

```typescript
/**
 * 事件处理错误
 */
interface EventHandlerError {
  /** 事件类型 */
  eventType: string;
  /** 处理器标识 */
  handlerId: string;
  /** 错误信息 */
  error: Error;
  /** 是否继续处理其他处理器 */
  continueProcessing: boolean;
}

/**
 * 全局错误处理器
 */
eventBus.onError((error: EventHandlerError) => {
  console.error(`Event handler error for ${error.eventType}:`, error.error);
  // 记录到日志系统
  logger.error('EventBus handler error', error);
});