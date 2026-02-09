/**
 * Ollama Provider 实现
 * T055: 实现 Ollama Provider
 * 
 * 支持本地运行的 Ollama LLM 服务
 * Ollama API 与 OpenAI API 兼容，但有一些细微差异
 */

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
 * Ollama API 响应格式
 */
interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama 流式响应格式
 */
interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Ollama 模型信息
 */
interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

/**
 * Ollama 模型列表响应
 */
interface OllamaModelList {
  models: OllamaModel[];
}

/**
 * Ollama Provider 配置
 */
export interface OllamaProviderConfig {
  baseUrl?: string;
  model?: string;
  timeout?: number;
  keepAlive?: string; // 模型保持加载的时间，如 "5m"
}

// ============================================================================
// 常量
// ============================================================================

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2';
const DEFAULT_TIMEOUT = 60000; // 本地模型可能需要更长时间
const DEFAULT_KEEP_ALIVE = '5m';

// ============================================================================
// Ollama Provider 实现
// ============================================================================

/**
 * Ollama Provider
 * 实现与本地 Ollama 服务的通信
 */
export class OllamaProvider implements IAIProvider {
  readonly type = 'ollama' as const;
  private _model: string;
  private baseUrl: string;
  private timeout: number;
  private keepAlive: string;

  constructor(config: OllamaProviderConfig = {}) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this._model = config.model || DEFAULT_MODEL;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.keepAlive = config.keepAlive || DEFAULT_KEEP_ALIVE;
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
    const startTime = Date.now();
    const model = options.model || this._model;

