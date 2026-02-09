/**
 * Voice API IPC 处理器
 * T093 [US5] 实现 Voice API IPC 处理器
 *
 * 处理渲染进程与主进程之间的语音服务 IPC 通信
 * 桥接主进程语音服务与渲染进程的 Web Speech API
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { getLogger } from '../logger';
import {
  getVoiceRecognitionService,
  VoiceRecognitionService,
} from '../services/voice-recognition';
import {
  getVoiceSynthesisService,
  VoiceSynthesisService,
} from '../services/voice-synthesis';
import type {
  VoiceRecognitionConfig,
  VoiceRecognitionResult,
  VoiceSynthesisConfig,
  VoiceSynthesisResult,
  VoiceInfo,
} from '../../shared/types/capabilities';

const logger = getLogger('voice-handler');

// ============================================================================
// IPC Channel 定义
// ============================================================================

/**
 * Voice IPC Channels
 */
export const VoiceChannels = {
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
  SYNTHESIS_IS_SPEAKING: 'voice:synthesis-is-speaking',
  SYNTHESIS_GET_CONFIG: 'voice:synthesis-get-config',
  SYNTHESIS_SET_CONFIG: 'voice:synthesis-set-config',
  SYNTHESIS_GET_VOICES: 'voice:synthesis-get-voices',
  SYNTHESIS_SET_VOICE: 'voice:synthesis-set-voice',
  
  // 可用性检查
  CHECK_AVAILABILITY: 'voice:check-availability',
  
  // 渲染进程回调（从渲染进程发送到主进程）
  CALLBACK_RECOGNITION_RESULT: 'voice:callback-recognition-result',
  CALLBACK_RECOGNITION_ERROR: 'voice:callback-recognition-error',
  CALLBACK_RECOGNITION_START: 'voice:callback-recognition-start',
  CALLBACK_RECOGNITION_END: 'voice:callback-recognition-end',
  CALLBACK_RECOGNITION_AUDIO_START: 'voice:callback-recognition-audio-start',
  CALLBACK_RECOGNITION_AUDIO_END: 'voice:callback-recognition-audio-end',
  CALLBACK_RECOGNITION_SPEECH_START: 'voice:callback-recognition-speech-start',
  CALLBACK_RECOGNITION_SPEECH_END: 'voice:callback-recognition-speech-end',
  CALLBACK_SYNTHESIS_START: 'voice:callback-synthesis-start',
  CALLBACK_SYNTHESIS_END: 'voice:callback-synthesis-end',
  CALLBACK_SYNTHESIS_PAUSE: 'voice:callback-synthesis-pause',
  CALLBACK_SYNTHESIS_RESUME: 'voice:callback-synthesis-resume',
  CALLBACK_SYNTHESIS_ERROR: 'voice:callback-synthesis-error',
  CALLBACK_SYNTHESIS_VOICES: 'voice:callback-synthesis-voices',
  
  // 事件（从主进程发送到渲染进程）
  EVENT_RECOGNITION_RESULT: 'voice:event-recognition-result',
  EVENT_RECOGNITION_ERROR: 'voice:event-recognition-error',
  EVENT_RECOGNITION_STATE_CHANGE: 'voice:event-recognition-state-change',
  EVENT_SYNTHESIS_STATE_CHANGE: 'voice:event-synthesis-state-change',
  EVENT_SYNTHESIS_BOUNDARY: 'voice:event-synthesis-boundary',
} as const;

// ============================================================================
// 类型定义
// ============================================================================

/**
 * IPC 错误接口
 */
interface IPCError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * 语音合成请求参数
 */
interface SpeakRequest {
  text: string;
  config?: Partial<VoiceSynthesisConfig>;
}

/**
 * 可用性检查结果
 */
interface VoiceAvailabilityResult {
  recognition: boolean;
  synthesis: boolean;
  reason?: string;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 创建 IPC 错误对象
 */
function createIPCError(code: string, message: string, details?: unknown): IPCError {
  return {
    code,
    message,
    details,
  };
}

/**
 * 验证文本
 */
function validateText(text: unknown, fieldName = 'text'): string {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw createIPCError('ERR_INVALID_INPUT', `${fieldName} must be a non-empty string`);
  }
  return text;
}

/**
 * 获取服务实例
 */
