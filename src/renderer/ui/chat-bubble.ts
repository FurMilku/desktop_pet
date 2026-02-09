/**
 * 对话气泡组件
 * T058 [US3]: 实现对话气泡组件
 * 
 * 功能：
 * - 显示宠物的对话内容（在宠物旁边）
 * - 支持流式更新（打字机效果，逐字显示）
 * - 解析并提取情绪标记 [emotion:xxx]
 * - 自动消失（定时）或手动关闭
 * - 监听 AI 流式事件从主进程接收数据
 */

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 情绪类型
 */
export type EmotionType = 
  | 'happy' 
  | 'curious' 
  | 'confused' 
  | 'thinking' 
  | 'excited' 
  | 'sleepy'
  | 'sad'
  | 'neutral';

/**
 * 气泡位置
 */
export interface BubblePosition {
  x: number;
  y: number;
}

/**
 * 气泡配置
 */
export interface ChatBubbleConfig {
  /** 自动隐藏延迟（毫秒），0 表示不自动隐藏 */
  autoHideDelay: number;
  /** 打字机效果速度（每字符毫秒数） */
  typewriterSpeed: number;
  /** 最大宽度（像素） */
  maxWidth: number;
  /** 最大高度（像素） */
  maxHeight: number;
  /** 气泡主题 */
  theme: 'light' | 'dark' | 'system';
  /** 是否启用打字机效果 */
  enableTypewriter: boolean;
  /** 层级 */
  zIndex: number;
  /** 尾巴方向 */
  tailDirection: 'left' | 'right' | 'bottom';
  /** 动画持续时间 */
  animationDuration: number;
}

/**
 * 气泡事件回调
 */
export interface ChatBubbleCallbacks {
  /** 情绪变化时触发 */
  onEmotionChange?: (emotion: EmotionType) => void;
  /** 气泡显示时触发 */
  onShow?: () => void;
  /** 气泡隐藏时触发 */
  onHide?: () => void;
  /** 内容更新时触发 */
  onContentUpdate?: (content: string) => void;
  /** 流式完成时触发 */
  onStreamComplete?: (fullContent: string, emotion: EmotionType | null) => void;
  /** 发生错误时触发 */
  onError?: (error: string) => void;
  /** 关闭按钮点击时触发 */
  onClose?: () => void;
}

/**
 * 流式数据块
 */
export interface StreamChunkData {
  streamId: string;
  chunk: {
    id: string;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  };
}

/**
 * 流式错误数据
 */
export interface StreamErrorData {
  streamId: string;
  error: {
    code: string;
    message: string;
    retryable?: boolean;
  };
}

/**
 * 流式完成数据
 */
export interface StreamCompleteData {
  streamId: string;
}

/**
 * 对话气泡接口
 */
export interface IChatBubble {
  readonly isVisible: boolean;
  readonly currentContent: string;
  readonly currentEmotion: EmotionType | null;
  readonly isStreaming: boolean;
  
  // 生命周期
  initialize(container?: HTMLElement): void;
  dispose(): void;
  
  // 配置
  setConfig(config: Partial<ChatBubbleConfig>): void;
  setCallbacks(callbacks: ChatBubbleCallbacks): void;
  setPosition(position: BubblePosition): void;
  
  // 显示控制
  show(content?: string): void;
  hide(): void;
  
  // 内容操作
  setContent(content: string, animate?: boolean): void;
  appendContent(content: string): void;
  clear(): void;
  
  // 流式处理
  startStream(streamId: string): void;
  handleStreamChunk(data: StreamChunkData): void;
  handleStreamComplete(data: StreamCompleteData): void;
  handleStreamError(data: StreamErrorData): void;
  abortStream(): void;
}

// ============================================================================
// 常量
// ============================================================================

/** 默认配置 */
const DEFAULT_CONFIG: ChatBubbleConfig = {
  autoHideDelay: 8000,
  typewriterSpeed: 30,
  maxWidth: 300,
  maxHeight: 200,
  theme: 'system',
  enableTypewriter: true,
  zIndex: 9999,
  tailDirection: 'left',
  animationDuration: 200,
};

