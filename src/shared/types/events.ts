/**
 * 预定义事件类型定义
 * @module shared/types/events
 */

import { IEvent, Subscription } from './event-bus';

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
 * 事件类型键
 */
export type EventType = keyof EventTypeMap;

/**
 * 类型安全的事件发布器
 */
export interface TypedEventEmitter {
  emit<K extends keyof EventTypeMap>(type: K, data: EventTypeMap[K]): Promise<void>;

  on<K extends keyof EventTypeMap>(
    type: K,
    listener: (event: IEvent<EventTypeMap[K]>) => void
  ): Subscription;
}