function getServices(): {
  recognition: VoiceRecognitionService;
  synthesis: VoiceSynthesisService;
} {
  return {
    recognition: getVoiceRecognitionService(),
    synthesis: getVoiceSynthesisService(),
  };
}

/**
 * 广播事件到所有窗口
 */
function broadcastToAllWindows(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows();
  for (const window of windows) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, data);
    }
  }
}

// ============================================================================
// 语音识别 IPC 处理器
// ============================================================================

/**
 * 处理开始语音识别请求
 * 返回识别配置供渲染进程使用
 */
async function handleRecognitionStart(
  _event: IpcMainInvokeEvent,
  config?: Partial<VoiceRecognitionConfig>
): Promise<VoiceRecognitionConfig> {
  try {
    logger.debug('Handle recognition start request', { config });
    const { recognition } = getServices();
    
    const recognitionConfig = recognition.startRecognition(config);
    
    logger.info('Recognition started', { config: recognitionConfig });
    return recognitionConfig;
  } catch (error) {
    logger.error('Failed to start recognition', error);
    
    if ((error as IPCError).code) {
      throw error;
    }
    
    throw createIPCError('ERR_RECOGNITION_START', `Failed to start recognition: ${error}`);
  }
}

/**
 * 处理停止语音识别请求
 */
async function handleRecognitionStop(
  _event: IpcMainInvokeEvent
): Promise<VoiceRecognitionResult> {
  try {
    logger.debug('Handle recognition stop request');
    const { recognition } = getServices();
    
    const result = recognition.stopRecognition();
    
    logger.info('Recognition stopped', { result });
    return result;
  } catch (error) {
    logger.error('Failed to stop recognition', error);
    
    if ((error as IPCError).code) {
      throw error;
    }
    
    throw createIPCError('ERR_RECOGNITION_STOP', `Failed to stop recognition: ${error}`);
  }
}

/**
 * 处理中止语音识别请求
 */
async function handleRecognitionAbort(_event: IpcMainInvokeEvent): Promise<void> {
  try {
    logger.debug('Handle recognition abort request');
    const { recognition } = getServices();
    
    recognition.abortRecognition();
    
    logger.info('Recognition aborted');
  } catch (error) {
    logger.error('Failed to abort recognition', error);
    
    if ((error as IPCError).code) {
      throw error;
    }
    
    throw createIPCError('ERR_RECOGNITION_ABORT', `Failed to abort recognition: ${error}`);
  }
}

/**
 * 处理检查是否正在识别请求
 */
async function handleRecognitionIsActive(
  _event: IpcMainInvokeEvent
): Promise<boolean> {
  try {
    const { recognition } = getServices();
    return recognition.isRecognizing();
  } catch (error) {
    logger.error('Failed to check recognition status', error);
    return false;
  }
}

/**
 * 处理获取识别配置请求
 */
async function handleRecognitionGetConfig(
  _event: IpcMainInvokeEvent
): Promise<VoiceRecognitionConfig> {
  try {
    const { recognition } = getServices();
    return recognition.getConfig();
  } catch (error) {
    logger.error('Failed to get recognition config', error);
    throw createIPCError('ERR_RECOGNITION_CONFIG', `Failed to get config: ${error}`);
  }
}

/**
 * 处理设置识别配置请求
 */
async function handleRecognitionSetConfig(
  _event: IpcMainInvokeEvent,
  config: Partial<VoiceRecognitionConfig>
): Promise<void> {
  try {
    logger.debug('Handle set recognition config', { config });
    const { recognition } = getServices();
    
    recognition.setConfig(config);
    
    logger.info('Recognition config updated');
  } catch (error) {
    logger.error('Failed to set recognition config', error);
    throw createIPCError('ERR_RECOGNITION_CONFIG', `Failed to set config: ${error}`);
  }
}

// ============================================================================
// 渲染进程回调处理器（语音识别）
// ============================================================================

/**
 * 处理渲染进程的识别结果回调
 */
async function handleCallbackRecognitionResult(
  event: IpcMainInvokeEvent,
  transcript: string,
  confidence: number,
  isFinal: boolean
): Promise<void> {
  try {
    logger.debug('Callback: recognition result', { transcript, confidence, isFinal });
    const { recognition } = getServices();
    
    recognition.handleResult(transcript, confidence, isFinal);
    
    // 广播结果到所有窗口（以便其他组件监听）
    broadcastToAllWindows(VoiceChannels.EVENT_RECOGNITION_RESULT, {
      transcript,
      confidence,
      isFinal,
      language: recognition.getConfig().language,
    });
  } catch (error) {
    logger.error('Failed to handle recognition result callback', error);
  }
}

