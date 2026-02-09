/**
 * Agent 能力管理器
 * T087: 实现 Agent 管理器
 * 
 * 协调 AI 能力（Chat、MCP、Skills、Memory）
 * 统一管理 AI 响应生成、工具调用和技能执行
 */

import { IDatabaseService } from '../../shared/services/database';
import { 
  ChatManager, 
  ChatMessage, 
  ChatCompletionOptions, 
  ChatCompletionResult,
  ToolDefinition,
  ToolCall,
  AIServiceError,
} from '../chat/chat-manager';
import { MemoryManager, ConversationContextOptions } from '../memory/memory-manager';
import { MCPManager, MCPToolResult } from '../mcp/mcp-manager';
import { SkillsManager, SkillExecutionResult } from '../skills/skills-manager';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Agent 配置
 */
export interface AgentConfig {
  /** Agent 名称 */
  name: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 是否启用工具调用 */
  enableTools: boolean;
  /** 是否启用技能 */
  enableSkills: boolean;
  /** 是否启用记忆 */
  enableMemory: boolean;
  /** 最大工具调用次数（防止无限循环） */
  maxToolCalls: number;
  /** 对话上下文选项 */
  contextOptions: ConversationContextOptions;
  /** 默认聊天选项 */
  chatOptions: ChatCompletionOptions;
}

/**
 * Agent 请求
 */
export interface AgentRequest {
  /** 对话 ID */
  conversationId: string;
  /** 用户消息 */
  message: string;
  /** 附加上下文 */
  context?: Record<string, unknown>;
  /** 是否流式响应 */
  stream?: boolean;
  /** 覆盖配置 */
  configOverrides?: Partial<AgentConfig>;
}

/**
 * Agent 响应
 */
export interface AgentResponse {
  /** 响应 ID */
  id: string;
  /** 对话 ID */
  conversationId: string;
  /** 响应内容 */
  content: string;
  /** 使用的工具 */
  toolsUsed: ToolUsage[];
  /** 使用的技能 */
  skillsUsed: SkillUsage[];
  /** 响应元数据 */
  metadata: ResponseMetadata;
}

/**
 * 工具使用记录
 */
export interface ToolUsage {
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
  /** 工具结果 */
  result: unknown;
  /** 执行时间（毫秒） */
  duration: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * 技能使用记录
 */
export interface SkillUsage {
  /** 技能名称 */
  skillName: string;
  /** 触发的动作 */
  action: string;
  /** 执行结果 */
  result: unknown;
  /** 执行时间（毫秒） */
  duration: number;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * 响应元数据
 */
export interface ResponseMetadata {
  /** AI 提供商 */
  provider: string;
  /** 使用的模型 */
  model: string;
  /** Token 使用量 */
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** 总延迟（毫秒） */
  totalLatency: number;
  /** 工具调用次数 */
  toolCallCount: number;
  /** 技能调用次数 */
  skillCallCount: number;
}

/**
 * 流式响应块
 */
export interface AgentStreamChunk {
  /** 块类型 */
  type: 'content' | 'tool_start' | 'tool_end' | 'skill_start' | 'skill_end' | 'done';
  /** 内容（type=content 时） */
  content?: string;
  /** 工具信息（type=tool_* 时） */
  tool?: {
    name: string;
    arguments?: Record<string, unknown>;
    result?: unknown;
    success?: boolean;
    error?: string;
  };
  /** 技能信息（type=skill_* 时） */
  skill?: {
    name: string;
    action?: string;
    result?: unknown;
    success?: boolean;
    error?: string;
  };
  /** 完成元数据（type=done 时） */
  metadata?: ResponseMetadata;
}

/**
 * Agent 状态
 */
export type AgentState = 'idle' | 'thinking' | 'calling_tool' | 'executing_skill' | 'responding';

/**
 * Agent 事件监听器
 */
export interface AgentEventListener {
  onStateChange?: (state: AgentState, details?: unknown) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: unknown, success: boolean) => void;
  onSkillExecute?: (skillName: string, action: string) => void;
  onSkillResult?: (skillName: string, result: unknown, success: boolean) => void;
  onError?: (error: Error) => void;
}

/**
 * Agent 管理器接口
 */
export interface IAgentManager {
  // 核心方法
  process(request: AgentRequest): Promise<AgentResponse>;
  processStream(request: AgentRequest): AsyncGenerator<AgentStreamChunk, void, unknown>;
  
