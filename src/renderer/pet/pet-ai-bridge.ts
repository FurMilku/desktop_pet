/**
 * 宠物-AI桥接器
 * T060 [US3]: 实现宠物-AI桥接器
 * 
 * 功能：
 * - 连接 ChatBubble/ChatWindow 与动画系统
 * - 处理用户输入并通过 IPC 发送到 AI 服务
 * - 接收 AI 流式响应并显示在气泡/窗口
 * - 将 EmotionType 映射到 AnimationState 触发宠物动画
 * - 管理对话上下文和系统提示词
 */

import type { AnimationState, IAnimationSystem } from './pet-animation';
import type {
  IChatBubble,
  EmotionType,
  StreamChunkData,
  StreamErrorData,
  StreamCompleteData,
} from '../ui/chat-bubble';
import type { IChatWindow, MessageRole } from '../ui/chat-window';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 聊天消息（与 AI 服务通信用）
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * 桥接器配置
 */
export interface PetAIBridgeConfig {
  /** 宠物名称 */
  petName: string;
  /** 宠物性格描述 */
  personality: string;
  /** 最大对话历史条数 */
  maxHistoryLength: number;
  /** 是否使用流式响应 */
  useStream: boolean;
  /** 是否在气泡显示响应 */
  showInBubble: boolean;
  /** 是否在窗口显示响应 */
  showInWindow: boolean;
  /** 系统提示词模板 */
  systemPromptTemplate: string;
  /** 默认情绪 */
  defaultEmotion: EmotionType;
  /** 情绪持续时间（毫秒），0 表示不自动重置 */
  emotionDuration: number;
}

/**
 * 桥接器事件回调
 */
export interface PetAIBridgeCallbacks {
  /** 开始处理消息 */
  onProcessingStart?: () => void;
  /** 处理完成 */
  onProcessingEnd?: (success: boolean) => void;
  /** 情绪变化 */
  onEmotionChange?: (emotion: EmotionType, animationState: AnimationState) => void;
  /** AI 响应完成 */
  onResponseComplete?: (content: string, emotion: EmotionType | null) => void;
  /** 发生错误 */
  onError?: (error: string) => void;
  /** 对话历史变化 */
  onHistoryChange?: (history: ChatMessage[]) => void;
}

/**
 * IPC 响应包装
 */
interface IpcResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
}

/**
 * 聊天完成结果
 */
interface ChatCompletionResult {
  content: string;
  provider: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cached?: boolean;
}

/**
 * 宠物-AI桥接器接口
 */
export interface IPetAIBridge {
  /** 是否正在处理 */
  readonly isProcessing: boolean;
  /** 当前情绪 */
  readonly currentEmotion: EmotionType;
  /** 对话历史 */
  readonly conversationHistory: ChatMessage[];
  
  // 生命周期
  initialize(): void;
  dispose(): void;
  
  // 配置
  setConfig(config: Partial<PetAIBridgeConfig>): void;
  setCallbacks(callbacks: PetAIBridgeCallbacks): void;
  
  // 组件绑定
  bindChatBubble(bubble: IChatBubble): void;
  bindChatWindow(window: IChatWindow): void;
  bindAnimationSystem(animationSystem: IAnimationSystem): void;
  
  // 消息处理
  sendMessage(content: string, useStream?: boolean): Promise<void>;
  
  // 情绪管理
  setEmotion(emotion: EmotionType): void;
  mapEmotionToAnimation(emotion: EmotionType): AnimationState;
  
  // 对话管理
  getConversationHistory(): ChatMessage[];
  clearConversation(): void;
  setSystemPrompt(prompt: string): void;
}

// ============================================================================
// 常量
// ============================================================================

/** AI IPC 通道 */
const AI_IPC_CHANNELS = {
  CHAT: 'ai:chat',
  CHAT_STREAM: 'ai:chat:stream',
  CHAT_STREAM_ABORT: 'ai:chat:stream:abort',
  CHECK_AVAILABILITY: 'ai:check-availability',
  GET_ACTIVE_PROVIDER: 'ai:get-active-provider',
} as const;

