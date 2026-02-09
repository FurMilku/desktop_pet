/**
 * 语音输入UI组件
 * T094 [US5]: 实现语音输入UI组件
 * 
 * 功能：
 * - 麦克风按钮UI（点击开始/停止识别）
 * - 使用 Web Speech API (SpeechRecognition) 进行语音识别
 * - 识别状态显示（idle, listening, processing, error）
 * - 通过 VoiceChannels 与主进程 IPC 通信
 * - 识别结果提交到聊天系统
 * - 触发宠物 listening 动画
 */

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 语音输入状态
 */
export type VoiceInputState = 'idle' | 'listening' | 'processing' | 'error';

/**
 * 语音识别配置
 */
export interface VoiceRecognitionConfig {
  language: string;
  continuous: boolean;
  interimResults: boolean;
  maxSilence?: number;
  timeout?: number;
}

/**
 * 语音识别结果
 */
export interface VoiceRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  language: string;
  processingTime?: number;
}

/**
 * 语音输入配置
 */
export interface VoiceInputConfig {
  /** 语言 */
  language: string;
  /** 是否连续识别 */
  continuous: boolean;
  /** 是否返回中间结果 */
  interimResults: boolean;
  /** 最大静音时间（毫秒） */
  maxSilence: number;
  /** 超时时间（毫秒） */
  timeout: number;
  /** 层级 */
  zIndex: number;
  /** 按钮大小 */
  buttonSize: number;
  /** 主题 */
  theme: 'light' | 'dark' | 'system';
}

/**
 * 语音输入回调
 */
export interface VoiceInputCallbacks {
  /** 识别结果（中间或最终） */
  onResult?: (result: VoiceRecognitionResult) => void;
  /** 最终识别结果 */
  onFinalResult?: (transcript: string, confidence: number) => void;
  /** 状态变化 */
  onStateChange?: (state: VoiceInputState) => void;
  /** 开始监听 */
  onListeningStart?: () => void;
  /** 停止监听 */
  onListeningStop?: () => void;
  /** 发生错误 */
  onError?: (error: string) => void;
  /** 提交结果到聊天 */
  onSubmit?: (transcript: string) => void;
}

/**
 * 语音输入接口
 */
export interface IVoiceInput {
  readonly state: VoiceInputState;
  readonly isListening: boolean;
  readonly lastTranscript: string;
  
  // 生命周期
  initialize(container?: HTMLElement): void;
  dispose(): void;
  
  // 配置
  setConfig(config: Partial<VoiceInputConfig>): void;
  setCallbacks(callbacks: VoiceInputCallbacks): void;
  setPosition(x: number, y: number): void;
  
  // 控制
  startListening(): Promise<void>;
  stopListening(): void;
  toggle(): Promise<void>;
  
  // 显示
  show(): void;
  hide(): void;
}

// ============================================================================
// 常量
// ============================================================================

/** 默认配置 */
const DEFAULT_CONFIG: VoiceInputConfig = {
  language: 'zh-CN',
  continuous: false,
  interimResults: true,
  maxSilence: 3000,
  timeout: 30000,
  zIndex: 9998,
  buttonSize: 48,
  theme: 'system',
};

/** Voice IPC 通道（与 voice-handler.ts 保持一致） */
const VoiceChannels = {
  // 语音识别
  RECOGNITION_START: 'voice:recognition-start',
  RECOGNITION_STOP: 'voice:recognition-stop',
  RECOGNITION_ABORT: 'voice:recognition-abort',
  RECOGNITION_IS_ACTIVE: 'voice:recognition-is-active',
  RECOGNITION_GET_CONFIG: 'voice:recognition-get-config',
  RECOGNITION_SET_CONFIG: 'voice:recognition-set-config',
  // 语音合成
  SYNTHESIS_SPEAK: 'voice:synthesis-speak',
  SYNTHESIS_STOP: 'voice:synthesis-stop',
  SYNTHESIS_PAUSE: 'voice:synthesis-pause',
  SYNTHESIS_RESUME: 'voice:synthesis-resume',
  // 回调通道（渲染进程 -> 主进程）
  CALLBACK_RECOGNITION_RESULT: 'voice:callback-recognition-result',
  CALLBACK_RECOGNITION_ERROR: 'voice:callback-recognition-error',
  CALLBACK_RECOGNITION_START: 'voice:callback-recognition-start',
  CALLBACK_RECOGNITION_END: 'voice:callback-recognition-end',
  CALLBACK_SYNTHESIS_START: 'voice:callback-synthesis-start',
  CALLBACK_SYNTHESIS_END: 'voice:callback-synthesis-end',
  // 事件通道（主进程 -> 渲染进程）
  EVENT_RECOGNITION_RESULT: 'voice:event-recognition-result',
  EVENT_RECOGNITION_ERROR: 'voice:event-recognition-error',
  EVENT_RECOGNITION_STATE_CHANGE: 'voice:event-recognition-state-change',
  EVENT_SYNTHESIS_STATE_CHANGE: 'voice:event-synthesis-state-change',
} as const;

