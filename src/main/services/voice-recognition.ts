/**
 * 语音识别服务 (STT - Speech to Text)
 * T091 [US5] 实现语音识别服务
 * 
 * 功能：
 * - Web Speech API 集成
 * - 多语言支持 (zh-CN, en-US, ja-JP 等)
 * - 连续识别模式
 * - 中间结果支持
 * - 超时和静音处理
 */

import { EventEmitter } from 'events';
import { logger } from '../logger';
import type {
  VoiceRecognitionConfig,
  VoiceRecognitionResult,
  CapabilityStatus,
} from '../../shared/types/capabilities';

// 默认配置
const DEFAULT_CONFIG: VoiceRecognitionConfig = {
  language: 'zh-CN',
  continuous: false,
  interimResults: true,
  maxSilence: 3000,
  timeout: 30000,
};

/**
 * 语音识别事件类型
 */
export type VoiceRecognitionEvent = 
  | 'result'
  | 'error'
  | 'start'
  | 'end'
  | 'audiostart'
  | 'audioend'
  | 'speechstart'
  | 'speechend';

/**
 * 语音识别服务
 * 封装 Web Speech API 的 SpeechRecognition
 */
export class VoiceRecognitionService extends EventEmitter {
  private config: VoiceRecognitionConfig;
  private recognition: SpeechRecognition | null = null;
  private status: CapabilityStatus = 'uninitialized';
  private recognizing: boolean = false;
  private startTime: number = 0;
  private lastTranscript: string = '';
  private lastConfidence: number = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private silenceTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(config?: Partial<VoiceRecognitionConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化语音识别服务
   */
  async initialize(): Promise<boolean> {
    try {
      this.status = 'initializing';
      
      const available = await this.checkAvailability();
      if (!available) {
        this.status = 'error';
        logger.warn('VoiceRecognitionService: Web Speech API not available');
        return false;
      }

      // 创建 SpeechRecognition 实例
      // 注意：在 Electron 中，需要通过渲染进程访问 Web Speech API
      // 这里提供服务端接口，实际识别在渲染进程执行
      this.status = 'ready';
      logger.info('VoiceRecognitionService: Initialized successfully');
      return true;
    } catch (error) {
      this.status = 'error';
      logger.error('VoiceRecognitionService: Initialization failed', error);
      return false;
    }
  }

  /**
   * 检查语音识别是否可用
   * 注意：在主进程中无法直接访问 Web Speech API
   * 需要通过 IPC 与渲染进程通信
   */
  async checkAvailability(): Promise<boolean> {
    // 在 Electron 主进程中，Web Speech API 不可用
    // 返回 true 表示服务可用，实际识别通过 IPC 委托给渲染进程
    return true;
  }

  /**
   * 获取当前状态
   */
  getStatus(): CapabilityStatus {
    return this.status;
  }

  /**
   * 检查是否正在识别
   */
  isRecognizing(): boolean {
    return this.recognizing;
  }

  /**
   * 获取配置
   */
  getConfig(): VoiceRecognitionConfig {
    return { ...this.config };
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<VoiceRecognitionConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug('VoiceRecognitionService: Config updated', this.config);
  }

  /**
   * 开始识别（由 IPC handler 调用，实际在渲染进程执行）
   * 返回识别配置供渲染进程使用
   */
  startRecognition(config?: Partial<VoiceRecognitionConfig>): VoiceRecognitionConfig {
    if (this.recognizing) {
      throw new Error('Recognition already in progress');
    }

    if (config) {
      this.setConfig(config);
    }

    // 重置状态
    this.recognizing = true;
    this.startTime = Date.now();
    this.lastTranscript = '';
    this.lastConfidence = 0;

    // 设置超时
    this.setupTimeout();

    logger.info('VoiceRecognitionService: Starting recognition', this.config);
    
    this.emit('start');
    return this.getConfig();
  }

  /**
   * 停止识别
   */
  stopRecognition(): VoiceRecognitionResult {
    this.clearTimeouts();

    const processingTime = this.recognizing ? Date.now() - this.startTime : 0;
    this.recognizing = false;

    const result: VoiceRecognitionResult = {
      transcript: this.lastTranscript,
      confidence: this.lastConfidence,
      isFinal: true,
      language: this.config.language,
      processingTime,
    };

    logger.info('VoiceRecognitionService: Stopped recognition', result);
    this.emit('end');

    return result;
  }

  /**
   * 中止识别
   */
  abortRecognition(): void {
    this.clearTimeouts();
    this.recognizing = false;
    this.lastTranscript = '';
    this.lastConfidence = 0;
    
    logger.info('VoiceRecognitionService: Recognition aborted');
    this.emit('end');
  }

  /**
   * 处理识别结果（由渲染进程通过 IPC 调用）
   */
  handleResult(transcript: string, confidence: number, isFinal: boolean): void {
    this.lastTranscript = transcript;
    this.lastConfidence = confidence;

    // 重置静音超时
    this.resetSilenceTimeout();

    const result: VoiceRecognitionResult = {
      transcript,
      confidence,
      isFinal,
      language: this.config.language,
      processingTime: Date.now() - this.startTime,
    };

    logger.debug('VoiceRecognitionService: Result received', result);
    this.emit('result', result);

    // 非连续模式下，最终结果后自动停止
    if (isFinal && !this.config.continuous) {
      this.stopRecognition();
    }
  }

  /**
   * 处理识别错误（由渲染进程通过 IPC 调用）
   */
  handleError(errorCode: string, errorMessage?: string): void {
    const error = new Error(`Speech recognition error: ${errorCode}${errorMessage ? ` - ${errorMessage}` : ''}`);
    
    logger.error('VoiceRecognitionService: Error', error);
    this.emit('error', error);
    
    this.recognizing = false;
    this.clearTimeouts();
  }

  /**
   * 处理音频开始事件
   */
  handleAudioStart(): void {
    logger.debug('VoiceRecognitionService: Audio started');
    this.emit('audiostart');
  }

  /**
   * 处理音频结束事件
   */
  handleAudioEnd(): void {
    logger.debug('VoiceRecognitionService: Audio ended');
    this.emit('audioend');
  }

  /**
   * 处理语音开始事件
   */
  handleSpeechStart(): void {
    logger.debug('VoiceRecognitionService: Speech started');
    this.resetSilenceTimeout();
    this.emit('speechstart');
  }

  /**
   * 处理语音结束事件
   */
  handleSpeechEnd(): void {
    logger.debug('VoiceRecognitionService: Speech ended');
    this.emit('speechend');
  }

  /**
   * 设置超时
   */
  private setupTimeout(): void {
    if (this.config.timeout && this.config.timeout > 0) {
      this.timeoutId = setTimeout(() => {
        if (this.recognizing) {
          logger.warn('VoiceRecognitionService: Recognition timeout');
          const error = new Error('Recognition timeout');
          this.emit('error', error);
          this.stopRecognition();
        }
      }, this.config.timeout);
    }
  }

  /**
   * 重置静音超时
   */
  private resetSilenceTimeout(): void {
    if (this.silenceTimeoutId) {
      clearTimeout(this.silenceTimeoutId);
      this.silenceTimeoutId = null;
    }

    if (this.config.maxSilence && this.config.maxSilence > 0 && this.recognizing) {
      this.silenceTimeoutId = setTimeout(() => {
        if (this.recognizing) {
          logger.info('VoiceRecognitionService: Silence timeout, stopping recognition');
          this.stopRecognition();
        }
      }, this.config.maxSilence);
    }
  }

  /**
   * 清除所有超时
   */
  private clearTimeouts(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.silenceTimeoutId) {
      clearTimeout(this.silenceTimeoutId);
      this.silenceTimeoutId = null;
    }
  }

