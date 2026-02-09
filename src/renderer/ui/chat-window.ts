/**
 * 独立聊天窗口组件
 * T059 [US3]: 实现独立聊天窗口组件
 * 
 * 功能：
 * - 提供独立的聊天窗口界面
 * - 支持消息历史显示
 * - 输入框和发送功能
 * - 流式响应实时显示
 * - 支持拖拽移动和调整大小
 */

import {
  EmotionType,
  StreamChunkData,
  StreamErrorData,
  StreamCompleteData,
  extractEmotion,
} from './chat-bubble';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * 聊天消息
 */
export interface ChatWindowMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  emotion?: EmotionType;
  isStreaming?: boolean;
}

/**
 * 窗口位置与尺寸
 */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 聊天窗口配置
 */
export interface ChatWindowConfig {
  /** 窗口标题 */
  title: string;
  /** 初始位置与尺寸 */
  bounds: WindowBounds;
  /** 最小宽度 */
  minWidth: number;
  /** 最小高度 */
  minHeight: number;
  /** 最大消息历史数 */
  maxMessages: number;
  /** 主题 */
  theme: 'light' | 'dark' | 'system';
  /** 层级 */
  zIndex: number;
  /** 是否可拖拽 */
  draggable: boolean;
  /** 是否可调整大小 */
  resizable: boolean;
  /** 占位符文本 */
  placeholder: string;
  /** 宠物名称 */
  petName: string;
}

/**
 * 聊天窗口回调
 */
export interface ChatWindowCallbacks {
  /** 发送消息 */
  onSendMessage?: (message: string) => void;
  /** 窗口打开 */
  onOpen?: () => void;
  /** 窗口关闭 */
  onClose?: () => void;
  /** 窗口移动 */
  onMove?: (bounds: WindowBounds) => void;
  /** 窗口调整大小 */
  onResize?: (bounds: WindowBounds) => void;
  /** 情绪变化 */
  onEmotionChange?: (emotion: EmotionType) => void;
  /** 清空消息 */
  onClear?: () => void;
}

/**
 * 聊天窗口接口
 */
export interface IChatWindow {
  readonly isOpen: boolean;
  readonly messages: ChatWindowMessage[];
  readonly bounds: WindowBounds;
  
  // 生命周期
  initialize(container?: HTMLElement): void;
  dispose(): void;
  
  // 配置
  setConfig(config: Partial<ChatWindowConfig>): void;
  setCallbacks(callbacks: ChatWindowCallbacks): void;
  
  // 窗口控制
  open(): void;
  close(): void;
  toggle(): void;
  focus(): void;
  setBounds(bounds: Partial<WindowBounds>): void;
  
  // 消息操作
  addMessage(message: Omit<ChatWindowMessage, 'id' | 'timestamp'>): string;
  updateMessage(id: string, updates: Partial<ChatWindowMessage>): void;
  clearMessages(): void;
  
  // 流式处理
  startStream(): string;
  handleStreamChunk(data: StreamChunkData): void;
  handleStreamComplete(data: StreamCompleteData): void;
  handleStreamError(data: StreamErrorData): void;
  
  // 输入控制
  setInputValue(value: string): void;
  setInputEnabled(enabled: boolean): void;
}

// ============================================================================
// 常量
// ============================================================================

/** 默认配置 */
const DEFAULT_CONFIG: ChatWindowConfig = {
  title: '与小宠物对话',
  bounds: { x: 100, y: 100, width: 400, height: 500 },
  minWidth: 300,
  minHeight: 400,
  maxMessages: 100,
  theme: 'system',
  zIndex: 9000,
  draggable: true,
  resizable: true,
  placeholder: '输入消息...',
  petName: '小宠物',
};

/** AI 流式事件通道 */
const AI_STREAM_EVENTS = {
  CHUNK: 'ai:stream:chunk',
  ERROR: 'ai:stream:error',
  COMPLETE: 'ai:stream:complete',
} as const;

// ============================================================================
// 样式
// ============================================================================