/** 情绪标记正则 */
const EMOTION_REGEX = /\[emotion:(happy|curious|confused|thinking|excited|sleepy|sad)\]/gi;

/** AI 流式事件通道（与 ai-handler.ts 保持一致） */
const AI_STREAM_EVENTS = {
  CHUNK: 'ai:stream:chunk',
  ERROR: 'ai:stream:error',
  COMPLETE: 'ai:stream:complete',
} as const;

// ============================================================================
// 样式
// ============================================================================

const BUBBLE_STYLES = `
.chat-bubble {
  position: fixed;
  max-width: var(--bubble-max-width, 300px);
  max-height: var(--bubble-max-height, 200px);
  background: var(--bubble-bg, #ffffff);
  border: 1px solid var(--bubble-border, #e0e0e0);
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 12px 16px;
  z-index: var(--bubble-z-index, 9999);
  opacity: 0;
  transform: scale(0.8) translateY(10px);
  transition: opacity var(--bubble-animation-duration, 200ms) ease,
              transform var(--bubble-animation-duration, 200ms) ease;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.chat-bubble.visible {
  opacity: 1;
  transform: scale(1) translateY(0);
  pointer-events: auto;
}

.chat-bubble.theme-dark {
  --bubble-bg: #2d2d2d;
  --bubble-border: #404040;
  --bubble-text: #e0e0e0;
  --bubble-close-hover: #3d3d3d;
}

.chat-bubble.theme-light {
  --bubble-bg: #ffffff;
  --bubble-border: #e0e0e0;
  --bubble-text: #333333;
  --bubble-close-hover: #f0f0f0;
}

/* 气泡尾巴 */
.chat-bubble::before {
  content: '';
  position: absolute;
  width: 0;
  height: 0;
  border: 8px solid transparent;
}

.chat-bubble.tail-left::before {
  left: -16px;
  top: 20px;
  border-right-color: var(--bubble-bg, #ffffff);
}

.chat-bubble.tail-right::before {
  right: -16px;
  top: 20px;
  border-left-color: var(--bubble-bg, #ffffff);
}

.chat-bubble.tail-bottom::before {
  bottom: -16px;
  left: 20px;
  border-top-color: var(--bubble-bg, #ffffff);
}

/* 内容区域 */
.chat-bubble-content {
  color: var(--bubble-text, #333333);
  overflow-y: auto;
  max-height: calc(var(--bubble-max-height, 200px) - 50px);
  scrollbar-width: thin;
}

.chat-bubble-content::-webkit-scrollbar {
  width: 4px;
}

.chat-bubble-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

/* 打字机光标 */
.chat-bubble-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--bubble-text, #333333);
  margin-left: 2px;
  animation: cursor-blink 0.8s infinite;
  vertical-align: text-bottom;
}

@keyframes cursor-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* 关闭按钮 */
.chat-bubble-close {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--bubble-text, #333333);
  font-size: 14px;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  transition: opacity 150ms, background 150ms;
}

.chat-bubble-close:hover {
  opacity: 1;
  background: var(--bubble-close-hover, #f0f0f0);
}

/* 加载指示器 */
.chat-bubble-loading {
  display: flex;
  gap: 4px;
  padding: 4px 0;
}

.chat-bubble-loading-dot {
  width: 6px;
  height: 6px;
  background: var(--bubble-text, #333333);
  border-radius: 50%;
  opacity: 0.4;
  animation: loading-bounce 1.4s infinite ease-in-out;
}

.chat-bubble-loading-dot:nth-child(1) { animation-delay: -0.32s; }
.chat-bubble-loading-dot:nth-child(2) { animation-delay: -0.16s; }
.chat-bubble-loading-dot:nth-child(3) { animation-delay: 0s; }

@keyframes loading-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* 错误状态 */
.chat-bubble.error {
  border-color: #ff6b6b;
}

.chat-bubble.error .chat-bubble-content {
  color: #ff6b6b;
}
`;

