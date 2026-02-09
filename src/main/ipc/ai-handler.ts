/**
 * AI API IPC 处理器
 * T057: 实现 AI API IPC 处理器
 *
 * 处理渲染进程与主进程之间的 AI 服务 IPC 通信
 * 支持聊天、流式聊天、提供商管理等功能
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { getLogger } from '../logger';
import { getChatManager, isAIServiceInitialized } from '../ai-service';
import {
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
  ProviderStatus,
  AIProviderConfig,
  AIServiceError,
} from '../../ai/chat/chat-manager';
import { AIProviderType } from '../../shared/types/models';

const logger = getLogger('ai-handler');

// ============================================================================
// IPC Channel 定义
// ============================================================================

/**
 * AI IPC Channels
 */
export const AIChannels = {
  // 聊天操作
  CHAT: 'ai:chat',
  CHAT_STREAM: 'ai:chat-stream',
  CHAT_STREAM_CANCEL: 'ai:chat-stream-cancel',
  
  // 提供商管理
  CHECK_AVAILABILITY: 'ai:check-availability',
  GET_PROVIDERS: 'ai:get-providers',
  GET_ACTIVE_PROVIDER: 'ai:get-active-provider',
  SET_DEFAULT_PROVIDER: 'ai:set-default-provider',
  REGISTER_PROVIDER: 'ai:register-provider',
  REMOVE_PROVIDER: 'ai:remove-provider',
  
  // 服务状态
  IS_INITIALIZED: 'ai:is-initialized',
  
  // 流式事件
  STREAM_CHUNK: 'ai:stream-chunk',
  STREAM_ERROR: 'ai:stream-error',
  STREAM_END: 'ai:stream-end',
} as const;

// ============================================================================
// 类型定义
// ============================================================================

/**
 * IPC 错误接口
 */
interface IPCError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * 聊天请求参数
 */
interface ChatRequest {
  messages: ChatMessage[];
  options?: ChatCompletionOptions;
}

/**
 * 流式聊天请求参数
 */
interface ChatStreamRequest {
  messages: ChatMessage[];
  options?: ChatCompletionOptions;
  requestId: string;
}

/**
 * 流式聊天响应
 */
interface ChatStreamResponse {
  requestId: string;
  success: boolean;
  error?: string;
}

/**
 * 提供商注册请求参数
 */
interface RegisterProviderRequest {
  id: string;
  name: string;
  type: AIProviderType;
  model: string;
  endpoint?: string;
  isDefault?: boolean;
  isEnabled?: boolean;
  priority?: number;
  settings?: {
    temperature?: number;
    max_tokens?: number;
    system_prompt?: string;
    [key: string]: unknown;
  };
}

// ============================================================================
// 活跃流式请求管理
// ============================================================================

/**
 * 活跃的流式请求映射
 * key: requestId, value: AbortController
 */
const activeStreams = new Map<string, AbortController>();

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 创建 IPC 错误对象
 */
function createIPCError(code: string, message: string, details?: unknown): IPCError {
  return {
    code,
    message,
    details,
  };
}

/**
 * 将 AIServiceError 转换为 IPCError
 */
function aiErrorToIPCError(error: AIServiceError): IPCError {
  return {
    code: `AI_${error.code}`,
    message: error.message,
    details: {
      provider: error.provider,
      retryable: error.retryable,
      retryAfter: error.retryAfter,
    },
  };
}

/**
 * 验证聊天消息数组
 */
function validateMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) {
    throw createIPCError('ERR_INVALID_INPUT', 'messages must be an array');
  }
  
  if (messages.length === 0) {
    throw createIPCError('ERR_INVALID_INPUT', 'messages array cannot be empty');
  }
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || typeof msg !== 'object') {
      throw createIPCError('ERR_INVALID_INPUT', `messages[${i}] must be an object`);
    }
    
    if (!['user', 'assistant', 'system', 'tool'].includes(msg.role)) {
      throw createIPCError(
        'ERR_INVALID_INPUT',
        `messages[${i}].role must be one of: user, assistant, system, tool`
      );
    }
    
    if (typeof msg.content !== 'string') {
      throw createIPCError('ERR_INVALID_INPUT', `messages[${i}].content must be a string`);
    }
  }
  
  return messages as ChatMessage[];
}