/** AI 流式事件通道 */
const AI_STREAM_EVENTS = {
  CHUNK: 'ai:stream:chunk',
  ERROR: 'ai:stream:error',
  COMPLETE: 'ai:stream:complete',
} as const;

/** 默认系统提示词模板 */
const DEFAULT_SYSTEM_PROMPT = `你是一只可爱的桌面小宠物，名叫{petName}。

性格特点：
{personality}

交流规则：
1. 用简短、活泼的语言回复，每次回复不超过50字
2. 表现出对主人的关心和陪伴
3. 可以表达情绪，如开心、好奇、困惑等
4. 偶尔撒娇或卖萌
5. 回复末尾添加情绪标记，格式为 [emotion:xxx]

可用情绪标记：
- [emotion:happy] - 开心、满足
- [emotion:curious] - 好奇、感兴趣
- [emotion:confused] - 困惑、不理解
- [emotion:thinking] - 思考中
- [emotion:excited] - 兴奋、激动
- [emotion:sleepy] - 困倦、想睡觉
- [emotion:sad] - 难过、失落

示例回复：
- "主人好呀~ 今天心情怎么样？ [emotion:happy]"
- "嗯？这是什么意思呀？ [emotion:curious]"
- "让我想想... [emotion:thinking]"`;

/** 默认配置 */
const DEFAULT_CONFIG: PetAIBridgeConfig = {
  petName: '小宠',
  personality: '活泼可爱，喜欢和主人互动，偶尔会撒娇',
  maxHistoryLength: 20,
  useStream: true,
  showInBubble: true,
  showInWindow: true,
  systemPromptTemplate: DEFAULT_SYSTEM_PROMPT,
  defaultEmotion: 'neutral',
  emotionDuration: 5000,
};

/** 情绪到动画状态的映射 */
const EMOTION_TO_ANIMATION: Record<EmotionType, AnimationState> = {
  happy: 'happy',
  curious: 'curious',
  confused: 'confused',
  thinking: 'thinking',
  excited: 'celebrating',
  sleepy: 'sleepy',
  sad: 'sad',
  neutral: 'idle',
};

// ============================================================================
// PetAIBridge 实现
// ============================================================================

/**
 * 宠物-AI桥接器
 */
export class PetAIBridge implements IPetAIBridge {
  // 配置
  private _config: PetAIBridgeConfig;
  private _callbacks: PetAIBridgeCallbacks = {};
  
  // 状态
  private _isInitialized = false;
  private _isProcessing = false;
  private _currentEmotion: EmotionType = 'neutral';
  private _conversationHistory: ChatMessage[] = [];
  private _systemPrompt: string = '';
  private _currentStreamId: string | null = null;
  
  // 绑定的组件
  private _chatBubble: IChatBubble | null = null;
  private _chatWindow: IChatWindow | null = null;
  private _animationSystem: IAnimationSystem | null = null;
  
  // 定时器
  private _emotionResetTimer: ReturnType<typeof setTimeout> | null = null;
  
  // IPC 监听器清理
  private _ipcCleanup: (() => void) | null = null;

  /**
   * 构造函数
   */
  constructor(config?: Partial<PetAIBridgeConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._currentEmotion = this._config.defaultEmotion;
  }

  // ============================================================================
  // 属性访问器
  // ============================================================================

  get isProcessing(): boolean {
    return this._isProcessing;
  }

  get currentEmotion(): EmotionType {
    return this._currentEmotion;
  }

  get conversationHistory(): ChatMessage[] {
    return [...this._conversationHistory];
  }

  // ============================================================================
  // 生命周期
  // ============================================================================