  /**
   * 销毁服务
   */
  async destroy(): Promise<void> {
    this.clearTimeouts();
    
    if (this.recognizing) {
      this.abortRecognition();
    }

    this.removeAllListeners();
    this.recognition = null;
    this.status = 'uninitialized';

    logger.info('VoiceRecognitionService: Destroyed');
  }
}

// 单例实例
let voiceRecognitionServiceInstance: VoiceRecognitionService | null = null;

/**
 * 获取语音识别服务实例（单例）
 */
export function getVoiceRecognitionService(): VoiceRecognitionService {
  if (!voiceRecognitionServiceInstance) {
    voiceRecognitionServiceInstance = new VoiceRecognitionService();
  }
  return voiceRecognitionServiceInstance;
}

/**
 * 初始化语音识别服务
 */
export async function initVoiceRecognitionService(
  config?: Partial<VoiceRecognitionConfig>
): Promise<VoiceRecognitionService> {
  const service = getVoiceRecognitionService();
  
  if (config) {
    service.setConfig(config);
  }
  
  await service.initialize();
  return service;
}

/**
 * 销毁语音识别服务
 */
export async function destroyVoiceRecognitionService(): Promise<void> {
  if (voiceRecognitionServiceInstance) {
    await voiceRecognitionServiceInstance.destroy();
    voiceRecognitionServiceInstance = null;
  }
}

export default VoiceRecognitionService;