// ============================================================================
// 样式
// ============================================================================

const VOICE_INPUT_STYLES = `
.voice-input-container {
  position: fixed;
  z-index: var(--voice-z-index, 9998);
  pointer-events: auto;
}

.voice-input-button {
  width: var(--voice-button-size, 48px);
  height: var(--voice-button-size, 48px);
  border-radius: 50%;
  border: none;
  background: var(--voice-bg, #ffffff);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.voice-input-button:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.voice-input-button:active {
  transform: scale(0.95);
}

.voice-input-button.listening {
  background: var(--voice-listening-bg, #ff4757);
  animation: voice-pulse 1.5s infinite;
}

.voice-input-button.processing {
  background: var(--voice-processing-bg, #ffa502);
  pointer-events: none;
}

.voice-input-button.error {
  background: var(--voice-error-bg, #ff6b6b);
  animation: voice-shake 0.5s;
}

.voice-input-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 麦克风图标 */
.voice-input-icon {
  width: 24px;
  height: 24px;
  fill: var(--voice-icon-color, #333333);
  transition: fill 0.2s ease;
}

.voice-input-button.listening .voice-input-icon,
.voice-input-button.processing .voice-input-icon {
  fill: #ffffff;
}

/* 波纹效果 */
.voice-input-ripple {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: scale(0);
  animation: voice-ripple 0.6s linear;
}

@keyframes voice-ripple {
  to {
    transform: scale(2.5);
    opacity: 0;
  }
}

@keyframes voice-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.4);
  }
  50% {
    box-shadow: 0 0 0 15px rgba(255, 71, 87, 0);
  }
}

@keyframes voice-shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-5px); }
  40%, 80% { transform: translateX(5px); }
}

/* 中间结果提示 */
.voice-input-interim {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--voice-interim-bg, rgba(0, 0, 0, 0.8));
  color: #ffffff;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.voice-input-interim.visible {
  opacity: 1;
}

/* 状态指示器 */
.voice-input-status {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--voice-bg, #ffffff);
  background: var(--voice-status-color, #2ed573);
}

.voice-input-status.listening {
  background: #ff4757;
  animation: status-blink 1s infinite;
}

.voice-input-status.processing {
  background: #ffa502;
}

.voice-input-status.error {
  background: #ff6b6b;
}

@keyframes status-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0.5; }
}

/* 主题 */
.voice-input-container.theme-dark {
  --voice-bg: #2d2d2d;
  --voice-icon-color: #e0e0e0;
  --voice-interim-bg: rgba(255, 255, 255, 0.9);
}

.voice-input-container.theme-dark .voice-input-interim {
  color: #333333;
}

.voice-input-container.theme-light {
  --voice-bg: #ffffff;
  --voice-icon-color: #333333;
}
`;

/** 麦克风 SVG 图标 */
const MICROPHONE_ICON = `
<svg class="voice-input-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
</svg>
`;

/** 停止 SVG 图标 */
const STOP_ICON = `
<svg class="voice-input-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="6" width="12" height="12" rx="2"/>
</svg>
`;

// ============================================================================
// SpeechRecognition 类型定义
// ============================================================================

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  
  start(): void;
  stop(): void;
  abort(): void;
  
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onaudioend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onnomatch: ((this: SpeechRecognition, ev: Event) => void) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