  // 配置管理
  getConfig(): AgentConfig;
  updateConfig(config: Partial<AgentConfig>): void;
  
  // 状态管理
  getState(): AgentState;
  addEventListener(listener: AgentEventListener): void;
  removeEventListener(listener: AgentEventListener): void;
  
  // 能力管理
  getAvailableTools(): ToolDefinition[];
  getAvailableSkills(): string[];
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  name: 'DesktopPetAgent',
  systemPrompt: `你是一个可爱的桌面宠物助手。你的任务是帮助用户完成各种任务，包括设置提醒、查询天气、打开应用程序等。

你的特点：
- 友善、乐于助人
- 回答简洁明了
- 适时使用表情符号
- 当用户完成任务时表达开心

你可以使用各种工具来帮助用户，但要确保：
1. 只在必要时使用工具
2. 向用户解释你在做什么
3. 如果工具调用失败，友好地告知用户并提供替代方案`,
  enableTools: true,
  enableSkills: true,
  enableMemory: true,
  maxToolCalls: 10,
  contextOptions: {
    maxTurns: 20,
    includeSystem: true,
  },
  chatOptions: {
    temperature: 0.7,
    max_tokens: 1024,
  },
};

// ============================================================================
// AgentManager 实现
// ============================================================================

/**
 * Agent 能力管理器
 * 协调所有 AI 能力组件
 */
export class AgentManager implements IAgentManager {
  private config: AgentConfig;
  private state: AgentState = 'idle';
  private eventListeners: Set<AgentEventListener> = new Set();

  constructor(
    private chatManager: ChatManager,
    private memoryManager: MemoryManager,
    private mcpManager: MCPManager,
    private skillsManager: SkillsManager,
    config: Partial<AgentConfig> = {}
  ) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // 初始化
  // --------------------------------------------------------------------------

  /**
   * 初始化 Agent 管理器
   */
  async initialize(): Promise<void> {
    // 初始化各个组件
    await this.chatManager.initialize();
    await this.memoryManager.initialize();
    await this.mcpManager.initialize();
    await this.skillsManager.initialize();
  }

  // --------------------------------------------------------------------------
  // 核心处理方法
  // --------------------------------------------------------------------------

  /**
   * 处理用户请求（非流式）
   */
  async process(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const toolsUsed: ToolUsage[] = [];
    const skillsUsed: SkillUsage[] = [];
    let toolCallCount = 0;
    let skillCallCount = 0;

    try {
      this.setState('thinking');

      // 合并配置
      const config = { ...this.config, ...request.configOverrides };

      // 1. 获取对话上下文
      let messages: ChatMessage[] = [];
      
      if (config.enableMemory) {
        messages = this.memoryManager.getConversationContext(
          request.conversationId,
          config.contextOptions
        );
      }

      // 2. 添加系统提示（如果没有）
      if (!messages.some(m => m.role === 'system')) {
        messages.unshift({
          role: 'system',
          content: config.systemPrompt,
        });
      }

      // 3. 添加用户消息
      const userMessage: ChatMessage = {
        role: 'user',
        content: request.message,
      };
      messages.push(userMessage);

      // 4. 保存用户消息到记忆
      if (config.enableMemory) {
        this.memoryManager.addToConversation(request.conversationId, userMessage);
      }

      // 5. 准备工具定义
      const tools = config.enableTools ? this.getAvailableTools() : undefined;

      // 6. 调用 AI
      let result = await this.chatManager.chat(messages, {
        ...config.chatOptions,
        tools,
        tool_choice: tools ? 'auto' : undefined,
      });

      // 7. 处理工具调用循环
      while (
        result.finish_reason === 'tool_calls' && 
        result.message.tool_calls && 
        toolCallCount < config.maxToolCalls
      ) {
        this.setState('calling_tool');

        // 添加助手消息（包含工具调用）
        messages.push(result.message);

        // 执行每个工具调用
        for (const toolCall of result.message.tool_calls) {
          const toolUsage = await this.executeToolCall(toolCall);
          toolsUsed.push(toolUsage);
          toolCallCount++;

          // 添加工具结果消息
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolUsage.result),
          });
        }