/**
 * 验证聊天选项
 */
function validateOptions(options: unknown): ChatCompletionOptions {
  if (options === undefined || options === null) {
    return {};
  }
  
  if (typeof options !== 'object') {
    throw createIPCError('ERR_INVALID_INPUT', 'options must be an object');
  }
  
  const opts = options as ChatCompletionOptions;
  
  // 验证数字参数
  if (opts.temperature !== undefined) {
    if (typeof opts.temperature !== 'number' || opts.temperature < 0 || opts.temperature > 2) {
      throw createIPCError('ERR_INVALID_INPUT', 'temperature must be a number between 0 and 2');
    }
  }
  
  if (opts.max_tokens !== undefined) {
    if (typeof opts.max_tokens !== 'number' || opts.max_tokens < 1) {
      throw createIPCError('ERR_INVALID_INPUT', 'max_tokens must be a positive number');
    }
  }
  
  if (opts.top_p !== undefined) {
    if (typeof opts.top_p !== 'number' || opts.top_p < 0 || opts.top_p > 1) {
      throw createIPCError('ERR_INVALID_INPUT', 'top_p must be a number between 0 and 1');
    }
  }
  
  return opts;
}

/**
 * 验证字符串 ID
 */
function validateId(id: unknown, fieldName = 'id'): string {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw createIPCError('ERR_INVALID_INPUT', `${fieldName} must be a non-empty string`);
  }
  return id;
}

/**
 * 确保 AI 服务已初始化
 */
function ensureInitialized(): void {
  if (!isAIServiceInitialized()) {
    throw createIPCError('ERR_NOT_INITIALIZED', 'AI service is not initialized');
  }
}

// ============================================================================
// AI IPC 处理器实现
// ============================================================================

/**
 * 处理聊天请求
 */
async function handleChat(
  _event: IpcMainInvokeEvent,
  request: ChatRequest
): Promise<ChatCompletionResult> {
  try {
    logger.debug('Handle chat request', { messageCount: request?.messages?.length });
    ensureInitialized();
    
    const messages = validateMessages(request?.messages);
    const options = validateOptions(request?.options);
    
    const chatManager = getChatManager();
    const result = await chatManager.chat(messages, options);
    
    logger.debug('Chat completed', {
      provider: result.provider,
      model: result.model,
      latency_ms: result.latency_ms,
    });
    
    return result;
  } catch (error) {
    logger.error('Failed to handle chat', { error: error instanceof Error ? error.message : String(error) });
    
    if (error instanceof AIServiceError) {
      throw aiErrorToIPCError(error);
    }
    
    if ((error as IPCError).code) {
      throw error;
    }
    
    throw createIPCError('ERR_INTERNAL', `Chat failed: ${error}`);
  }
}

/**
 * 处理流式聊天请求
 * 通过 IPC 事件发送流式响应块
 */