// ============================================================================
// VoiceInput 实现
// ============================================================================

/**
 * 语音输入UI组件
 */
export class VoiceInput implements IVoiceInput {
  // 配置
  private _config: VoiceInputConfig;
  private _callbacks: VoiceInputCallbacks = {};
  
  // 状态
  private _state: VoiceInputState = 'idle';
  private _isInitialized = false;
  private _isVisible = true;
  private _lastTranscript = '';
  private _interimTranscript = '';
  private _startTime = 0;
  
  // DOM 元素
  private _container: HTMLElement | null = null;
  private _wrapperElement: HTMLElement | null = null;
  private _buttonElement: HTMLButtonElement | null = null;
  private _interimElement: HTMLElement | null = null;
  private _statusElement: HTMLElement | null = null;
  private _styleElement: HTMLStyleElement | null = null;
  
  // 语音识别
  private _recognition: SpeechRecognition | null = null;
  private _isRecognitionSupported = false;
  
  // 定时器
  private _silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private _timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  
  // IPC
  private _ipcCleanup: (() => void) | null = null;

  /**
   * 构造函数
   */
  constructor(config?: Partial<VoiceInputConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._checkSpeechRecognitionSupport();
  }

  // ============================================================================
  // 属性访问器
  // ============================================================================

  get state(): VoiceInputState {
    return this._state;
  }

  get isListening(): boolean {
    return this._state === 'listening';
  }

  get lastTranscript(): string {
    return this._lastTranscript;
  }

  // ============================================================================
  // 生命周期
  // ============================================================================

  /**
   * 初始化组件
   */
  initialize(container?: HTMLElement): void {
    if (this._isInitialized) {
      console.warn('[VoiceInput] Already initialized');
      return;
    }

    this._container = container || document.body;
    
    // 注入样式
    this._injectStyles();
    
    // 创建 DOM 元素
    this._createElements();
    
    // 初始化语音识别
    this._initSpeechRecognition();
    
    // 设置 IPC 监听
    this._setupIPCListeners();

    this._isInitialized = true;
    console.log('[VoiceInput] Initialized, recognition supported:', this._isRecognitionSupported);
  }

  /**
   * 销毁组件
   */
  dispose(): void {
    // 停止识别
    this.stopListening();
    
    // 清理定时器
    this._clearTimers();
    
    // 清理 IPC 监听
    this._cleanupIPCListeners();
    
    // 移除 DOM 元素
    if (this._wrapperElement && this._wrapperElement.parentNode) {
      this._wrapperElement.parentNode.removeChild(this._wrapperElement);
    }
    
    // 移除样式
    if (this._styleElement && this._styleElement.parentNode) {
      this._styleElement.parentNode.removeChild(this._styleElement);
    }

    // 清理状态
    this._container = null;
    this._wrapperElement = null;
    this._buttonElement = null;
    this._interimElement = null;
    this._statusElement = null;
    this._styleElement = null;
    this._recognition = null;
    this._isInitialized = false;
    this._state = 'idle';
    this._lastTranscript = '';
    this._interimTranscript = '';
    this._callbacks = {};

    console.log('[VoiceInput] Disposed');
  }

  // ============================================================================
  // 配置
  // ============================================================================

  /**
   * 更新配置
   */
  setConfig(config: Partial<VoiceInputConfig>): void {
    this._config = { ...this._config, ...config };
    this._applyConfig();
    
    // 更新语音识别配置
    if (this._recognition) {
      this._recognition.lang = this._config.language;
      this._recognition.continuous = this._config.continuous;
      this._recognition.interimResults = this._config.interimResults;
    }
  }

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: VoiceInputCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  /**
   * 设置位置
   */
  setPosition(x: number, y: number): void {
    if (!this._wrapperElement) return;
    this._wrapperElement.style.left = `${x}px`;
    this._wrapperElement.style.top = `${y}px`;
  }

  // ============================================================================
  // 控制
  // ============================================================================