const WINDOW_STYLES = `
.chat-window {
  position: fixed;
  display: flex;
  flex-direction: column;
  background: var(--cw-bg, #ffffff);
  border: 1px solid var(--cw-border, #e0e0e0);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  z-index: var(--cw-z-index, 9000);
  opacity: 0;
  transform: scale(0.95);
  transition: opacity 200ms ease, transform 200ms ease;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif;
  overflow: hidden;
}

.chat-window.open {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}

.chat-window.theme-dark {
  --cw-bg: #1e1e1e;
  --cw-border: #333;
  --cw-header-bg: #252525;
  --cw-text: #e0e0e0;
  --cw-text-muted: #888;
  --cw-input-bg: #2d2d2d;
  --cw-input-border: #404040;
  --cw-msg-user-bg: #0078d4;
  --cw-msg-assistant-bg: #333;
  --cw-scrollbar: #444;
}

.chat-window.theme-light {
  --cw-bg: #ffffff;
  --cw-border: #e0e0e0;
  --cw-header-bg: #f5f5f5;
  --cw-text: #333333;
  --cw-text-muted: #888;
  --cw-input-bg: #ffffff;
  --cw-input-border: #e0e0e0;
  --cw-msg-user-bg: #0078d4;
  --cw-msg-assistant-bg: #f0f0f0;
  --cw-scrollbar: #ccc;
}

/* 头部 */
.chat-window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--cw-header-bg, #f5f5f5);
  border-bottom: 1px solid var(--cw-border, #e0e0e0);
  cursor: move;
  user-select: none;
}

.chat-window-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--cw-text, #333);
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-window-title-icon {
  font-size: 18px;
}

.chat-window-actions {
  display: flex;
  gap: 8px;
}

.chat-window-action {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--cw-text-muted, #888);
  font-size: 14px;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 150ms, color 150ms;
}

.chat-window-action:hover {
  background: var(--cw-border, #e0e0e0);
  color: var(--cw-text, #333);
}

.chat-window-action.close:hover {
  background: #ff5f57;
  color: white;
}

/* 消息区域 */
.chat-window-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--cw-scrollbar, #ccc) transparent;
}

.chat-window-messages::-webkit-scrollbar {
  width: 6px;
}

.chat-window-messages::-webkit-scrollbar-thumb {
  background: var(--cw-scrollbar, #ccc);
  border-radius: 3px;
}

/* 消息项 */
.chat-message {
  display: flex;
  flex-direction: column;
  max-width: 85%;
  animation: message-appear 200ms ease;
}

@keyframes message-appear {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.chat-message.user {
  align-self: flex-end;
}

.chat-message.assistant {
  align-self: flex-start;
}

.chat-message-content {
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.5;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.chat-message.user .chat-message-content {
  background: var(--cw-msg-user-bg, #0078d4);
  color: white;
  border-bottom-right-radius: 4px;
}

.chat-message.assistant .chat-message-content {
  background: var(--cw-msg-assistant-bg, #f0f0f0);
  color: var(--cw-text, #333);
  border-bottom-left-radius: 4px;
}

.chat-message-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--cw-text-muted, #888);
}

.chat-message.user .chat-message-meta {
  justify-content: flex-end;
}

.chat-message-emotion {
  font-size: 14px;
}

/* 流式加载指示器 */
.chat-message-streaming {
  display: inline-flex;
  gap: 3px;
  padding: 4px 0;
}

.chat-message-streaming-dot {
  width: 5px;
  height: 5px;
  background: var(--cw-text, #333);
  border-radius: 50%;
  opacity: 0.4;
  animation: streaming-bounce 1.4s infinite ease-in-out;
}

.chat-message-streaming-dot:nth-child(1) { animation-delay: -0.32s; }
.chat-message-streaming-dot:nth-child(2) { animation-delay: -0.16s; }
.chat-message-streaming-dot:nth-child(3) { animation-delay: 0s; }

@keyframes streaming-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* 打字光标 */
.chat-message-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--cw-text, #333);
  margin-left: 2px;
  animation: cursor-blink 0.8s infinite;
  vertical-align: text-bottom;
}

@keyframes cursor-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* 输入区域 */
.chat-window-input-area {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--cw-border, #e0e0e0);
  background: var(--cw-bg, #ffffff);
}

.chat-window-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--cw-input-border, #e0e0e0);
  border-radius: 20px;
  background: var(--cw-input-bg, #ffffff);
  color: var(--cw-text, #333);
  font-size: 14px;
  outline: none;
  resize: none;
  font-family: inherit;
  transition: border-color 150ms;
}

.chat-window-input:focus {
  border-color: #0078d4;
}

.chat-window-input::placeholder {
  color: var(--cw-text-muted, #888);
}

.chat-window-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat-window-send {
  width: 40px;
  height: 40px;
  border: none;
  background: #0078d4;
  color: white;
  font-size: 16px;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 150ms, transform 150ms;
}

.chat-window-send:hover:not(:disabled) {
  background: #006cbd;
  transform: scale(1.05);
}

.chat-window-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 调整大小手柄 */
.chat-window-resize {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
}

.chat-window-resize::before {
  content: '';
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-right: 2px solid var(--cw-text-muted, #888);
  border-bottom: 2px solid var(--cw-text-muted, #888);
}

/* 空状态 */
.chat-window-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--cw-text-muted, #888);
  padding: 32px;
  text-align: center;
}

.chat-window-empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.chat-window-empty-text {
  font-size: 14px;
}
`;

