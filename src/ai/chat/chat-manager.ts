/**
 * Chat 能力管理器
 * T052: 实现 Chat 能力管理器
 * 
 * 实现 IAIService 接口，提供多提供商支持和自动降级策略
 */

import { AIProviderModel, AIProviderEntity, DEFAULT_PROVIDERS } from '../../shared/models/ai-provider';
import { IDatabaseService } from '../../shared/services/database';
import { AIProviderType, AIProviderStatus } from '../../shared/types/models';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required?: string[];
    };
  };
}

/**
 * 聊天完成选项
 */
export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  stream?: boolean;
}

/**
 * 聊天完成结果
 */
export interface ChatCompletionResult {
  id: string;
  message: ChatMessage;
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  provider: AIProviderType;
  model: string;
  latency_ms: number;
}

/**
 * 流式块
 */
export interface StreamChunk {
  id: string;
  delta: {
    role?: MessageRole;
    content?: string;
    tool_calls?: Partial<ToolCall>[];
  };
  finish_reason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

/**
 * AI 服务错误码
 */
export type AIServiceErrorCode = 
  | 'NETWORK_ERROR' 
  | 'AUTH_ERROR' 
  | 'RATE_LIMIT' 
  | 'CONTEXT_LENGTH' 
  | 'CONTENT_FILTER' 
  | 'PROVIDER_ERROR' 
  | 'TIMEOUT' 
  | 'NO_PROVIDER';

/**
 * AI 服务错误
 */
export class AIServiceError extends Error {
  constructor(
    public readonly code: AIServiceErrorCode,
    message: string,
    public readonly provider?: AIProviderType,
    public readonly retryable: boolean = false,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'AIServiceError';
    Object.setPrototypeOf(this, AIServiceError.prototype);
  }
}

/**
 * 提供商状态
 */
export interface ProviderStatus {
  id: string;
  name: string;
  type: AIProviderType;
  available: boolean;
  latency_ms?: number;
  error?: string;
}

/**
 * AI 提供商配置
 */
export interface AIProviderConfig {
  id: string;
  name: string;
  type: AIProviderType;
  model: string;
  endpoint?: string;
  isDefault: boolean;
  isEnabled: boolean;
  priority: number;
  settings: {
    temperature?: number;
    max_tokens?: number;
    system_prompt?: string;
    [key: string]: unknown;
  };
}

/**
 * AI 提供商接口
 */
export interface IAIProvider {
  readonly type: AIProviderType;
  readonly model: string;

  chat(
    messages: ChatMessage[],
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult>;

  chatStream(
    messages: ChatMessage[],
    options: ChatCompletionOptions
  ): AsyncGenerator<StreamChunk, void, unknown>;

  testConnection(): Promise<boolean>;

  getApiKey(): Promise<string | null>;

  setApiKey(key: string): Promise<void>;
}

/**
 * AI 服务接口
 */
export interface IAIService {
  chat(
    messages: ChatMessage[],
    options?: ChatCompletionOptions
  ): Promise<ChatCompletionResult>;

  chatStream(
    messages: ChatMessage[],
    options?: ChatCompletionOptions
  ): AsyncGenerator<StreamChunk, void, unknown>;

  checkAvailability(): Promise<ProviderStatus[]>;

  getActiveProvider(): AIProviderConfig | null;

  setDefaultProvider(providerId: string): Promise<void>;

  registerProvider(config: AIProviderConfig): Promise<void>;

  removeProvider(providerId: string): Promise<void>;

  getProviders(): AIProviderConfig[];
}

// ============================================================================
// ChatManager 实现
// ============================================================================

/**
 * Chat 能力管理器
 * 管理多个 AI 提供商，实现自动降级策略
 */
export class ChatManager implements IAIService {
  private providerModel: AIProviderModel;
  private providers: Map<string, IAIProvider> = new Map();
  private activeProviderId: string | null = null;
  private responseCache: Map<string, ChatCompletionResult> = new Map();
  private readonly maxCacheSize = 100;
  private readonly defaultTimeout = 30000; // 30秒