// ============================================================================
// ChatBubble 实现
// ============================================================================

/**
 * 对话气泡组件
 */
export class ChatBubble implements IChatBubble {
  // 配置
  private _config: ChatBubbleConfig;
  private _callbacks: ChatBubbleCallbacks = {};
  
  // 状态
  private _isVisible = false;
  private _isInitialized = false;
  private _isStreaming = false;
  private _currentContent = '';
  private _displayedContent = '';
  private _currentEmotion: EmotionType | null = null;
  private _currentStreamId: string | null = null;
  
  // DOM 元素
  private _container: HTMLElement | null = null;
  private _bubbleElement: HTMLElement | null = null;
  private _contentElement: HTMLElement | null = null;
  private _closeButton: HTMLElement | null = null;
  private _styleElement: HTMLStyleElement | null = null;
  
  // 定时器
  private _autoHideTimer: ReturnType<typeof setTimeout> | null = null;
  private _typewriterTimer: ReturnType<typeof setTimeout> | null = null;
  private _typewriterQueue: string[] = [];
  
  // IPC 监听器清理函数
  private _ipcCleanup: (() => void) | null = null;

  /**
   * 构造函数
   */
  constructor(config?: Partial<ChatBubbleConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // 属性访问器
  // ============================================================================

  get isVisible(): boolean {
    return this._isVisible;
  }

  get currentContent(): string {
    return this._currentContent;
  }

  get currentEmotion(): EmotionType | null {
    return this._currentEmotion;
  }

  get isStreaming(): boolean {
    return this._isStreaming;
  }

  // ============================================================================
  // 生命周期
  // ============================================================================

  /**
   * 初始化气泡
   */
  initialize(container?: HTMLElement): void {
    if (this._isInitialized) {
      console.warn('[ChatBubble] Already initialized');
      return;
    }

    this._container = container || document.body;
    
    // 注入样式
    this._injectStyles();
    
    // 创建气泡元素
    this._createBubbleElement();
    
    // 设置 IPC 监听
    this._setupIPCListeners();

    this._isInitialized = true;
    console.log('[ChatBubble] Initialized');
  }

  /**
   * 销毁气泡
   */
  dispose(): void {
    // 清理定时器
    this._clearTimers();
    
    // 清理 IPC 监听
    this._cleanupIPCListeners();
    
    // 移除气泡元素
    if (this._bubbleElement && this._bubbleElement.parentNode) {
      this._bubbleElement.parentNode.removeChild(this._bubbleElement);
    }
    
    // 移除样式
    if (this._styleElement && this._styleElement.parentNode) {
      this._styleElement.parentNode.removeChild(this._styleElement);
    }

    // 清理状态
    this._container = null;
    this._bubbleElement = null;
    this._contentElement = null;
    this._closeButton = null;
    this._styleElement = null;
    this._isVisible = false;
    this._isInitialized = false;
    this._isStreaming = false;
    this._currentContent = '';
    this._displayedContent = '';
    this._currentEmotion = null;
    this._currentStreamId = null;
    this._callbacks = {};
    this._typewriterQueue = [];

    console.log('[ChatBubble] Disposed');
  }

  // ============================================================================
  // 配置
  // ============================================================================

  /**
   * 更新配置
   */
  setConfig(config: Partial<ChatBubbleConfig>): void {
    this._config = { ...this._config, ...config };
    this._applyConfig();
  }

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: ChatBubbleCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  /**
   * 设置气泡位置
   */
  setPosition(position: BubblePosition): void {
    if (!this._bubbleElement) return;
    
    // 计算实际位置（考虑边界）
    const rect = this._bubbleElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let x = position.x;
    let y = position.y;
    
    // 根据尾巴方向调整位置
    if (this._config.tailDirection === 'left') {
      x += 20; // 气泡在宠物右侧
    } else if (this._config.tailDirection === 'right') {
      x -= rect.width + 20; // 气泡在宠物左侧
    }
    
    // 边界检测
    if (x + rect.width > viewportWidth - 10) {
      x = viewportWidth - rect.width - 10;
    }
    if (x < 10) x = 10;
    
    if (y + rect.height > viewportHeight - 10) {
      y = viewportHeight - rect.height - 10;
    }
    if (y < 10) y = 10;
    
    this._bubbleElement.style.left = `${x}px`;
    this._bubbleElement.style.top = `${y}px`;
  }

  // ============================================================================
  // 显示控制
  // ============================================================================

  /**
   * 显示气泡
   */
  show(content?: string): void {
    if (!this._isInitialized || !this._bubbleElement) {
      console.warn('[ChatBubble] Not initialized');
      return;
    }

    if (content !== undefined) {
      this.setContent(content, this._config.enableTypewriter);
    }

    this._bubbleElement.classList.add('visible');
    this._isVisible = true;
    
    // 设置自动隐藏
    this._resetAutoHideTimer();
    
    this._callbacks.onShow?.();
    console.log('[ChatBubble] Shown');
  }

  /**
   * 隐藏气泡
   */
  hide(): void {
    if (!this._isVisible || !this._bubbleElement) return;

    this._bubbleElement.classList.remove('visible');
    this._isVisible = false;
    
    // 清理定时器
    this._clearTimers();
    
    // 如果正在流式传输，中止
    if (this._isStreaming) {
      this.abortStream();
    }
    
    this._callbacks.onHide?.();
    console.log('[ChatBubble] Hidden');
  }

  // ============================================================================
  // 内容操作
  // ============================================================================

  /**
   * 设置内容
   */
  setContent(content: string, animate: boolean = false): void {
    // 解析情绪标记
    const { text, emotion } = this._parseContent(content);
    
    this._currentContent = text;
    
    // 如果情绪变化，触发回调
    if (emotion && emotion !== this._currentEmotion) {
      this._currentEmotion = emotion;
      this._callbacks.onEmotionChange?.(emotion);
    }
    
    if (animate && this._config.enableTypewriter) {
      this._startTypewriter(text);
    } else {
      this._displayContent(text);
    }
    
    this._callbacks.onContentUpdate?.(text);
  }

  /**
   * 追加内容（用于流式）
   */
  appendContent(content: string): void {
    this._currentContent += content;
    
    if (this._config.enableTypewriter) {
      // 添加到打字机队列
      this._typewriterQueue.push(...content.split(''));
      this._processTypewriterQueue();
    } else {
      // 直接显示
      this._displayContent(this._currentContent);
    }
    
    this._callbacks.onContentUpdate?.(this._currentContent);
  }

  /**
   * 清除内容
   */
  clear(): void {
    this._currentContent = '';
    this._displayedContent = '';
    this._currentEmotion = null;
    this._typewriterQueue = [];
    
    if (this._contentElement) {
      this._contentElement.innerHTML = '';
    }
  }

  // ============================================================================
  // 流式处理
  // ============================================================================

  /**
   * 开始流式接收
   */
  startStream(streamId: string): void {
    this._currentStreamId = streamId;
    this._isStreaming = true;
    this._currentContent = '';
    this._displayedContent = '';
    this._typewriterQueue = [];
    
    // 显示加载指示器
    this._showLoading();
    
    // 显示气泡
    this.show();
    
    console.log('[ChatBubble] Stream started:', streamId);
  }

  /**
   * 处理流式数据块
   */
  handleStreamChunk(data: StreamChunkData): void {
    if (data.streamId !== this._currentStreamId) return;
    
    // 隐藏加载指示器
    this._hideLoading();
    
    const content = data.chunk.delta?.content;
    if (content) {
      this.appendContent(content);
    }
    
    // 重置自动隐藏计时器
    this._resetAutoHideTimer();
  }

  /**
   * 处理流式完成
   */
  handleStreamComplete(data: StreamCompleteData): void {
    if (data.streamId !== this._currentStreamId) return;
    
    this._isStreaming = false;
    this._currentStreamId = null;
    
    // 隐藏加载指示器
    this._hideLoading();
    
    // 移除光标
    this._removeCursor();
    
    // 解析最终内容中的情绪
    const { text, emotion } = this._parseContent(this._currentContent);
    this._currentContent = text;
    
    // 更新显示内容（移除情绪标记）
    if (this._displayedContent !== text) {
      this._displayContent(text);
    }
    
    // 触发情绪变化
    if (emotion && emotion !== this._currentEmotion) {
      this._currentEmotion = emotion;
      this._callbacks.onEmotionChange?.(emotion);
    }
    
    // 触发完成回调
    this._callbacks.onStreamComplete?.(text, emotion);
    
    console.log('[ChatBubble] Stream completed, emotion:', emotion);
  }

  /**
   * 处理流式错误
   */
  handleStreamError(data: StreamErrorData): void {
    if (data.streamId !== this._currentStreamId) return;
    
    this._isStreaming = false;
    this._currentStreamId = null;
    
    // 隐藏加载指示器
    this._hideLoading();
    
    // 显示错误状态
    this._showError(data.error.message);
    
    this._callbacks.onError?.(data.error.message);
    
    console.error('[ChatBubble] Stream error:', data.error);
  }

  /**
   * 中止流式
   */
  abortStream(): void {
    if (!this._isStreaming) return;
    
    this._isStreaming = false;
    const streamId = this._currentStreamId;
    this._currentStreamId = null;
    
    // 通过 IPC 中止流
    if (streamId && window.electronAPI?.ai?.abortStream) {
      window.electronAPI.ai.abortStream(streamId).catch(console.error);
    }
    
    // 清理显示
    this._hideLoading();
    this._removeCursor();
    
    console.log('[ChatBubble] Stream aborted:', streamId);
  }

  // ============================================================================
  // 私有方法：DOM 操作
  // ============================================================================

  /**
   * 注入样式
   */
  private _injectStyles(): void {
    if (document.getElementById('chat-bubble-styles')) return;

    this._styleElement = document.createElement('style');
    this._styleElement.id = 'chat-bubble-styles';
    this._styleElement.textContent = BUBBLE_STYLES;
    document.head.appendChild(this._styleElement);
  }

  /**
   * 创建气泡元素
   */
  private _createBubbleElement(): void {
    this._bubbleElement = document.createElement('div');
    this._bubbleElement.className = 'chat-bubble';
    
    // 内容区域
    this._contentElement = document.createElement('div');
    this._contentElement.className = 'chat-bubble-content';
    this._bubbleElement.appendChild(this._contentElement);
    
    // 关闭按钮
    this._closeButton = document.createElement('button');
    this._closeButton.className = 'chat-bubble-close';
    this._closeButton.innerHTML = '×';
    this._closeButton.addEventListener('click', () => {
      this.hide();
      this._callbacks.onClose?.();
    });
    this._bubbleElement.appendChild(this._closeButton);
    
    // 应用配置
    this._applyConfig();
    
    this._container?.appendChild(this._bubbleElement);
  }

  /**
   * 应用配置
   */
  private _applyConfig(): void {
    if (!this._bubbleElement) return;

    // CSS 变量
    this._bubbleElement.style.setProperty('--bubble-max-width', `${this._config.maxWidth}px`);
    this._bubbleElement.style.setProperty('--bubble-max-height', `${this._config.maxHeight}px`);
    this._bubbleElement.style.setProperty('--bubble-z-index', `${this._config.zIndex}`);
    this._bubbleElement.style.setProperty('--bubble-animation-duration', `${this._config.animationDuration}ms`);

    // 主题
    this._bubbleElement.classList.remove('theme-light', 'theme-dark');
    const theme = this._getEffectiveTheme();
    this._bubbleElement.classList.add(`theme-${theme}`);

    // 尾巴方向
    this._bubbleElement.classList.remove('tail-left', 'tail-right', 'tail-bottom');
    this._bubbleElement.classList.add(`tail-${this._config.tailDirection}`);
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
   * 显示内容
   */
  private _displayContent(content: string): void {
    if (!this._contentElement) return;
    
    this._displayedContent = content;
    this._contentElement.textContent = content;
  }

  /**
   * 显示加载指示器
   */
  private _showLoading(): void {
    if (!this._contentElement) return;
    
    this._contentElement.innerHTML = `
      <div class="chat-bubble-loading">
        <span class="chat-bubble-loading-dot"></span>
        <span class="chat-bubble-loading-dot"></span>
        <span class="chat-bubble-loading-dot"></span>
      </div>
    `;
  }

  /**
   * 隐藏加载指示器
   */
  private _hideLoading(): void {
    if (!this._contentElement) return;
    
    const loading = this._contentElement.querySelector('.chat-bubble-loading');
    if (loading) {
      loading.remove();
    }
  }

  /**
   * 显示错误状态
   */
  private _showError(message: string): void {
    if (!this._bubbleElement || !this._contentElement) return;
    
    this._bubbleElement.classList.add('error');
    this._contentElement.textContent = message;
    
    // 5秒后移除错误状态
    setTimeout(() => {
      this._bubbleElement?.classList.remove('error');
    }, 5000);
  }

  /**
   * 添加打字光标
   */
  private _addCursor(): void {
    if (!this._contentElement) return;
    
    // 移除现有光标
    this._removeCursor();
    
    const cursor = document.createElement('span');
    cursor.className = 'chat-bubble-cursor';
    this._contentElement.appendChild(cursor);
  }

  /**
   * 移除打字光标
   */
  private _removeCursor(): void {
    if (!this._contentElement) return;
    
    const cursor = this._contentElement.querySelector('.chat-bubble-cursor');
    if (cursor) {
      cursor.remove();
    }
  }

  // ============================================================================
  // 私有方法：打字机效果
  // ============================================================================

  /**
   * 开始打字机效果
   */
  private _startTypewriter(text: string): void {
    this._displayedContent = '';
    this._typewriterQueue = text.split('');
    
    if (this._contentElement) {
      this._contentElement.textContent = '';
    }
    
    this._processTypewriterQueue();
  }

  /**
   * 处理打字机队列
   */
  private _processTypewriterQueue(): void {
    if (this._typewriterQueue.length === 0) {
      this._removeCursor();
      return;
    }
    
    // 确保有光标
    this._addCursor();
    
    // 如果已有定时器在运行，不重复启动
    if (this._typewriterTimer) return;
    
    this._typewriterTimer = setTimeout(() => {
      this._typewriterTimer = null;
      
      if (this._typewriterQueue.length > 0) {
        const char = this._typewriterQueue.shift()!;
        this._displayedContent += char;
        
        if (this._contentElement) {
          // 更新文本内容
          const cursor = this._contentElement.querySelector('.chat-bubble-cursor');
          if (cursor) {
            cursor.remove();
          }
          this._contentElement.textContent = this._displayedContent;
          this._addCursor();
        }
        
        // 继续处理队列
        this._processTypewriterQueue();
      } else {
        this._removeCursor();
      }
    }, this._config.typewriterSpeed);
  }

  // ============================================================================
  // 私有方法：解析
  // ============================================================================

  /**
   * 解析内容，提取情绪标记
   */
  private _parseContent(content: string): { text: string; emotion: EmotionType | null } {
    let emotion: EmotionType | null = null;
    
    // 查找情绪标记
    const matches = content.match(EMOTION_REGEX);
    if (matches && matches.length > 0) {
      // 取最后一个情绪标记
      const lastMatch = matches[matches.length - 1];
      const emotionMatch = lastMatch.match(/\[emotion:(\w+)\]/i);
      if (emotionMatch) {
        emotion = emotionMatch[1].toLowerCase() as EmotionType;
      }
    }
    
    // 移除所有情绪标记
    const text = content.replace(EMOTION_REGEX, '').trim();
    
    return { text, emotion };
  }

  // ============================================================================
  // 私有方法：定时器
  // ============================================================================

  /**
   * 重置自动隐藏定时器
   */
  private _resetAutoHideTimer(): void {
    if (this._autoHideTimer) {
      clearTimeout(this._autoHideTimer);
      this._autoHideTimer = null;
    }
    
    if (this._config.autoHideDelay > 0 && !this._isStreaming) {
      this._autoHideTimer = setTimeout(() => {
        this.hide();
      }, this._config.autoHideDelay);
    }
  }

  /**
   * 清理所有定时器
   */
  private _clearTimers(): void {
    if (this._autoHideTimer) {
      clearTimeout(this._autoHideTimer);
      this._autoHideTimer = null;
    }
    if (this._typewriterTimer) {
      clearTimeout(this._typewriterTimer);
      this._typewriterTimer = null;
    }
  }

  // ============================================================================
  // 私有方法：IPC 监听
  // ============================================================================

  /**
   * 设置 IPC 监听器
   */
  private _setupIPCListeners(): void {
    // 检查 electronAPI 是否可用
    if (typeof window === 'undefined' || !window.electronAPI?.on) {
      console.warn('[ChatBubble] electronAPI not available, IPC listeners not set up');
      return;
    }

    const handlers = {
      chunk: (data: StreamChunkData) => this.handleStreamChunk(data),
      error: (data: StreamErrorData) => this.handleStreamError(data),
      complete: (data: StreamCompleteData) => this.handleStreamComplete(data),
    };

    // 注册监听器
    window.electronAPI.on(AI_STREAM_EVENTS.CHUNK, handlers.chunk);
    window.electronAPI.on(AI_STREAM_EVENTS.ERROR, handlers.error);
    window.electronAPI.on(AI_STREAM_EVENTS.COMPLETE, handlers.complete);

    // 保存清理函数
    this._ipcCleanup = () => {
      window.electronAPI?.off?.(AI_STREAM_EVENTS.CHUNK, handlers.chunk);
      window.electronAPI?.off?.(AI_STREAM_EVENTS.ERROR, handlers.error);
      window.electronAPI?.off?.(AI_STREAM_EVENTS.COMPLETE, handlers.complete);
    };

    console.log('[ChatBubble] IPC listeners set up');
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
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建对话气泡实例
 */
export function createChatBubble(config?: Partial<ChatBubbleConfig>): IChatBubble {
  return new ChatBubble(config);
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 提取情绪标记
 */
export function extractEmotion(content: string): { text: string; emotion: EmotionType | null } {
  let emotion: EmotionType | null = null;
  
  const matches = content.match(EMOTION_REGEX);
  if (matches && matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const emotionMatch = lastMatch.match(/\[emotion:(\w+)\]/i);
    if (emotionMatch) {
      emotion = emotionMatch[1].toLowerCase() as EmotionType;
    }
  }
  
  const text = content.replace(EMOTION_REGEX, '').trim();
  
  return { text, emotion };
}

/**
 * 验证情绪类型
 */
export function isValidEmotion(emotion: string): emotion is EmotionType {
  const validEmotions: EmotionType[] = [
    'happy', 'curious', 'confused', 'thinking', 'excited', 'sleepy', 'sad', 'neutral'
  ];
  return validEmotions.includes(emotion as EmotionType);
}

// ============================================================================
// 类型声明扩展
// ============================================================================

declare global {
  interface Window {
    electronAPI?: {
      on?: (channel: string, callback: (...args: unknown[]) => void) => void;
      off?: (channel: string, callback: (...args: unknown[]) => void) => void;
      ai?: {
        abortStream?: (streamId: string) => Promise<void>;
      };
    };
  }
}

// ============================================================================
// 导出
// ============================================================================

export default ChatBubble;