/**
 * 处理渲染进程的识别错误回调
 */
async function handleCallbackRecognitionError(
  _event: IpcMainInvokeEvent,
  errorCode: string,
  errorMessage?: string
): Promise<void> {
  try {
    logger.debug('Callback: recognition error', { errorCode, errorMessage });
    const { recognition } = getServices();
    
    recognition.handleError(errorCode, errorMessage);
    
    // 广播错误
    broadcastToAllWindows(VoiceChannels.EVENT_RECOGNITION_ERROR, {
      code: errorCode,
      message: errorMessage,
    });
  } catch (error) {
    logger.error('Failed to handle recognition error callback', error);
  }
}

/**
 * 处理渲染进程的识别开始回调
 */
async function handleCallbackRecognitionStart(
  _event: IpcMainInvokeEvent
): Promise<void> {
  try {
    logger.debug('Callback: recognition started');
    
    broadcastToAllWindows(VoiceChannels.EVENT_RECOGNITION_STATE_CHANGE, {
      state: 'started',
      isRecognizing: true,
    });
  } catch (error) {
    logger.error('Failed to handle recognition start callback', error);
  }
}

/**
 * 处理渲染进程的识别结束回调
 */
async function handleCallbackRecognitionEnd(
  _event: IpcMainInvokeEvent
): Promise<void> {
  try {
    logger.debug('Callback: recognition ended');
    
    broadcastToAllWindows(VoiceChannels.EVENT_RECOGNITION_STATE_CHANGE, {
      state: 'ended',
      isRecognizing: false,
    });
  } catch (error) {
    logger.error('Failed to handle recognition end callback', error);
  }
}

/**
 * 处理渲染进程的音频开始回调
 */
async function handleCallbackRecognitionAudioStart(
  _event: IpcMainInvokeEvent
): Promise<void> {
  try {
    logger.debug('Callback: recognition audio started');
    const { recognition } = getServices();
    recognition.handleAudioStart();
  } catch (error) {
    logger.error('Failed to handle audio start callback', error);
  }
}

/**
 * 处理渲染进程的音频结束回调
 */
async function handleCallbackRecognitionAudioEnd(
  _event: IpcMainInvokeEvent
): Promise<void> {
  try {
    logger.debug('Callback: recognition audio ended');
    const { recognition } = getServices();
    recognition.handleAudioEnd();
  } catch (error) {
    logger.error('Failed to handle audio end callback', error);
  }
}

/**
 * 处理渲染进程的语音开始回调
 */
async function handleCallbackRecognitionSpeechStart(
  _event: IpcMainInvokeEvent
): Promise<void> {
  try {
    logger.debug('Callback: recognition speech started');
    const { recognition } = getServices();
    recognition.handleSpeechStart();
  } catch (error) {
    logger.error('Failed to handle speech start callback', error);
  }
}

/**
 * 处理渲染进程的语音结束回调
 */
async function handleCallbackRecognitionSpeechEnd(
  _event: IpcMainInvokeEvent
): Promise<void> {
  try {
    logger.debug('Callback: recognition speech ended');
    const { recognition } = getServices();
    recognition.handleSpeechEnd();
  } catch (error) {
    logger.error('Failed to handle speech end callback', error);
  }
}

// ============================================================================
// 语音合成 IPC 处理器
// ============================================================================

/**
 * 处理语音合成播放请求
 * 返回合成配置供渲染进程使用
 */
async function handleSynthesisSpeak(
  _event: IpcMainInvokeEvent,
  request: SpeakRequest
): Promise<{ text: string; config: VoiceSynthesisConfig }> {
  try {
    logger.debug('Handle synthesis speak request', { textLength: request?.text?.length });
    const { synthesis } = getServices();
    
    const text = validateText(request?.text);
    const result = synthesis.synthesize(text, request?.config);
    
    logger.info('Synthesis prepared', { textLength: text.length, config: result.config });
    return result;
  } catch (error) {
    logger.error('Failed to prepare synthesis', error);
    
    if ((error as IPCError).code) {
      throw error;
    }
    
    throw createIPCError('ERR_SYNTHESIS_SPEAK', `Failed to prepare synthesis: ${error}`);
  }
}