  constructor(private db: IDatabaseService) {
    this.providerModel = new AIProviderModel(db);
  }

  // --------------------------------------------------------------------------
  // 初始化
  // --------------------------------------------------------------------------

  /**
   * 初始化 ChatManager
   * 创建预置提供商配置
   */
  async initialize(): Promise<void> {
    // 重置所有提供商状态
    this.providerModel.resetAllStatus();
    
    // 创建预置提供商配置
    this.providerModel.createPresets(DEFAULT_PROVIDERS);
    
    // 设置默认活跃提供商
    const defaultProvider = this.providerModel.findDefault();
    if (defaultProvider) {
      this.activeProviderId = defaultProvider.id;
    }
  }

  /**
   * 注册 AI 提供商实现
   * @param providerId 提供商 ID
   * @param provider 提供商实现
   */
  registerProviderInstance(providerId: string, provider: IAIProvider): void {
    this.providers.set(providerId, provider);
  }

  /**
   * 注销 AI 提供商实现
   * @param providerId 提供商 ID
   */
  unregisterProviderInstance(providerId: string): void {
    this.providers.delete(providerId);
  }

  // --------------------------------------------------------------------------
  // IAIService 实现
  // --------------------------------------------------------------------------

  /**
   * 发送聊天完成请求
   * 实现自动降级策略
   */
  async chat(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {}
  ): Promise<ChatCompletionResult> {
    // 获取降级序列
    const fallbackSequence = this.providerModel.getFallbackSequence(false);
    
    if (fallbackSequence.length === 0) {
      throw new AIServiceError('NO_PROVIDER', '没有可用的 AI 提供商');
    }

    const attemptedProviders: string[] = [];
    let lastError: AIServiceError | null = null;

    // 按优先级尝试每个提供商
    for (const providerEntity of fallbackSequence) {
      attemptedProviders.push(providerEntity.id);
      
      const provider = this.providers.get(providerEntity.id);
      if (!provider) {
        continue; // 提供商未注册实现
      }

      try {
        const startTime = Date.now();
        
        const result = await this.executeWithTimeout(
          provider.chat(messages, {
            model: options.model || providerEntity.model,
            temperature: options.temperature ?? providerEntity.temperature,
            max_tokens: options.max_tokens ?? providerEntity.maxTokens,
            ...options,
          }),
          this.defaultTimeout
        );

        const latency = Date.now() - startTime;
        result.latency_ms = latency;

        // 记录使用
        this.providerModel.recordUsage(providerEntity.id);
        this.activeProviderId = providerEntity.id;

        // 缓存响应
        this.cacheResponse(messages, result);

        return result;
      } catch (error) {
        lastError = this.handleProviderError(error, providerEntity);
        
        // 标记提供商错误状态
        this.providerModel.markError(providerEntity.id, lastError.message);
        
        // 如果不可重试，继续下一个提供商
        if (!lastError.retryable) {
          continue;
        }
        
        // 如果有速率限制，等待后重试当前提供商
        if (lastError.code === 'RATE_LIMIT' && lastError.retryAfter) {
          await this.delay(lastError.retryAfter * 1000);
          // 重试当前提供商
          try {
            const provider = this.providers.get(providerEntity.id);
            if (provider) {
              const result = await provider.chat(messages, options);
              this.providerModel.recordUsage(providerEntity.id);
              return result;
            }
          } catch {
            // 重试失败，继续下一个提供商
          }
        }
      }
    }

    // 所有提供商都失败，尝试从缓存获取
    const cachedResult = this.getCachedResponse(messages);
    if (cachedResult) {
      return cachedResult;
    }

    // 抛出最后一个错误
    throw lastError || new AIServiceError('NO_PROVIDER', '所有 AI 提供商都不可用');
  }