// ============================================================================
// ChatWindow 实现
// ============================================================================

/**
 * 独立聊天窗口组件
 */
export class ChatWindow implements IChatWindow {
  // 配置
  private _config: ChatWindowConfig;
  private _callbacks: ChatWindowCallbacks = {};
  
  // 状态
  private _isOpen = false;
  private _isInitialized = false;
  private _messages: ChatWindowMessage[] = [];
  private _currentStreamId: string | null = null;
  private _streamingMessageId: string | null = null;
  private _bounds: WindowBounds;
  
  // DOM 元素
  private _container: HTMLElement | null = null;
  private _windowElement: HTMLElement | null = null;
  private _messagesContainer: HTMLElement | null = null;
  private _inputElement: HTMLTextAreaElement | null = null;
  private _sendButton: HTMLButtonElement | null = null;
  private _styleElement: HTMLStyleElement | null = null;
  
  // 拖拽状态
  private _isDragging = false;
  private _isResizing = false;
  private _dragOffset = { x: 0, y: 0 };
  
  // IPC 监听器清理
  private _ipcCleanup: (() => void) | null = null;
  
  // 事件处理函数引用
  private _boundHandlers: {
    mouseMove?: (e: MouseEvent) => void;
    mouseUp?: (e: MouseEvent) => void;
  } = {};

  /**
   * 构造函数
   */
  constructor(config?: Partial<ChatWindowConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._bounds = { ...this._config.bounds };
  }

  // ============================================================================
  // 属性访问器
  // ============================================================================

  get isOpen(): boolean {
    return this._isOpen;
  }

  get messages(): ChatWindowMessage[] {
    return [...this._messages];
  }

  get bounds(): WindowBounds {
    return { ...this._bounds };
  }

  // ============================================================================
  // 生命周期
  // ============================================================================

  /**
   * 初始化窗口
   */
  initialize(container?: HTMLElement): void {
    if (this._isInitialized) {
      console.warn('[ChatWindow] Already initialized');
      return;
    }

    this._container = container || document.body;
    
    // 注入样式
    this._injectStyles();
    
    // 创建窗口元素
    this._createWindowElement();
    
    // 设置 IPC 监听
    this._setupIPCListeners();
    
    // 设置拖拽事件
    this._setupDragHandlers();

    this._isInitialized = true;
    console.log('[ChatWindow] Initialized');
  }

