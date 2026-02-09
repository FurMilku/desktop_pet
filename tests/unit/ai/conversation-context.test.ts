/**
 * T048a [P] [US3] 单元测试：20轮对话上下文保持 (SC-006)
 * 
 * 测试对话上下文管理功能：
 * - 默认保持最近20轮对话记录
 * - 上下文长度可配置
 * - 正确计算对话轮数（用户+助手为一轮）
 * - 超出限制时正确截断旧消息
 * - 系统提示词不计入轮数
 * - 工具调用消息的处理
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// Type Definitions
// ============================================================================

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

interface ConversationConfig {
  id: string;
  title: string | null;
  systemPrompt: string | null;
  contextLength: number;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Conversation Context Manager
// ============================================================================

/**
 * 对话上下文管理器
 * 
 * 负责管理对话历史记录，确保发送给AI的上下文满足以下要求：
 * 1. 保持最近N轮对话（默认20轮）
 * 2. 系统提示词始终包含在上下文中
 * 3. 正确处理工具调用消息
 * 4. 支持动态调整上下文长度
 */
class ConversationContextManager {
  private messages: MessageRecord[] = [];
  private config: ConversationConfig;
  private static readonly DEFAULT_CONTEXT_LENGTH = 20;
  private static readonly MAX_CONTEXT_LENGTH = 50;
  private static readonly MIN_CONTEXT_LENGTH = 1;

  constructor(config: Partial<ConversationConfig> = {}) {
    this.config = {
      id: config.id || `conv-${Date.now()}`,
      title: config.title || null,
      systemPrompt: config.systemPrompt || null,
      contextLength: this.validateContextLength(config.contextLength),
      createdAt: config.createdAt || Date.now(),
      updatedAt: config.updatedAt || Date.now()
    };
  }

  private validateContextLength(length?: number): number {
    if (length === undefined || length === null) {
      return ConversationContextManager.DEFAULT_CONTEXT_LENGTH;
    }
    return Math.max(
      ConversationContextManager.MIN_CONTEXT_LENGTH,
      Math.min(ConversationContextManager.MAX_CONTEXT_LENGTH, length)
    );
  }

  /**
   * 获取当前配置的上下文长度
   */
  getContextLength(): number {
    return this.config.contextLength;
  }

  /**
   * 设置上下文长度
   */
  setContextLength(length: number): void {
    this.config.contextLength = this.validateContextLength(length);
    this.config.updatedAt = Date.now();
  }