async function handleChatStream(
  event: IpcMainInvokeEvent,
  request: ChatStreamRequest
): Promise<ChatStreamResponse> {
  const { requestId } = request;
  
  try {
    logger.debug('Handle chat stream request', {
      requestId,
      messageCount: request?.messages?.length,
    });
    ensureInitialized();
    
    const messages = validateMessages(request?.messages);
    const options = validateOptions(request?.options);
    
    // 创建 AbortController
    const abortController = new AbortController();
    activeStreams.set(requestId, abortController);
    
    // 获取发送事件的窗口
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw createIPCError('ERR_NO_WINDOW', 'Cannot find browser window');
    }
    
    // 异步处理流式响应
    void (async (): Promise<void> => {
      try {
        const chatManager = getChatManager();
        const stream = chatManager.chatStream(messages, options);
        
        for await (const chunk of stream) {
          // 检查是否已取消
          if (abortController.signal.aborted) {
            logger.debug('Stream cancelled', { requestId });
            break;
          }
          
          // 发送流式块到渲染进程
          if (!window.isDestroyed()) {
            window.webContents.send(AIChannels.STREAM_CHUNK, {
              requestId,
              chunk,
            });
          }
        }
        
        // 发送流结束事件
        if (!window.isDestroyed()) {
          window.webContents.send(AIChannels.STREAM_END, { requestId });
        }
        
        logger.debug('Stream completed', { requestId });
      } catch (error) {
        logger.error('Stream error', { requestId, error: error instanceof Error ? error.message : String(error) });
        
        // 发送错误事件
        if (!window.isDestroyed()) {
          const errorInfo = error instanceof AIServiceError
            ? aiErrorToIPCError(error)
            : createIPCError('ERR_STREAM', `Stream failed: ${error}`);
          
          window.webContents.send(AIChannels.STREAM_ERROR, {
            requestId,
            error: errorInfo,
          });
        }
      } finally {
        // 清理活跃流
        activeStreams.delete(requestId);
      }
    })();
    
    return { requestId, success: true };
  } catch (error) {
    logger.error('Failed to start chat stream', { error: error instanceof Error ? error.message : String(error) });
    activeStreams.delete(requestId);
    
    if (error instanceof AIServiceError) {
      throw aiErrorToIPCError(error);
    }
    
    if ((error as IPCError).code) {
      throw error;
    }
    
    throw createIPCError('ERR_INTERNAL', `Failed to start stream: ${error}`);
  }
}

/**
 * 处理取消流式聊天请求
 */