  /**
   * 销毁窗口
   */
  dispose(): void {
    // 清理 IPC 监听
    this._cleanupIPCListeners();
    
    // 清理拖拽事件
    this._cleanupDragHandlers();
    
    // 移除窗口元素
    if (this._windowElement && this._windowElement.parentNode) {
      this._windowElement.parentNode.removeChild(this._windowElement);
    }
    
    // 移除样式
    if (this._styleElement && this._styleElement.parentNode) {
      this._styleElement.parentNode.removeChild(this._styleElement);
    }

    // 清理状态
    this._container = null;
    this._windowElement = null;
    this._messagesContainer = null;
    this._inputElement = null;
    this._sendButton = null;
    this._styleElement = null;
    this._isOpen = false;
    this._isInitialized = false;
    this._messages = [];
    this._callbacks = {};
    this._boundHandlers = {};

    console.log('[ChatWindow] Disposed');
  }

  // ============================================================================
  // 配置
  // ============================================================================

  /**
   * 更新配置
   */
  setConfig(config: Partial<ChatWindowConfig>): void {
    this._config = { ...this._config, ...config };
    this._applyConfig();
  }

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: ChatWindowCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  // ============================================================================
  // 窗口控制
  // ============================================================================

  /**
   * 打开窗口
   */
  open(): void {
    if (!this._isInitialized || !this._windowElement) {
      console.warn('[ChatWindow] Not initialized');
      return;
    }

    this._windowElement.classList.add('open');
    this._isOpen = true;
    
    // 聚焦输入框
    setTimeout(() => this._inputElement?.focus(), 200);
    
    this._callbacks.onOpen?.();
    console.log('[ChatWindow] Opened');
  }

  /**
   * 关闭窗口
   */
  close(): void {
    if (!this._isOpen || !this._windowElement) return;

    this._windowElement.classList.remove('open');
    this._isOpen = false;
    
    this._callbacks.onClose?.();
    console.log('[ChatWindow] Closed');
  }