/**
 * 处理停止语音合成请求
 */
async function handleSynthesisStop(_event: IpcMainInvokeEvent): Promise<void> {
  try {
    logger.debug('Handle synthesis stop request');
    const { synthesis } = getServices();
    
    synthesis.stopSpeaking();
    
    logger.info('Synthesis stopped');
  } catch (error) {
    logger.error('Failed to stop synthesis', error);
    throw createIPCError('ERR_SYNTHESIS_STOP', `Failed to stop synthesis: ${error}`);
  }
}

/**
 * 处理暂停语音合成请求
 */
async function handleSynthesisPause(_event: IpcMainInvokeEvent): Promise<void> {
  try {
    logger.debug('Handle synthesis pause request');
    const { synthesis } = getServices();
    
    synthesis.pauseSpeaking();
    
    logger.info('Synthesis paused');
  } catch (error) {
    logger.error('Failed to pause synthesis', error);
    throw createIPCError('ERR_SYNTHESIS_PAUSE', `Failed to pause synthesis: ${error}`);
  }
}

/**
 * 处理恢复语音合成请求
 */
async function handleSynthesisResume(_event: IpcMainInvokeEvent): Promise<void> {
  try {
    logger.debug('Handle synthesis resume request');
    const { synthesis } = getServices();
    
    synthesis.resumeSpeaking();
    
    logger.info('Synthesis resumed');
  } catch (error) {
    logger.error('Failed to resume synthesis', error);
    throw createIPCError('ERR_SYNTHESIS_RESUME', `Failed to resume synthesis: ${error}`);
  }
}

/**
 * 处理检查是否正在播放请求
 */
async function handleSynthesisIsSpeaking(
  _event: IpcMainInvokeEvent
): Promise<boolean> {
  try {
    const { synthesis } = getServices();
    return synthesis.isSpeaking();
  } catch (error) {
    logger.error('Failed to check synthesis status', error);
    return false;
  }
}

/**
 * 处理获取合成配置请求
 */
async function handleSynthesisGetConfig(
  _event: IpcMainInvokeEvent
): Promise<VoiceSynthesisConfig> {
  try {
    const { synthesis } = getServices();
    return synthesis.getConfig();
  } catch (error) {
    logger.error('Failed to get synthesis config', error);
    throw createIPCError('ERR_SYNTHESIS_CONFIG', `Failed to get config: ${error}`);
  }
}

/**
 * 处理设置合成配置请求
 */
async function handleSynthesisSetConfig(
  _event: IpcMainInvokeEvent,
  config: Partial<VoiceSynthesisConfig>
): Promise<void> {
  try {
    logger.debug('Handle set synthesis config', { config });
    const { synthesis } = getServices();
    
    synthesis.setConfig(config);
    
    logger.info('Synthesis config updated');
  } catch (error) {
    logger.error('Failed to set synthesis config', error);
    throw createIPCError('ERR_SYNTHESIS_CONFIG', `Failed to set config: ${error}`);
  }
}

/**
 * 处理获取可用语音列表请求
 */
async function handleSynthesisGetVoices(
  _event: IpcMainInvokeEvent
): Promise<VoiceInfo[]> {
  try {
    const { synthesis } = getServices();
    return synthesis.getAvailableVoices();
  } catch (error) {
    logger.error('Failed to get voices', error);
    throw createIPCError('ERR_SYNTHESIS_VOICES', `Failed to get voices: ${error}`);
  }
}

/**
 * 处理设置语音请求
 */
async function handleSynthesisSetVoice(
  _event: IpcMainInvokeEvent,
  voiceId: string
): Promise<void> {
  try {
    logger.debug('Handle set voice', { voiceId });
    const { synthesis } = getServices();
    
    synthesis.setVoice(voiceId);
    
    logger.info('Voice set', { voiceId });
  } catch (error) {
    logger.error('Failed to set voice', error);
    throw createIPCError('ERR_SYNTHESIS_VOICE', `Failed to set voice: ${error}`);
  }
}

// ============================================================================
// 渲染进程回调处理器（语音合成）
// ============================================================================

/**
 * 处理渲染进程的合成开始回调
 */
