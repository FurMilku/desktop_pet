/**
 * 语音合成服务 (TTS - Text to Speech)
 * T092 [US5] 实现语音合成服务
 * 
 * 功能：
 * - Web Speech API SpeechSynthesis 集成
 * - 多语言和多语音支持
 * - 语速、音调、音量控制
 * - 播放控制（暂停、恢复、停止）
 * - 语音列表管理
 */

import { EventEmitter } from 'events';
import { logger } from '../logger';
import type {
  VoiceSynthesisConfig,
  VoiceSynthesisResult,
  VoiceInfo,
  CapabilityStatus,
} from '../../shared/types/capabilities';

// 默认配置
const DEFAULT_CONFIG: VoiceSynthesisConfig = {
  voice: 'default',
  language: 'zh-CN',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
};

/**
 * 语音合成事件类型
 */
export type VoiceSynthesisEvent = 
  | 'start'
  | 'end'
  | 'pause'
  | 'resume'
  | 'boundary'
  | 'mark'
  | 'error';

/**
 * 语音合成服务
 * 封装 Web Speech API 的 SpeechSynthesis
 */
export class VoiceSynthesisService extends EventEmitter {
  private config: VoiceSynthesisConfig;
  private status: CapabilityStatus = 'uninitialized';
  private speaking: boolean = false;
  private paused: boolean = false;
  private currentText: string = '';
  private startTime: number = 0;
  private availableVoices: VoiceInfo[] = [];

  constructor(config?: Partial<VoiceSynthesisConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 初始化语音合成服务
   */
  async initialize(): Promise<boolean> {
    try {
      this.status = 'initializing';
      
      const available = await this.checkAvailability();
      if (!available) {
        this.status = 'error';
        logger.warn('VoiceSynthesisService: Speech Synthesis API not available');
        return false;
      }

      // 在 Electron 主进程中，实际的语音合成在渲染进程执行
      // 这里只维护配置和状态
      this.status = 'ready';
      logger.info('VoiceSynthesisService: Initialized successfully');
      return true;
    } catch (error) {
      this.status = 'error';
      logger.error('VoiceSynthesisService: Initialization failed', error);
      return false;
    }
  }

  /**
   * 检查语音合成是否可用
   */
  async checkAvailability(): Promise<boolean> {
    // 在 Electron 主进程中，实际检查由渲染进程完成
    // 返回 true 表示服务层可用
    return true;
  }

  /**
   * 获取当前状态
   */
  getStatus(): CapabilityStatus {
    return this.status;
  }

  /**
   * 检查是否正在播放
   */
  isSpeaking(): boolean {
    return this.speaking;
  }

  /**
   * 检查是否暂停
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * 获取配置
   */
  getConfig(): VoiceSynthesisConfig {
    return { ...this.config };
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<VoiceSynthesisConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug('VoiceSynthesisService: Config updated', this.config);
  }

  /**
   * 合成语音（返回配置供渲染进程使用）
   */
  synthesize(text: string, config?: Partial<VoiceSynthesisConfig>): {
    text: string;
    config: VoiceSynthesisConfig;
  } {
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for synthesis');
    }

    if (config) {
      this.setConfig(config);
    }

    this.currentText = text;
    this.startTime = Date.now();

    logger.info('VoiceSynthesisService: Synthesizing text', { 
      textLength: text.length,
      config: this.config 
    });

    return {
      text,
      config: this.getConfig(),
    };
  }

  /**
   * 开始播放（由渲染进程调用）
   */
  handleSpeakStart(text: string): void {
    this.speaking = true;
    this.paused = false;
    this.currentText = text;
    this.startTime = Date.now();

    logger.debug('VoiceSynthesisService: Speech started', { textLength: text.length });
    this.emit('start', { text });
  }

  /**
   * 播放结束（由渲染进程调用）
   */
  handleSpeakEnd(): VoiceSynthesisResult {
    const duration = Date.now() - this.startTime;
    
    const result: VoiceSynthesisResult = {
      text: this.currentText,
      duration,
    };

    this.speaking = false;
    this.paused = false;

    logger.debug('VoiceSynthesisService: Speech ended', result);
    this.emit('end', result);

    return result;
  }

  /**
   * 播放暂停（由渲染进程调用）
   */
  handlePause(): void {
    if (this.speaking && !this.paused) {
      this.paused = true;
      logger.debug('VoiceSynthesisService: Speech paused');
      this.emit('pause');
    }
  }

  /**
   * 播放恢复（由渲染进程调用）
   */
  handleResume(): void {
    if (this.speaking && this.paused) {
      this.paused = false;
      logger.debug('VoiceSynthesisService: Speech resumed');
      this.emit('resume');
    }
  }