async function handleChatStreamCancel(
  _event: IpcMainInvokeEvent,
  requestId: string
): Promise<boolean> {
  try {
    logger.debug('Handle cancel stream request', { requestId });
    validateId(requestId, 'requestId');
    
    const controller = activeStreams.get(requestId);
    if (controller) {
      controller.abort();
      activeStreams.delete(requestId);
      logger.debug('Stream cancelled successfully', { requestId });
      return true;
    }
    
    logger.debug('Stream not found or already completed', { requestId });
    return false;
  } catch (error) {
    logger.error('Failed to cancel stream', { error: error instanceof Error ? error.message : String(error) });
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to cancel stream: ${error}`);
  }
}

/**
 * 处理检查可用性请求
 */
async function handleCheckAvailability(
  _event: IpcMainInvokeEvent
): Promise<ProviderStatus[]> {
  try {
    logger.debug('Handle check availability request');
    ensureInitialized();
    
    const chatManager = getChatManager();
    const statuses = await chatManager.checkAvailability();
    
    logger.debug('Availability check completed', {
      providerCount: statuses.length,
      available: statuses.filter(s => s.available).length,
    });
    
    return statuses;
  } catch (error) {
    logger.error('Failed to check availability', { error: error instanceof Error ? error.message : String(error) });
    
    if ((error as IPCError).code) {
      throw error;
    }
    
    throw createIPCError('ERR_INTERNAL', `Failed to check availability: ${error}`);
  }
}

/**
 * 处理获取所有提供商请求
 */
async function handleGetProviders(
  _event: IpcMainInvokeEvent
): Promise<AIProviderConfig[]> {
  try {
    logger.debug('Handle get providers request');
    ensureInitialized();
    
    const chatManager = getChatManager();
    const providers = chatManager.getProviders();
    
    logger.debug('Get providers completed', { count: providers.length });
    
    return providers;
  } catch (error) {
    logger.error('Failed to get providers', { error: error instanceof Error ? error.message : String(error) });
    
    if ((error as IPCError).code) {
      throw error;
    }
    
    throw createIPCError('ERR_INTERNAL', `Failed to get providers: ${error}`);
  }
}

/**
 * 处理获取活跃提供商请求
 */
async function handleGetActiveProvider(
  _event: IpcMainInvokeEvent
): Promise<AIProviderConfig | null> {
  try {
    logger.debug('Handle get active provider request');
    ensureInitialized();
    
    const chatManager = getChatManager();
    const provider = chatManager.getActiveProvider();
    
    logger.debug('Get active provider completed', { provider: provider?.id });
    
    return provider;
  } catch (error) {
    logger.error('Failed to get active provider', { error: error instanceof Error ? error.message : String(error) });
    
    if ((error as IPCError).code) {
      throw error;
    }
    
    throw createIPCError('ERR_INTERNAL', `Failed to get active provider: ${error}`);
  }
}

/**
 * 处理设置默认提供商请求
 */
async function handleSetDefaultProvider(
  _event: IpcMainInvokeEvent,
  providerId: string
): Promise<void> {
  try {
    logger.debug('Handle set default provider request', { providerId });
    ensureInitialized();
    validateId(providerId, 'providerId');
    
    const chatManager = getChatManager();
    await chatManager.setDefaultProvider(providerId);
    
    logger.debug('Set default provider completed', { providerId });
  } catch (error) {
    logger.error('Failed to set default provider', { error: error instanceof Error ? error.message : String(error) });
    
    if (error instanceof AIServiceError) {
      throw aiErrorToIPCError(error);
    }
    
    if ((error as IPCError).code) {
      throw error;
    }
    
    throw createIPCError('ERR_INTERNAL', `Failed to set default provider: ${error}`);
  }
}

/**
 * 处理注册提供商请求
 */
async function handleRegisterProvider(
  _event: IpcMainInvokeEvent,
  request: RegisterProviderRequest
): Promise<void> {
  try {
    logger.debug('Handle register provider request', { id: request?.id, type: request?.type });
    ensureInitialized();
    
    // 验证必要字段
    validateId(request?.id, 'id');
    validateId(request?.name, 'name');
    validateId(request?.type, 'type');
    validateId(request?.model, 'model');
    
    // 验证 type 是有效的提供商类型
    const validTypes: AIProviderType[] = ['openai', 'claude', 'ollama'];
    if (!validTypes.includes(request.type)) {
      throw createIPCError(
        'ERR_INVALID_INPUT',
        `Invalid provider type: ${request.type}. Must be one of: ${validTypes.join(', ')}`
      );
    }
    
    const config: AIProviderConfig = {
      id: request.id,
      name: request.name,
      type: request.type,
      model: request.model,
      ...(request.endpoint !== undefined && { endpoint: request.endpoint }),
      isDefault: request.isDefault ?? false,
      isEnabled: request.isEnabled ?? true,
      priority: request.priority ?? 100,
      settings: request.settings ?? {},
    };
    
    const chatManager = getChatManager();
    await chatManager.registerProvider(config);
    
    logger.debug('Register provider completed', { id: request.id });
  } catch (error) {
    logger.error('Failed to register provider', { error: error instanceof Error ? error.message : String(error) });
    
    if (error instanceof AIServiceError) {
      throw aiErrorToIPCError(error);
    }
    
    if ((error as IPCError).code) {
      throw error;
    }
    
    throw createIPCError('ERR_INTERNAL', `Failed to register provider: ${error}`);
  }
}

/**
 * 处理移除提供商请求
 */
async function handleRemoveProvider(
  _event: IpcMainInvokeEvent,
  providerId: string
): Promise<void> {
  try {
    logger.debug('Handle remove provider request', { providerId });
    ensureInitialized();
    validateId(providerId, 'providerId');
    
    const chatManager = getChatManager();
    await chatManager.removeProvider(providerId);
    
    logger.debug('Remove provider completed', { providerId });
  } catch (error) {
    logger.error('Failed to remove provider', { error: error instanceof Error ? error.message : String(error) });
    
    if (error instanceof AIServiceError) {
      throw aiErrorToIPCError(error);
    }
    
    if ((error as IPCError).code) {
      throw error;
    }
    
    throw createIPCError('ERR_INTERNAL', `Failed to remove provider: ${error}`);
  }
}

/**
 * 处理检查服务是否初始化请求
 */
async function handleIsInitialized(_event: IpcMainInvokeEvent): Promise<boolean> {
  try {
    logger.debug('Handle is initialized request');
    return isAIServiceInitialized();
  } catch (error) {
    logger.error('Failed to check initialization status', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

// ============================================================================
// IPC 处理器注册
// ============================================================================

/**
 * 注册所有 AI IPC 处理器
 */
export function registerAIHandlers(): void {
  logger.info('Registering AI IPC handlers');
  
  // 聊天操作
  ipcMain.handle(AIChannels.CHAT, handleChat);
  ipcMain.handle(AIChannels.CHAT_STREAM, handleChatStream);
  ipcMain.handle(AIChannels.CHAT_STREAM_CANCEL, handleChatStreamCancel);
  
  // 提供商管理
  ipcMain.handle(AIChannels.CHECK_AVAILABILITY, handleCheckAvailability);
  ipcMain.handle(AIChannels.GET_PROVIDERS, handleGetProviders);
  ipcMain.handle(AIChannels.GET_ACTIVE_PROVIDER, handleGetActiveProvider);
  ipcMain.handle(AIChannels.SET_DEFAULT_PROVIDER, handleSetDefaultProvider);
  ipcMain.handle(AIChannels.REGISTER_PROVIDER, handleRegisterProvider);
  ipcMain.handle(AIChannels.REMOVE_PROVIDER, handleRemoveProvider);
  
  // 服务状态
  ipcMain.handle(AIChannels.IS_INITIALIZED, handleIsInitialized);
  
  logger.info('AI IPC handlers registered', {
    channels: Object.values(AIChannels).filter(c => !c.includes('stream-')),
    streamEvents: [AIChannels.STREAM_CHUNK, AIChannels.STREAM_ERROR, AIChannels.STREAM_END],
  });
}

/**
 * 注销所有 AI IPC 处理器
 */
export function unregisterAIHandlers(): void {
  logger.info('Unregistering AI IPC handlers');
  
  // 取消所有活跃的流
  for (const [requestId, controller] of activeStreams) {
    logger.debug('Cancelling active stream', { requestId });
    controller.abort();
  }
  activeStreams.clear();
  
  // 聊天操作
  ipcMain.removeHandler(AIChannels.CHAT);
  ipcMain.removeHandler(AIChannels.CHAT_STREAM);
  ipcMain.removeHandler(AIChannels.CHAT_STREAM_CANCEL);
  
  // 提供商管理
  ipcMain.removeHandler(AIChannels.CHECK_AVAILABILITY);
  ipcMain.removeHandler(AIChannels.GET_PROVIDERS);
  ipcMain.removeHandler(AIChannels.GET_ACTIVE_PROVIDER);
  ipcMain.removeHandler(AIChannels.SET_DEFAULT_PROVIDER);
  ipcMain.removeHandler(AIChannels.REGISTER_PROVIDER);
  ipcMain.removeHandler(AIChannels.REMOVE_PROVIDER);
  
  // 服务状态
  ipcMain.removeHandler(AIChannels.IS_INITIALIZED);
  
  logger.info('AI IPC handlers unregistered');
}

/**
 * 获取活跃流数量（用于调试/测试）
 */
export function getActiveStreamCount(): number {
  return activeStreams.size;
}

// ============================================================================
// 导出
// ============================================================================

export type {
  IPCError,
  ChatRequest,
  ChatStreamRequest,
  ChatStreamResponse,
  RegisterProviderRequest,
};