    const requestBody = this.buildRequestBody(messages, options, model, false);

    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/api/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
        this.timeout
      );

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data: OllamaResponse = await response.json();
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
    const model = options.model || this._model;
    const requestBody = this.buildRequestBody(messages, options, model, true);

    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/api/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
        this.timeout
      );

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      if (!response.body) {
        throw new AIServiceError('PROVIDER_ERROR', '无法获取响应流', 'ollama');
      }

      // Ollama 使用 NDJSON 格式（每行一个 JSON 对象）
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const messageId = `ollama-${Date.now()}`;
      let isFirstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const chunk: OllamaStreamChunk = JSON.parse(line);
            const streamChunk = this.parseStreamChunk(chunk, messageId, isFirstChunk);
            isFirstChunk = false;

            if (streamChunk) {
              yield streamChunk;
            }

            if (chunk.done) {
              return;
            }
          } catch {
            // 忽略解析错误
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
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/api/tags`,
        {
          method: 'GET',
        },
        5000 // 5秒超时
      );

      if (!response.ok) {
        return false;
      }

      // 检查是否有可用的模型
      const data: OllamaModelList = await response.json();
      return data.models && data.models.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * 获取 API Key
   * Ollama 是本地服务，不需要 API Key
   */
  async getApiKey(): Promise<string | null> {
    return null;
  }

  /**
   * 设置 API Key
   * Ollama 是本地服务，不需要 API Key
   */
  async setApiKey(_key: string): Promise<void> {
    // Ollama 不需要 API Key
  }

  // --------------------------------------------------------------------------
  // 扩展方法
  // --------------------------------------------------------------------------

  /**
   * 获取可用的模型列表
   */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/api/tags`,
        {
          method: 'GET',
        },
        5000
      );

      if (!response.ok) {
        throw new AIServiceError('PROVIDER_ERROR', '无法获取模型列表', 'ollama');
      }

      const data: OllamaModelList = await response.json();
      return data.models || [];
    } catch (error) {
      if (error instanceof AIServiceError) {
        throw error;
      }
      throw this.handleError(error);
    }
  }

  /**
   * 拉取模型
   */
  async pullModel(modelName: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        throw new AIServiceError('PROVIDER_ERROR', `无法拉取模型: ${modelName}`, 'ollama');
      }

      // 流式读取拉取进度
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
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
   * 检查模型是否存在
   */
  async hasModel(modelName: string): Promise<boolean> {
    try {
      const models = await this.listModels();
      return models.some(m => m.name === modelName || m.name.startsWith(`${modelName}:`));
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  /**
   * 构建请求体
   */
  private buildRequestBody(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    model: string,
    stream: boolean
  ): Record<string, unknown> {
    // 转换消息格式
    const ollamaMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const body: Record<string, unknown> = {
      model,
      messages: ollamaMessages,
      stream,
      keep_alive: this.keepAlive,
    };

    // Ollama 选项
    const ollamaOptions: Record<string, unknown> = {};

    if (options.temperature !== undefined) {
      ollamaOptions.temperature = options.temperature;
    }
    if (options.top_p !== undefined) {
      ollamaOptions.top_p = options.top_p;
    }
    if (options.max_tokens !== undefined) {
      ollamaOptions.num_predict = options.max_tokens;
    }
    if (options.frequency_penalty !== undefined) {
      ollamaOptions.frequency_penalty = options.frequency_penalty;
    }
    if (options.presence_penalty !== undefined) {
      ollamaOptions.presence_penalty = options.presence_penalty;
    }
    if (options.stop) {
      ollamaOptions.stop = options.stop;
    }

    if (Object.keys(ollamaOptions).length > 0) {
      body.options = ollamaOptions;
    }

    return body;
  }

  /**
   * 解析响应
   */
  private parseResponse(
    data: OllamaResponse,
    model: string,
    latency: number
  ): ChatCompletionResult {
    // 计算 token 使用量（如果有）
    const usage = data.prompt_eval_count && data.eval_count
      ? {
          prompt_tokens: data.prompt_eval_count,
          completion_tokens: data.eval_count,
          total_tokens: data.prompt_eval_count + data.eval_count,
        }
      : undefined;

    return {
      id: `ollama-${Date.now()}`,
      message: {
        role: data.message.role as MessageRole,
        content: data.message.content,
      },
      finish_reason: 'stop',
      usage,
      provider: 'ollama',
      model,
      latency_ms: latency,
    };
  }

  /**
   * 解析流式块
   */
  private parseStreamChunk(
    chunk: OllamaStreamChunk,
    messageId: string,
    isFirstChunk: boolean
  ): StreamChunk {
    const streamChunk: StreamChunk = {
      id: messageId,
      delta: {},
    };

    if (isFirstChunk) {
      streamChunk.delta.role = 'assistant' as MessageRole;
    }

    if (chunk.message?.content) {
      streamChunk.delta.content = chunk.message.content;
    }

    if (chunk.done) {
      streamChunk.finish_reason = 'stop';
    }

    return streamChunk;
  }

  /**
   * 处理错误响应
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `HTTP ${response.status}`;

    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // 尝试获取文本错误
      try {
        errorMessage = await response.text();
      } catch {
        // 忽略
      }
    }

    switch (response.status) {
      case 404:
        // 模型不存在
        if (errorMessage.includes('model') || errorMessage.includes('not found')) {
          throw new AIServiceError(
            'PROVIDER_ERROR',
            `模型不存在: ${errorMessage}`,
            'ollama',
            false
          );
        }
        throw new AIServiceError('PROVIDER_ERROR', errorMessage, 'ollama');
      case 500:
        throw new AIServiceError('PROVIDER_ERROR', errorMessage, 'ollama', true);
      default:
        throw new AIServiceError('PROVIDER_ERROR', errorMessage, 'ollama');
    }
  }

  /**
   * 处理通用错误
   */
  private handleError(error: unknown): AIServiceError {
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        return new AIServiceError('TIMEOUT', '请求超时', 'ollama', true);
      }
      if (error.message.includes('ECONNREFUSED')) {
        return new AIServiceError(
          'NETWORK_ERROR',
          'Ollama 服务未运行，请确保已启动 Ollama',
          'ollama',
          true
        );
      }
      if (error.message.includes('ENOTFOUND')) {
        return new AIServiceError('NETWORK_ERROR', '无法连接到 Ollama 服务', 'ollama', true);
      }
      return new AIServiceError('PROVIDER_ERROR', error.message, 'ollama');
    }
    return new AIServiceError('PROVIDER_ERROR', String(error), 'ollama');
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
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 Ollama Provider 实例
 */
export function createOllamaProvider(config?: OllamaProviderConfig): OllamaProvider {
  return new OllamaProvider(config);
}

/**
 * 检查 Ollama 服务是否可用
 */
export async function isOllamaAvailable(baseUrl?: string): Promise<boolean> {
  const provider = new OllamaProvider({ baseUrl });
  return provider.testConnection();
}