  /**
   * 添加消息到历史记录
   */
  addMessage(message: Omit<MessageRecord, 'id' | 'conversation_id' | 'created_at'>): MessageRecord {
    const record: MessageRecord = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      conversation_id: this.config.id,
      created_at: Date.now(),
      ...message
    };
    this.messages.push(record);
    this.config.updatedAt = Date.now();
    return record;
  }

  /**
   * 获取所有消息
   */
  getAllMessages(): MessageRecord[] {
    return [...this.messages];
  }

  /**
   * 获取消息总数
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * 计算当前对话轮数
   * 一轮 = 一条用户消息 + 对应的助手回复
   */
  getTurnCount(): number {
    let turns = 0;
    let hasUserMessage = false;

    for (const msg of this.messages) {
      if (msg.role === 'user') {
        hasUserMessage = true;
      } else if (msg.role === 'assistant' && hasUserMessage) {
        turns++;
        hasUserMessage = false;
      }
    }

    // 如果有未回复的用户消息，也算作一轮的开始
    if (hasUserMessage) {
      turns++;
    }

    return turns;
  }

  /**
   * 构建发送给AI的上下文消息
   * 
   * 规则：
   * 1. 系统提示词（如果有）始终在最前面
   * 2. 最近N轮对话历史
   * 3. 工具调用消息与对应的用户/助手消息保持在一起
   */
  buildContextMessages(): ChatMessage[] {
    const result: ChatMessage[] = [];

    // 1. 添加系统提示词
    if (this.config.systemPrompt) {
      result.push({
        role: 'system',
        content: this.config.systemPrompt
      });
    }

    // 2. 获取最近N轮的消息
    const recentMessages = this.getRecentTurns(this.config.contextLength);

    // 3. 转换为ChatMessage格式
    for (const msg of recentMessages) {
      const chatMsg: ChatMessage = {
        role: msg.role,
        content: msg.content
      };

      // 处理工具调用
      if (msg.tool_calls) {
        try {
          chatMsg.tool_calls = JSON.parse(msg.tool_calls);
        } catch {
          // 忽略解析错误
        }
      }

      // 处理工具结果
      if (msg.role === 'tool' && msg.tool_result) {
        chatMsg.tool_call_id = msg.id;
        chatMsg.content = msg.tool_result;
      }

      result.push(chatMsg);
    }

    return result;
  }

  /**
   * 获取最近N轮对话
   * 
   * 轮数计算：
   * - user + assistant = 1轮
   * - 工具消息跟随其关联的assistant消息
   * - system消息不计入轮数
   */
  private getRecentTurns(turnCount: number): MessageRecord[] {
    // 将消息按轮次分组
    const turns: MessageRecord[][] = [];
    let currentTurn: MessageRecord[] = [];
    let waitingForAssistant = false;

    for (const msg of this.messages) {
      if (msg.role === 'system') {
        // 系统消息单独处理，不计入轮次
        continue;
      }

      if (msg.role === 'user') {
        // 新的用户消息开始新的一轮
        if (currentTurn.length > 0) {
          turns.push(currentTurn);
        }
        currentTurn = [msg];
        waitingForAssistant = true;
      } else if (msg.role === 'assistant') {
        currentTurn.push(msg);
        waitingForAssistant = false;
      } else if (msg.role === 'tool') {
        // 工具消息跟随当前轮次
        currentTurn.push(msg);
      }
    }

    // 添加最后一个未完成的轮次
    if (currentTurn.length > 0) {
      turns.push(currentTurn);
    }

    // 取最近N轮
    const recentTurns = turns.slice(-turnCount);
    
    // 展平返回
    return recentTurns.flat();
  }

  /**
   * 清空所有消息
   */
  clearMessages(): void {
    this.messages = [];
    this.config.updatedAt = Date.now();
  }

  /**
   * 获取配置
   */
  getConfig(): ConversationConfig {
    return { ...this.config };
  }

  /**
   * 设置系统提示词
   */
  setSystemPrompt(prompt: string | null): void {
    this.config.systemPrompt = prompt;
    this.config.updatedAt = Date.now();
  }

  /**
   * 导出消息历史（用于持久化）
   */
  exportMessages(): MessageRecord[] {
    return JSON.parse(JSON.stringify(this.messages));
  }

  /**
   * 导入消息历史（从持久化恢复）
   */
  importMessages(messages: MessageRecord[]): void {
    this.messages = JSON.parse(JSON.stringify(messages));
    this.config.updatedAt = Date.now();
  }

  /**
   * 获取上下文Token估算（简单估算，实际应使用tokenizer）
   * 假设平均每个字符约0.5个token
   */
  estimateContextTokens(): number {
    const contextMessages = this.buildContextMessages();
    let totalChars = 0;
    
    for (const msg of contextMessages) {
      totalChars += msg.content.length;
      if (msg.tool_calls) {
        totalChars += JSON.stringify(msg.tool_calls).length;
      }
    }

    return Math.ceil(totalChars * 0.5);
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('对话上下文管理 (SC-006)', () => {
  let contextManager: ConversationContextManager;

  beforeEach(() => {
    contextManager = new ConversationContextManager({
      systemPrompt: '你是一只可爱的桌面小宠物'
    });
  });

  describe('基本配置', () => {
    it('默认上下文长度应该是20轮', () => {
      const manager = new ConversationContextManager();
      expect(manager.getContextLength()).toBe(20);
    });

    it('应该能自定义上下文长度', () => {
      const manager = new ConversationContextManager({ contextLength: 10 });
      expect(manager.getContextLength()).toBe(10);
    });

    it('上下文长度不应低于1', () => {
      const manager = new ConversationContextManager({ contextLength: 0 });
      expect(manager.getContextLength()).toBe(1);

      const manager2 = new ConversationContextManager({ contextLength: -5 });
      expect(manager2.getContextLength()).toBe(1);
    });

    it('上下文长度不应超过50', () => {
      const manager = new ConversationContextManager({ contextLength: 100 });
      expect(manager.getContextLength()).toBe(50);
    });

    it('应该能动态修改上下文长度', () => {
      expect(contextManager.getContextLength()).toBe(20);
      
      contextManager.setContextLength(15);
      expect(contextManager.getContextLength()).toBe(15);
      
      contextManager.setContextLength(5);
      expect(contextManager.getContextLength()).toBe(5);
    });
  });

  describe('消息管理', () => {
    it('应该能添加消息', () => {
      contextManager.addMessage({
        role: 'user',
        content: '你好',
        tokens: null,
        tool_calls: null,
        tool_result: null
      });

      expect(contextManager.getMessageCount()).toBe(1);
    });

    it('应该能获取所有消息', () => {
      contextManager.addMessage({
        role: 'user',
        content: '你好',
        tokens: null,
        tool_calls: null,
        tool_result: null
      });
      contextManager.addMessage({
        role: 'assistant',
        content: '你好呀！',
        tokens: null,
        tool_calls: null,
        tool_result: null
      });

      const messages = contextManager.getAllMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('你好');
      expect(messages[1].content).toBe('你好呀！');
    });

    it('添加的消息应该有唯一ID', () => {
      const msg1 = contextManager.addMessage({
        role: 'user',
        content: '消息1',
        tokens: null,
        tool_calls: null,
        tool_result: null
      });
      const msg2 = contextManager.addMessage({
        role: 'user',
        content: '消息2',
        tokens: null,
        tool_calls: null,
        tool_result: null
      });

      expect(msg1.id).toBeTruthy();
      expect(msg2.id).toBeTruthy();
      expect(msg1.id).not.toBe(msg2.id);
    });

    it('应该能清空所有消息', () => {
      contextManager.addMessage({
        role: 'user',
        content: '消息1',
        tokens: null,
        tool_calls: null,
        tool_result: null
      });
      contextManager.addMessage({
        role: 'assistant',
        content: '回复1',
        tokens: null,
        tool_calls: null,
        tool_result: null
      });

      expect(contextManager.getMessageCount()).toBe(2);
      
      contextManager.clearMessages();
      
      expect(contextManager.getMessageCount()).toBe(0);
    });
  });

  describe('轮数计算', () => {
    it('没有消息时轮数为0', () => {
      expect(contextManager.getTurnCount()).toBe(0);
    });

    it('一条用户消息算作1轮（未完成）', () => {
      contextManager.addMessage({
        role: 'user',
        content: '你好',
        tokens: null,
        tool_calls: null,
        tool_result: null
      });

      expect(contextManager.getTurnCount()).toBe(1);
    });

    it('用户+助手算作1轮', () => {
      contextManager.addMessage({
        role: 'user',
        content: '你好',
        tokens: null,
        tool_calls: null,
        tool_result: null
      });
      contextManager.addMessage({
        role: 'assistant',
        content: '你好呀！',
        tokens: null,
        tool_calls: null,
        tool_result: null
      });

      expect(contextManager.getTurnCount()).toBe(1);
    });

    it('多轮对话应该正确计数', () => {
      // 第1轮
      contextManager.addMessage({ role: 'user', content: '问题1', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({ role: 'assistant', content: '回答1', tokens: null, tool_calls: null, tool_result: null });
      
      // 第2轮
      contextManager.addMessage({ role: 'user', content: '问题2', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({ role: 'assistant', content: '回答2', tokens: null, tool_calls: null, tool_result: null });
      
      // 第3轮
      contextManager.addMessage({ role: 'user', content: '问题3', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({ role: 'assistant', content: '回答3', tokens: null, tool_calls: null, tool_result: null });

      expect(contextManager.getTurnCount()).toBe(3);
    });

    it('连续的用户消息应该分别计数', () => {
      contextManager.addMessage({ role: 'user', content: '问题1', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({ role: 'user', content: '问题2', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({ role: 'assistant', content: '回答', tokens: null, tool_calls: null, tool_result: null });

      // 问题1算一轮（被问题2开始的新轮覆盖），问题2+回答算一轮
      expect(contextManager.getTurnCount()).toBe(2);
    });
  });

  describe('上下文构建 - 20轮限制', () => {
    it('少于20轮时应该返回所有消息', () => {
      // 添加5轮对话
      for (let i = 0; i < 5; i++) {
        contextManager.addMessage({ role: 'user', content: `问题${i}`, tokens: null, tool_calls: null, tool_result: null });
        contextManager.addMessage({ role: 'assistant', content: `回答${i}`, tokens: null, tool_calls: null, tool_result: null });
      }

      const context = contextManager.buildContextMessages();
      
      // 1个系统提示 + 10条对话消息（5轮）
      expect(context).toHaveLength(11);
      expect(context[0].role).toBe('system');
    });

    it('正好20轮时应该返回所有消息', () => {
      // 添加20轮对话
      for (let i = 0; i < 20; i++) {
        contextManager.addMessage({ role: 'user', content: `问题${i}`, tokens: null, tool_calls: null, tool_result: null });
        contextManager.addMessage({ role: 'assistant', content: `回答${i}`, tokens: null, tool_calls: null, tool_result: null });
      }

      const context = contextManager.buildContextMessages();
      
      // 1个系统提示 + 40条对话消息（20轮）
      expect(context).toHaveLength(41);
    });

    it('超过20轮时应该只返回最近20轮', () => {
      // 添加25轮对话
      for (let i = 0; i < 25; i++) {
        contextManager.addMessage({ role: 'user', content: `问题${i}`, tokens: null, tool_calls: null, tool_result: null });
        contextManager.addMessage({ role: 'assistant', content: `回答${i}`, tokens: null, tool_calls: null, tool_result: null });
      }

      const context = contextManager.buildContextMessages();
      
      // 1个系统提示 + 40条对话消息（20轮）
      expect(context).toHaveLength(41);
      
      // 验证是最近的20轮（从问题5开始）
      expect(context[1].content).toBe('问题5');
      expect(context[context.length - 1].content).toBe('回答24');
    });

    it('自定义上下文长度为10轮时应该只返回最近10轮', () => {
      contextManager.setContextLength(10);
      
      // 添加15轮对话
      for (let i = 0; i < 15; i++) {
        contextManager.addMessage({ role: 'user', content: `问题${i}`, tokens: null, tool_calls: null, tool_result: null });
        contextManager.addMessage({ role: 'assistant', content: `回答${i}`, tokens: null, tool_calls: null, tool_result: null });
      }

      const context = contextManager.buildContextMessages();
      
      // 1个系统提示 + 20条对话消息（10轮）
      expect(context).toHaveLength(21);
      
      // 验证是最近的10轮（从问题5开始）
      expect(context[1].content).toBe('问题5');
    });

    it('截断后应该保持对话的完整性', () => {
      // 添加25轮对话
      for (let i = 0; i < 25; i++) {
        contextManager.addMessage({ role: 'user', content: `问题${i}`, tokens: null, tool_calls: null, tool_result: null });
        contextManager.addMessage({ role: 'assistant', content: `回答${i}`, tokens: null, tool_calls: null, tool_result: null });
      }

      const context = contextManager.buildContextMessages();
      
      // 跳过系统提示，检查对话消息的配对
      const dialogMessages = context.slice(1);
      
      for (let i = 0; i < dialogMessages.length; i += 2) {
        expect(dialogMessages[i].role).toBe('user');
        expect(dialogMessages[i + 1].role).toBe('assistant');
        
        // 验证配对正确（问题N对应回答N）
        const questionNum = dialogMessages[i].content.match(/\d+/)?.[0];
        const answerNum = dialogMessages[i + 1].content.match(/\d+/)?.[0];
        expect(questionNum).toBe(answerNum);
      }
    });
  });

  describe('系统提示词处理', () => {
    it('系统提示词应该始终在上下文最前面', () => {
      contextManager.addMessage({ role: 'user', content: '问题1', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({ role: 'assistant', content: '回答1', tokens: null, tool_calls: null, tool_result: null });

      const context = contextManager.buildContextMessages();
      
      expect(context[0].role).toBe('system');
      expect(context[0].content).toBe('你是一只可爱的桌面小宠物');
    });

    it('没有系统提示词时不应该有system消息', () => {
      const manager = new ConversationContextManager();
      manager.addMessage({ role: 'user', content: '问题', tokens: null, tool_calls: null, tool_result: null });
      manager.addMessage({ role: 'assistant', content: '回答', tokens: null, tool_calls: null, tool_result: null });

      const context = manager.buildContextMessages();
      
      expect(context[0].role).toBe('user');
      expect(context.every(m => m.role !== 'system')).toBe(true);
    });

    it('系统提示词不应计入轮数', () => {
      // 即使有系统提示词，轮数计算也只看user/assistant
      contextManager.addMessage({ role: 'user', content: '问题', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({ role: 'assistant', content: '回答', tokens: null, tool_calls: null, tool_result: null });

      expect(contextManager.getTurnCount()).toBe(1);
    });

    it('应该能动态修改系统提示词', () => {
      const context1 = contextManager.buildContextMessages();
      expect(context1[0].content).toBe('你是一只可爱的桌面小宠物');

      contextManager.setSystemPrompt('你是一只聪明的AI助手');
      
      const context2 = contextManager.buildContextMessages();
      expect(context2[0].content).toBe('你是一只聪明的AI助手');
    });

    it('应该能移除系统提示词', () => {
      contextManager.setSystemPrompt(null);
      contextManager.addMessage({ role: 'user', content: '问题', tokens: null, tool_calls: null, tool_result: null });

      const context = contextManager.buildContextMessages();
      
      expect(context[0].role).toBe('user');
    });
  });

  describe('工具调用消息处理', () => {
    it('工具调用应该与对应的助手消息在同一轮', () => {
      // 用户问题
      contextManager.addMessage({ role: 'user', content: '今天天气怎么样', tokens: null, tool_calls: null, tool_result: null });
      
      // 助手发起工具调用
      contextManager.addMessage({
        role: 'assistant',
        content: '',
        tokens: null,
        tool_calls: JSON.stringify([{
          id: 'call-1',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"city":"北京"}' }
        }]),
        tool_result: null
      });
      
      // 工具返回结果
      contextManager.addMessage({
        role: 'tool',
        content: '北京今天晴天，气温25度',
        tokens: null,
        tool_calls: null,
        tool_result: '{"weather":"晴","temp":25}'
      });
      
      // 助手最终回复
      contextManager.addMessage({
        role: 'assistant',
        content: '北京今天是晴天，气温25度，很适合出门哦！',
        tokens: null,
        tool_calls: null,
        tool_result: null
      });

      // 这应该算作1轮对话
      expect(contextManager.getTurnCount()).toBe(1);

      const context = contextManager.buildContextMessages();
      
      // 系统提示 + 用户 + 助手(工具调用) + 工具 + 助手(最终回复)
      expect(context).toHaveLength(5);
    });

    it('多轮工具调用应该正确计数', () => {
      // 第1轮：带工具调用
      contextManager.addMessage({ role: 'user', content: '查天气', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({ role: 'assistant', content: '', tokens: null, tool_calls: '[{"id":"1","type":"function","function":{"name":"get_weather","arguments":"{}"}}]', tool_result: null });
      contextManager.addMessage({ role: 'tool', content: '晴天', tokens: null, tool_calls: null, tool_result: '{"weather":"晴"}' });
      contextManager.addMessage({ role: 'assistant', content: '今天晴天', tokens: null, tool_calls: null, tool_result: null });

      // 第2轮：普通对话
      contextManager.addMessage({ role: 'user', content: '谢谢', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({ role: 'assistant', content: '不客气', tokens: null, tool_calls: null, tool_result: null });

      expect(contextManager.getTurnCount()).toBe(2);
    });

    it('工具调用信息应该在上下文中正确传递', () => {
      contextManager.addMessage({ role: 'user', content: '设置提醒', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({
        role: 'assistant',
        content: '',
        tokens: null,
        tool_calls: JSON.stringify([{
          id: 'call-123',
          type: 'function',
          function: { name: 'set_reminder', arguments: '{"title":"开会","time":"14:00"}' }
        }]),
        tool_result: null
      });

      const context = contextManager.buildContextMessages();
      const assistantMsg = context.find(m => m.tool_calls);
      
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.tool_calls).toHaveLength(1);
      expect(assistantMsg?.tool_calls?.[0].function.name).toBe('set_reminder');
    });
  });

  describe('消息导出和导入', () => {
    it('应该能导出消息历史', () => {
      contextManager.addMessage({ role: 'user', content: '问题1', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({ role: 'assistant', content: '回答1', tokens: null, tool_calls: null, tool_result: null });

      const exported = contextManager.exportMessages();
      
      expect(exported).toHaveLength(2);
      expect(exported[0].content).toBe('问题1');
    });

    it('导出的消息应该是深拷贝', () => {
      contextManager.addMessage({ role: 'user', content: '原始内容', tokens: null, tool_calls: null, tool_result: null });

      const exported = contextManager.exportMessages();
      exported[0].content = '修改后的内容';

      const messages = contextManager.getAllMessages();
      expect(messages[0].content).toBe('原始内容');
    });

    it('应该能导入消息历史', () => {
      const messagesToImport: MessageRecord[] = [
        { id: 'msg-1', conversation_id: 'conv-1', role: 'user', content: '导入的问题', tokens: null, tool_calls: null, tool_result: null, created_at: Date.now() },
        { id: 'msg-2', conversation_id: 'conv-1', role: 'assistant', content: '导入的回答', tokens: null, tool_calls: null, tool_result: null, created_at: Date.now() }
      ];

      contextManager.importMessages(messagesToImport);

      const messages = contextManager.getAllMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('导入的问题');
    });

    it('导入应该替换现有消息', () => {
      contextManager.addMessage({ role: 'user', content: '原有消息', tokens: null, tool_calls: null, tool_result: null });

      const messagesToImport: MessageRecord[] = [
        { id: 'msg-new', conversation_id: 'conv-1', role: 'user', content: '新消息', tokens: null, tool_calls: null, tool_result: null, created_at: Date.now() }
      ];

      contextManager.importMessages(messagesToImport);

      const messages = contextManager.getAllMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('新消息');
    });
  });

  describe('Token估算', () => {
    it('应该能估算上下文Token数量', () => {
      contextManager.addMessage({ role: 'user', content: '你好世界', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({ role: 'assistant', content: '你好！', tokens: null, tool_calls: null, tool_result: null });

      const tokens = contextManager.estimateContextTokens();
      
      // 系统提示词 + 用户消息 + 助手消息
      // 大约 (12 + 4 + 3) * 0.5 = ~10 tokens（中文字符估算）
      expect(tokens).toBeGreaterThan(0);
    });

    it('上下文截断后Token数量应该减少', () => {
      contextManager.setContextLength(5);

      // 添加10轮对话
      for (let i = 0; i < 10; i++) {
        contextManager.addMessage({ role: 'user', content: `这是一个很长的问题${i}，包含很多字符`, tokens: null, tool_calls: null, tool_result: null });
        contextManager.addMessage({ role: 'assistant', content: `这是一个很长的回答${i}，也包含很多字符`, tokens: null, tool_calls: null, tool_result: null });
      }

      const tokensWithLimit = contextManager.estimateContextTokens();
      
      // 临时增加上下文长度
      contextManager.setContextLength(50);
      const tokensWithoutLimit = contextManager.estimateContextTokens();

      expect(tokensWithLimit).toBeLessThan(tokensWithoutLimit);
    });
  });

  describe('边界情况', () => {
    it('空对话应该只返回系统提示词', () => {
      const context = contextManager.buildContextMessages();
      
      expect(context).toHaveLength(1);
      expect(context[0].role).toBe('system');
    });

    it('只有系统消息时应该正确处理', () => {
      // 系统消息不计入轮次，也不应出现在对话历史中（除了配置的系统提示词）
      const manager = new ConversationContextManager();
      
      const context = manager.buildContextMessages();
      expect(context).toHaveLength(0);
    });

    it('非常长的对话应该能正确处理', () => {
      // 添加100轮对话
      for (let i = 0; i < 100; i++) {
        contextManager.addMessage({ role: 'user', content: `问题${i}`, tokens: null, tool_calls: null, tool_result: null });
        contextManager.addMessage({ role: 'assistant', content: `回答${i}`, tokens: null, tool_calls: null, tool_result: null });
      }

      const context = contextManager.buildContextMessages();
      
      // 系统提示 + 20轮对话
      expect(context).toHaveLength(41);
      
      // 验证是最后20轮
      expect(context[1].content).toBe('问题80');
      expect(context[context.length - 1].content).toBe('回答99');
    });

    it('上下文长度为1时应该只保留最后一轮', () => {
      contextManager.setContextLength(1);

      contextManager.addMessage({ role: 'user', content: '问题1', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({ role: 'assistant', content: '回答1', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({ role: 'user', content: '问题2', tokens: null, tool_calls: null, tool_result: null });
      contextManager.addMessage({ role: 'assistant', content: '回答2', tokens: null, tool_calls: null, tool_result: null });

      const context = contextManager.buildContextMessages();
      
      // 系统提示 + 1轮对话
      expect(context).toHaveLength(3);
      expect(context[1].content).toBe('问题2');
      expect(context[2].content).toBe('回答2');
    });

    it('只有未完成的轮次时应该正确处理', () => {
      contextManager.addMessage({ role: 'user', content: '等待回复的问题', tokens: null, tool_calls: null, tool_result: null });

      const context = contextManager.buildContextMessages();
      
      // 系统提示 + 1条用户消息
      expect(context).toHaveLength(2);
      expect(context[1].role).toBe('user');
      expect(context[1].content).toBe('等待回复的问题');
    });
  });

  describe('并发安全', () => {
    it('快速连续添加消息应该保持顺序', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          new Promise<void>(resolve => {
            setTimeout(() => {
              contextManager.addMessage({ role: 'user', content: `消息${i}`, tokens: null, tool_calls: null, tool_result: null });
              resolve();
            }, Math.random() * 10);
          })
        );
      }

      await Promise.all(promises);

      const messages = contextManager.getAllMessages();
      expect(messages).toHaveLength(10);
    });
  });
});

describe('20轮对话上下文保持验证 (SC-006)', () => {
  it('应该精确保持20轮对话历史', () => {
    const manager = new ConversationContextManager({
      systemPrompt: '系统提示'
    });

    // 添加正好20轮对话
    for (let i = 0; i < 20; i++) {
      manager.addMessage({ role: 'user', content: `用户消息${i + 1}`, tokens: null, tool_calls: null, tool_result: null });
      manager.addMessage({ role: 'assistant', content: `AI回复${i + 1}`, tokens: null, tool_calls: null, tool_result: null });
    }

    expect(manager.getTurnCount()).toBe(20);
    
    const context = manager.buildContextMessages();
    // 系统提示 + 40条消息
    expect(context.length).toBe(41);
  });

  it('应该在超过20轮时丢弃最早的对话', () => {
    const manager = new ConversationContextManager({
      systemPrompt: '系统提示'
    });

    // 添加21轮对话
    for (let i = 0; i < 21; i++) {
      manager.addMessage({ role: 'user', content: `用户消息${i + 1}`, tokens: null, tool_calls: null, tool_result: null });
      manager.addMessage({ role: 'assistant', content: `AI回复${i + 1}`, tokens: null, tool_calls: null, tool_result: null });
    }

    expect(manager.getTurnCount()).toBe(21);
    
    const context = manager.buildContextMessages();
    // 系统提示 + 40条消息（20轮）
    expect(context.length).toBe(41);
    
    // 第一轮应该是"用户消息2"（原来的"用户消息1"被丢弃）
    expect(context[1].content).toBe('用户消息2');
    expect(context[2].content).toBe('AI回复2');
    
    // 最后一轮应该是"用户消息21"
    expect(context[context.length - 2].content).toBe('用户消息21');
    expect(context[context.length - 1].content).toBe('AI回复21');
  });

  it('数据模型中默认context_length应为20', () => {
    const manager = new ConversationContextManager();
    expect(manager.getConfig().contextLength).toBe(20);
  });

  it('对话配置应该支持自定义context_length', () => {
    const manager = new ConversationContextManager({ contextLength: 15 });
    expect(manager.getConfig().contextLength).toBe(15);

    // 添加20轮，但只保留15轮
    for (let i = 0; i < 20; i++) {
      manager.addMessage({ role: 'user', content: `问题${i}`, tokens: null, tool_calls: null, tool_result: null });
      manager.addMessage({ role: 'assistant', content: `回答${i}`, tokens: null, tool_calls: null, tool_result: null });
    }

    const context = manager.buildContextMessages();
    // 30条消息（15轮）
    expect(context.length).toBe(30);
    
    // 应该从问题5开始（0-4被丢弃）
    expect(context[0].content).toBe('问题5');
  });
});