  /**
   * 处理边界事件
   */
  handleBoundary(name: string, charIndex: number): void {
    logger.debug('VoiceSynthesisService: Boundary', { name, charIndex });
    this.emit('boundary', { name, charIndex });
  }

  /**
   * 处理标记事件
   */
  handleMark(name: string): void {
    logger.debug('VoiceSynthesisService: Mark', { name });
    this.emit('mark', { name });
  }

  /**
   * 处理错误
   */
  handleError(errorCode: string, errorMessage?: string): void {
    const error = new Error(`Speech synthesis error: ${errorCode}${errorMessage ? ` - ${errorMessage}` : ''}`);
    
    logger.error('VoiceSynthesisService: Error', error);
    this.emit('error', error);
    
    this.speaking = false;
    this.paused = false;
  }

  /**
   * 停止播放
   */
  stopSpeaking(): void {
    if (this.speaking) {
      this.speaking = false;
      this.paused = false;
      logger.info('VoiceSynthesisService: Stopped speaking');
      this.emit('end', { text: this.currentText, duration: Date.now() - this.startTime });
    }
  }

  /**
   * 暂停播放
   */
  pauseSpeaking(): void {
    if (this.speaking && !this.paused) {
      this.paused = true;
      logger.info('VoiceSynthesisService: Paused speaking');
      this.emit('pause');
    }
  }

  /**
   * 恢复播放
   */
  resumeSpeaking(): void {
    if (this.speaking && this.paused) {
      this.paused = false;
      logger.info('VoiceSynthesisService: Resumed speaking');
      this.emit('resume');
    }
  }

  /**
   * 更新可用语音列表（由渲染进程调用）
   */
  updateAvailableVoices(voices: VoiceInfo[]): void {
    this.availableVoices = voices;
    logger.info('VoiceSynthesisService: Voices updated', { count: voices.length });
  }

  /**
   * 获取可用语音列表
   */
  getAvailableVoices(): VoiceInfo[] {
    return [...this.availableVoices];
  }

  /**
   * 根据语言获取语音
   */
  getVoicesByLanguage(language: string): VoiceInfo[] {
    return this.availableVoices.filter(voice => 
      voice.language.startsWith(language) || 
      voice.language.toLowerCase().includes(language.toLowerCase())
    );
  }

  /**
   * 获取默认语音
   */
  getDefaultVoice(language?: string): VoiceInfo | undefined {
    const lang = language || this.config.language;
    const voices = this.getVoicesByLanguage(lang);
    
    // 优先选择本地语音
    const localVoice = voices.find(v => v.isLocal);
    if (localVoice) {
      return localVoice;
    }
    
    // 返回第一个匹配的语音
    return voices[0];
  }

  /**
   * 设置语音
   */
  setVoice(voiceId: string): void {
    const voice = this.availableVoices.find(v => v.id === voiceId);
    if (voice) {
      this.config.voice = voiceId;
      this.config.language = voice.language;
      logger.info('VoiceSynthesisService: Voice set', { voiceId, language: voice.language });
    } else {
      logger.warn('VoiceSynthesisService: Voice not found', { voiceId });
    }
  }

  /**
   * 销毁服务
   */
  async destroy(): Promise<void> {
    if (this.speaking) {
      this.stopSpeaking();
    }

    this.removeAllListeners();
    this.availableVoices = [];
    this.status = 'uninitialized';

    logger.info('VoiceSynthesisService: Destroyed');
  }
}

// 单例实例
let voiceSynthesisServiceInstance: VoiceSynthesisService | null = null;

/**
 * 获取语音合成服务实例（单例）
 */
export function getVoiceSynthesisService(): VoiceSynthesisService {
  if (!voiceSynthesisServiceInstance) {
    voiceSynthesisServiceInstance = new VoiceSynthesisService();
  }
  return voiceSynthesisServiceInstance;
}

/**
 * 初始化语音合成服务
 */
export async function initVoiceSynthesisService(
  config?: Partial<VoiceSynthesisConfig>
): Promise<VoiceSynthesisService> {
  const service = getVoiceSynthesisService();
  
  if (config) {
    service.setConfig(config);
  }
  
  await service.initialize();
  return service;
}

/**
 * 销毁语音合成服务
 */
export async function destroyVoiceSynthesisService(): Promise<void> {
  if (voiceSynthesisServiceInstance) {
    await voiceSynthesisServiceInstance.destroy();
    voiceSynthesisServiceInstance = null;
  }
}

export default VoiceSynthesisService;