  /**
   * 开始监听
   */
  async startListening(): Promise<void> {
    if (!this._isInitialized) {
      console.warn('[VoiceInput] Not initialized');
      return;
    }

    if (!this._isRecognitionSupported) {
      this._setState('error');
      this._callbacks.onError?.('语音识别不支持');
      return;
    }

    if (this._state === 'listening') {
      console.warn('[VoiceInput] Already listening');
      return;
    }

    try {
      // 请求麦克风权限
      await this._requestMicrophonePermission();
      
      // 重置状态
      this._lastTranscript = '';
      this._interimTranscript = '';
      this._startTime = Date.now();
      
      // 开始识别
      this._recognition?.start();
      
      // 设置超时
      this._startTimeoutTimer();
      
      this._setState('listening');
      this._callbacks.onListeningStart?.();
      
      // 通知主进程
      this._notifyMainProcess(VoiceChannels.CALLBACK_RECOGNITION_START, {});
      
      console.log('[VoiceInput] Started listening');
    } catch (error) {
      console.error('[VoiceInput] Failed to start listening:', error);
      this._setState('error');
      this._callbacks.onError?.(error instanceof Error ? error.message : '无法启动语音识别');
    }
  }

  /**
   * 停止监听
   */
  stopListening(): void {
    if (this._state !== 'listening' && this._state !== 'processing') {
      return;
    }

    // 清理定时器
    this._clearTimers();
    
    // 停止识别
    try {
      this._recognition?.stop();
    } catch (error) {
      console.warn('[VoiceInput] Error stopping recognition:', error);
    }
    
    this._setState('idle');
    this._callbacks.onListeningStop?.();
    
    // 通知主进程
    this._notifyMainProcess(VoiceChannels.CALLBACK_RECOGNITION_END, {});
    
    // 隐藏中间结果
    this._hideInterim();
    
    console.log('[VoiceInput] Stopped listening');
  }

  /**
   * 切换监听状态
   */
  async toggle(): Promise<void> {
    if (this._state === 'listening') {
      this.stopListening();
    } else if (this._state === 'idle') {
      await this.startListening();
    }
  }

  // ============================================================================
  // 显示
  // ============================================================================

  /**
   * 显示组件
   */
  show(): void {
    if (!this._wrapperElement) return;
    this._wrapperElement.style.display = 'block';
    this._isVisible = true;
  }

  /**
   * 隐藏组件
   */
  hide(): void {
    if (!this._wrapperElement) return;
    this._wrapperElement.style.display = 'none';
    this._isVisible = false;
    
    // 如果正在监听，停止
    if (this._state === 'listening') {
      this.stopListening();
    }
  }

  // ============================================================================
  // 私有方法：初始化
  // ============================================================================

  /**
   * 检查语音识别支持
   */
  private _checkSpeechRecognitionSupport(): void {
    const SpeechRecognitionAPI = (window as unknown as { 
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    }).SpeechRecognition || (window as unknown as { 
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    }).webkitSpeechRecognition;
    
    this._isRecognitionSupported = !!SpeechRecognitionAPI;
  }

  /**
   * 初始化语音识别
   */
  private _initSpeechRecognition(): void {
    const SpeechRecognitionAPI = (window as unknown as { 
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    }).SpeechRecognition || (window as unknown as { 
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    }).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.warn('[VoiceInput] SpeechRecognition not supported');
      return;
    }

    this._recognition = new SpeechRecognitionAPI();
    this._recognition.lang = this._config.language;
    this._recognition.continuous = this._config.continuous;
    this._recognition.interimResults = this._config.interimResults;
    this._recognition.maxAlternatives = 1;