        // 继续对话
        this.setState('thinking');
        result = await this.chatManager.chat(messages, {
          ...config.chatOptions,
          tools,
          tool_choice: 'auto',
        });
      }

      // 8. 检查是否需要执行技能
      if (config.enableSkills) {
        const skillResult = await this.checkAndExecuteSkill(
          request.message,
          result.message.content
        );
        
        if (skillResult) {
          skillsUsed.push(skillResult);
          skillCallCount++;
          
          // 如果技能提供了额外响应，附加到内容
          if (skillResult.result && typeof skillResult.result === 'object') {
            const skillResponse = (skillResult.result as { response?: string }).response;
            if (skillResponse) {
              result.message.content += `\n\n${skillResponse}`;
            }
          }
        }
      }

      // 9. 保存助手消息到记忆
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: result.message.content,
      };
      
      if (config.enableMemory) {
        this.memoryManager.addToConversation(request.conversationId, assistantMessage);
        
        // 记录交互
        this.memoryManager.recordInteraction('chat', {
          conversationId: request.conversationId,
          userMessage: request.message,
          assistantMessage: result.message.content,
          toolsUsed: toolsUsed.map(t => t.name),
          skillsUsed: skillsUsed.map(s => s.skillName),
        });
      }

      this.setState('idle');

      return {
        id: result.id,
        conversationId: request.conversationId,
        content: result.message.content,
        toolsUsed,
        skillsUsed,
        metadata: {
          provider: result.provider,
          model: result.model,
          tokenUsage: result.usage ? {
            prompt: result.usage.prompt_tokens,
            completion: result.usage.completion_tokens,
            total: result.usage.total_tokens,
          } : undefined,
          totalLatency: Date.now() - startTime,
          toolCallCount,
          skillCallCount,
        },
      };
    } catch (error) {
      this.setState('idle');
      this.emitError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * 处理用户请求（流式）
   */
  async *processStream(request: AgentRequest): AsyncGenerator<AgentStreamChunk, void, unknown> {
    const startTime = Date.now();
    const toolsUsed: ToolUsage[] = [];
    const skillsUsed: SkillUsage[] = [];
    let toolCallCount = 0;
    let skillCallCount = 0;
    let fullContent = '';

    try {
      this.setState('thinking');

      // 合并配置
      const config = { ...this.config, ...request.configOverrides };

      // 1. 获取对话上下文
      let messages: ChatMessage[] = [];
      
      if (config.enableMemory) {
        messages = this.memoryManager.getConversationContext(
          request.conversationId,
          config.contextOptions
        );
      }

      // 2. 添加系统提示
      if (!messages.some(m => m.role === 'system')) {
        messages.unshift({
          role: 'system',
          content: config.systemPrompt,
        });
      }

      // 3. 添加用户消息
      const userMessage: ChatMessage = {
        role: 'user',
        content: request.message,
      };
      messages.push(userMessage);

      if (config.enableMemory) {
        this.memoryManager.addToConversation(request.conversationId, userMessage);
      }

      // 4. 准备工具
      const tools = config.enableTools ? this.getAvailableTools() : undefined;

      // 5. 流式调用 AI
      this.setState('responding');
      
      const stream = this.chatManager.chatStream(messages, {
        ...config.chatOptions,
        tools,
        tool_choice: tools ? 'auto' : undefined,
        stream: true,
      });

      let accumulatedToolCalls: Partial<ToolCall>[] = [];
      let finishReason: string | undefined;

      for await (const chunk of stream) {
        // 处理内容
        if (chunk.delta.content) {
          fullContent += chunk.delta.content;
          yield {
            type: 'content',
            content: chunk.delta.content,
          };
        }

        // 累积工具调用
        if (chunk.delta.tool_calls) {
          for (const tc of chunk.delta.tool_calls) {
            // 合并工具调用片段
            if (tc.id) {
              accumulatedToolCalls.push(tc);
            } else if (accumulatedToolCalls.length > 0) {
              const last = accumulatedToolCalls[accumulatedToolCalls.length - 1];
              if (tc.function?.arguments) {
                last.function = last.function || { name: '', arguments: '' };
                last.function.arguments += tc.function.arguments;
              }
            }
          }
        }

        if (chunk.finish_reason) {
          finishReason = chunk.finish_reason;
        }
      }

      // 6. 处理工具调用
      if (finishReason === 'tool_calls' && accumulatedToolCalls.length > 0) {
        for (const tc of accumulatedToolCalls) {
          if (!tc.id || !tc.function?.name) continue;

          this.setState('calling_tool');
          
          yield {
            type: 'tool_start',
            tool: {
              name: tc.function.name,
              arguments: tc.function.arguments ? JSON.parse(tc.function.arguments) : {},
            },
          };

          const toolCall: ToolCall = {
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments || '{}',
            },
          };

          const toolUsage = await this.executeToolCall(toolCall);
          toolsUsed.push(toolUsage);
          toolCallCount++;

          yield {
            type: 'tool_end',
            tool: {
              name: toolUsage.name,
              result: toolUsage.result,
              success: toolUsage.success,
              error: toolUsage.error,
            },
          };

          // 添加工具结果到消息
          messages.push({
            role: 'assistant',
            content: '',
            tool_calls: [toolCall],
          });
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolUsage.result),
          });
        }

        // 继续对话获取最终响应
        this.setState('responding');
        const continueStream = this.chatManager.chatStream(messages, {
          ...config.chatOptions,
          tools,
          stream: true,
        });

        for await (const chunk of continueStream) {
          if (chunk.delta.content) {
            fullContent += chunk.delta.content;
            yield {
              type: 'content',
              content: chunk.delta.content,
            };
          }
        }
      }

      // 7. 检查技能
      if (config.enableSkills) {
        const skillResult = await this.checkAndExecuteSkill(request.message, fullContent);
        
        if (skillResult) {
          yield {
            type: 'skill_start',
            skill: {
              name: skillResult.skillName,
              action: skillResult.action,
            },
          };

          skillsUsed.push(skillResult);
          skillCallCount++;

          yield {
            type: 'skill_end',
            skill: {
              name: skillResult.skillName,
              result: skillResult.result,
              success: skillResult.success,
              error: skillResult.error,
            },
          };
        }
      }

      // 8. 保存到记忆
      if (config.enableMemory) {
        this.memoryManager.addToConversation(request.conversationId, {
          role: 'assistant',
          content: fullContent,
        });
      }

      this.setState('idle');

      // 9. 发送完成块
      yield {
        type: 'done',
        metadata: {
          provider: 'unknown', // 流式模式下可能无法获取
          model: 'unknown',
          totalLatency: Date.now() - startTime,
          toolCallCount,
          skillCallCount,
        },
      };
    } catch (error) {
      this.setState('idle');
      this.emitError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // 配置管理
  // --------------------------------------------------------------------------

  /**
   * 获取当前配置
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 重置为默认配置
   */
  resetConfig(): void {
    this.config = { ...DEFAULT_AGENT_CONFIG };
  }

  // --------------------------------------------------------------------------
  // 状态管理
  // --------------------------------------------------------------------------

  /**
   * 获取当前状态
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * 添加事件监听器
   */
  addEventListener(listener: AgentEventListener): void {
    this.eventListeners.add(listener);
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(listener: AgentEventListener): void {
    this.eventListeners.delete(listener);
  }

  // --------------------------------------------------------------------------
  // 能力管理
  // --------------------------------------------------------------------------

  /**
   * 获取可用工具定义
   */
  getAvailableTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    // 从 MCP 服务器获取工具
    const mcpTools = this.mcpManager.getAvailableTools();
    for (const tool of mcpTools) {
      tools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema as {
            type: 'object';
            properties: Record<string, { type: string; description: string; enum?: string[] }>;
            required?: string[];
          },
        },
      });
    }

    return tools;
  }

  /**
   * 获取可用技能列表
   */
  getAvailableSkills(): string[] {
    return this.skillsManager.getAvailableSkills();
  }

  // --------------------------------------------------------------------------
  // 私有方法
  // --------------------------------------------------------------------------

  /**
   * 设置状态并通知监听器
   */
  private setState(state: AgentState, details?: unknown): void {
    this.state = state;
    for (const listener of this.eventListeners) {
      listener.onStateChange?.(state, details);
    }
  }

  /**
   * 发送错误事件
   */
  private emitError(error: Error): void {
    for (const listener of this.eventListeners) {
      listener.onError?.(error);
    }
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(toolCall: ToolCall): Promise<ToolUsage> {
    const startTime = Date.now();
    const toolName = toolCall.function.name;
    let args: Record<string, unknown> = {};

    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      args = {};
    }

    // 通知监听器
    for (const listener of this.eventListeners) {
      listener.onToolCall?.(toolName, args);
    }

    try {
      // 通过 MCP 管理器调用工具
      const result = await this.mcpManager.callTool(toolName, args);
      const duration = Date.now() - startTime;

      // 通知监听器
      for (const listener of this.eventListeners) {
        listener.onToolResult?.(toolName, result, true);
      }

      // 记录技能使用（如果启用记忆）
      if (this.config.enableMemory) {
        this.memoryManager.recordSkillUsage(toolName, true, { args, result, duration });
      }

      return {
        name: toolName,
        arguments: args,
        result: result.content,
        duration,
        success: !result.isError,
        error: result.isError ? String(result.content) : undefined,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 通知监听器
      for (const listener of this.eventListeners) {
        listener.onToolResult?.(toolName, null, false);
      }

      // 记录失败
      if (this.config.enableMemory) {
        this.memoryManager.recordSkillUsage(toolName, false, { args, error: errorMessage, duration });
      }

      return {
        name: toolName,
        arguments: args,
        result: null,
        duration,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 检查并执行技能
   */
  private async checkAndExecuteSkill(
    userMessage: string,
    assistantResponse: string
  ): Promise<SkillUsage | null> {
    const startTime = Date.now();

    // 检测用户意图，匹配技能
    const matchedSkill = this.skillsManager.matchSkill(userMessage);
    
    if (!matchedSkill) {
      return null;
    }

    const { skillName, action, parameters } = matchedSkill;

    // 通知监听器
    for (const listener of this.eventListeners) {
      listener.onSkillExecute?.(skillName, action);
    }

    try {
      const result = await this.skillsManager.executeSkill(skillName, action, parameters);
      const duration = Date.now() - startTime;

      // 通知监听器
      for (const listener of this.eventListeners) {
        listener.onSkillResult?.(skillName, result, result.success);
      }

      return {
        skillName,
        action,
        result: result.data,
        duration,
        success: result.success,
        error: result.error,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 通知监听器
      for (const listener of this.eventListeners) {
        listener.onSkillResult?.(skillName, null, false);
      }

      return {
        skillName,
        action,
        result: null,
        duration,
        success: false,
        error: errorMessage,
      };
    }
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 AgentManager 实例
 */
export function createAgentManager(
  chatManager: ChatManager,
  memoryManager: MemoryManager,
  mcpManager: MCPManager,
  skillsManager: SkillsManager,
  config?: Partial<AgentConfig>
): AgentManager {
  return new AgentManager(chatManager, memoryManager, mcpManager, skillsManager, config);
}

/**
 * 全局 AgentManager 实例
 */
let globalAgentManager: AgentManager | null = null;

/**
 * 获取全局 AgentManager 实例
 */
export function getGlobalAgentManager(): AgentManager | null {
  return globalAgentManager;
}

/**
 * 设置全局 AgentManager 实例
 */
export function setGlobalAgentManager(manager: AgentManager): void {
  globalAgentManager = manager;
}

/**
 * 重置全局 AgentManager（用于测试）
 */
export function resetGlobalAgentManager(): void {
  globalAgentManager = null;
}