  /**
   * 初始化桥接器
   */
  initialize(): void {
    if (this._isInitialized) {
      console.warn('[PetAIBridge] Already initialized');
      return;
    }

    // 生成系统提示词
    this._generateSystemPrompt();
    
    // 设置 IPC 监听
    this._setupIPCListeners();

    this._isInitialized = true;
    console.log('[PetAIBridge] Initialized');
  }

  /**
   * 销毁桥接器
   */
  dispose(): void {
    // 清理定时器
    if (this._emotionResetTimer) {
      clearTimeout(this._emotionResetTimer);
      this._emotionResetTimer = null;
    }
    
    // 中止当前流
    if (this._currentStreamId) {
      this._abortStream(this._currentStreamId);
      this._currentStreamId = null;
    }
    
    // 清理 IPC 监听
    this._cleanupIPCListeners();
    
    // 清理引用
    this._chatBubble = null;
    this._chatWindow = null;
    this._animationSystem = null;
    this._conversationHistory = [];
    this._callbacks = {};
    this._isProcessing = false;
    this._isInitialized = false;

    console.log('[PetAIBridge] Disposed');
  }

  // ============================================================================
  // 配置
  // ============================================================================

  /**
   * 更新配置
   */
  setConfig(config: Partial<PetAIBridgeConfig>): void {
    const oldConfig = { ...this._config };
    this._config = { ...this._config, ...config };
    
    // 如果宠物名称或性格变化，重新生成系统提示词
    if (config.petName !== undefined || config.personality !== undefined || 
        config.systemPromptTemplate !== undefined) {
      this._generateSystemPrompt();
    }
    
    console.log('[PetAIBridge] Config updated');
  }

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: PetAIBridgeCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  // ============================================================================
  // 组件绑定
  // ============================================================================

  /**
   * 绑定对话气泡
   */
  bindChatBubble(bubble: IChatBubble): void {
    this._chatBubble = bubble;
    
    // 设置气泡回调
    bubble.setCallbacks({
      onEmotionChange: (emotion) => {
        this.setEmotion(emotion);
      },
      onStreamComplete: (content, emotion) => {
        if (emotion) {
          this.setEmotion(emotion);
        }
        this._callbacks.onResponseComplete?.(content, emotion);
      },
      onError: (error) => {
        this._callbacks.onError?.(error);
      },
    });
    
    console.log('[PetAIBridge] ChatBubble bound');
  }

  /**
   * 绑定聊天窗口
   */
  bindChatWindow(window: IChatWindow): void {
    this._chatWindow = window;
    
    // 设置窗口回调
    window.setCallbacks({
      onSendMessage: (message) => {
        this.sendMessage(message);
      },
      onEmotionChange: (emotion) => {
        this.setEmotion(emotion);
      },
      onClear: () => {
        this.clearConversation();
      },
    });
    
    console.log('[PetAIBridge] ChatWindow bound');
  }

  /**
   * 绑定动画系统
   */
  bindAnimationSystem(animationSystem: IAnimationSystem): void {
    this._animationSystem = animationSystem;
    console.log('[PetAIBridge] AnimationSystem bound');
  }

  // ============================================================================
  // 消息处理
  // ============================================================================

