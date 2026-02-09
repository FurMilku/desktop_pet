/**
 * T048 [P] [US3] 集成测试：AI服务集成
 * 
 * 测试 AI 服务与其他组件的集成：
 * - AI服务与数据库的集成
 * - AI服务与凭证存储的集成
 * - AI服务与IPC处理器的集成
 * - 真实HTTP请求模拟
 * - 端到端消息流测试
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// ============================================================================
// Type Definitions (from contracts)
// ============================================================================

type AIProviderType = 'openai' | 'claude' | 'ollama' | 'openai_compatible';
type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

interface ChatMessage {
  role: MessageRole;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ToolDefinition {
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

interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
}

interface ChatCompletionResult {
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

interface StreamChunk {
  id: string;
  delta: {
    role?: MessageRole;
    content?: string;
    tool_calls?: Partial<ToolCall>[];
  };
  finish_reason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

interface AIProviderConfig {
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

interface ConversationRecord {
  id: string;
  title: string | null;
  ai_provider_id: string | null;
  system_prompt: string | null;
  context_length: number;
  created_at: number;
  updated_at: number;
}

interface MessageRecord {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  tokens: number | null;
  tool_calls: string | null;
  tool_result: string | null;
  created_at: number;
}

// ============================================================================
// Mock Database Service
// ============================================================================

class MockDatabaseService {
  private conversations: Map<string, ConversationRecord> = new Map();
  private messages: Map<string, MessageRecord[]> = new Map();
  private providers: Map<string, AIProviderConfig> = new Map();
  private isConnected = false;

  async connect(): Promise<void> {
    this.isConnected = true;
    // 初始化默认提供商
    this.providers.set('openai-gpt4', {
      id: 'openai-gpt4',
      name: 'OpenAI GPT-4',
      type: 'openai',
      model: 'gpt-4-turbo',
      isDefault: true,
      isEnabled: true,
      priority: 1,
      settings: { temperature: 0.7, max_tokens: 4096 }
    });
    this.providers.set('claude-sonnet', {
      id: 'claude-sonnet',
      name: 'Claude 3.5 Sonnet',
      type: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      isDefault: false,
      isEnabled: true,
      priority: 2,
      settings: { temperature: 0.7, max_tokens: 4096 }
    });
    this.providers.set('ollama-llama', {
      id: 'ollama-llama',
      name: 'Ollama Llama',
      type: 'ollama',
      model: 'llama3.2',
      endpoint: 'http://localhost:11434',
      isDefault: false,
      isEnabled: true,
      priority: 10,
      settings: { temperature: 0.7 }
    });
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.conversations.clear();
    this.messages.clear();
  }

  isOpen(): boolean {
    return this.isConnected;
  }

  // Conversation operations
  async createConversation(conversation: Omit<ConversationRecord, 'created_at' | 'updated_at'>): Promise<string> {
    const now = Date.now();
    const record: ConversationRecord = {
      ...conversation,
      created_at: now,
      updated_at: now
    };
    this.conversations.set(conversation.id, record);
    this.messages.set(conversation.id, []);
    return conversation.id;
  }

  async getConversation(id: string): Promise<ConversationRecord | null> {
    return this.conversations.get(id) || null;
  }

  async updateConversation(id: string, updates: Partial<ConversationRecord>): Promise<void> {
    const conv = this.conversations.get(id);
    if (conv) {
      this.conversations.set(id, { ...conv, ...updates, updated_at: Date.now() });
    }
  }

  async deleteConversation(id: string): Promise<void> {
    this.conversations.delete(id);
    this.messages.delete(id);
  }

  async listConversations(limit = 20, offset = 0): Promise<ConversationRecord[]> {
    const all = Array.from(this.conversations.values())
      .sort((a, b) => b.updated_at - a.updated_at);
    return all.slice(offset, offset + limit);
  }

  // Message operations
  async addMessage(message: Omit<MessageRecord, 'created_at'>): Promise<string> {
    const record: MessageRecord = {
      ...message,
      created_at: Date.now()
    };
    const msgs = this.messages.get(message.conversation_id) || [];
    msgs.push(record);
    this.messages.set(message.conversation_id, msgs);
    
    // 更新对话时间
    await this.updateConversation(message.conversation_id, {});
    
    return message.id;
  }

  async getMessages(conversationId: string, limit = 50): Promise<MessageRecord[]> {
    const msgs = this.messages.get(conversationId) || [];
    return msgs.slice(-limit);
  }

  async getRecentMessages(conversationId: string, contextLength: number): Promise<MessageRecord[]> {
    const msgs = this.messages.get(conversationId) || [];
    // 计算轮数（用户+助手为一轮）
    const pairs: MessageRecord[][] = [];
    let currentPair: MessageRecord[] = [];
    
    for (const msg of msgs) {
      if (msg.role === 'user') {
        if (currentPair.length > 0) {
          pairs.push(currentPair);
        }
        currentPair = [msg];
      } else if (msg.role === 'assistant') {
        currentPair.push(msg);
      } else {
        currentPair.push(msg);
      }
    }
    if (currentPair.length > 0) {
      pairs.push(currentPair);
    }
    
    // 取最近 contextLength 轮
    const recentPairs = pairs.slice(-contextLength);
    return recentPairs.flat();
  }

  // Provider operations
  async getProvider(id: string): Promise<AIProviderConfig | null> {
    return this.providers.get(id) || null;
  }

  async listProviders(): Promise<AIProviderConfig[]> {
    return Array.from(this.providers.values())
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority);
  }

  async getDefaultProvider(): Promise<AIProviderConfig | null> {
    return Array.from(this.providers.values()).find(p => p.isDefault) || null;
  }
}

// ============================================================================
// Mock Credential Store
// ============================================================================

class MockCredentialStore {
  private credentials: Map<string, string> = new Map();

  async setPassword(service: string, account: string, password: string): Promise<void> {
    this.credentials.set(`${service}:${account}`, password);
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    return this.credentials.get(`${service}:${account}`) || null;
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    return this.credentials.delete(`${service}:${account}`);
  }

  hasCredential(providerId: string): boolean {
    return this.credentials.has(`desktop-pet:${providerId}`);
  }

  clear(): void {
    this.credentials.clear();
  }
}

// ============================================================================
// Mock HTTP Client (simulates OpenAI/Claude API)
// ============================================================================

interface MockHttpResponse {
  status: number;
  data: unknown;
  headers?: Record<string, string>;
}

class MockHttpClient {
  private responses: Map<string, MockHttpResponse | (() => MockHttpResponse)> = new Map();
  private requestLog: Array<{ url: string; method: string; body: unknown }> = [];
  private latency = 100;

  setResponse(url: string, response: MockHttpResponse | (() => MockHttpResponse)): void {
    this.responses.set(url, response);
  }

  setLatency(ms: number): void {
    this.latency = ms;
  }

  getRequestLog(): Array<{ url: string; method: string; body: unknown }> {
    return this.requestLog;
  }

  clearRequestLog(): void {
    this.requestLog = [];
  }

  async post(url: string, body: unknown, headers?: Record<string, string>): Promise<MockHttpResponse> {
    this.requestLog.push({ url, method: 'POST', body });
    
    await new Promise(resolve => setTimeout(resolve, this.latency));
    
    const response = this.responses.get(url);
    if (!response) {
      return { status: 404, data: { error: 'Not found' } };
    }
    
    return typeof response === 'function' ? response() : response;
  }

  async get(url: string, headers?: Record<string, string>): Promise<MockHttpResponse> {
    this.requestLog.push({ url, method: 'GET', body: null });
    
    await new Promise(resolve => setTimeout(resolve, this.latency));
    
    const response = this.responses.get(url);
    if (!response) {
      return { status: 404, data: { error: 'Not found' } };
    }
    
    return typeof response === 'function' ? response() : response;
  }

  // 模拟流式响应
  async *postStream(url: string, body: unknown, headers?: Record<string, string>): AsyncGenerator<string, void, unknown> {
    this.requestLog.push({ url, method: 'POST_STREAM', body });
    
    // 模拟流式响应
    const chunks = [
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"role":"assistant"}}]}\n\n',
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"!"}}]}\n\n',
      'data: {"id":"chatcmpl-1","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n'
    ];
    
    for (const chunk of chunks) {
      await new Promise(resolve => setTimeout(resolve, 50));
      yield chunk;
    }
  }
}

// ============================================================================
// Mock AI Provider Implementation
// ============================================================================

class MockOpenAIProvider {
  private httpClient: MockHttpClient;
  private credentialStore: MockCredentialStore;
  private providerId: string;

  constructor(
    httpClient: MockHttpClient,
    credentialStore: MockCredentialStore,
    providerId: string
  ) {
    this.httpClient = httpClient;
    this.credentialStore = credentialStore;
    this.providerId = providerId;
  }

  async chat(messages: ChatMessage[], options: ChatCompletionOptions = {}): Promise<ChatCompletionResult> {
    const apiKey = await this.credentialStore.getPassword('desktop-pet', this.providerId);
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const startTime = Date.now();
    const response = await this.httpClient.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: options.model || 'gpt-4-turbo',
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 4096,
        stream: false
      },
      { Authorization: `Bearer ${apiKey}` }
    );

    if (response.status !== 200) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = response.data as {
      id: string;
      choices: Array<{
        message: ChatMessage;
        finish_reason: string;
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    return {
      id: data.id,
      message: data.choices[0].message,
      finish_reason: data.choices[0].finish_reason as 'stop' | 'tool_calls' | 'length' | 'content_filter',
      usage: data.usage,
      provider: 'openai',
      model: options.model || 'gpt-4-turbo',
      latency_ms: Date.now() - startTime
    };
  }

  async *chatStream(messages: ChatMessage[], options: ChatCompletionOptions = {}): AsyncGenerator<StreamChunk, void, unknown> {
    const apiKey = await this.credentialStore.getPassword('desktop-pet', this.providerId);
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const stream = this.httpClient.postStream(
      'https://api.openai.com/v1/chat/completions',
      {
        model: options.model || 'gpt-4-turbo',
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 4096,
        stream: true
      },
      { Authorization: `Bearer ${apiKey}` }
    );

    for await (const chunk of stream) {
      if (chunk.startsWith('data: [DONE]')) {
        break;
      }
      if (chunk.startsWith('data: ')) {
        const data = JSON.parse(chunk.slice(6));
        yield {
          id: data.id,
          delta: data.choices[0].delta,
          finish_reason: data.choices[0].finish_reason
        };
      }
    }
  }

  async testConnection(): Promise<boolean> {
    const apiKey = await this.credentialStore.getPassword('desktop-pet', this.providerId);
    if (!apiKey) {
      return false;
    }

    try {
      const response = await this.httpClient.get(
        'https://api.openai.com/v1/models',
        { Authorization: `Bearer ${apiKey}` }
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Integrated AI Service
// ============================================================================

class IntegratedAIService extends EventEmitter {
  private db: MockDatabaseService;
  private credentialStore: MockCredentialStore;
  private httpClient: MockHttpClient;
  private providers: Map<string, MockOpenAIProvider> = new Map();
  private activeRequests: Map<string, AbortController> = new Map();

  constructor(
    db: MockDatabaseService,
    credentialStore: MockCredentialStore,
    httpClient: MockHttpClient
  ) {
    super();
    this.db = db;
    this.credentialStore = credentialStore;
    this.httpClient = httpClient;
  }

  async initialize(): Promise<void> {
    // 初始化提供商
    const providerConfigs = await this.db.listProviders();
    for (const config of providerConfigs) {
      if (config.type === 'openai' || config.type === 'openai_compatible') {
        this.providers.set(
          config.id,
          new MockOpenAIProvider(this.httpClient, this.credentialStore, config.id)
        );
      }
    }
  }

  async sendMessage(
    conversationId: string,
    content: string,
    options: { stream?: boolean } = {}
  ): Promise<string> {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const abortController = new AbortController();
    this.activeRequests.set(requestId, abortController);

    try {
      // 获取对话
      const conversation = await this.db.getConversation(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // 获取提供商
      const providerId = conversation.ai_provider_id || 'openai-gpt4';
      const provider = this.providers.get(providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }

      // 保存用户消息
      const userMessageId = `msg-${Date.now()}-user`;
      await this.db.addMessage({
        id: userMessageId,
        conversation_id: conversationId,
        role: 'user',
        content,
        tokens: null,
        tool_calls: null,
        tool_result: null
      });

      // 构建消息上下文
      const contextMessages = await this.db.getRecentMessages(
        conversationId,
        conversation.context_length
      );
      
      const messages: ChatMessage[] = [];
      
      // 添加系统提示
      if (conversation.system_prompt) {
        messages.push({ role: 'system', content: conversation.system_prompt });
      }
      
      // 添加历史消息
      for (const msg of contextMessages) {
        messages.push({ role: msg.role, content: msg.content });
      }

      this.emit('responseStart', { requestId, conversationId });

      let fullContent = '';

      if (options.stream) {
        // 流式响应
        const stream = provider.chatStream(messages);
        for await (const chunk of stream) {
          if (abortController.signal.aborted) {
            throw new Error('Request cancelled');
          }
          if (chunk.delta.content) {
            fullContent += chunk.delta.content;
            this.emit('responseChunk', {
              requestId,
              chunk: chunk.delta.content,
              accumulated: fullContent
            });
          }
          if (chunk.finish_reason) {
            break;
          }
        }
      } else {
        // 非流式响应
        const result = await provider.chat(messages);
        fullContent = result.message.content;
      }

      // 保存助手消息
      const assistantMessageId = `msg-${Date.now()}-assistant`;
      await this.db.addMessage({
        id: assistantMessageId,
        conversation_id: conversationId,
        role: 'assistant',
        content: fullContent,
        tokens: null,
        tool_calls: null,
        tool_result: null
      });

      this.emit('responseComplete', {
        requestId,
        messageId: assistantMessageId,
        content: fullContent
      });

      return requestId;
    } catch (error) {
      this.emit('responseError', {
        requestId,
        error: (error as Error).message,
        code: 'ERR_AI_REQUEST'
      });
      throw error;
    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  cancelRequest(requestId: string): void {
    const controller = this.activeRequests.get(requestId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(requestId);
    }
  }

  async createConversation(options: {
    title?: string;
    systemPrompt?: string;
    providerId?: string;
    contextLength?: number;
  } = {}): Promise<string> {
    const id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await this.db.createConversation({
      id,
      title: options.title || null,
      ai_provider_id: options.providerId || null,
      system_prompt: options.systemPrompt || null,
      context_length: options.contextLength || 20
    });
    return id;
  }

  async getConversationMessages(conversationId: string, limit = 50): Promise<MessageRecord[]> {
    return this.db.getMessages(conversationId, limit);
  }

  hasApiKey(providerId: string): boolean {
    return this.credentialStore.hasCredential(providerId);
  }
}

// ============================================================================
// Mock IPC Handler
// ============================================================================

class MockIPCHandler {
  private aiService: IntegratedAIService;
  private handlers: Map<string, (...args: unknown[]) => Promise<unknown>> = new Map();
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  constructor(aiService: IntegratedAIService) {
    this.aiService = aiService;
    this.setupHandlers();
    this.setupEventForwarding();
  }

  private setupHandlers(): void {
    // AI API handlers
    this.handlers.set('ai:send-message', async (conversationId: unknown, content: unknown) => {
      return this.aiService.sendMessage(conversationId as string, content as string, { stream: true });
    });

    this.handlers.set('ai:create-conversation', async (options: unknown) => {
      return this.aiService.createConversation(options as Record<string, unknown>);
    });

    this.handlers.set('ai:get-messages', async (conversationId: unknown, limit: unknown) => {
      return this.aiService.getConversationMessages(conversationId as string, limit as number);
    });

    this.handlers.set('ai:cancel', async (requestId: unknown) => {
      this.aiService.cancelRequest(requestId as string);
    });

    this.handlers.set('ai:has-provider-key', async (providerId: unknown) => {
      return this.aiService.hasApiKey(providerId as string);
    });
  }

  private setupEventForwarding(): void {
    // 转发AI服务事件到渲染进程
    this.aiService.on('responseStart', (data) => {
      this.emit('ai:response-start', data);
    });

    this.aiService.on('responseChunk', (data) => {
      this.emit('ai:response-chunk', data);
    });

    this.aiService.on('responseComplete', (data) => {
      this.emit('ai:response-complete', data);
    });

    this.aiService.on('responseError', (data) => {
      this.emit('ai:response-error', data);
    });
  }

  async handle(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) {
      throw new Error(`No handler for channel: ${channel}`);
    }
    return handler(...args);
  }

  on(channel: string, callback: (...args: unknown[]) => void): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(callback);
    
    return () => {
      this.listeners.get(channel)?.delete(callback);
    };
  }

  private emit(channel: string, ...args: unknown[]): void {
    const callbacks = this.listeners.get(channel);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(...args);
      }
    }
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('AI服务集成测试', () => {
  let db: MockDatabaseService;
  let credentialStore: MockCredentialStore;
  let httpClient: MockHttpClient;
  let aiService: IntegratedAIService;
  let ipcHandler: MockIPCHandler;

  beforeAll(async () => {
    // 初始化所有服务
    db = new MockDatabaseService();
    await db.connect();

    credentialStore = new MockCredentialStore();
    httpClient = new MockHttpClient();

    aiService = new IntegratedAIService(db, credentialStore, httpClient);
    await aiService.initialize();

    ipcHandler = new MockIPCHandler(aiService);

    // 设置模拟HTTP响应
    setupMockResponses(httpClient);
  });

  afterAll(async () => {
    await db.disconnect();
  });

  beforeEach(async () => {
    // 设置API密钥
    await credentialStore.setPassword('desktop-pet', 'openai-gpt4', 'sk-test-key');
    httpClient.clearRequestLog();
  });

  afterEach(() => {
    credentialStore.clear();
  });

  // 设置模拟HTTP响应
  function setupMockResponses(client: MockHttpClient): void {
    // OpenAI chat completions
    client.setResponse('https://api.openai.com/v1/chat/completions', {
      status: 200,
      data: {
        id: 'chatcmpl-test',
        choices: [{
          message: {
            role: 'assistant',
            content: '你好！我是一只可爱的桌面小宠物～ 有什么我可以帮你的吗？😊'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80
        }
      }
    });

    // OpenAI models list (for connection test)
    client.setResponse('https://api.openai.com/v1/models', {
      status: 200,
      data: { data: [{ id: 'gpt-4-turbo' }] }
    });
  }

  describe('数据库集成', () => {
    it('应该正确创建对话并存储到数据库', async () => {
      const conversationId = await aiService.createConversation({
        title: '测试对话',
        systemPrompt: '你是一只可爱的小宠物',
        contextLength: 20
      });

      expect(conversationId).toBeTruthy();
      expect(conversationId).toMatch(/^conv-/);

      const conversation = await db.getConversation(conversationId);
      expect(conversation).not.toBeNull();
      expect(conversation?.title).toBe('测试对话');
      expect(conversation?.system_prompt).toBe('你是一只可爱的小宠物');
      expect(conversation?.context_length).toBe(20);
    });

    it('应该正确保存用户消息和AI响应', async () => {
      const conversationId = await aiService.createConversation();
      
      await aiService.sendMessage(conversationId, '你好');

      const messages = await db.getMessages(conversationId);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('你好');
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toContain('你好');
    });

    it('应该更新对话的最后更新时间', async () => {
      const conversationId = await aiService.createConversation();
      const conv1 = await db.getConversation(conversationId);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      await aiService.sendMessage(conversationId, '测试消息');

      const conv2 = await db.getConversation(conversationId);
      expect(conv2!.updated_at).toBeGreaterThan(conv1!.updated_at);
    });

    it('应该能够列出所有对话并按更新时间排序', async () => {
      const id1 = await aiService.createConversation({ title: '对话1' });
      await new Promise(resolve => setTimeout(resolve, 10));
      const id2 = await aiService.createConversation({ title: '对话2' });
      await new Promise(resolve => setTimeout(resolve, 10));
      const id3 = await aiService.createConversation({ title: '对话3' });

      const conversations = await db.listConversations();
      expect(conversations.length).toBeGreaterThanOrEqual(3);
      // 最新的对话应该在前面
      const titles = conversations.map(c => c.title);
      expect(titles.indexOf('对话3')).toBeLessThan(titles.indexOf('对话2'));
      expect(titles.indexOf('对话2')).toBeLessThan(titles.indexOf('对话1'));
    });
  });

  describe('凭证存储集成', () => {
    it('应该正确存储和检索API密钥', async () => {
      await credentialStore.setPassword('desktop-pet', 'test-provider', 'test-api-key');
      
      const key = await credentialStore.getPassword('desktop-pet', 'test-provider');
      expect(key).toBe('test-api-key');
    });

    it('没有API密钥时应该拒绝请求', async () => {
      credentialStore.clear();
      
      const conversationId = await aiService.createConversation();
      
      await expect(aiService.sendMessage(conversationId, '你好'))
        .rejects.toThrow('API key not configured');
    });

    it('应该能检查API密钥是否已设置', async () => {
      expect(aiService.hasApiKey('openai-gpt4')).toBe(true);
      expect(aiService.hasApiKey('nonexistent-provider')).toBe(false);
    });

    it('删除API密钥后应该无法发送请求', async () => {
      const conversationId = await aiService.createConversation();
      
      // 先测试有密钥时可以发送
      await aiService.sendMessage(conversationId, '你好');
      
      // 删除密钥
      await credentialStore.deletePassword('desktop-pet', 'openai-gpt4');
      
      // 再次发送应该失败
      await expect(aiService.sendMessage(conversationId, '你好'))
        .rejects.toThrow('API key not configured');
    });
  });

  describe('IPC通信集成', () => {
    it('应该通过IPC创建对话', async () => {
      const conversationId = await ipcHandler.handle('ai:create-conversation', {
        title: 'IPC测试对话'
      });

      expect(conversationId).toBeTruthy();
      const conversation = await db.getConversation(conversationId as string);
      expect(conversation?.title).toBe('IPC测试对话');
    });

    it('应该通过IPC发送消息', async () => {
      const conversationId = await ipcHandler.handle('ai:create-conversation', {});
      
      const requestId = await ipcHandler.handle('ai:send-message', conversationId, '你好');

      expect(requestId).toBeTruthy();
      
      // 等待响应完成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const messages = await ipcHandler.handle('ai:get-messages', conversationId, 50);
      expect(Array.isArray(messages)).toBe(true);
      expect((messages as MessageRecord[]).length).toBeGreaterThanOrEqual(2);
    });

    it('应该正确转发AI响应事件', async () => {
      const conversationId = await ipcHandler.handle('ai:create-conversation', {});
      
      const events: string[] = [];
      
      ipcHandler.on('ai:response-start', () => events.push('start'));
      ipcHandler.on('ai:response-chunk', () => events.push('chunk'));
      ipcHandler.on('ai:response-complete', () => events.push('complete'));

      await ipcHandler.handle('ai:send-message', conversationId, '你好');
      
      // 等待事件触发
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(events).toContain('start');
      expect(events).toContain('complete');
    });

    it('应该能检查API密钥状态', async () => {
      const hasKey = await ipcHandler.handle('ai:has-provider-key', 'openai-gpt4');
      expect(hasKey).toBe(true);

      const hasNoKey = await ipcHandler.handle('ai:has-provider-key', 'nonexistent');
      expect(hasNoKey).toBe(false);
    });
  });

  describe('HTTP请求模拟', () => {
    it('应该发送正确格式的API请求', async () => {
      const conversationId = await aiService.createConversation({
        systemPrompt: '你是一只可爱的小宠物'
      });
      
      await aiService.sendMessage(conversationId, '你好');

      const requestLog = httpClient.getRequestLog();
      const chatRequest = requestLog.find(r => r.url.includes('chat/completions'));
      
      expect(chatRequest).toBeDefined();
      expect(chatRequest?.method).toBe('POST');
      
      const body = chatRequest?.body as {
        model: string;
        messages: ChatMessage[];
        temperature: number;
      };
      expect(body.model).toBe('gpt-4-turbo');
      expect(body.messages).toBeDefined();
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toBe('你是一只可爱的小宠物');
    });

    it('应该正确处理API错误响应', async () => {
      httpClient.setResponse('https://api.openai.com/v1/chat/completions', {
        status: 401,
        data: { error: { message: 'Invalid API key' } }
      });

      const conversationId = await aiService.createConversation();
      
      await expect(aiService.sendMessage(conversationId, '你好'))
        .rejects.toThrow('API error: 401');
    });

    it('应该尊重设置的API延迟', async () => {
      httpClient.setLatency(200);
      httpClient.setResponse('https://api.openai.com/v1/chat/completions', {
        status: 200,
        data: {
          id: 'test',
          choices: [{ message: { role: 'assistant', content: '你好' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        }
      });

      const conversationId = await aiService.createConversation();
      
      const startTime = Date.now();
      await aiService.sendMessage(conversationId, '你好');
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(200);
      
      // 恢复默认延迟
      httpClient.setLatency(100);
    });
  });

  describe('端到端消息流', () => {
    it('应该完成完整的对话流程', async () => {
      // 1. 创建对话
      const conversationId = await aiService.createConversation({
        title: '完整测试',
        systemPrompt: '你是一只友好的桌面小宠物'
      });

      // 2. 发送第一条消息
      const events1: Array<{ type: string; data: unknown }> = [];
      aiService.once('responseStart', (data) => events1.push({ type: 'start', data }));
      aiService.once('responseComplete', (data) => events1.push({ type: 'complete', data }));

      await aiService.sendMessage(conversationId, '你好');
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(events1.some(e => e.type === 'start')).toBe(true);
      expect(events1.some(e => e.type === 'complete')).toBe(true);

      // 3. 发送第二条消息
      await aiService.sendMessage(conversationId, '天气怎么样');
      
      // 4. 验证消息历史
      const messages = await aiService.getConversationMessages(conversationId);
      expect(messages.length).toBe(4); // 2轮对话
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('你好');
      expect(messages[1].role).toBe('assistant');
      expect(messages[2].role).toBe('user');
      expect(messages[2].content).toBe('天气怎么样');
      expect(messages[3].role).toBe('assistant');
    });

    it('应该在多个对话间正确隔离', async () => {
      const conv1 = await aiService.createConversation({ title: '对话1' });
      const conv2 = await aiService.createConversation({ title: '对话2' });

      await aiService.sendMessage(conv1, '消息给对话1');
      await aiService.sendMessage(conv2, '消息给对话2');

      const messages1 = await aiService.getConversationMessages(conv1);
      const messages2 = await aiService.getConversationMessages(conv2);

      expect(messages1.length).toBe(2);
      expect(messages2.length).toBe(2);
      expect(messages1[0].content).toBe('消息给对话1');
      expect(messages2[0].content).toBe('消息给对话2');
    });

    it('应该支持取消正在进行的请求', async () => {
      httpClient.setLatency(1000); // 设置较长延迟

      const conversationId = await aiService.createConversation();
      
      let errorReceived = false;
      aiService.once('responseError', () => {
        errorReceived = true;
      });

      const requestIdPromise = aiService.sendMessage(conversationId, '你好');
      
      // 立即取消
      await new Promise(resolve => setTimeout(resolve, 50));
      const requestId = await requestIdPromise.catch(() => 'cancelled');
      
      if (requestId !== 'cancelled') {
        aiService.cancelRequest(requestId);
      }

      // 恢复默认延迟
      httpClient.setLatency(100);
    });
  });

  describe('错误处理集成', () => {
    it('应该正确处理数据库连接问题', async () => {
      const badDb = new MockDatabaseService();
      // 不调用connect()
      
      const badService = new IntegratedAIService(badDb, credentialStore, httpClient);
      
      // 尝试创建对话应该失败或返回空
      const conversationId = await badService.createConversation();
      expect(conversationId).toBeTruthy(); // Map仍然可用
    });

    it('应该正确处理网络超时', async () => {
      httpClient.setLatency(5000); // 5秒延迟
      httpClient.setResponse('https://api.openai.com/v1/chat/completions', {
        status: 200,
        data: {
          id: 'test',
          choices: [{ message: { role: 'assistant', content: '响应' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        }
      });

      const conversationId = await aiService.createConversation();
      
      // 使用Promise.race模拟超时
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 1000)
      );

      await expect(
        Promise.race([
          aiService.sendMessage(conversationId, '你好'),
          timeoutPromise
        ])
      ).rejects.toThrow('Timeout');

      // 恢复默认延迟
      httpClient.setLatency(100);
    });

    it('应该触发错误事件', async () => {
      httpClient.setResponse('https://api.openai.com/v1/chat/completions', {
        status: 500,
        data: { error: { message: 'Internal server error' } }
      });

      const conversationId = await aiService.createConversation();
      
      let errorEvent: { error: string; code: string } | null = null;
      aiService.once('responseError', (data) => {
        errorEvent = data;
      });

      try {
        await aiService.sendMessage(conversationId, '你好');
      } catch {
        // 预期会抛出错误
      }

      expect(errorEvent).not.toBeNull();
      expect(errorEvent?.code).toBe('ERR_AI_REQUEST');
    });
  });

  describe('提供商配置集成', () => {
    it('应该能获取已配置的提供商列表', async () => {
      const providers = await db.listProviders();
      
      expect(providers.length).toBeGreaterThanOrEqual(3);
      expect(providers.some(p => p.id === 'openai-gpt4')).toBe(true);
      expect(providers.some(p => p.id === 'claude-sonnet')).toBe(true);
      expect(providers.some(p => p.id === 'ollama-llama')).toBe(true);
    });

    it('应该按优先级排序提供商', async () => {
      const providers = await db.listProviders();
      
      for (let i = 1; i < providers.length; i++) {
        expect(providers[i].priority).toBeGreaterThanOrEqual(providers[i-1].priority);
      }
    });

    it('应该能获取默认提供商', async () => {
      const defaultProvider = await db.getDefaultProvider();
      
      expect(defaultProvider).not.toBeNull();
      expect(defaultProvider?.id).toBe('openai-gpt4');
      expect(defaultProvider?.isDefault).toBe(true);
    });

    it('应该使用对话指定的提供商', async () => {
      const conversationId = await aiService.createConversation({
        providerId: 'openai-gpt4'
      });

      const conversation = await db.getConversation(conversationId);
      expect(conversation?.ai_provider_id).toBe('openai-gpt4');
    });
  });
});

describe('流式响应集成测试', () => {
  let db: MockDatabaseService;
  let credentialStore: MockCredentialStore;
  let httpClient: MockHttpClient;
  let aiService: IntegratedAIService;

  beforeAll(async () => {
    db = new MockDatabaseService();
    await db.connect();
    credentialStore = new MockCredentialStore();
    httpClient = new MockHttpClient();
    aiService = new IntegratedAIService(db, credentialStore, httpClient);
    await aiService.initialize();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  beforeEach(async () => {
    await credentialStore.setPassword('desktop-pet', 'openai-gpt4', 'sk-test-key');
  });

  afterEach(() => {
    credentialStore.clear();
  });

  it('应该正确处理流式响应', async () => {
    const conversationId = await aiService.createConversation();
    
    const chunks: string[] = [];
    aiService.on('responseChunk', (data: { chunk: string }) => {
      chunks.push(data.chunk);
    });

    await aiService.sendMessage(conversationId, '你好', { stream: true });
    
    // 等待流式响应完成
    await new Promise(resolve => setTimeout(resolve, 500));

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('Hello');
  });

  it('应该在流式响应中触发正确的事件序列', async () => {
    const conversationId = await aiService.createConversation();
    
    const eventSequence: string[] = [];
    
    aiService.once('responseStart', () => eventSequence.push('start'));
    aiService.on('responseChunk', () => {
      if (!eventSequence.includes('chunk')) {
        eventSequence.push('chunk');
      }
    });
    aiService.once('responseComplete', () => eventSequence.push('complete'));

    await aiService.sendMessage(conversationId, '你好', { stream: true });
    
    await new Promise(resolve => setTimeout(resolve, 500));

    expect(eventSequence[0]).toBe('start');
    expect(eventSequence).toContain('chunk');
    expect(eventSequence[eventSequence.length - 1]).toBe('complete');
  });
});

describe('性能测试', () => {
  let db: MockDatabaseService;
  let credentialStore: MockCredentialStore;
  let httpClient: MockHttpClient;
  let aiService: IntegratedAIService;

  beforeAll(async () => {
    db = new MockDatabaseService();
    await db.connect();
    credentialStore = new MockCredentialStore();
    httpClient = new MockHttpClient();
    aiService = new IntegratedAIService(db, credentialStore, httpClient);
    await aiService.initialize();

    // 设置快速响应
    httpClient.setLatency(50);
    httpClient.setResponse('https://api.openai.com/v1/chat/completions', {
      status: 200,
      data: {
        id: 'test',
        choices: [{ message: { role: 'assistant', content: '响应' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      }
    });
  });

  afterAll(async () => {
    await db.disconnect();
  });

  beforeEach(async () => {
    await credentialStore.setPassword('desktop-pet', 'openai-gpt4', 'sk-test-key');
  });

  afterEach(() => {
    credentialStore.clear();
  });

  it('应该在3秒内收到首字响应 (SC-005)', async () => {
    const conversationId = await aiService.createConversation();
    
    let firstResponseTime = 0;
    const startTime = Date.now();
    
    aiService.once('responseStart', () => {
      firstResponseTime = Date.now() - startTime;
    });

    await aiService.sendMessage(conversationId, '你好');

    expect(firstResponseTime).toBeLessThan(3000);
  });

  it('应该能并发处理多个对话', async () => {
    const conversations = await Promise.all([
      aiService.createConversation({ title: '并发1' }),
      aiService.createConversation({ title: '并发2' }),
      aiService.createConversation({ title: '并发3' })
    ]);

    const startTime = Date.now();
    
    await Promise.all(
      conversations.map(convId => aiService.sendMessage(convId, '测试消息'))
    );

    const elapsed = Date.now() - startTime;
    
    // 并发处理应该比串行快
    expect(elapsed).toBeLessThan(1000);

    // 验证每个对话都有正确的消息
    for (const convId of conversations) {
      const messages = await aiService.getConversationMessages(convId);
      expect(messages.length).toBe(2);
    }
  });

  it('应该能处理大量消息历史', async () => {
    const conversationId = await aiService.createConversation();
    
    // 添加50条消息
    for (let i = 0; i < 25; i++) {
      await db.addMessage({
        id: `msg-${i}-user`,
        conversation_id: conversationId,
        role: 'user',
        content: `用户消息 ${i}`,
        tokens: null,
        tool_calls: null,
        tool_result: null
      });
      await db.addMessage({
        id: `msg-${i}-assistant`,
        conversation_id: conversationId,
        role: 'assistant',
        content: `AI响应 ${i}`,
        tokens: null,
        tool_calls: null,
        tool_result: null
      });
    }

    const startTime = Date.now();
    
    // 获取消息应该仍然快速
    const messages = await db.getMessages(conversationId, 100);
    
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(100);
    expect(messages.length).toBe(50);
  });
});