  /**
   * 切换窗口状态
   */
  toggle(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * 聚焦窗口
   */
  focus(): void {
    if (!this._isOpen) {
      this.open();
    }
    this._inputElement?.focus();
  }

  /**
   * 设置窗口边界
   */
  setBounds(bounds: Partial<WindowBounds>): void {
    this._bounds = { ...this._bounds, ...bounds };
    this._applyBounds();
  }

  // ============================================================================
  // 消息操作
  // ============================================================================

  /**
   * 添加消息
   */
  addMessage(message: Omit<ChatWindowMessage, 'id' | 'timestamp'>): string {
    const id = this._generateMessageId();
    const fullMessage: ChatWindowMessage = {
      ...message,
      id,
      timestamp: Date.now(),
    };
    
    this._messages.push(fullMessage);
    
    // 限制消息数量
    if (this._messages.length > this._config.maxMessages) {
      this._messages.shift();
    }
    
    this._renderMessage(fullMessage);
    this._scrollToBottom();
    
    return id;
  }

  /**
   * 更新消息
   */
  updateMessage(id: string, updates: Partial<ChatWindowMessage>): void {
    const index = this._messages.findIndex(m => m.id === id);
    if (index === -1) return;
    
    this._messages[index] = { ...this._messages[index], ...updates };
    
    // 重新渲染该消息
    const element = this._messagesContainer?.querySelector(`[data-message-id="${id}"]`);
    if (element) {
      const newElement = this._createMessageElement(this._messages[index]);
      element.replaceWith(newElement);
    }
    
    this._scrollToBottom();
  }

  /**
   * 清空消息
   */
  clearMessages(): void {
    this._messages = [];
    this._renderAllMessages();
    this._callbacks.onClear?.();
  }

  // ============================================================================
  // 流式处理
  // ============================================================================

  /**
   * 开始流式接收
   */
  startStream(): string {
    // 创建一个新的助手消息
    const messageId = this.addMessage({
      role: 'assistant',
      content: '',
      isStreaming: true,
    });
    
    this._streamingMessageId = messageId;
    this._currentStreamId = `stream-${Date.now()}`;
    
    // 禁用输入
    this.setInputEnabled(false);
    
    return this._currentStreamId;
  }

  /**
   * 处理流式数据块
   */
  handleStreamChunk(data: StreamChunkData): void {
    if (!this._streamingMessageId) return;
    
    const message = this._messages.find(m => m.id === this._streamingMessageId);
    if (!message) return;
    
    const content = data.chunk.delta?.content;
    if (content) {
      message.content += content;
      this._updateStreamingMessage(message);
    }
  }

  /**
   * 处理流式完成
   */
  handleStreamComplete(data: StreamCompleteData): void {
    if (!this._streamingMessageId) return;
    
    const message = this._messages.find(m => m.id === this._streamingMessageId);
    if (message) {
      // 解析情绪
      const { text, emotion } = extractEmotion(message.content);
      message.content = text;
      message.emotion = emotion || undefined;
      message.isStreaming = false;
      
      // 重新渲染
      this.updateMessage(message.id, message);
      
      // 触发情绪变化
      if (emotion) {
        this._callbacks.onEmotionChange?.(emotion);
      }
    }
    
    this._streamingMessageId = null;
    this._currentStreamId = null;
    
    // 启用输入
    this.setInputEnabled(true);
    this._inputElement?.focus();
    
    console.log('[ChatWindow] Stream completed');
  }

  /**
   * 处理流式错误
   */
  handleStreamError(data: StreamErrorData): void {
    if (!this._streamingMessageId) return;
    
    // 更新消息为错误状态
    this.updateMessage(this._streamingMessageId, {
      content: `错误: ${data.error.message}`,
      isStreaming: false,
    });
    
    this._streamingMessageId = null;
    this._currentStreamId = null;
    
    // 启用输入
    this.setInputEnabled(true);
    
    console.error('[ChatWindow] Stream error:', data.error);
  }

  // ============================================================================
  // 输入控制
  // ============================================================================

  /**
   * 设置输入值
   */
  setInputValue(value: string): void {
    if (this._inputElement) {
      this._inputElement.value = value;
    }
  }

  /**
   * 设置输入启用状态
   */
  setInputEnabled(enabled: boolean): void {
    if (this._inputElement) {
      this._inputElement.disabled = !enabled;
    }
    if (this._sendButton) {
      this._sendButton.disabled = !enabled;
    }
  }

  // ============================================================================
  // 私有方法：DOM 操作
  // ============================================================================

  /**
   * 注入样式
   */
  private _injectStyles(): void {
    if (document.getElementById('chat-window-styles')) return;

    this._styleElement = document.createElement('style');
    this._styleElement.id = 'chat-window-styles';
    this._styleElement.textContent = WINDOW_STYLES;
    document.head.appendChild(this._styleElement);
  }

  /**
   * 创建窗口元素
   */
  private _createWindowElement(): void {
    this._windowElement = document.createElement('div');
    this._windowElement.className = 'chat-window';
    
    // 头部
    const header = document.createElement('div');
    header.className = 'chat-window-header';
    header.innerHTML = `
      <div class="chat-window-title">
        <span class="chat-window-title-icon">🐾</span>
        <span>${this._config.title}</span>
      </div>
      <div class="chat-window-actions">
        <button class="chat-window-action clear" title="清空消息">🗑️</button>
        <button class="chat-window-action close" title="关闭">×</button>
      </div>
    `;
    
    // 清空按钮
    const clearBtn = header.querySelector('.clear');
    clearBtn?.addEventListener('click', () => this.clearMessages());
    
    // 关闭按钮
    const closeBtn = header.querySelector('.close');
    closeBtn?.addEventListener('click', () => this.close());
    
    this._windowElement.appendChild(header);
    
    // 消息区域
    this._messagesContainer = document.createElement('div');
    this._messagesContainer.className = 'chat-window-messages';
    this._windowElement.appendChild(this._messagesContainer);
    
    // 输入区域
    const inputArea = document.createElement('div');
    inputArea.className = 'chat-window-input-area';
    
    this._inputElement = document.createElement('textarea');
    this._inputElement.className = 'chat-window-input';
    this._inputElement.placeholder = this._config.placeholder;
    this._inputElement.rows = 1;
    this._inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._handleSend();
      }
    });
    this._inputElement.addEventListener('input', () => {
      this._autoResizeInput();
    });
    inputArea.appendChild(this._inputElement);
    
    this._sendButton = document.createElement('button');
    this._sendButton.className = 'chat-window-send';
    this._sendButton.innerHTML = '➤';
    this._sendButton.addEventListener('click', () => this._handleSend());
    inputArea.appendChild(this._sendButton);
    
    this._windowElement.appendChild(inputArea);
    
    // 调整大小手柄
    if (this._config.resizable) {
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'chat-window-resize';
      resizeHandle.addEventListener('mousedown', (e) => this._startResize(e));
      this._windowElement.appendChild(resizeHandle);
    }
    
    // 应用配置
    this._applyConfig();
    this._applyBounds();
    
    // 渲染空状态
    this._renderEmptyState();
    
    this._container?.appendChild(this._windowElement);
  }

  /**
   * 应用配置
   */
  private _applyConfig(): void {
    if (!this._windowElement) return;

    // CSS 变量
    this._windowElement.style.setProperty('--cw-z-index', `${this._config.zIndex}`);

    // 主题
    this._windowElement.classList.remove('theme-light', 'theme-dark');
    const theme = this._getEffectiveTheme();
    this._windowElement.classList.add(`theme-${theme}`);
  }

  /**
   * 应用边界
   */
  private _applyBounds(): void {
    if (!this._windowElement) return;

    this._windowElement.style.left = `${this._bounds.x}px`;
    this._windowElement.style.top = `${this._bounds.y}px`;
    this._windowElement.style.width = `${this._bounds.width}px`;
    this._windowElement.style.height = `${this._bounds.height}px`;
  }

  /**
   * 获取有效主题
   */
  private _getEffectiveTheme(): 'light' | 'dark' {
    if (this._config.theme === 'system') {
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'light';
    }
    return this._config.theme;
  }

  /**
   * 渲染空状态
   */
  private _renderEmptyState(): void {
    if (!this._messagesContainer || this._messages.length > 0) return;

    this._messagesContainer.innerHTML = `
      <div class="chat-window-empty">
        <div class="chat-window-empty-icon">💬</div>
        <div class="chat-window-empty-text">
          开始和${this._config.petName}聊天吧！
        </div>
      </div>
    `;
  }

  /**
   * 渲染所有消息
   */
  private _renderAllMessages(): void {
    if (!this._messagesContainer) return;

    this._messagesContainer.innerHTML = '';

    if (this._messages.length === 0) {
      this._renderEmptyState();
      return;
    }

    for (const message of this._messages) {
      this._renderMessage(message);
    }
  }

  /**
   * 渲染单条消息
   */
  private _renderMessage(message: ChatWindowMessage): void {
    if (!this._messagesContainer) return;

    // 移除空状态
    const empty = this._messagesContainer.querySelector('.chat-window-empty');
    if (empty) {
      empty.remove();
    }

    const element = this._createMessageElement(message);
    this._messagesContainer.appendChild(element);
  }

  /**
   * 创建消息元素
   */
  private _createMessageElement(message: ChatWindowMessage): HTMLElement {
    const element = document.createElement('div');
    element.className = `chat-message ${message.role}`;
    element.dataset.messageId = message.id;

    const contentEl = document.createElement('div');
    contentEl.className = 'chat-message-content';

    if (message.isStreaming && !message.content) {
      // 显示加载指示器
      contentEl.innerHTML = `
        <div class="chat-message-streaming">
          <span class="chat-message-streaming-dot"></span>
          <span class="chat-message-streaming-dot"></span>
          <span class="chat-message-streaming-dot"></span>
        </div>
      `;
    } else if (message.isStreaming) {
      // 显示内容和光标
      contentEl.textContent = message.content;
      const cursor = document.createElement('span');
      cursor.className = 'chat-message-cursor';
      contentEl.appendChild(cursor);
    } else {
      contentEl.textContent = message.content;
    }

    element.appendChild(contentEl);

    // 元信息
    const metaEl = document.createElement('div');
    metaEl.className = 'chat-message-meta';

    const time = new Date(message.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    metaEl.innerHTML = `<span>${timeStr}</span>`;

    if (message.emotion) {
      const emotionIcon = this._getEmotionIcon(message.emotion);
      metaEl.innerHTML += `<span class="chat-message-emotion">${emotionIcon}</span>`;
    }

    element.appendChild(metaEl);

    return element;
  }

  /**
   * 更新流式消息
   */
  private _updateStreamingMessage(message: ChatWindowMessage): void {
    const element = this._messagesContainer?.querySelector(`[data-message-id="${message.id}"]`);
    if (!element) return;

    const contentEl = element.querySelector('.chat-message-content');
    if (contentEl) {
      contentEl.textContent = message.content;
      
      // 添加光标
      const cursor = document.createElement('span');
      cursor.className = 'chat-message-cursor';
      contentEl.appendChild(cursor);
    }

    this._scrollToBottom();
  }

  /**
   * 获取情绪图标
   */
  private _getEmotionIcon(emotion: EmotionType): string {
    const icons: Record<EmotionType, string> = {
      happy: '😊',
      curious: '🤔',
      confused: '😕',
      thinking: '💭',
      excited: '🎉',
      sleepy: '😴',
      sad: '😢',
      neutral: '😐',
    };
    return icons[emotion] || '😊';
  }

  /**
   * 滚动到底部
   */
  private _scrollToBottom(): void {
    if (this._messagesContainer) {
      this._messagesContainer.scrollTop = this._messagesContainer.scrollHeight;
    }
  }

  /**
   * 自动调整输入框高度
   */
  private _autoResizeInput(): void {
    if (!this._inputElement) return;

    this._inputElement.style.height = 'auto';
    const scrollHeight = this._inputElement.scrollHeight;
    const maxHeight = 120;
    this._inputElement.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
  }

  // ============================================================================
  // 私有方法：事件处理
  // ============================================================================

  /**
   * 处理发送
   */
  private _handleSend(): void {
    if (!this._inputElement || this._inputElement.disabled) return;

    const content = this._inputElement.value.trim();
    if (!content) return;

    // 添加用户消息
    this.addMessage({
      role: 'user',
      content,
    });

    // 清空输入
    this._inputElement.value = '';
    this._autoResizeInput();

    // 触发回调
    this._callbacks.onSendMessage?.(content);
  }

  /**
   * 设置拖拽事件
   */
  private _setupDragHandlers(): void {
    if (!this._config.draggable) return;

    const header = this._windowElement?.querySelector('.chat-window-header');
    if (!header) return;

    header.addEventListener('mousedown', (e: Event) => {
      const mouseEvent = e as MouseEvent;
      // 忽略按钮点击
      if ((mouseEvent.target as HTMLElement).closest('.chat-window-action')) return;
      this._startDrag(mouseEvent);
    });

    this._boundHandlers.mouseMove = (e: MouseEvent) => {
      if (this._isDragging) {
        this._onDrag(e);
      } else if (this._isResizing) {
        this._onResize(e);
      }
    };

    this._boundHandlers.mouseUp = () => {
      this._endDrag();
      this._endResize();
    };

    document.addEventListener('mousemove', this._boundHandlers.mouseMove);
    document.addEventListener('mouseup', this._boundHandlers.mouseUp);
  }

  /**
   * 清理拖拽事件
   */
  private _cleanupDragHandlers(): void {
    if (this._boundHandlers.mouseMove) {
      document.removeEventListener('mousemove', this._boundHandlers.mouseMove);
    }
    if (this._boundHandlers.mouseUp) {
      document.removeEventListener('mouseup', this._boundHandlers.mouseUp);
    }
    this._boundHandlers = {};
  }

  /**
   * 开始拖拽
   */
  private _startDrag(e: MouseEvent): void {
    this._isDragging = true;
    this._dragOffset = {
      x: e.clientX - this._bounds.x,
      y: e.clientY - this._bounds.y,
    };
    document.body.style.userSelect = 'none';
  }

  /**
   * 拖拽中
   */
  private _onDrag(e: MouseEvent): void {
    const x = e.clientX - this._dragOffset.x;
    const y = e.clientY - this._dragOffset.y;

    this._bounds.x = Math.max(0, Math.min(x, window.innerWidth - this._bounds.width));
    this._bounds.y = Math.max(0, Math.min(y, window.innerHeight - this._bounds.height));

    this._applyBounds();
  }

  /**
   * 结束拖拽
   */
  private _endDrag(): void {
    if (this._isDragging) {
      this._isDragging = false;
      document.body.style.userSelect = '';
      this._callbacks.onMove?.(this._bounds);
    }
  }

  /**
   * 开始调整大小
   */
  private _startResize(e: MouseEvent): void {
    e.preventDefault();
    this._isResizing = true;
    this._dragOffset = {
      x: e.clientX,
      y: e.clientY,
    };
    document.body.style.userSelect = 'none';
  }

  /**
   * 调整大小中
   */
  private _onResize(e: MouseEvent): void {
    const deltaX = e.clientX - this._dragOffset.x;
    const deltaY = e.clientY - this._dragOffset.y;

    const newWidth = Math.max(this._config.minWidth, this._bounds.width + deltaX);
    const newHeight = Math.max(this._config.minHeight, this._bounds.height + deltaY);

    this._bounds.width = Math.min(newWidth, window.innerWidth - this._bounds.x);
    this._bounds.height = Math.min(newHeight, window.innerHeight - this._bounds.y);

    this._dragOffset = { x: e.clientX, y: e.clientY };

    this._applyBounds();
  }

  /**
   * 结束调整大小
   */
  private _endResize(): void {
    if (this._isResizing) {
      this._isResizing = false;
      document.body.style.userSelect = '';
      this._callbacks.onResize?.(this._bounds);
    }
  }

  // ============================================================================
  // 私有方法：IPC 监听
  // ============================================================================

  /**
   * 设置 IPC 监听器
   */
  private _setupIPCListeners(): void {
    if (typeof window === 'undefined' || !window.electronAPI?.on) {
      console.warn('[ChatWindow] electronAPI not available, IPC listeners not set up');
      return;
    }

    const handlers = {
      chunk: (data: StreamChunkData) => {
        if (this._currentStreamId === data.streamId) {
          this.handleStreamChunk(data);
        }
      },
      error: (data: StreamErrorData) => {
        if (this._currentStreamId === data.streamId) {
          this.handleStreamError(data);
        }
      },
      complete: (data: StreamCompleteData) => {
        if (this._currentStreamId === data.streamId) {
          this.handleStreamComplete(data);
        }
      },
    };

    window.electronAPI.on(AI_STREAM_EVENTS.CHUNK, handlers.chunk);
    window.electronAPI.on(AI_STREAM_EVENTS.ERROR, handlers.error);
    window.electronAPI.on(AI_STREAM_EVENTS.COMPLETE, handlers.complete);

    this._ipcCleanup = () => {
      window.electronAPI?.off?.(AI_STREAM_EVENTS.CHUNK, handlers.chunk);
      window.electronAPI?.off?.(AI_STREAM_EVENTS.ERROR, handlers.error);
      window.electronAPI?.off?.(AI_STREAM_EVENTS.COMPLETE, handlers.complete);
    };

    console.log('[ChatWindow] IPC listeners set up');
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

  // ============================================================================
  // 私有方法：工具
  // ============================================================================

  /**
   * 生成消息 ID
   */
  private _generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建聊天窗口实例
 */
export function createChatWindow(config?: Partial<ChatWindowConfig>): IChatWindow {
  return new ChatWindow(config);
}

// ============================================================================
// 导出
// ============================================================================

export default ChatWindow;