async function handleCallbackSynthesisStart(
  _event: IpcMainInvokeEvent,
  text: string
): Promise<void> {
  try {
    logger.debug('Callback: synthesis started', { textLength: text?.length });
    const { synthesis } = getServices();
    
    synthesis.handleSpeakStart(text);
    
    broadcastToAllWindows(VoiceChannels.EVENT_SYNTHESIS_STATE_CHANGE, {
      state: 'started',
      isSpeaking: true,
    });
  } catch (error) {
    logger.error('Failed to handle synthesis start callback', error);
  }
}

/**
 * 处理渲染进程的合成结束回调
 */
async function handleCallbackSynthesisEnd(
  _event: IpcMainInvokeEvent
): Promise<VoiceSynthesisResult | null> {
  try {
    logger.debug('Callback: synthesis ended');
    const { synthesis } = getServices();
    
    const result = synthesis.handleSpeakEnd();
    
    broadcastToAllWindows(VoiceChannels.EVENT_SYNTHESIS_STATE_CHANGE, {
      state: 'ended',
      isSpeaking: false,
      result,
    });
    
    return result;
  } catch (error) {
    logger.error('Failed to handle synthesis end callback', error);
    return null;
  }
}

/**
 * 处理渲染进程的合成暂停回调
 */
async function handleCallbackSynthesisPause(
  _event: IpcMainInvokeEvent
): Promise<void> {
  try {
    logger.debug('Callback: synthesis paused');
    const { synthesis } = getServices();
    
    synthesis.handlePause();
    
    broadcastToAllWindows(VoiceChannels.EVENT_SYNTHESIS_STATE_CHANGE, {
      state: 'paused',
      isSpeaking: true,
      isPaused: true,
    });
  } catch (error) {
    logger.error('Failed to handle synthesis pause callback', error);
  }
}

/**
 * 处理渲染进程的合成恢复回调
 */
async function handleCallbackSynthesisResume(
  _event: IpcMainInvokeEvent
): Promise<void> {
  try {
    logger.debug('Callback: synthesis resumed');
    const { synthesis } = getServices();
    
    synthesis.handleResume();
    
    broadcastToAllWindows(VoiceChannels.EVENT_SYNTHESIS_STATE_CHANGE, {
      state: 'resumed',
      isSpeaking: true,
      isPaused: false,
    });
  } catch (error) {
    logger.error('Failed to handle synthesis resume callback', error);
  }
}

/**
 * 处理渲染进程的合成错误回调
 */
async function handleCallbackSynthesisError(
  _event: IpcMainInvokeEvent,
  errorCode: string,
  errorMessage?: string
): Promise<void> {
  try {
    logger.debug('Callback: synthesis error', { errorCode, errorMessage });
    const { synthesis } = getServices();
    
    synthesis.handleError(errorCode, errorMessage);
    
    broadcastToAllWindows(VoiceChannels.EVENT_SYNTHESIS_STATE_CHANGE, {
      state: 'error',
      isSpeaking: false,
      error: { code: errorCode, message: errorMessage },
    });
  } catch (error) {
    logger.error('Failed to handle synthesis error callback', error);
  }
}

/**
 * 处理渲染进程的语音列表更新回调
 */
async function handleCallbackSynthesisVoices(
  _event: IpcMainInvokeEvent,
  voices: VoiceInfo[]
): Promise<void> {
  try {
    logger.debug('Callback: synthesis voices updated', { count: voices?.length });
    const { synthesis } = getServices();
    
    synthesis.updateAvailableVoices(voices);
  } catch (error) {
    logger.error('Failed to handle synthesis voices callback', error);
  }
}

// ============================================================================
// 可用性检查
// ============================================================================

/**
 * 处理检查语音功能可用性请求
 */
async function handleCheckAvailability(
  _event: IpcMainInvokeEvent
): Promise<VoiceAvailabilityResult> {
  try {
    logger.debug('Handle check availability request');
    const { recognition, synthesis } = getServices();
    
    const [recognitionAvailable, synthesisAvailable] = await Promise.all([
      recognition.checkAvailability(),
      synthesis.checkAvailability(),
    ]);
    
    const result: VoiceAvailabilityResult = {
      recognition: recognitionAvailable,
      synthesis: synthesisAvailable,
    };
    
    if (!recognitionAvailable && !synthesisAvailable) {
      result.reason = 'Web Speech API not supported in this environment';
    } else if (!recognitionAvailable) {
      result.reason = 'Speech recognition not available';
    } else if (!synthesisAvailable) {
      result.reason = 'Speech synthesis not available';
    }
    
    logger.info('Availability check completed', result);
    return result;
  } catch (error) {
    logger.error('Failed to check availability', error);
    return {
      recognition: false,
      synthesis: false,
      reason: `Failed to check availability: ${error}`,
    };
  }
}