  /**
   * 发送流式聊天请求
   */
  async *chatStream(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {}
  ): AsyncGenerator<StreamChunk, void, unknown> {
    // 获取降级序列
    const fallbackSequence = this.providerModel.getFallbackSequence(false);
    
    if (fallbackSequence.length === 0) {
      throw new AIServiceError('NO_PROVIDER', '没有可用的 AI 提供商');
    }

    let lastError: AIServiceError | null = null;

    // 按优先级尝试每个提供商
    for (const providerEntity of fallbackSequence) {
      const provider = this.providers.get(providerEntity.id);
      if (!provider) {
        continue;
      }

      try {
        const stream = provider.chatStream(messages, {
          model: options.model || providerEntity.model,
          temperature: options.temperature ?? providerEntity.temperature,
          max_tokens: options.max_tokens ?? providerEntity.maxTokens,
          ...options,
          stream: true,
        });

        // 记录使用
        this.providerModel.recordUsage(providerEntity.id);
        this.activeProviderId = providerEntity.id;

        // 转发流式响应
        for await (const chunk of stream) {
          yield chunk;
        }

        return;
      } catch (error) {
        lastError = this.handleProviderError(error, providerEntity);
        this.providerModel.markError(providerEntity.id, lastError.message);
      }
    }

    throw lastError || new AIServiceError('NO_PROVIDER', '所有 AI 提供商都不可用');
  }

  /**
   * 检查服务可用性
   */
  async checkAvailability(): Promise<ProviderStatus[]> {
    const enabledProviders = this.providerModel.findEnabled();
    const statuses: ProviderStatus[] = [];

    for (const providerEntity of enabledProviders) {
      const provider = this.providers.get(providerEntity.id);
      
      const status: ProviderStatus = {
        id: providerEntity.id,
        name: providerEntity.name,
        type: providerEntity.type,
        available: false,
      };

      if (!provider) {
        status.error = '提供商未注册';
        statuses.push(status);
        continue;
      }

      try {
        const startTime = Date.now();
        const isConnected = await provider.testConnection();
        const latency = Date.now() - startTime;

        status.available = isConnected;
        status.latency_ms = latency;

        if (isConnected) {
          this.providerModel.clearError(providerEntity.id);
        }
      } catch (error) {
        status.available = false;
        status.error = error instanceof Error ? error.message : '连接测试失败';
        this.providerModel.markError(providerEntity.id, status.error);
      }

      statuses.push(status);
    }

    return statuses;
  }

  /**
   * 获取当前活跃的提供商
   */
  getActiveProvider(): AIProviderConfig | null {
    if (!this.activeProviderId) {
      return null;
    }

    const entity = this.providerModel.findById(this.activeProviderId);
    if (!entity) {
      return null;
    }

    return this.entityToConfig(entity);
  }

  /**
   * 设置默认提供商
   */
  async setDefaultProvider(providerId: string): Promise<void> {
    const entity = this.providerModel.findById(providerId);
    if (!entity) {
      throw new AIServiceError('PROVIDER_ERROR', `提供商不存在: ${providerId}`);
    }

    this.providerModel.setDefault(providerId);
    this.activeProviderId = providerId;
  }

  /**
   * 注册提供商配置
   */
  async registerProvider(config: AIProviderConfig): Promise<void> {
    const existing = this.providerModel.findById(config.id);
    
    if (existing) {
      // 更新现有配置
      this.providerModel.update(config.id, {
        name: config.name,
        model: config.model,
        baseUrl: config.endpoint,
        temperature: config.settings.temperature,
        maxTokens: config.settings.max_tokens,
        priority: config.priority,
        enabled: config.isEnabled,
      });
    } else {
      // 创建新配置
      this.providerModel.create({
        name: config.name,
        type: config.type,
        model: config.model,
        baseUrl: config.endpoint,
        temperature: config.settings.temperature,
        maxTokens: config.settings.max_tokens,
        priority: config.priority,
        enabled: config.isEnabled,
      });
    }
  }

