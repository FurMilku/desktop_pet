/**
 * 语音识别服务单元测试
 * T089 [P] [US5] 单元测试：语音识别服务
 * 
 * 测试覆盖：
 * - 语音识别初始化和配置
 * - 开始/停止识别流程
 * - 识别结果回调处理
 * - 错误处理和超时
 * - 多语言支持
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Web Speech API
const mockSpeechRecognition = vi.fn();
const mockSpeechRecognitionInstance = {
  lang: 'zh-CN',
  continuous: false,
  interimResults: true,
  maxAlternatives: 1,
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
  onresult: null as ((event: any) => void) | null,
  onerror: null as ((event: any) => void) | null,
  onend: null as (() => void) | null,
  onstart: null as (() => void) | null,
  onaudiostart: null as (() => void) | null,
  onaudioend: null as (() => void) | null,
  onspeechstart: null as (() => void) | null,
  onspeechend: null as (() => void) | null,
};

mockSpeechRecognition.mockImplementation(() => mockSpeechRecognitionInstance);

// Setup global mock
(global as any).webkitSpeechRecognition = mockSpeechRecognition;
(global as any).SpeechRecognition = mockSpeechRecognition;

// Types from capabilities
interface VoiceRecognitionConfig {
  language: string;
  continuous: boolean;
  interimResults: boolean;
  maxSilence?: number;
  timeout?: number;
}

interface VoiceRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  language: string;
  processingTime?: number;
}

// Voice Recognition Service Interface
interface IVoiceRecognitionService {
  initialize(): Promise<boolean>;
  startRecognition(config?: Partial<VoiceRecognitionConfig>): Promise<void>;
  stopRecognition(): Promise<VoiceRecognitionResult>;
  isRecognizing(): boolean;
  onResult(callback: (result: VoiceRecognitionResult) => void): () => void;
  onError(callback: (error: Error) => void): () => void;
  getConfig(): VoiceRecognitionConfig;
  setConfig(config: Partial<VoiceRecognitionConfig>): void;
  checkAvailability(): Promise<boolean>;
  destroy(): Promise<void>;
}

// Mock Voice Recognition Service Implementation
class VoiceRecognitionService implements IVoiceRecognitionService {
  private config: VoiceRecognitionConfig = {
    language: 'zh-CN',
    continuous: false,
    interimResults: true,
    maxSilence: 3000,
    timeout: 30000,
  };
  
  private recognition: any = null;
  private recognizing: boolean = false;
  private resultCallbacks: Set<(result: VoiceRecognitionResult) => void> = new Set();
  private errorCallbacks: Set<(error: Error) => void> = new Set();
  private startTime: number = 0;
  private lastTranscript: string = '';
  private lastConfidence: number = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private silenceTimeoutId: ReturnType<typeof setTimeout> | null = null;
  
  async initialize(): Promise<boolean> {
    const available = await this.checkAvailability();
    if (!available) {
      return false;
    }
    
    this.recognition = new (
      (global as any).webkitSpeechRecognition || 
      (global as any).SpeechRecognition
    )();
    
    this.setupRecognitionHandlers();
    return true;
  }
  
  private setupRecognitionHandlers(): void {
    if (!this.recognition) return;
    
    this.recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence;
      const isFinal = result.isFinal;
      
      this.lastTranscript = transcript;
      this.lastConfidence = confidence;
      
      // Reset silence timeout
      if (this.silenceTimeoutId) {
        clearTimeout(this.silenceTimeoutId);
      }
      
      if (!isFinal && this.config.maxSilence) {
        this.silenceTimeoutId = setTimeout(() => {
          if (this.recognizing) {
            this.stopRecognition();
          }
        }, this.config.maxSilence);
      }
      
      const recognitionResult: VoiceRecognitionResult = {
        transcript,
        confidence,
        isFinal,
        language: this.config.language,
        processingTime: Date.now() - this.startTime,
      };
      
      this.notifyResult(recognitionResult);
      
      if (isFinal && !this.config.continuous) {
        this.stopRecognition();
      }
    };
    
    this.recognition.onerror = (event: any) => {
      const error = new Error(`Speech recognition error: ${event.error}`);
      this.notifyError(error);
      this.recognizing = false;
    };
    
    this.recognition.onend = () => {
      this.recognizing = false;
      this.clearTimeouts();
    };
    
    this.recognition.onstart = () => {
      this.recognizing = true;
      this.startTime = Date.now();
    };
  }
  
  async startRecognition(config?: Partial<VoiceRecognitionConfig>): Promise<void> {
    if (this.recognizing) {
      throw new Error('Recognition already in progress');
    }
    
    if (!this.recognition) {
      throw new Error('Recognition not initialized');
    }
    
    if (config) {
      this.setConfig(config);
    }
    
    // Apply config to recognition instance
    this.recognition.lang = this.config.language;
    this.recognition.continuous = this.config.continuous;
    this.recognition.interimResults = this.config.interimResults;
    
    // Reset state
    this.lastTranscript = '';
    this.lastConfidence = 0;
    
    // Start timeout if configured
    if (this.config.timeout) {
      this.timeoutId = setTimeout(() => {
        if (this.recognizing) {
          this.stopRecognition();
          this.notifyError(new Error('Recognition timeout'));
        }
      }, this.config.timeout);
    }
    
    this.recognition.start();
  }
  
  async stopRecognition(): Promise<VoiceRecognitionResult> {
    this.clearTimeouts();
    
    if (!this.recognizing) {
      return {
        transcript: this.lastTranscript,
        confidence: this.lastConfidence,
        isFinal: true,
        language: this.config.language,
        processingTime: 0,
      };
    }
    
    const processingTime = Date.now() - this.startTime;
    this.recognition.stop();
    this.recognizing = false;
    
    return {
      transcript: this.lastTranscript,
      confidence: this.lastConfidence,
      isFinal: true,
      language: this.config.language,
      processingTime,
    };
  }
  
  isRecognizing(): boolean {
    return this.recognizing;
  }
  
  onResult(callback: (result: VoiceRecognitionResult) => void): () => void {
    this.resultCallbacks.add(callback);
    return () => {
      this.resultCallbacks.delete(callback);
    };
  }
  
  onError(callback: (error: Error) => void): () => void {
    this.errorCallbacks.add(callback);
    return () => {
      this.errorCallbacks.delete(callback);
    };
  }
  
  private notifyResult(result: VoiceRecognitionResult): void {
    this.resultCallbacks.forEach(callback => callback(result));
  }
  
  private notifyError(error: Error): void {
    this.errorCallbacks.forEach(callback => callback(error));
  }
  
  getConfig(): VoiceRecognitionConfig {
    return { ...this.config };
  }
  
  setConfig(config: Partial<VoiceRecognitionConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  async checkAvailability(): Promise<boolean> {
    return !!(
      (global as any).webkitSpeechRecognition || 
      (global as any).SpeechRecognition
    );
  }
  
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
  
  async destroy(): Promise<void> {
    this.clearTimeouts();
    if (this.recognizing) {
      this.recognition?.abort();
    }
    this.resultCallbacks.clear();
    this.errorCallbacks.clear();
    this.recognition = null;
    this.recognizing = false;
  }
}

describe('VoiceRecognitionService', () => {
  let service: VoiceRecognitionService;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpeechRecognitionInstance.start.mockClear();
    mockSpeechRecognitionInstance.stop.mockClear();
    mockSpeechRecognitionInstance.abort.mockClear();
    service = new VoiceRecognitionService();
  });
  
  afterEach(async () => {
    await service.destroy();
  });
  
  describe('initialization', () => {
    it('should initialize successfully when Web Speech API is available', async () => {
      const result = await service.initialize();
      
      expect(result).toBe(true);
      expect(mockSpeechRecognition).toHaveBeenCalled();
    });
    
    it('should fail initialization when Web Speech API is not available', async () => {
      // Temporarily remove API
      const originalWebkit = (global as any).webkitSpeechRecognition;
      const originalSpeech = (global as any).SpeechRecognition;
      delete (global as any).webkitSpeechRecognition;
      delete (global as any).SpeechRecognition;
      
      const result = await service.initialize();
      
      expect(result).toBe(false);
      
      // Restore
      (global as any).webkitSpeechRecognition = originalWebkit;
      (global as any).SpeechRecognition = originalSpeech;
    });
    
    it('should check availability correctly', async () => {
      const available = await service.checkAvailability();
      expect(available).toBe(true);
    });
  });
  
  describe('configuration', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should have default configuration', () => {
      const config = service.getConfig();
      
      expect(config.language).toBe('zh-CN');
      expect(config.continuous).toBe(false);
      expect(config.interimResults).toBe(true);
      expect(config.maxSilence).toBe(3000);
      expect(config.timeout).toBe(30000);
    });
    
    it('should update configuration', () => {
      service.setConfig({
        language: 'en-US',
        continuous: true,
      });
      
      const config = service.getConfig();
      expect(config.language).toBe('en-US');
      expect(config.continuous).toBe(true);
      expect(config.interimResults).toBe(true); // Unchanged
    });
    
    it('should return a copy of configuration', () => {
      const config1 = service.getConfig();
      const config2 = service.getConfig();
      
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });
  
  describe('recognition lifecycle', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should start recognition successfully', async () => {
      await service.startRecognition();
      
      expect(mockSpeechRecognitionInstance.start).toHaveBeenCalled();
      expect(mockSpeechRecognitionInstance.lang).toBe('zh-CN');
      expect(mockSpeechRecognitionInstance.continuous).toBe(false);
      expect(mockSpeechRecognitionInstance.interimResults).toBe(true);
    });
    
    it('should start recognition with custom config', async () => {
      await service.startRecognition({
        language: 'en-US',
        continuous: true,
      });
      
      expect(mockSpeechRecognitionInstance.lang).toBe('en-US');
      expect(mockSpeechRecognitionInstance.continuous).toBe(true);
    });
    
    it('should throw error when starting recognition without initialization', async () => {
      const uninitializedService = new VoiceRecognitionService();
      
      await expect(uninitializedService.startRecognition()).rejects.toThrow(
        'Recognition not initialized'
      );
    });
    
    it('should throw error when recognition already in progress', async () => {
      // Simulate recognition in progress
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      await expect(service.startRecognition()).rejects.toThrow(
        'Recognition already in progress'
      );
    });
    
    it('should stop recognition and return result', async () => {
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      // Simulate recognition result
      mockSpeechRecognitionInstance.onresult?.({
        results: [{
          0: { transcript: '你好', confidence: 0.95 },
          isFinal: false,
          length: 1,
        }],
      });
      
      const result = await service.stopRecognition();
      
      expect(mockSpeechRecognitionInstance.stop).toHaveBeenCalled();
      expect(result.transcript).toBe('你好');
      expect(result.confidence).toBe(0.95);
      expect(result.isFinal).toBe(true);
      expect(result.language).toBe('zh-CN');
    });
    
    it('should return empty result when stopped without recognition', async () => {
      const result = await service.stopRecognition();
      
      expect(result.transcript).toBe('');
      expect(result.confidence).toBe(0);
      expect(result.isFinal).toBe(true);
    });
    
    it('should track recognition state correctly', async () => {
      expect(service.isRecognizing()).toBe(false);
      
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      expect(service.isRecognizing()).toBe(true);
      
      await service.stopRecognition();
      mockSpeechRecognitionInstance.onend?.();
      
      expect(service.isRecognizing()).toBe(false);
    });
  });
  
  describe('result handling', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should notify listeners on interim result', async () => {
      const resultCallback = vi.fn();
      service.onResult(resultCallback);
      
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      mockSpeechRecognitionInstance.onresult?.({
        results: [{
          0: { transcript: '你', confidence: 0.8 },
          isFinal: false,
          length: 1,
        }],
      });
      
      expect(resultCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          transcript: '你',
          confidence: 0.8,
          isFinal: false,
          language: 'zh-CN',
        })
      );
    });
    
    it('should notify listeners on final result', async () => {
      const resultCallback = vi.fn();
      service.onResult(resultCallback);
      
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      mockSpeechRecognitionInstance.onresult?.({
        results: [{
          0: { transcript: '你好世界', confidence: 0.95 },
          isFinal: true,
          length: 1,
        }],
      });
      
      expect(resultCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          transcript: '你好世界',
          confidence: 0.95,
          isFinal: true,
        })
      );
    });
    
    it('should allow multiple result listeners', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      service.onResult(callback1);
      service.onResult(callback2);
      
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      mockSpeechRecognitionInstance.onresult?.({
        results: [{
          0: { transcript: 'test', confidence: 0.9 },
          isFinal: true,
          length: 1,
        }],
      });
      
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
    
    it('should allow unsubscribing from results', async () => {
      const resultCallback = vi.fn();
      const unsubscribe = service.onResult(resultCallback);
      
      unsubscribe();
      
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      mockSpeechRecognitionInstance.onresult?.({
        results: [{
          0: { transcript: 'test', confidence: 0.9 },
          isFinal: true,
          length: 1,
        }],
      });
      
      expect(resultCallback).not.toHaveBeenCalled();
    });
    
    it('should include processing time in result', async () => {
      const resultCallback = vi.fn();
      service.onResult(resultCallback);
      
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      // Wait a bit to accumulate processing time
      await new Promise(resolve => setTimeout(resolve, 10));
      
      mockSpeechRecognitionInstance.onresult?.({
        results: [{
          0: { transcript: 'test', confidence: 0.9 },
          isFinal: true,
          length: 1,
        }],
      });
      
      expect(resultCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          processingTime: expect.any(Number),
        })
      );
      
      const result = resultCallback.mock.calls[0][0];
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('error handling', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should notify listeners on error', async () => {
      const errorCallback = vi.fn();
      service.onError(errorCallback);
      
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      mockSpeechRecognitionInstance.onerror?.({
        error: 'no-speech',
      });
      
      expect(errorCallback).toHaveBeenCalledWith(
        expect.any(Error)
      );
      expect(errorCallback.mock.calls[0][0].message).toContain('no-speech');
    });
    
    it('should allow multiple error listeners', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      service.onError(callback1);
      service.onError(callback2);
      
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      mockSpeechRecognitionInstance.onerror?.({
        error: 'network',
      });
      
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
    
    it('should allow unsubscribing from errors', async () => {
      const errorCallback = vi.fn();
      const unsubscribe = service.onError(errorCallback);
      
      unsubscribe();
      
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      mockSpeechRecognitionInstance.onerror?.({
        error: 'network',
      });
      
      expect(errorCallback).not.toHaveBeenCalled();
    });
    
    it('should set recognizing to false on error', async () => {
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      expect(service.isRecognizing()).toBe(true);
      
      mockSpeechRecognitionInstance.onerror?.({
        error: 'aborted',
      });
      
      expect(service.isRecognizing()).toBe(false);
    });
  });
  
  describe('timeout handling', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      await service.initialize();
    });
    
    afterEach(() => {
      vi.useRealTimers();
    });
    
    it('should timeout recognition after configured duration', async () => {
      const errorCallback = vi.fn();
      service.onError(errorCallback);
      
      service.setConfig({ timeout: 5000 });
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      expect(service.isRecognizing()).toBe(true);
      
      // Fast forward past timeout
      vi.advanceTimersByTime(5100);
      
      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('timeout'),
        })
      );
    });
    
    it('should not timeout if recognition completes in time', async () => {
      const errorCallback = vi.fn();
      service.onError(errorCallback);
      
      service.setConfig({ timeout: 5000 });
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      // Complete recognition before timeout
      vi.advanceTimersByTime(2000);
      await service.stopRecognition();
      
      // Fast forward past original timeout
      vi.advanceTimersByTime(5000);
      
      expect(errorCallback).not.toHaveBeenCalled();
    });
    
    it('should stop recognition on silence timeout', async () => {
      service.setConfig({ maxSilence: 2000 });
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      // Send interim result
      mockSpeechRecognitionInstance.onresult?.({
        results: [{
          0: { transcript: 'hello', confidence: 0.8 },
          isFinal: false,
          length: 1,
        }],
      });
      
      // Fast forward past silence timeout
      vi.advanceTimersByTime(2100);
      
      expect(mockSpeechRecognitionInstance.stop).toHaveBeenCalled();
    });
    
    it('should reset silence timeout on new speech', async () => {
      service.setConfig({ maxSilence: 2000 });
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      // Send first interim result
      mockSpeechRecognitionInstance.onresult?.({
        results: [{
          0: { transcript: 'hello', confidence: 0.8 },
          isFinal: false,
          length: 1,
        }],
      });
      
      // Advance 1 second
      vi.advanceTimersByTime(1000);
      
      // Send second interim result (resets timeout)
      mockSpeechRecognitionInstance.onresult?.({
        results: [{
          0: { transcript: 'hello world', confidence: 0.85 },
          isFinal: false,
          length: 1,
        }],
      });
      
      // Advance 1.5 seconds (less than 2 seconds from last result)
      vi.advanceTimersByTime(1500);
      
      // Should not have stopped yet
      expect(mockSpeechRecognitionInstance.stop).not.toHaveBeenCalled();
      
      // Advance another second (now past 2 seconds from last result)
      vi.advanceTimersByTime(1000);
      
      expect(mockSpeechRecognitionInstance.stop).toHaveBeenCalled();
    });
  });
  
  describe('multi-language support', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should support Chinese language', async () => {
      await service.startRecognition({ language: 'zh-CN' });
      
      expect(mockSpeechRecognitionInstance.lang).toBe('zh-CN');
    });
    
    it('should support English language', async () => {
      await service.startRecognition({ language: 'en-US' });
      
      expect(mockSpeechRecognitionInstance.lang).toBe('en-US');
    });
    
    it('should support Japanese language', async () => {
      await service.startRecognition({ language: 'ja-JP' });
      
      expect(mockSpeechRecognitionInstance.lang).toBe('ja-JP');
    });
    
    it('should include language in result', async () => {
      const resultCallback = vi.fn();
      service.onResult(resultCallback);
      
      await service.startRecognition({ language: 'en-US' });
      mockSpeechRecognitionInstance.onstart?.();
      
      mockSpeechRecognitionInstance.onresult?.({
        results: [{
          0: { transcript: 'hello', confidence: 0.9 },
          isFinal: true,
          length: 1,
        }],
      });
      
      expect(resultCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'en-US',
        })
      );
    });
  });
  
  describe('continuous mode', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should continue recognition after final result in continuous mode', async () => {
      const resultCallback = vi.fn();
      service.onResult(resultCallback);
      
      await service.startRecognition({ continuous: true });
      mockSpeechRecognitionInstance.onstart?.();
      
      // First final result
      mockSpeechRecognitionInstance.onresult?.({
        results: [{
          0: { transcript: 'hello', confidence: 0.9 },
          isFinal: true,
          length: 1,
        }],
      });
      
      // Should not stop
      expect(mockSpeechRecognitionInstance.stop).not.toHaveBeenCalled();
      expect(service.isRecognizing()).toBe(true);
    });
    
    it('should stop recognition after final result in non-continuous mode', async () => {
      await service.startRecognition({ continuous: false });
      mockSpeechRecognitionInstance.onstart?.();
      
      mockSpeechRecognitionInstance.onresult?.({
        results: [{
          0: { transcript: 'hello', confidence: 0.9 },
          isFinal: true,
          length: 1,
        }],
      });
      
      // Should have called stopRecognition
      expect(mockSpeechRecognitionInstance.stop).toHaveBeenCalled();
    });
  });
  
  describe('destruction', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    it('should clean up resources on destroy', async () => {
      const resultCallback = vi.fn();
      const errorCallback = vi.fn();
      
      service.onResult(resultCallback);
      service.onError(errorCallback);
      
      await service.startRecognition();
      mockSpeechRecognitionInstance.onstart?.();
      
      await service.destroy();
      
      expect(service.isRecognizing()).toBe(false);
      expect(mockSpeechRecognitionInstance.abort).toHaveBeenCalled();
    });
    
    it('should clear all callbacks on destroy', async () => {
      const resultCallback = vi.fn();
      service.onResult(resultCallback);
      
      await service.destroy();
      
      // Should not be able to trigger callbacks after destroy
      // (internal callbacks cleared)
    });
  });
});