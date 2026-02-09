/**
 * OpenAI Provider 实现
 * T053: 实现 OpenAI Provider
 * 
 * 支持 OpenAI API 和兼容 API（如 Azure OpenAI）
 */

import { safeStorage } from 'electron';
import {
  IAIProvider,
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
  StreamChunk,
  AIServiceError,
  MessageRole,
} from '../chat-manager';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * OpenAI API 响应格式
 */
interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI 流式响应格式
 */
interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  }>;
}

/**
 * OpenAI Provider 配置
 */
export interface OpenAIProviderConfig {
  baseUrl?: string;
  model?: string;
  organization?: string;
  timeout?: number;
}

// ============================================================================
// 常量
// ============================================================================

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT = 30000;
const CREDENTIAL_KEY = 'openai-api-key';

// ============================================================================
// OpenAI Provider 实现
// ============================================================================

/**
 * OpenAI Provider
 * 实现与 OpenAI API 的通信
 */
export class OpenAIProvider implements IAIProvider {
  readonly type = 'openai' as const;
  private _model: string;
  private baseUrl: string;
  private organization?: string;
  private timeout: number;
  private apiKey: string | null = null;

  constructor(config: OpenAIProviderConfig = {}) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this._model = config.model || DEFAULT_MODEL;
    this.organization = config.organization;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
  }

  get model(): string {
    return this._model;
  }

  // --------------------------------------------------------------------------
  // IAIProvider 接口实现
  // --------------------------------------------------------------------------

  /**
   * 发送聊天请求
   */
  async chat(
    messages: ChatMessage[],
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new AIServiceError('AUTH_ERROR', 'OpenAI API Key 未配置', 'openai');
    }

    const startTime = Date.now();
    const model = options.model || this._model;

    const requestBody = this.buildRequestBody(messages, options, model);

    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: this.buildHeaders(apiKey),
          body: JSON.stringify(requestBody),
        },
        this.timeout
      );

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data: OpenAIResponse = await response.json();
      const latency = Date.now() - startTime;

      return this.parseResponse(data, model, latency);
    } catch (error) {
      if (error instanceof AIServiceError) {
        throw error;
      }
      throw this.handleError(error);
    }
  }

  /**
   * 发送流式聊天请求
   */
  async *chatStream(
    messages: ChatMessage[],
    options: ChatCompletionOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new AIServiceError('AUTH_ERROR', 'OpenAI API Key 未配置', 'openai');
    }

    const model = options.model || this._model;
    const requestBody = this.buildRequestBody(messages, options, model, true);

    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: this.buildHeaders(apiKey),
          body: JSON.stringify(requestBody),
        },
        this.timeout
      );

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw new AIServiceError('PROVIDER_ERROR', '无法获取响应流', 'openai');
      }

      // 解析 SSE 流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              return;
            }

            try {
              const chunk: OpenAIStreamChunk = JSON.parse(data);
              yield this.parseStreamChunk(chunk);
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof AIServiceError) {
        throw error;
      }
      throw this.handleError(error);
    }
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return false;
    }

    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/models`,
        {
          method: 'GET',
          headers: this.buildHeaders(apiKey),
        },
        10000 // 10秒超时
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 获取 API Key
   */
  async getApiKey(): Promise<string | null> {
    // 优先使用内存中的 key
    if (this.apiKey) {
      return this.apiKey;
    }

    // 尝试从安全存储获取
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encryptedKey = this.getStoredKey();
        if (encryptedKey) {
          const decrypted = safeStorage.decryptString(Buffer.from(encryptedKey, 'base64'));
          this.apiKey = decrypted;
          return decrypted;
        }
      }
    } catch {
      // 安全存储不可用，使用环境变量
    }

    // 尝试从环境变量获取
    const envKey = process.env.OPENAI_API_KEY;
    if (envKey) {
      this.apiKey = envKey;
      return envKey;
    }

    return null;
  }

  /**
   * 设置 API Key
   */
  async setApiKey(key: string): Promise<void> {
    this.apiKey = key;

    // 尝试保存到安全存储
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(key);
        this.storeKey(encrypted.toString('base64'));
      }
    } catch {
      // 安全存储不可用，仅保存在内存中
    }
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  /**
   * 构建请求头
   */
  private buildHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }

    return headers;
  }

  /**
   * 构建请求体
   */
  private buildRequestBody(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    model: string,
    stream = false
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.name && { name: m.name }),
        ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
        ...(m.tool_calls && { tool_calls: m.tool_calls }),
      })),
      stream,
    };

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }
    if (options.max_tokens !== undefined) {
      body.max_tokens = options.max_tokens;
    }
    if (options.top_p !== undefined) {
      body.top_p = options.top_p;
    }
    if (options.frequency_penalty !== undefined) {
      body.frequency_penalty = options.frequency_penalty;
    }
    if (options.presence_penalty !== undefined) {
      body.presence_penalty = options.presence_penalty;
    }
    if (options.stop) {
      body.stop = options.stop;
    }
    if (options.tools) {
      body.tools = options.tools;
    }
    if (options.tool_choice) {
      body.tool_choice = options.tool_choice;
    }

    return body;
  }

  /**
   * 解析响应
   */
  private parseResponse(
    data: OpenAIResponse,
    model: string,
    latency: number
  ): ChatCompletionResult {
    const choice = data.choices[0];
    if (!choice) {
      throw new AIServiceError('PROVIDER_ERROR', '无效的响应格式', 'openai');
    }

    return {
      id: data.id,
      message: {
        role: choice.message.role as MessageRole,
        content: choice.message.content || '',
        tool_calls: choice.message.tool_calls,
      },
      finish_reason: choice.finish_reason,
      usage: data.usage,
      provider: 'openai',
      model,
      latency_ms: latency,
    };
  }

  /**
   * 解析流式块
   */
  private parseStreamChunk(chunk: OpenAIStreamChunk): StreamChunk {
    const choice = chunk.choices[0];
    if (!choice) {
      return {
        id: chunk.id,
        delta: {},
      };
    }

    return {
      id: chunk.id,
      delta: {
        role: choice.delta.role as MessageRole | undefined,
        content: choice.delta.content,
        tool_calls: choice.delta.tool_calls?.map(tc => ({
          id: tc.id,
          type: tc.type,
          function: tc.function,
        })),
      },
      finish_reason: choice.finish_reason,
    };
  }

  /**
   * 处理错误响应
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `HTTP ${response.status}`;
    
    try {
      const errorData = await response.json();
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
    } catch {
      // 忽略解析错误
    }

    switch (response.status) {
      case 401:
        throw new AIServiceError('AUTH_ERROR', errorMessage, 'openai');
      case 429:
        const retryAfter = response.headers.get('Retry-After');
        throw new AIServiceError(
          'RATE_LIMIT',
          errorMessage,
          'openai',
          true,
          retryAfter ? parseInt(retryAfter) : 60
        );
      case 400:
        if (errorMessage.includes('context') || errorMessage.includes('token')) {
          throw new AIServiceError('CONTEXT_LENGTH', errorMessage, 'openai');
        }
        throw new AIServiceError('PROVIDER_ERROR', errorMessage, 'openai');
      case 500:
      case 502:
      case 503:
        throw new AIServiceError('PROVIDER_ERROR', errorMessage, 'openai', true);
      default:
        throw new AIServiceError('PROVIDER_ERROR', errorMessage, 'openai');
    }
  }

  /**
   * 处理通用错误
   */
  private handleError(error: unknown): AIServiceError {
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        return new AIServiceError('TIMEOUT', '请求超时', 'openai', true);
      }
      if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
        return new AIServiceError('NETWORK_ERROR', '网络连接失败', 'openai', true);
      }
      return new AIServiceError('PROVIDER_ERROR', error.message, 'openai');
    }
    return new AIServiceError('PROVIDER_ERROR', String(error), 'openai');
  }

  /**
   * 带超时的 fetch
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 获取存储的 Key（简化实现，实际应使用 electron-store 或类似库）
   */
  private getStoredKey(): string | null {
    // 在实际实现中，应该使用 electron-store 或类似的持久化存储
    // 这里返回 null，依赖环境变量或内存中的 key
    return null;
  }

  /**
   * 存储 Key（简化实现）
   */
  private storeKey(_encrypted: string): void {
    // 在实际实现中，应该使用 electron-store 或类似的持久化存储
    // 这里仅记录到内存
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 OpenAI Provider 实例
 */
export function createOpenAIProvider(config?: OpenAIProviderConfig): OpenAIProvider {
  return new OpenAIProvider(config);
}