// ============================================================================
// IPC 处理器注册
// ============================================================================

/**
 * 注册所有 Voice IPC 处理器
 */
export function registerVoiceHandlers(): void {
  logger.info('Registering Voice IPC handlers');
  
  // 语音识别
  ipcMain.handle(VoiceChannels.RECOGNITION_START, handleRecognitionStart);
  ipcMain.handle(VoiceChannels.RECOGNITION_STOP, handleRecognitionStop);
  ipcMain.handle(VoiceChannels.RECOGNITION_ABORT, handleRecognitionAbort);
  ipcMain.handle(VoiceChannels.RECOGNITION_IS_ACTIVE, handleRecognitionIsActive);
  ipcMain.handle(VoiceChannels.RECOGNITION_GET_CONFIG, handleRecognitionGetConfig);
  ipcMain.handle(VoiceChannels.RECOGNITION_SET_CONFIG, handleRecognitionSetConfig);
  
  // 语音合成
  ipcMain.handle(VoiceChannels.SYNTHESIS_SPEAK, handleSynthesisSpeak);
  ipcMain.handle(VoiceChannels.SYNTHESIS_STOP, handleSynthesisStop);
  ipcMain.handle(VoiceChannels.SYNTHESIS_PAUSE, handleSynthesisPause);
  ipcMain.handle(VoiceChannels.SYNTHESIS_RESUME, handleSynthesisResume);
  ipcMain.handle(VoiceChannels.SYNTHESIS_IS_SPEAKING, handleSynthesisIsSpeaking);
  ipcMain.handle(VoiceChannels.SYNTHESIS_GET_CONFIG, handleSynthesisGetConfig);
  ipcMain.handle(VoiceChannels.SYNTHESIS_SET_CONFIG, handleSynthesisSetConfig);
  ipcMain.handle(VoiceChannels.SYNTHESIS_GET_VOICES, handleSynthesisGetVoices);
  ipcMain.handle(VoiceChannels.SYNTHESIS_SET_VOICE, handleSynthesisSetVoice);
  
  // 可用性检查
  ipcMain.handle(VoiceChannels.CHECK_AVAILABILITY, handleCheckAvailability);
  
  // 渲染进程回调（语音识别）
  ipcMain.handle(VoiceChannels.CALLBACK_RECOGNITION_RESULT, handleCallbackRecognitionResult);
  ipcMain.handle(VoiceChannels.CALLBACK_RECOGNITION_ERROR, handleCallbackRecognitionError);
  ipcMain.handle(VoiceChannels.CALLBACK_RECOGNITION_START, handleCallbackRecognitionStart);
  ipcMain.handle(VoiceChannels.CALLBACK_RECOGNITION_END, handleCallbackRecognitionEnd);
  ipcMain.handle(VoiceChannels.CALLBACK_RECOGNITION_AUDIO_START, handleCallbackRecognitionAudioStart);
  ipcMain.handle(VoiceChannels.CALLBACK_RECOGNITION_AUDIO_END, handleCallbackRecognitionAudioEnd);
  ipcMain.handle(VoiceChannels.CALLBACK_RECOGNITION_SPEECH_START, handleCallbackRecognitionSpeechStart);
  ipcMain.handle(VoiceChannels.CALLBACK_RECOGNITION_SPEECH_END, handleCallbackRecognitionSpeechEnd);
  
  // 渲染进程回调（语音合成）
  ipcMain.handle(VoiceChannels.CALLBACK_SYNTHESIS_START, handleCallbackSynthesisStart);
  ipcMain.handle(VoiceChannels.CALLBACK_SYNTHESIS_END, handleCallbackSynthesisEnd);
  ipcMain.handle(VoiceChannels.CALLBACK_SYNTHESIS_PAUSE, handleCallbackSynthesisPause);
  ipcMain.handle(VoiceChannels.CALLBACK_SYNTHESIS_RESUME, handleCallbackSynthesisResume);
  ipcMain.handle(VoiceChannels.CALLBACK_SYNTHESIS_ERROR, handleCallbackSynthesisError);
  ipcMain.handle(VoiceChannels.CALLBACK_SYNTHESIS_VOICES, handleCallbackSynthesisVoices);
  
  logger.info('Voice IPC handlers registered', {
    recognitionChannels: Object.keys(VoiceChannels).filter(k => k.startsWith('RECOGNITION')).length,
    synthesisChannels: Object.keys(VoiceChannels).filter(k => k.startsWith('SYNTHESIS')).length,
    callbackChannels: Object.keys(VoiceChannels).filter(k => k.startsWith('CALLBACK')).length,
    eventChannels: Object.keys(VoiceChannels).filter(k => k.startsWith('EVENT')).length,
  });
}

