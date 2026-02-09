/**
 * Claude Provider 实现
 * T054: 实现 Claude Provider
 * 
 * 支持 Anthropic Claude API
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
 * Claude API 请求格式
 */
interface ClaudeRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  system?: string;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

/**
 * Claude API 响应格式
 */
interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Claude 流式事件类型
 */
interface ClaudeStreamEvent {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 
        'content_block_stop' | 'message_delta' | 'message_stop' | 'ping' | 'error';
  message?: {
    id: string;
    type: 'message';
    role: 'assistant';
    model: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  index?: number;
  content_block?: {
    type: 'text';
    text: string;
  };
  delta?: {
    type: 'text_delta';
    text: string;
    stop_reason?: 'end_turn' | 'max_tokens' | 'stop_sequence';
  };
  usage?: {
    output_tokens: number;
  };
  error?: {
    type: string;
    message: string;
  };
}

/**
 * Claude Provider 配置
 */
export interface ClaudeProviderConfig {
  baseUrl?: string;
  model?: string;
  timeout?: number;
  apiVersion?: string;
}

// ============================================================================
// 常量
// ============================================================================

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_API_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;
const CREDENTIAL_KEY = 'claude-api-key';

// ============================================================================
// Claude Provider 实现
// ============================================================================

/**
 * Claude Provider
 * 实现与 Anthropic Claude API 的通信
 */
export class ClaudeProvider implements IAIProvider {
  readonly type = 'claude' as const;
  private _model: string;
  private baseUrl: string;
  private timeout: number;
  private apiVersion: string;
  private apiKey: string | null = null;

  constructor(config: ClaudeProviderConfig = {}) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this._model = config.model || DEFAULT_MODEL;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.apiVersion = config.apiVersion || DEFAULT_API_VERSION;
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
      throw new AIServiceError('AUTH_ERROR', 'Claude API Key 未配置', 'claude');
    }

    const startTime = Date.now();
    const model = options.model || this._model;