  /**
   * 发送消息
   */
  async sendMessage(content: string, useStream?: boolean): Promise<void> {
    if (!this._isInitialized) {
      console.warn('[PetAIBridge] Not initialized');
      return;
    }

    if (this._isProcessing) {
      console.warn('[PetAIBridge] Already processing a message');
      return;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return;
    }

    this._isProcessing = true;
    this._callbacks.onProcessingStart?.();

    // 切换到 listening 状态
    this._setAnimationState('listening');

    // 添加用户消息到历史
    this._addMessageToHistory({ role: 'user', content: trimmedContent });

    // 在窗口中添加用户消息（气泡不显示用户消息）
    if (this._chatWindow && this._config.showInWindow) {
      this._chatWindow.addMessage({
        role: 'user',
        content: trimmedContent,
      });
    }

    const shouldStream = useStream ?? this._config.useStream;

    try {
      if (shouldStream) {
        await this._sendStreamMessage();
      } else {
        await this._sendNonStreamMessage();
      }
      
      this._callbacks.onProcessingEnd?.(true);
    } catch (error) {
      console.error('[PetAIBridge] Send message error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._callbacks.onError?.(errorMessage);
      this._callbacks.onProcessingEnd?.(false);
      
      // 显示错误
      this._showError(errorMessage);
      
      // 切换到 confused 状态表示出错
      this.setEmotion('confused');
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * 发送流式消息
   */
  private async _sendStreamMessage(): Promise<void> {
    const messages = this._buildMessages();
    
    // 调用 IPC 启动流
    const response = await this._invokeIPC<{ streamId: string }>(
      AI_IPC_CHANNELS.CHAT_STREAM,
      messages
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '启动流式请求失败');
    }

    this._currentStreamId = response.data.streamId;

    // 切换到 thinking 状态
    this._setAnimationState('thinking');

    // 在气泡中开始流式显示
    if (this._chatBubble && this._config.showInBubble) {
      this._chatBubble.startStream(this._currentStreamId);
    }

    // 在窗口中开始流式显示
    if (this._chatWindow && this._config.showInWindow) {
      this._chatWindow.startStream();
    }

    // 流式数据由 IPC 监听器处理
    // 等待流完成的逻辑在 _handleStreamComplete 中
  }

  /**
   * 发送非流式消息
   */
  private async _sendNonStreamMessage(): Promise<void> {
    const messages = this._buildMessages();

    // 切换到 thinking 状态
    this._setAnimationState('thinking');

    // 显示加载状态
    if (this._chatBubble && this._config.showInBubble) {
      this._chatBubble.show();
      // 气泡会显示加载指示器
    }

    // 调用 IPC
    const response = await this._invokeIPC<ChatCompletionResult>(
      AI_IPC_CHANNELS.CHAT,
      messages
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'AI 请求失败');
    }

    const content = response.data.content;

    // 添加助手回复到历史
    this._addMessageToHistory({ role: 'assistant', content });

    // 显示回复
    this._displayResponse(content);
  }

  // ============================================================================
  // 情绪管理
  // ============================================================================

  /**
   * 设置情绪
   */
  setEmotion(emotion: EmotionType): void {
    if (emotion === this._currentEmotion) return;

    this._currentEmotion = emotion;
    
    // 映射到动画状态
    const animationState = this.mapEmotionToAnimation(emotion);
    
    // 设置动画
    this._setAnimationState(animationState);
    
    // 触发回调
    this._callbacks.onEmotionChange?.(emotion, animationState);

    // 设置情绪重置定时器
    if (this._config.emotionDuration > 0 && emotion !== 'neutral') {
      this._resetEmotionAfterDelay();
    }

    console.log(`[PetAIBridge] Emotion set to: ${emotion} -> ${animationState}`);
  }

  /**
   * 情绪到动画状态的映射
   */
  mapEmotionToAnimation(emotion: EmotionType): AnimationState {
    return EMOTION_TO_ANIMATION[emotion] || 'idle';
  }

  /**
   * 延迟后重置情绪
   */
  private _resetEmotionAfterDelay(): void {
    if (this._emotionResetTimer) {
      clearTimeout(this._emotionResetTimer);
    }

    this._emotionResetTimer = setTimeout(() => {
      this._emotionResetTimer = null;
      // 只在不处理消息时重置
      if (!this._isProcessing) {
        this.setEmotion(this._config.defaultEmotion);
      }
    }, this._config.emotionDuration);
  }

  // ============================================================================
  // 对话管理
  // ============================================================================

  /**
   * 获取对话历史
   */
  getConversationHistory(): ChatMessage[] {
    return [...this._conversationHistory];
  }

  /**
   * 清除对话历史
   */
  clearConversation(): void {
    this._conversationHistory = [];
    this._callbacks.onHistoryChange?.([]);
    console.log('[PetAIBridge] Conversation cleared');
  }

  /**
   * 设置系统提示词
   */
  setSystemPrompt(prompt: string): void {
    this._systemPrompt = prompt;
    console.log('[PetAIBridge] System prompt updated');
  }

  /**
   * 生成系统提示词
   */
  private _generateSystemPrompt(): void {
    this._systemPrompt = this._config.systemPromptTemplate
      .replace('{petName}', this._config.petName)
      .replace('{personality}', this._config.personality);
  }

  /**
   * 构建发送给 AI 的消息列表
   */
  private _buildMessages(): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: 'system', content: this._systemPrompt },
      ...this._conversationHistory,
    ];
    return messages;
  }

  /**
   * 添加消息到历史
   */
  private _addMessageToHistory(message: ChatMessage): void {
    this._conversationHistory.push(message);
    
    // 限制历史长度
    while (this._conversationHistory.length > this._config.maxHistoryLength) {
      this._conversationHistory.shift();
    }
    
    this._callbacks.onHistoryChange?.(this._conversationHistory);
  }

  // ============================================================================
  // 显示处理
  // ============================================================================

  /**
   * 显示 AI 响应
   */
  private _displayResponse(content: string): void {
    // 解析情绪
    const { text, emotion } = this._extractEmotion(content);
    
    // 在气泡中显示
    if (this._chatBubble && this._config.showInBubble) {
      this._chatBubble.setContent(text, true);
      this._chatBubble.show();
    }
    
    // 在窗口中显示
    if (this._chatWindow && this._config.showInWindow) {
      this._chatWindow.addMessage({
        role: 'assistant',
        content: text,
        emotion: emotion || undefined,
      });
    }
    
    // 设置情绪
    if (emotion) {
      this.setEmotion(emotion);
    } else {
      // 默认开心
      this.setEmotion('happy');
    }
    
    this._callbacks.onResponseComplete?.(text, emotion);
  }

  /**
   * 显示错误
   */
  private _showError(message: string): void {
    const errorText = `哎呀，出错了：${message}`;
    
    if (this._chatBubble && this._config.showInBubble) {
      this._chatBubble.setContent(errorText);
      this._chatBubble.show();
    }
    
    if (this._chatWindow && this._config.showInWindow) {
      this._chatWindow.addMessage({
        role: 'assistant',
        content: errorText,
      });
    }
  }

  /**
   * 提取情绪标记
   */
  private _extractEmotion(content: string): { text: string; emotion: EmotionType | null } {
    const emotionRegex = /\[emotion:(happy|curious|confused|thinking|excited|sleepy|sad)\]/gi;
    let emotion: EmotionType | null = null;
    
    const matches = content.match(emotionRegex);
    if (matches && matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const emotionMatch = lastMatch.match(/\[emotion:(\w+)\]/i);
      if (emotionMatch) {
        emotion = emotionMatch[1].toLowerCase() as EmotionType;
      }
    }
    
    const text = content.replace(emotionRegex, '').trim();
    
    return { text, emotion };
  }

  // ============================================================================
  // 动画控制
  // ============================================================================

  /**
   * 设置动画状态
   */
  private _setAnimationState(state: AnimationState): void {
    if (this._animationSystem) {
      this._animationSystem.setState(state);
    }
  }

  // ============================================================================
  // IPC 通信
  // ============================================================================

  /**
   * 调用 IPC
   */
  private async _invokeIPC<T>(channel: string, ...args: unknown[]): Promise<IpcResponse<T>> {
    if (typeof window === 'undefined' || !window.electronAPI?.invoke) {
      return {
        success: false,
        error: { code: 'NO_IPC', message: 'IPC 不可用' },
      };
    }

    try {
      const result = await window.electronAPI.invoke(channel, ...args);
      return result as IpcResponse<T>;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'IPC_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * 中止流
   */
  private async _abortStream(streamId: string): Promise<void> {
    try {
      await this._invokeIPC(AI_IPC_CHANNELS.CHAT_STREAM_ABORT, streamId);
    } catch (error) {
      console.error('[PetAIBridge] Abort stream error:', error);
    }
  }

  /**
   * 设置 IPC 监听器
   */
  private _setupIPCListeners(): void {
    if (typeof window === 'undefined' || !window.electronAPI?.on) {
      console.warn('[PetAIBridge] electronAPI not available');
      return;
    }

    const handlers = {
      chunk: (data: StreamChunkData) => this._handleStreamChunk(data),
      error: (data: StreamErrorData) => this._handleStreamError(data),
      complete: (data: StreamCompleteData) => this._handleStreamComplete(data),
    };

    window.electronAPI.on(AI_STREAM_EVENTS.CHUNK, handlers.chunk);
    window.electronAPI.on(AI_STREAM_EVENTS.ERROR, handlers.error);
    window.electronAPI.on(AI_STREAM_EVENTS.COMPLETE, handlers.complete);

    this._ipcCleanup = () => {
      window.electronAPI?.off?.(AI_STREAM_EVENTS.CHUNK, handlers.chunk);
      window.electronAPI?.off?.(AI_STREAM_EVENTS.ERROR, handlers.error);
      window.electronAPI?.off?.(AI_STREAM_EVENTS.COMPLETE, handlers.complete);
    };

    console.log('[PetAIBridge] IPC listeners set up');
  }

  /**
   * 清理 IPC 监听器
   */
  private _cleanupIPCListeners(): void {
    if (this._ipcCleanup) {
      this._ipcCleanup();
      this._ipcCleanup = null;
    }
  }

  /**
   * 处理流式数据块
   */
  private _handleStreamChunk(data: StreamChunkData): void {
    if (data.streamId !== this._currentStreamId) return;

    // 气泡和窗口已经通过各自的 IPC 监听器处理
    // 这里主要用于收集完整内容
  }

  /**
   * 处理流式错误
   */
  private _handleStreamError(data: StreamErrorData): void {
    if (data.streamId !== this._currentStreamId) return;

    console.error('[PetAIBridge] Stream error:', data.error);
    
    this._currentStreamId = null;
    this._isProcessing = false;
    
    // 设置 confused 状态
    this.setEmotion('confused');
    
    this._callbacks.onError?.(data.error.message);
    this._callbacks.onProcessingEnd?.(false);
  }

  /**
   * 处理流式完成
   */
  private _handleStreamComplete(data: StreamCompleteData): void {
    if (data.streamId !== this._currentStreamId) return;

    console.log('[PetAIBridge] Stream complete');
    
    this._currentStreamId = null;

    // 获取气泡中的完整内容
    if (this._chatBubble) {
      const content = this._chatBubble.currentContent;
      const emotion = this._chatBubble.currentEmotion;
      
      // 添加到历史
      this._addMessageToHistory({ role: 'assistant', content });
      
      // 设置情绪
      if (emotion) {
        this.setEmotion(emotion);
      } else {
        this.setEmotion('happy');
      }
      
      this._callbacks.onResponseComplete?.(content, emotion);
    }
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建宠物-AI桥接器实例
 */
export function createPetAIBridge(config?: Partial<PetAIBridgeConfig>): IPetAIBridge {
  return new PetAIBridge(config);
}

// ============================================================================
// 类型声明扩展
// ============================================================================

declare global {
  interface Window {
    electronAPI?: {
      on?: (channel: string, callback: (...args: unknown[]) => void) => void;
      off?: (channel: string, callback: (...args: unknown[]) => void) => void;
      invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
  }
}

// ============================================================================
// 导出
// ============================================================================

export default PetAIBridge;