/**
 * 注销所有 Voice IPC 处理器
 */
export function unregisterVoiceHandlers(): void {
  logger.info('Unregistering Voice IPC handlers');
  
  // 语音识别
  ipcMain.removeHandler(VoiceChannels.RECOGNITION_START);
  ipcMain.removeHandler(VoiceChannels.RECOGNITION_STOP);
  ipcMain.removeHandler(VoiceChannels.RECOGNITION_ABORT);
  ipcMain.removeHandler(VoiceChannels.RECOGNITION_IS_ACTIVE);
  ipcMain.removeHandler(VoiceChannels.RECOGNITION_GET_CONFIG);
  ipcMain.removeHandler(VoiceChannels.RECOGNITION_SET_CONFIG);
  
  // 语音合成
  ipcMain.removeHandler(VoiceChannels.SYNTHESIS_SPEAK);
  ipcMain.removeHandler(VoiceChannels.SYNTHESIS_STOP);
  ipcMain.removeHandler(VoiceChannels.SYNTHESIS_PAUSE);
  ipcMain.removeHandler(VoiceChannels.SYNTHESIS_RESUME);
  ipcMain.removeHandler(VoiceChannels.SYNTHESIS_IS_SPEAKING);
  ipcMain.removeHandler(VoiceChannels.SYNTHESIS_GET_CONFIG);
  ipcMain.removeHandler(VoiceChannels.SYNTHESIS_SET_CONFIG);
  ipcMain.removeHandler(VoiceChannels.SYNTHESIS_GET_VOICES);
  ipcMain.removeHandler(VoiceChannels.SYNTHESIS_SET_VOICE);
  
  // 可用性检查
  ipcMain.removeHandler(VoiceChannels.CHECK_AVAILABILITY);
  
  // 渲染进程回调（语音识别）
  ipcMain.removeHandler(VoiceChannels.CALLBACK_RECOGNITION_RESULT);
  ipcMain.removeHandler(VoiceChannels.CALLBACK_RECOGNITION_ERROR);
  ipcMain.removeHandler(VoiceChannels.CALLBACK_RECOGNITION_START);
  ipcMain.removeHandler(VoiceChannels.CALLBACK_RECOGNITION_END);
  ipcMain.removeHandler(VoiceChannels.CALLBACK_RECOGNITION_AUDIO_START);
  ipcMain.removeHandler(VoiceChannels.CALLBACK_RECOGNITION_AUDIO_END);
  ipcMain.removeHandler(VoiceChannels.CALLBACK_RECOGNITION_SPEECH_START);
  ipcMain.removeHandler(VoiceChannels.CALLBACK_RECOGNITION_SPEECH_END);
  
  // 渲染进程回调（语音合成）
  ipcMain.removeHandler(VoiceChannels.CALLBACK_SYNTHESIS_START);
  ipcMain.removeHandler(VoiceChannels.CALLBACK_SYNTHESIS_END);
  ipcMain.removeHandler(VoiceChannels.CALLBACK_SYNTHESIS_PAUSE);
  ipcMain.removeHandler(VoiceChannels.CALLBACK_SYNTHESIS_RESUME);
  ipcMain.removeHandler(VoiceChannels.CALLBACK_SYNTHESIS_ERROR);
  ipcMain.removeHandler(VoiceChannels.CALLBACK_SYNTHESIS_VOICES);
  
  logger.info('Voice IPC handlers unregistered');
}

// ============================================================================
// 导出
// ============================================================================

export type {
  IPCError,
  SpeakRequest,
  VoiceAvailabilityResult,
};