    const requestBody = this.buildRequestBody(messages, options, model);

    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/messages`,
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

      const data: ClaudeResponse = await response.json();
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
      throw new AIServiceError('AUTH_ERROR', 'Claude API Key 未配置', 'claude');
    }

    const model = options.model || this._model;
    const requestBody = this.buildRequestBody(messages, options, model, true);

    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/messages`,
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
        throw new AIServiceError('PROVIDER_ERROR', '无法获取响应流', 'claude');
      }

      // 解析 SSE 流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let messageId = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const event: ClaudeStreamEvent = JSON.parse(data);
              const chunk = this.parseStreamEvent(event, messageId);
              
              if (event.type === 'message_start' && event.message) {
                messageId = event.message.id;
              }
              
              if (chunk) {
                yield chunk;
              }
              
              if (event.type === 'message_stop') {
                return;
              }
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
      // Claude 没有专门的健康检查端点，发送一个简单请求
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/v1/messages`,
        {
          method: 'POST',
          headers: this.buildHeaders(apiKey),
          body: JSON.stringify({
            model: this._model,
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Hi' }],
          }),
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
    const envKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
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
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': this.apiVersion,
    };
  }

  /**
   * 构建请求体
   * Claude API 需要将 system 消息单独传递
   */
  private buildRequestBody(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    model: string,
    stream = false
  ): ClaudeRequest {
    // 提取 system 消息
    const systemMessages = messages.filter(m => m.role === 'system');
    const systemContent = systemMessages.map(m => m.content).join('\n');
    
    // 转换消息格式（排除 system 消息）
    const claudeMessages = messages
      .filter(m => m.role !== 'system' && m.role !== 'tool')
      .map(m => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content,
      }));

    const body: ClaudeRequest = {
      model,
      messages: claudeMessages,
      max_tokens: options.max_tokens || DEFAULT_MAX_TOKENS,
      stream,
    };

    if (systemContent) {
      body.system = systemContent;
    }

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }
    if (options.top_p !== undefined) {
      body.top_p = options.top_p;
    }
    if (options.stop) {
      body.stop_sequences = options.stop;
    }

    return body;
  }

  /**
   * 解析响应
   */
  private parseResponse(
    data: ClaudeResponse,
    model: string,
    latency: number
  ): ChatCompletionResult {
    // 合并所有文本内容
    const content = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    // 映射停止原因
    let finishReason: 'stop' | 'length' = 'stop';
    if (data.stop_reason === 'max_tokens') {
      finishReason = 'length';
    }

    return {
      id: data.id,
      message: {
        role: 'assistant' as MessageRole,
        content,
      },
      finish_reason: finishReason,
      usage: {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      provider: 'claude',
      model,
      latency_ms: latency,
    };
  }

  /**
   * 解析流式事件
   */
  private parseStreamEvent(event: ClaudeStreamEvent, messageId: string): StreamChunk | null {
    switch (event.type) {
      case 'message_start':
        return {
          id: event.message?.id || messageId,
          delta: {
            role: 'assistant' as MessageRole,
          },
        };

      case 'content_block_delta':
        if (event.delta?.type === 'text_delta') {
          return {
            id: messageId,
            delta: {
              content: event.delta.text,
            },
          };
        }
        return null;

      case 'message_delta':
        if (event.delta?.stop_reason) {
          const finishReason = event.delta.stop_reason === 'max_tokens' ? 'length' : 'stop';
          return {
            id: messageId,
            delta: {},
            finish_reason: finishReason,
          };
        }
        return null;

      case 'error':
        throw new AIServiceError(
          'PROVIDER_ERROR',
          event.error?.message || '流式响应错误',
          'claude'
        );

      default:
        return null;
    }
  }

  /**
   * 处理错误响应
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `HTTP ${response.status}`;
    let errorType = '';
    
    try {
      const errorData = await response.json();
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
      if (errorData.error?.type) {
        errorType = errorData.error.type;
      }
    } catch {
      // 忽略解析错误
    }

    switch (response.status) {
      case 401:
        throw new AIServiceError('AUTH_ERROR', errorMessage, 'claude');
      case 429:
        const retryAfter = response.headers.get('Retry-After');
        throw new AIServiceError(
          'RATE_LIMIT',
          errorMessage,
          'claude',
          true,
          retryAfter ? parseInt(retryAfter) : 60
        );
      case 400:
        if (errorType === 'invalid_request_error' && 
            (errorMessage.includes('context') || errorMessage.includes('token'))) {
          throw new AIServiceError('CONTEXT_LENGTH', errorMessage, 'claude');
        }
        throw new AIServiceError('PROVIDER_ERROR', errorMessage, 'claude');
      case 500:
      case 502:
      case 503:
      case 529: // Claude specific: overloaded
        throw new AIServiceError('PROVIDER_ERROR', errorMessage, 'claude', true);
      default:
        throw new AIServiceError('PROVIDER_ERROR', errorMessage, 'claude');
    }
  }

  /**
   * 处理通用错误
   */
  private handleError(error: unknown): AIServiceError {
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        return new AIServiceError('TIMEOUT', '请求超时', 'claude', true);
      }
      if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
        return new AIServiceError('NETWORK_ERROR', '网络连接失败', 'claude', true);
      }
      return new AIServiceError('PROVIDER_ERROR', error.message, 'claude');
    }
    return new AIServiceError('PROVIDER_ERROR', String(error), 'claude');
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
   * 获取存储的 Key（简化实现）
   */
  private getStoredKey(): string | null {
    return null;
  }

  /**
   * 存储 Key（简化实现）
   */
  private storeKey(_encrypted: string): void {
    // 在实际实现中，应该使用 electron-store 或类似的持久化存储
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 Claude Provider 实例
 */
export function createClaudeProvider(config?: ClaudeProviderConfig): ClaudeProvider {
  return new ClaudeProvider(config);
}