    // 绑定事件处理器
    this._recognition.onstart = this._handleRecognitionStart.bind(this);
    this._recognition.onend = this._handleRecognitionEnd.bind(this);
    this._recognition.onerror = this._handleRecognitionError.bind(this);
    this._recognition.onresult = this._handleRecognitionResult.bind(this);
    this._recognition.onspeechstart = this._handleSpeechStart.bind(this);
    this._recognition.onspeechend = this._handleSpeechEnd.bind(this);
  }

  /**
   * 请求麦克风权限
   */
  private async _requestMicrophonePermission(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 立即停止流，我们只需要权限
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      throw new Error('麦克风权限被拒绝');
    }
  }

  // ============================================================================
  // 私有方法：DOM 操作
  // ============================================================================

  /**
   * 注入样式
   */
  private _injectStyles(): void {
    if (document.getElementById('voice-input-styles')) return;

    this._styleElement = document.createElement('style');
    this._styleElement.id = 'voice-input-styles';
    this._styleElement.textContent = VOICE_INPUT_STYLES;
    document.head.appendChild(this._styleElement);
  }

  /**
   * 创建 DOM 元素
   */
  private _createElements(): void {
    // 容器
    this._wrapperElement = document.createElement('div');
    this._wrapperElement.className = 'voice-input-container';
    
    // 按钮
    this._buttonElement = document.createElement('button');
    this._buttonElement.className = 'voice-input-button';
    this._buttonElement.innerHTML = MICROPHONE_ICON;
    this._buttonElement.title = '点击开始语音输入';
    this._buttonElement.addEventListener('click', this._handleButtonClick.bind(this));
    
    // 状态指示器
    this._statusElement = document.createElement('div');
    this._statusElement.className = 'voice-input-status';
    this._buttonElement.appendChild(this._statusElement);
    
    // 中间结果显示
    this._interimElement = document.createElement('div');
    this._interimElement.className = 'voice-input-interim';
    
    this._wrapperElement.appendChild(this._buttonElement);
    this._wrapperElement.appendChild(this._interimElement);
    
    // 应用配置
    this._applyConfig();
    
    // 禁用按钮（如果不支持）
    if (!this._isRecognitionSupported) {
      this._buttonElement.disabled = true;
      this._buttonElement.title = '您的浏览器不支持语音识别';
    }
    
    this._container?.appendChild(this._wrapperElement);
  }

  /**
   * 应用配置
   */
  private _applyConfig(): void {
    if (!this._wrapperElement) return;

    // CSS 变量
    this._wrapperElement.style.setProperty('--voice-z-index', `${this._config.zIndex}`);
    this._wrapperElement.style.setProperty('--voice-button-size', `${this._config.buttonSize}px`);

    // 主题
    this._wrapperElement.classList.remove('theme-light', 'theme-dark');
    const theme = this._getEffectiveTheme();
    this._wrapperElement.classList.add(`theme-${theme}`);
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

  // ============================================================================
  // 私有方法：事件处理
  // ============================================================================

  /**
   * 按钮点击处理
   */
  private async _handleButtonClick(): Promise<void> {
    // 添加波纹效果
    this._addRippleEffect();
    
    await this.toggle();
  }

  /**
   * 添加波纹效果
   */
  private _addRippleEffect(): void {
    if (!this._buttonElement) return;
    
    const ripple = document.createElement('span');
    ripple.className = 'voice-input-ripple';
    this._buttonElement.appendChild(ripple);
    
    setTimeout(() => {
      ripple.remove();
    }, 600);
  }

  /**
   * 识别开始处理
   */
  private _handleRecognitionStart(): void {
    console.log('[VoiceInput] Recognition started');
  }

  /**
   * 识别结束处理
   */
  private _handleRecognitionEnd(): void {
    console.log('[VoiceInput] Recognition ended');
    
    // 如果有最终结果，提交
    if (this._lastTranscript && this._state === 'processing') {
      this._submitResult();
    }
    
    this._setState('idle');
    this._hideInterim();
  }

  /**
   * 识别错误处理
   */
  private _handleRecognitionError(event: SpeechRecognitionErrorEvent): void {
    console.error('[VoiceInput] Recognition error:', event.error, event.message);
    
    // 清理定时器
    this._clearTimers();
    
    let errorMessage = '语音识别错误';
    
    switch (event.error) {
      case 'no-speech':
        errorMessage = '未检测到语音';
        break;
      case 'audio-capture':
        errorMessage = '无法捕获音频';
        break;
      case 'not-allowed':
        errorMessage = '麦克风权限被拒绝';
        break;
      case 'network':
        errorMessage = '网络错误';
        break;
      case 'aborted':
        // 主动中止，不算错误
        this._setState('idle');
        return;
      default:
        errorMessage = event.message || '语音识别错误';
    }
    
    this._setState('error');
    this._callbacks.onError?.(errorMessage);
    
    // 通知主进程
    this._notifyMainProcess(VoiceChannels.CALLBACK_RECOGNITION_ERROR, {
      error: event.error,
      message: errorMessage,
    });
    
    // 3秒后恢复正常状态
    setTimeout(() => {
      if (this._state === 'error') {
        this._setState('idle');
      }
    }, 3000);
  }

  /**
   * 识别结果处理
   */
  private _handleRecognitionResult(event: SpeechRecognitionEvent): void {
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      
      if (result.isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    // 更新中间结果显示
    if (interimTranscript) {
      this._interimTranscript = interimTranscript;
      this._showInterim(interimTranscript);
      
      // 重置静音计时器
      this._resetSilenceTimer();
    }

    // 处理最终结果
    if (finalTranscript) {
      const processingTime = Date.now() - this._startTime;
      const confidence = event.results[event.results.length - 1][0].confidence;
      
      this._lastTranscript = finalTranscript;
      this._setState('processing');
      
      const result: VoiceRecognitionResult = {
        transcript: finalTranscript,
        confidence: confidence,
        isFinal: true,
        language: this._config.language,
        processingTime: processingTime,
      };
      
      // 触发回调
      this._callbacks.onResult?.(result);
      this._callbacks.onFinalResult?.(finalTranscript, confidence);
      
      // 通知主进程
      this._notifyMainProcess(VoiceChannels.CALLBACK_RECOGNITION_RESULT, result);
      
      console.log('[VoiceInput] Final result:', finalTranscript, 'confidence:', confidence);
      
      // 如果不是连续模式，停止识别
      if (!this._config.continuous) {
        this._recognition?.stop();
      }
    } else if (interimTranscript) {
      // 中间结果
      const result: VoiceRecognitionResult = {
        transcript: interimTranscript,
        confidence: 0,
        isFinal: false,
        language: this._config.language,
      };
      
      this._callbacks.onResult?.(result);
    }
  }

  /**
   * 语音开始处理
   */
  private _handleSpeechStart(): void {
    console.log('[VoiceInput] Speech started');
    this._clearSilenceTimer();
  }

  /**
   * 语音结束处理
   */
  private _handleSpeechEnd(): void {
    console.log('[VoiceInput] Speech ended');
    this._resetSilenceTimer();
  }

  // ============================================================================
  // 私有方法：状态管理
  // ============================================================================

  /**
   * 设置状态
   */
  private _setState(state: VoiceInputState): void {
    if (this._state === state) return;
    
    const previousState = this._state;
    this._state = state;
    
    // 更新 UI
    this._updateUI();
    
    // 触发回调
    this._callbacks.onStateChange?.(state);
    
    console.log('[VoiceInput] State changed:', previousState, '->', state);
  }

  /**
   * 更新 UI
   */
  private _updateUI(): void {
    if (!this._buttonElement || !this._statusElement) return;
    
    // 移除所有状态类
    this._buttonElement.classList.remove('listening', 'processing', 'error');
    this._statusElement.classList.remove('listening', 'processing', 'error');
    
    // 添加当前状态类
    if (this._state !== 'idle') {
      this._buttonElement.classList.add(this._state);
      this._statusElement.classList.add(this._state);
    }
    
    // 更新图标
    if (this._state === 'listening') {
      this._buttonElement.innerHTML = STOP_ICON;
      this._buttonElement.appendChild(this._statusElement);
      this._buttonElement.title = '点击停止语音输入';
    } else {
      this._buttonElement.innerHTML = MICROPHONE_ICON;
      this._buttonElement.appendChild(this._statusElement);
      this._buttonElement.title = '点击开始语音输入';
    }
  }

  /**
   * 显示中间结果
   */
  private _showInterim(text: string): void {
    if (!this._interimElement) return;
    this._interimElement.textContent = text;
    this._interimElement.classList.add('visible');
  }

  /**
   * 隐藏中间结果
   */
  private _hideInterim(): void {
    if (!this._interimElement) return;
    this._interimElement.classList.remove('visible');
  }

  /**
   * 提交结果
   */
  private _submitResult(): void {
    if (!this._lastTranscript) return;
    
    this._callbacks.onSubmit?.(this._lastTranscript);
    console.log('[VoiceInput] Submitted:', this._lastTranscript);
  }

  // ============================================================================
  // 私有方法：定时器
  // ============================================================================

  /**
   * 开始超时计时器
   */
  private _startTimeoutTimer(): void {
    if (this._config.timeout <= 0) return;
    
    this._clearTimeoutTimer();
    this._timeoutTimer = setTimeout(() => {
      console.log('[VoiceInput] Timeout reached');
      this.stopListening();
    }, this._config.timeout);
  }

  /**
   * 清除超时计时器
   */
  private _clearTimeoutTimer(): void {
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }
  }

  /**
   * 重置静音计时器
   */
  private _resetSilenceTimer(): void {
    if (this._config.maxSilence <= 0) return;
    
    this._clearSilenceTimer();
    this._silenceTimer = setTimeout(() => {
      console.log('[VoiceInput] Max silence reached');
      this.stopListening();
    }, this._config.maxSilence);
  }

  /**
   * 清除静音计时器
   */
  private _clearSilenceTimer(): void {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  /**
   * 清理所有定时器
   */
  private _clearTimers(): void {
    this._clearTimeoutTimer();
    this._clearSilenceTimer();
  }

  // ============================================================================
  // 私有方法：IPC 通信
  // ============================================================================

  /**
   * 设置 IPC 监听器
   */
  private _setupIPCListeners(): void {
    if (typeof window === 'undefined' || !window.electronAPI?.on) {
      console.warn('[VoiceInput] electronAPI not available, IPC listeners not set up');
      return;
    }

    const handlers = {
      stateChange: (data: { state: VoiceInputState }) => {
        console.log('[VoiceInput] Received state change from main:', data.state);
      },
    };

    // 注册监听器
    window.electronAPI.on(VoiceChannels.EVENT_RECOGNITION_STATE_CHANGE, handlers.stateChange);

    // 保存清理函数
    this._ipcCleanup = () => {
      window.electronAPI?.off?.(VoiceChannels.EVENT_RECOGNITION_STATE_CHANGE, handlers.stateChange);
    };

    console.log('[VoiceInput] IPC listeners set up');
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
   * 通知主进程
   */
  private _notifyMainProcess(channel: string, data: unknown): void {
    if (typeof window === 'undefined' || !window.electronAPI?.send) {
      return;
    }
    
    try {
      window.electronAPI.send(channel, data);
    } catch (error) {
      console.warn('[VoiceInput] Failed to notify main process:', error);
    }
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建语音输入实例
 */
export function createVoiceInput(config?: Partial<VoiceInputConfig>): IVoiceInput {
  return new VoiceInput(config);
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 检查语音识别是否支持
 */
export function isSpeechRecognitionSupported(): boolean {
  const SpeechRecognitionAPI = (window as unknown as { 
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }).SpeechRecognition || (window as unknown as { 
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }).webkitSpeechRecognition;
  
  return !!SpeechRecognitionAPI;
}

/**
 * 获取支持的语言列表
 */
export function getSupportedLanguages(): string[] {
  return [
    'zh-CN',  // 中文（简体）
    'zh-TW',  // 中文（繁体）
    'en-US',  // 英语（美国）
    'en-GB',  // 英语（英国）
    'ja-JP',  // 日语
    'ko-KR',  // 韩语
    'de-DE',  // 德语
    'fr-FR',  // 法语
    'es-ES',  // 西班牙语
    'it-IT',  // 意大利语
    'pt-BR',  // 葡萄牙语（巴西）
    'ru-RU',  // 俄语
  ];
}

// ============================================================================
// 类型声明扩展
// ============================================================================

declare global {
  interface Window {
    electronAPI?: {
      on?: (channel: string, callback: (...args: unknown[]) => void) => void;
      off?: (channel: string, callback: (...args: unknown[]) => void) => void;
      send?: (channel: string, data: unknown) => void;
    };
  }
}

// ============================================================================
// 导出
// ============================================================================

export default VoiceInput;