  /**
   * 移除提供商
   */
  async removeProvider(providerId: string): Promise<void> {
    // 从实例映射中移除
    this.providers.delete(providerId);
    
    // 从数据库中删除
    this.providerModel.delete(providerId);
    
    // 如果是活跃提供商，清除
    if (this.activeProviderId === providerId) {
      this.activeProviderId = null;
      const defaultProvider = this.providerModel.findDefault();
      if (defaultProvider) {
        this.activeProviderId = defaultProvider.id;
      }
    }
  }

  /**
   * 获取所有已注册的提供商
   */
  getProviders(): AIProviderConfig[] {
    const entities = this.providerModel.findAll();
    return entities.map(entity => this.entityToConfig(entity));
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  /**
   * 实体转配置
   */
  private entityToConfig(entity: AIProviderEntity): AIProviderConfig {
    const configData = entity.config ? JSON.parse(entity.config) : {};
    
    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      model: entity.model,
      endpoint: entity.baseUrl || undefined,
      isDefault: entity.priority === 0,
      isEnabled: entity.enabled,
      priority: entity.priority,
      settings: {
        temperature: entity.temperature,
        max_tokens: entity.maxTokens,
        system_prompt: configData.system_prompt,
        ...configData,
      },
    };
  }

  /**
   * 处理提供商错误
   */
  private handleProviderError(error: unknown, provider: AIProviderEntity): AIServiceError {
    if (error instanceof AIServiceError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    
    // 检测错误类型
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return new AIServiceError('TIMEOUT', '请求超时', provider.type, true);
    }
    
    if (message.includes('401') || message.includes('unauthorized') || message.includes('Unauthorized')) {
      return new AIServiceError('AUTH_ERROR', '认证失败', provider.type, false);
    }
    
    if (message.includes('429') || message.includes('rate limit') || message.includes('Rate limit')) {
      // 尝试提取 retry-after
      const retryMatch = message.match(/retry.?after:?\s*(\d+)/i);
      const retryAfter = retryMatch ? parseInt(retryMatch[1]) : 60;
      return new AIServiceError('RATE_LIMIT', '请求过于频繁', provider.type, true, retryAfter);
    }
    
    if (message.includes('context') || message.includes('token') || message.includes('too long')) {
      return new AIServiceError('CONTEXT_LENGTH', '上下文长度超限', provider.type, false);
    }
    
    if (message.includes('content') || message.includes('filter') || message.includes('moderation')) {
      return new AIServiceError('CONTENT_FILTER', '内容被过滤', provider.type, false);
    }
    
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND') || message.includes('network')) {
      return new AIServiceError('NETWORK_ERROR', '网络错误', provider.type, true);
    }

    return new AIServiceError('PROVIDER_ERROR', message, provider.type, false);
  }

  /**
   * 带超时执行
   */
  private executeWithTimeout<T>(
    promise: Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new AIServiceError('TIMEOUT', '请求超时'));
      }, timeout);

      promise
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(messages: ChatMessage[]): string {
    // 使用最后几条消息生成键
    const relevantMessages = messages.slice(-3);
    const content = relevantMessages.map(m => `${m.role}:${m.content}`).join('|');
    return content.slice(0, 500);
  }

  /**
   * 缓存响应
   */
  private cacheResponse(messages: ChatMessage[], result: ChatCompletionResult): void {
    const key = this.generateCacheKey(messages);
    
    // 限制缓存大小
    if (this.responseCache.size >= this.maxCacheSize) {
      const firstKey = this.responseCache.keys().next().value;
      if (firstKey) {
        this.responseCache.delete(firstKey);
      }
    }
    
    this.responseCache.set(key, result);
  }

  /**
   * 获取缓存的响应
   */
  private getCachedResponse(messages: ChatMessage[]): ChatCompletionResult | null {
    const key = this.generateCacheKey(messages);
    return this.responseCache.get(key) || null;
  }

  /**
   * 清除响应缓存
   */
  clearCache(): void {
    this.responseCache.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.responseCache.size,
      maxSize: this.maxCacheSize,
    };
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 ChatManager 实例
 */
export function createChatManager(db: IDatabaseService): ChatManager {
  return new ChatManager(db);
}