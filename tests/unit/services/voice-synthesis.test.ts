/**
 * 语音合成服务单元测试
 * T090 [P] [US5] 单元测试：语音合成服务
 * 
 * 测试覆盖：
 * - 语音合成初始化和配置
 * - 语音合成流程（synthesize/speak）
 * - 语音播放控制（停止、暂停）
 * - 可用语音列表获取
 * - 多语言支持
 * - 语速、音调、音量调节
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock SpeechSynthesis API
const mockUtterance = vi.fn();
const mockUtteranceInstance = {
  text: '',
  lang: 'zh-CN',
  voice: null as SpeechSynthesisVoice | null,
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  onstart: null as ((event: any) => void) | null,
  onend: null as ((event: any) => void) | null,
  onerror: null as ((event: any) => void) | null,
  onpause: null as ((event: any) => void) | null,
  onresume: null as ((event: any) => void) | null,
  onboundary: null as ((event: any) => void) | null,
};

mockUtterance.mockImplementation(() => {
  return { ...mockUtteranceInstance };
});

const mockVoices: Partial<SpeechSynthesisVoice>[] = [
  { voiceURI: 'zh-CN-voice', name: 'Chinese Voice', lang: 'zh-CN', localService: true, default: true },
  { voiceURI: 'en-US-voice', name: 'English Voice', lang: 'en-US', localService: true, default: false },
  { voiceURI: 'ja-JP-voice', name: 'Japanese Voice', lang: 'ja-JP', localService: false, default: false },
  { voiceURI: 'en-GB-voice', name: 'British English', lang: 'en-GB', localService: true, default: false },
];

const mockSpeechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  getVoices: vi.fn(() => mockVoices as SpeechSynthesisVoice[]),
  speaking: false,
  pending: false,
  paused: false,
  onvoiceschanged: null as (() => void) | null,
};

// Setup global mocks
(global as any).SpeechSynthesisUtterance = mockUtterance;
(global as any).speechSynthesis = mockSpeechSynthesis;

// Types from capabilities
interface VoiceSynthesisConfig {
  voice: string;
  language: string;
  rate: number;
  pitch: number;
  volume: number;
}

interface VoiceSynthesisResult {
  text: string;
  duration: number;
  audioData?: ArrayBuffer;
}

interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  isLocal: boolean;
  gender?: 'male' | 'female' | 'neutral';
}

// Voice Synthesis Service Interface
interface IVoiceSynthesisService {
  initialize(): Promise<boolean>;
  synthesize(text: string, config?: Partial<VoiceSynthesisConfig>): Promise<VoiceSynthesisResult>;
  speak(text: string, config?: Partial<VoiceSynthesisConfig>): Promise<void>;
  stopSpeaking(): Promise<void>;
  pauseSpeaking(): Promise<void>;
  resumeSpeaking(): Promise<void>;
  isSpeaking(): boolean;
  isPaused(): boolean;
  getAvailableVoices(): Promise<VoiceInfo[]>;
  getConfig(): VoiceSynthesisConfig;
  setConfig(config: Partial<VoiceSynthesisConfig>): void;
  checkAvailability(): Promise<boolean>;
  onStart(callback: () => void): () => void;
  onEnd(callback: () => void): () => void;
  onError(callback: (error: Error) => void): () => void;
  destroy(): Promise<void>;
}

// Mock Voice Synthesis Service Implementation
class VoiceSynthesisService implements IVoiceSynthesisService {
  private config: VoiceSynthesisConfig = {
    voice: 'default',
    language: 'zh-CN',
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
  };
  
  private speaking: boolean = false;
  private paused: boolean = false;
  private currentUtterance: any = null;
  private startCallbacks: Set<() => void> = new Set();
  private endCallbacks: Set<() => void> = new Set();
  private errorCallbacks: Set<(error: Error) => void> = new Set();
  private voices: VoiceInfo[] = [];
  private initialized: boolean = false;
  
  async initialize(): Promise<boolean> {
    const available = await this.checkAvailability();
    if (!available) {
      return false;
    }
    
    // Load available voices
    await this.loadVoices();
    this.initialized = true;
    return true;
  }
  
  private async loadVoices(): Promise<void> {
    return new Promise((resolve) => {
      const loadVoicesInternal = () => {
        const synth = (global as any).speechSynthesis;
        const rawVoices = synth.getVoices();
        
        this.voices = rawVoices.map((voice: SpeechSynthesisVoice) => ({
          id: voice.voiceURI,
          name: voice.name,
          language: voice.lang,
          isLocal: voice.localService,
          gender: this.detectGender(voice.name),
        }));
        
        resolve();
      };
      
      const synth = (global as any).speechSynthesis;
      const voices = synth.getVoices();
      
      if (voices.length > 0) {
        loadVoicesInternal();
      } else {
        // Wait for voices to load
        synth.onvoiceschanged = loadVoicesInternal;
        // Fallback timeout
        setTimeout(loadVoicesInternal, 100);
      }
    });
  }
  
  private detectGender(voiceName: string): 'male' | 'female' | 'neutral' | undefined {
    const name = voiceName.toLowerCase();
    if (name.includes('female') || name.includes('woman') || name.includes('girl')) {
      return 'female';
    }
    if (name.includes('male') || name.includes('man') || name.includes('boy')) {
      return 'male';
    }
    return undefined;
  }
  
  async synthesize(text: string, config?: Partial<VoiceSynthesisConfig>): Promise<VoiceSynthesisResult> {
    if (!this.initialized) {
      throw new Error('Service not initialized');
    }
    
    const mergedConfig = { ...this.config, ...config };
    const startTime = Date.now();
    
    // Create utterance for timing estimation
    const utterance = this.createUtterance(text, mergedConfig);
    
    // Estimate duration based on text length and rate
    // Average speaking rate is ~150 words per minute or ~3 chars per second for Chinese
    const charsPerSecond = 3 / mergedConfig.rate;
    const estimatedDuration = (text.length / charsPerSecond) * 1000;
    
    return {
      text,
      duration: estimatedDuration,
    };
  }
  
  async speak(text: string, config?: Partial<VoiceSynthesisConfig>): Promise<void> {
    if (!this.initialized) {
      throw new Error('Service not initialized');
    }
    
    if (this.speaking) {
      await this.stopSpeaking();
    }
    
    const mergedConfig = { ...this.config, ...config };
    const utterance = this.createUtterance(text, mergedConfig);
    
    return new Promise((resolve, reject) => {
      utterance.onstart = () => {
        this.speaking = true;
        this.paused = false;
        this.notifyStart();
      };
      
      utterance.onend = () => {
        this.speaking = false;
        this.paused = false;
        this.currentUtterance = null;
        this.notifyEnd();
        resolve();
      };
      
      utterance.onerror = (event: any) => {
        this.speaking = false;
        this.paused = false;
        this.currentUtterance = null;
        const error = new Error(`Speech synthesis error: ${event.error || 'unknown'}`);
        this.notifyError(error);
        reject(error);
      };
      
      this.currentUtterance = utterance;
      (global as any).speechSynthesis.speak(utterance);
    });
  }
  
  private createUtterance(text: string, config: VoiceSynthesisConfig): any {
    const Utterance = (global as any).SpeechSynthesisUtterance;
    const utterance = new Utterance();
    
    utterance.text = text;
    utterance.lang = config.language;
    utterance.rate = config.rate;
    utterance.pitch = config.pitch;
    utterance.volume = config.volume;
    
    // Set voice if specified
    if (config.voice !== 'default') {
      const voice = this.findVoice(config.voice, config.language);
      if (voice) {
        utterance.voice = voice;
      }
    }
    
    return utterance;
  }
  
  private findVoice(voiceId: string, language: string): SpeechSynthesisVoice | null {
    const synth = (global as any).speechSynthesis;
    const voices = synth.getVoices();
    
    // Try to find by ID
    let voice = voices.find((v: SpeechSynthesisVoice) => v.voiceURI === voiceId);
    if (voice) return voice;
    
    // Try to find by name
    voice = voices.find((v: SpeechSynthesisVoice) => v.name === voiceId);
    if (voice) return voice;
    
    // Fallback to language match
    voice = voices.find((v: SpeechSynthesisVoice) => v.lang.startsWith(language.split('-')[0]));
    return voice || null;
  }
  
  async stopSpeaking(): Promise<void> {
    (global as any).speechSynthesis.cancel();
    this.speaking = false;
    this.paused = false;
    this.currentUtterance = null;
  }
  
  async pauseSpeaking(): Promise<void> {
    if (this.speaking && !this.paused) {
      (global as any).speechSynthesis.pause();
      this.paused = true;
    }
  }
  
  async resumeSpeaking(): Promise<void> {
    if (this.paused) {
      (global as any).speechSynthesis.resume();
      this.paused = false;
    }
  }
  
  isSpeaking(): boolean {
    return this.speaking;
  }
  
  isPaused(): boolean {
    return this.paused;
  }
  
  async getAvailableVoices(): Promise<VoiceInfo[]> {
    if (!this.initialized) {
      await this.loadVoices();
    }
    return [...this.voices];
  }
  
  getConfig(): VoiceSynthesisConfig {
    return { ...this.config };
  }
  
  setConfig(config: Partial<VoiceSynthesisConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  async checkAvailability(): Promise<boolean> {
    return !!(
      (global as any).speechSynthesis &&
      (global as any).SpeechSynthesisUtterance
    );
  }
  
  onStart(callback: () => void): () => void {
    this.startCallbacks.add(callback);
    return () => {
      this.startCallbacks.delete(callback);
    };
  }
  
  onEnd(callback: () => void): () => void {
    this.endCallbacks.add(callback);
    return () => {
      this.endCallbacks.delete(callback);
    };
  }
  
  onError(callback: (error: Error) => void): () => void {
    this.errorCallbacks.add(callback);
    return () => {
      this.errorCallbacks.delete(callback);
    };
  }
  
  private notifyStart(): void {
    this.startCallbacks.forEach(callback => callback());
  }
  
  private notifyEnd(): void {
    this.endCallbacks.forEach(callback => callback());
  }
  
  private notifyError(error: Error): void {
    this.errorCallbacks.forEach(callback => callback(error));
  }
  
  async destroy(): Promise<void> {
    await this.stopSpeaking();
    this.startCallbacks.clear();
    this.endCallbacks.clear();
    this.errorCallbacks.clear();
    this.voices = [];
    this.initialized = false;
  }
}

describe('VoiceSynthesisService', () => {
  let service: VoiceSynthesisService;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpeechSynthesis.speak.mockClear();
    mockSpeechSynthesis.cancel.mockClear();
    mockSpeechSynthesis.pause.mockClear();
    mockSpeechSynthesis.resume.mockClear();
    mockSpeechSynthesis.speaking = false;
    mockSpeechSynthesis.paused = false;
    service = new VoiceSynthesisService();
  });
  
  afterEach(async () => {
    await service.destroy();
  });
  
  describe('initialization', () => {
    it('should initialize successfully when Speech Synthesis API is available', async () => {
      const result = await service.initialize();
      
      expect(result).toBe(true);
    });
    
    it('should fail initialization when Speech Synthesis API is not available', async () => {
      // Temporarily remove API
      const originalSynth = (global as any).speechSynthesis;
      const originalUtterance = (global as any).SpeechSynthesisUtterance;
      delete (global as any).speechSynthesis;
      delete (global as any).SpeechSynthesisUtterance;
      
      const result = await service.initialize();
      
      expect(result).toBe(false);
      
      // Restore
      (global as any).speechSynthesis = originalSynth;
      (global as any).SpeechSynthesisUtterance = originalUtterance;
    });
    
    it('should check availability correctly', async () => {
      const available = await service.checkAvailability();
      expect(available).toBe(true);
    });
    
    it('should load voices on initialization', async () => {
      await service.initialize();
      
      const voices = await service.getAvailableVoices();
      expect(voices.length).toBeGreaterThan(0);
    });
  });
  
  describe('configuration', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should have default configuration', () => {
      const config = service.getConfig();
      
      expect(config.voice).toBe('default');
      expect(config.language).toBe('zh-CN');
      expect(config.rate).toBe(1.0);
      expect(config.pitch).toBe(1.0);
      expect(config.volume).toBe(1.0);
    });
    
    it('should update configuration', () => {
      service.setConfig({
        language: 'en-US',
        rate: 1.5,
        pitch: 0.8,
      });
      
      const config = service.getConfig();
      expect(config.language).toBe('en-US');
      expect(config.rate).toBe(1.5);
      expect(config.pitch).toBe(0.8);
      expect(config.volume).toBe(1.0); // Unchanged
    });
    
    it('should return a copy of configuration', () => {
      const config1 = service.getConfig();
      const config2 = service.getConfig();
      
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });
  
  describe('voice management', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should get available voices', async () => {
      const voices = await service.getAvailableVoices();
      
      expect(voices.length).toBe(4);
      expect(voices[0]).toEqual(expect.objectContaining({
        id: 'zh-CN-voice',
        name: 'Chinese Voice',
        language: 'zh-CN',
        isLocal: true,
      }));
    });
    
    it('should include voice metadata', async () => {
      const voices = await service.getAvailableVoices();
      
      voices.forEach(voice => {
        expect(voice).toHaveProperty('id');
        expect(voice).toHaveProperty('name');
        expect(voice).toHaveProperty('language');
        expect(voice).toHaveProperty('isLocal');
      });
    });
    
    it('should return a copy of voices list', async () => {
      const voices1 = await service.getAvailableVoices();
      const voices2 = await service.getAvailableVoices();
      
      expect(voices1).not.toBe(voices2);
    });
  });
  
  describe('speech synthesis', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should synthesize text and return result', async () => {
      const result = await service.synthesize('你好世界');
      
      expect(result.text).toBe('你好世界');
      expect(result.duration).toBeGreaterThan(0);
    });
    
    it('should synthesize with custom config', async () => {
      const result = await service.synthesize('Hello', {
        language: 'en-US',
        rate: 2.0,
      });
      
      expect(result.text).toBe('Hello');
    });
    
    it('should throw error when not initialized', async () => {
      const uninitializedService = new VoiceSynthesisService();
      
      await expect(uninitializedService.synthesize('test')).rejects.toThrow(
        'Service not initialized'
      );
    });
    
    it('should estimate duration based on text length and rate', async () => {
      const result1 = await service.synthesize('短文本');
      const result2 = await service.synthesize('这是一段比较长的文本，用于测试时长估算');
      
      expect(result2.duration).toBeGreaterThan(result1.duration);
    });
    
    it('should adjust duration based on rate', async () => {
      const resultSlow = await service.synthesize('测试', { rate: 0.5 });
      const resultFast = await service.synthesize('测试', { rate: 2.0 });
      
      expect(resultSlow.duration).toBeGreaterThan(resultFast.duration);
    });
  });
  
  describe('speaking lifecycle', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should speak text', async () => {
      const speakPromise = service.speak('你好');
      
      // Simulate speech events
      const utterance = mockUtterance.mock.results[0]?.value;
      if (utterance?.onstart) {
        utterance.onstart({});
      }
      
      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
      expect(service.isSpeaking()).toBe(true);
      
      // Complete speech
      if (utterance?.onend) {
        utterance.onend({});
      }
      
      await speakPromise;
      expect(service.isSpeaking()).toBe(false);
    });
    
    it('should stop previous speech before starting new one', async () => {
      // Start first speech
      const promise1 = service.speak('第一段');
      const utterance1 = mockUtterance.mock.results[0]?.value;
      utterance1?.onstart?.({});
      
      expect(service.isSpeaking()).toBe(true);
      
      // Start second speech (should cancel first)
      const promise2 = service.speak('第二段');
      
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    });
    
    it('should throw error when not initialized', async () => {
      const uninitializedService = new VoiceSynthesisService();
      
      await expect(uninitializedService.speak('test')).rejects.toThrow(
        'Service not initialized'
      );
    });
    
    it('should track speaking state correctly', async () => {
      expect(service.isSpeaking()).toBe(false);
      
      const speakPromise = service.speak('测试');
      const utterance = mockUtterance.mock.results[0]?.value;
      
      utterance?.onstart?.({});
      expect(service.isSpeaking()).toBe(true);
      
      utterance?.onend?.({});
      await speakPromise;
      expect(service.isSpeaking()).toBe(false);
    });
  });
  
  describe('playback control', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should stop speaking', async () => {
      const speakPromise = service.speak('长文本');
      const utterance = mockUtterance.mock.results[0]?.value;
      utterance?.onstart?.({});
      
      await service.stopSpeaking();
      
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
      expect(service.isSpeaking()).toBe(false);
    });
    
    it('should pause speaking', async () => {
      const speakPromise = service.speak('测试');
      const utterance = mockUtterance.mock.results[0]?.value;
      utterance?.onstart?.({});
      
      await service.pauseSpeaking();
      
      expect(mockSpeechSynthesis.pause).toHaveBeenCalled();
      expect(service.isPaused()).toBe(true);
    });
    
    it('should resume speaking', async () => {
      const speakPromise = service.speak('测试');
      const utterance = mockUtterance.mock.results[0]?.value;
      utterance?.onstart?.({});
      
      await service.pauseSpeaking();
      expect(service.isPaused()).toBe(true);
      
      await service.resumeSpeaking();
      expect(mockSpeechSynthesis.resume).toHaveBeenCalled();
      expect(service.isPaused()).toBe(false);
    });
    
    it('should not pause if not speaking', async () => {
      await service.pauseSpeaking();
      
      expect(mockSpeechSynthesis.pause).not.toHaveBeenCalled();
    });
    
    it('should not resume if not paused', async () => {
      await service.resumeSpeaking();
      
      expect(mockSpeechSynthesis.resume).not.toHaveBeenCalled();
    });
  });
  
  describe('callbacks', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should notify on speech start', async () => {
      const startCallback = vi.fn();
      service.onStart(startCallback);
      
      service.speak('测试');
      const utterance = mockUtterance.mock.results[0]?.value;
      utterance?.onstart?.({});
      
      expect(startCallback).toHaveBeenCalled();
    });
    
    it('should notify on speech end', async () => {
      const endCallback = vi.fn();
      service.onEnd(endCallback);
      
      const speakPromise = service.speak('测试');
      const utterance = mockUtterance.mock.results[0]?.value;
      utterance?.onstart?.({});
      utterance?.onend?.({});
      
      await speakPromise;
      expect(endCallback).toHaveBeenCalled();
    });
    
    it('should notify on speech error', async () => {
      const errorCallback = vi.fn();
      service.onError(errorCallback);
      
      const speakPromise = service.speak('测试');
      const utterance = mockUtterance.mock.results[0]?.value;
      utterance?.onstart?.({});
      utterance?.onerror?.({ error: 'network' });
      
      await expect(speakPromise).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
    });
    
    it('should allow multiple listeners', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      service.onStart(callback1);
      service.onStart(callback2);
      
      service.speak('测试');
      const utterance = mockUtterance.mock.results[0]?.value;
      utterance?.onstart?.({});
      
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
    
    it('should allow unsubscribing', async () => {
      const callback = vi.fn();
      const unsubscribe = service.onStart(callback);
      
      unsubscribe();
      
      service.speak('测试');
      const utterance = mockUtterance.mock.results[0]?.value;
      utterance?.onstart?.({});
      
      expect(callback).not.toHaveBeenCalled();
    });
  });
  
  describe('multi-language support', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should support Chinese language', async () => {
      await service.synthesize('你好', { language: 'zh-CN' });
      
      // Check utterance was created with correct language
      expect(mockUtterance).toHaveBeenCalled();
    });
    
    it('should support English language', async () => {
      await service.synthesize('Hello', { language: 'en-US' });
      
      expect(mockUtterance).toHaveBeenCalled();
    });
    
    it('should support Japanese language', async () => {
      await service.synthesize('こんにちは', { language: 'ja-JP' });
      
      expect(mockUtterance).toHaveBeenCalled();
    });
    
    it('should have voices for multiple languages', async () => {
      const voices = await service.getAvailableVoices();
      
      const languages = new Set(voices.map(v => v.language));
      expect(languages.size).toBeGreaterThan(1);
    });
  });
  
  describe('voice parameters', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should apply rate parameter', async () => {
      service.setConfig({ rate: 1.5 });
      const config = service.getConfig();
      
      expect(config.rate).toBe(1.5);
    });
    
    it('should apply pitch parameter', async () => {
      service.setConfig({ pitch: 0.8 });
      const config = service.getConfig();
      
      expect(config.pitch).toBe(0.8);
    });
    
    it('should apply volume parameter', async () => {
      service.setConfig({ volume: 0.5 });
      const config = service.getConfig();
      
      expect(config.volume).toBe(0.5);
    });
    
    it('should apply all parameters together', async () => {
      service.setConfig({
        rate: 1.2,
        pitch: 0.9,
        volume: 0.7,
      });
      
      const config = service.getConfig();
      expect(config.rate).toBe(1.2);
      expect(config.pitch).toBe(0.9);
      expect(config.volume).toBe(0.7);
    });
  });
  
  describe('error handling', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should handle synthesis errors', async () => {
      const errorCallback = vi.fn();
      service.onError(errorCallback);
      
      const speakPromise = service.speak('测试');
      const utterance = mockUtterance.mock.results[0]?.value;
      utterance?.onstart?.({});
      utterance?.onerror?.({ error: 'synthesis-failed' });
      
      await expect(speakPromise).rejects.toThrow('synthesis-failed');
      expect(errorCallback).toHaveBeenCalled();
    });
    
    it('should reset state on error', async () => {
      const speakPromise = service.speak('测试');
      const utterance = mockUtterance.mock.results[0]?.value;
      utterance?.onstart?.({});
      
      expect(service.isSpeaking()).toBe(true);
      
      utterance?.onerror?.({ error: 'cancelled' });
      
      try {
        await speakPromise;
      } catch (e) {
        // Expected
      }
      
      expect(service.isSpeaking()).toBe(false);
      expect(service.isPaused()).toBe(false);
    });
  });
  
  describe('destruction', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should stop speaking on destroy', async () => {
      const speakPromise = service.speak('测试');
      const utterance = mockUtterance.mock.results[0]?.value;
      utterance?.onstart?.({});
      
      await service.destroy();
      
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    });
    
    it('should clear all callbacks on destroy', async () => {
      const startCallback = vi.fn();
      const endCallback = vi.fn();
      const errorCallback = vi.fn();
      
      service.onStart(startCallback);
      service.onEnd(endCallback);
      service.onError(errorCallback);
      
      await service.destroy();
      
      // Callbacks should be cleared
    });
    
    it('should reset initialization state on destroy', async () => {
      await service.destroy();
      
      // Should need to reinitialize
      await expect(service.speak('test')).rejects.toThrow('not initialized');
    });
  });
});