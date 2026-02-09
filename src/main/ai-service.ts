/**
 * AI 服务初始化器
 * T056: 主进程 AI 服务管理
 * 
 * 负责初始化、管理和关闭 AI 服务
 */

import { ChatManager, createChatManager, IAIService } from '../ai/chat/chat-manager';
import { createOpenAIProvider } from '../ai/chat/providers/openai-provider';
import { createClaudeProvider } from '../ai/chat/providers/claude-provider';
import { createOllamaProvider, isOllamaAvailable } from '../ai/chat/providers/ollama-provider';
import { DEFAULT_PROVIDERS } from '../shared/models/ai-provider';
import { databaseService } from './index';
import log from 'electron-log';

// ============================================================================
// 模块状态
// ============================================================================

let chatManager: ChatManager | null = null;
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

// ============================================================================
// 公共 API
// ============================================================================

/**
 * 初始化 AI 服务
 * 创建 ChatManager 并注册所有默认 Provider
 */
export async function initializeAIService(): Promise<void> {
  // 避免重复初始化
  if (isInitialized) {
    log.info('[AI Service] Already initialized');
    return;
  }

  // 避免并发初始化
  if (initializationPromise) {
    log.info('[AI Service] Initialization in progress, waiting...');
    return initializationPromise;
  }

  initializationPromise = doInitialize();

  try {
    await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}

/**
 * 获取 AI 服务实例
 * @throws Error 如果服务未初始化
 */
export function getAIService(): IAIService {
  if (!chatManager || !isInitialized) {
    throw new Error('AI Service not initialized. Call initializeAIService() first.');
  }
  return chatManager;
}

/**
 * 获取 ChatManager 实例（更具体的类型）
 * @throws Error 如果服务未初始化
 */
export function getChatManager(): ChatManager {
  if (!chatManager || !isInitialized) {
    throw new Error('AI Service not initialized. Call initializeAIService() first.');
  }
  return chatManager;
}

/**
 * 检查 AI 服务是否已初始化
 */
export function isAIServiceInitialized(): boolean {
  return isInitialized && chatManager !== null;
}

/**
 * 关闭 AI 服务
 */
export async function shutdownAIService(): Promise<void> {
  if (!chatManager) {
    log.info('[AI Service] Not initialized, nothing to shutdown');
    return;
  }

  log.info('[AI Service] Shutting down...');

  try {
    // 清理资源
    chatManager = null;
    isInitialized = false;
    log.info('[AI Service] Shutdown complete');
  } catch (error) {
    log.error('[AI Service] Error during shutdown:', error);
    throw error;
  }
}

// ============================================================================
// 内部实现
// ============================================================================

/**
 * 执行实际的初始化逻辑
 */
async function doInitialize(): Promise<void> {
  log.info('[AI Service] Initializing...');

  try {
    // 1. 创建 ChatManager
    chatManager = createChatManager(databaseService);
    log.info('[AI Service] ChatManager created');

    // 2. 初始化 ChatManager（同步数据库中的 Provider 配置）
    await chatManager.initialize();
    log.info('[AI Service] ChatManager initialized');

    // 3. 注册 Provider 实例
    await registerDefaultProviders();

    isInitialized = true;
    log.info('[AI Service] Initialization complete');
  } catch (error) {
    log.error('[AI Service] Initialization failed:', error);
    chatManager = null;
    isInitialized = false;
    throw error;
  }
}

/**
 * 注册默认的 Provider 实例
 */
async function registerDefaultProviders(): Promise<void> {
  if (!chatManager) {
    throw new Error('ChatManager not created');
  }

  for (const providerConfig of DEFAULT_PROVIDERS) {
    try {
      const provider = await createProviderInstance(providerConfig);
      if (provider) {
        chatManager.registerProviderInstance(providerConfig.id, provider);
        log.info(`[AI Service] Registered provider: ${providerConfig.name} (${providerConfig.id})`);
      }
    } catch (error) {
      log.warn(`[AI Service] Failed to register provider ${providerConfig.id}:`, error);
      // 继续注册其他 Provider，不中断整个初始化
    }
  }
}

/**
 * 根据配置创建 Provider 实例
 */
async function createProviderInstance(
  config: typeof DEFAULT_PROVIDERS[number]
): Promise<ReturnType<typeof createOpenAIProvider | typeof createClaudeProvider | typeof createOllamaProvider> | null> {
  switch (config.type) {
    case 'openai':
      return createOpenAIProvider({
        model: config.model,
      });

    case 'claude':
      return createClaudeProvider({
        model: config.model,
      });

    case 'ollama':
      // Ollama 是本地服务，先检查是否可用
      const ollamaAvailable = await isOllamaAvailable(config.baseUrl);
      if (!ollamaAvailable) {
        log.info(`[AI Service] Ollama service not available at ${config.baseUrl}, skipping registration`);
        // 仍然创建实例，以便后续 Ollama 启动时可以使用
      }
      return createOllamaProvider({
        baseUrl: config.baseUrl,
        model: config.model,
      });

    default:
      log.warn(`[AI Service] Unknown provider type: ${config.type}`);
      return null;
  }
}

// ============================================================================
// 导出类型
// ============================================================================

export type { IAIService } from '../ai/chat/chat-manager';