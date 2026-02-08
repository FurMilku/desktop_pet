/**
 * Preload Script for Desktop 3D Pet
 *
 * This script runs in a sandboxed environment with access to a limited
 * subset of Node.js APIs. It exposes safe IPC communication channels
 * to the renderer process via contextBridge.
 *
 * Security: contextIsolation=true, nodeIntegration=false, sandbox=true
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// ============================================================================
// Type Definitions (matching contracts/ipc-api.md)
// ============================================================================

// Window API Types
interface DisplayInfo {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
}

// Pet API Types
type AnimationState =
  | 'idle'
  | 'thinking'
  | 'happy'
  | 'sad'
  | 'confused'
  | 'drag'
  | 'listening'
  | 'celebrating'
  | 'sleepy'
  | 'curious';

interface AnimationOptions {
  transitionDuration?: number;
  loop?: boolean;
  nextState?: AnimationState;
}

interface PetPosition {
  x: number;
  y: number;
  monitor: number;
}

interface PetState {
  animation: AnimationState;
  position: PetPosition;
  skinId: string;
  emotionalValue: number;
}

// AI API Types
interface ConversationInfo {
  id: string;
  title: string | null;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface MessageInfo {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  createdAt: number;
}

interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

interface CreateConversationOptions {
  title?: string;
  systemPrompt?: string;
  providerId?: string;
}

interface AIProviderInfo {
  id: string;
  name: string;
  type: 'openai' | 'claude' | 'ollama' | 'custom';
  model: string;
  isLocal: boolean;
  enabled: boolean;
  hasApiKey: boolean;
}

interface ResponseStartEvent {
  requestId: string;
  conversationId: string;
}

interface ResponseChunkEvent {
  requestId: string;
  chunk: string;
  accumulated: string;
}

interface ResponseCompleteEvent {
  requestId: string;
  messageId: string;
  content: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

interface ResponseErrorEvent {
  requestId: string;
  error: string;
  code: string;
}

interface ToolCallEvent {
  requestId: string;
  tool: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'success' | 'error';
}

// Reminder API Types
interface CreateReminderInput {
  title: string;
  description?: string;
  triggerTime: number;
  repeatRule?: string;
  repeatEnd?: number;
}

interface UpdateReminderInput {
  title?: string;
  description?: string;
  triggerTime?: number;
  repeatRule?: string | null;
  repeatEnd?: number | null;
}

interface ListRemindersOptions {
  includeCompleted?: boolean;
  from?: number;
  to?: number;
  limit?: number;
}

interface ReminderInfo {
  id: string;
  title: string;
  description: string | null;
  triggerTime: number;
  repeatRule: string | null;
  completed: boolean;
  snoozedUntil: number | null;
  createdAt: number;
}

// Settings API Types
type SettingKey =
  | 'window.alwaysOnTop'
  | 'window.startMinimized'
  | 'window.opacity'
  | 'pet.idleTimeout'
  | 'pet.animationSpeed'
  | 'ai.defaultProvider'
  | 'ai.streamingEnabled'
  | 'chat.mode'
  | 'chat.maxHistory'
  | 'voice.enabled'
  | 'voice.autoSpeak'
  | 'voice.language'
  | 'system.autoStart'
  | 'system.checkUpdates'
  | 'telemetry.enabled'
  | 'mcp.enabledServers'
  | 'skills.enabledSkills';

interface Settings {
  window: {
    alwaysOnTop: boolean;
    startMinimized: boolean;
    opacity: number;
  };
  pet: {
    idleTimeout: number;
    animationSpeed: number;
  };
  ai: {
    defaultProvider: string;
    streamingEnabled: boolean;
  };
  chat: {
    mode: 'bubble' | 'window';
    maxHistory: number;
  };
  voice: {
    enabled: boolean;
    autoSpeak: boolean;
    language: string;
  };
  system: {
    autoStart: boolean;
    checkUpdates: boolean;
  };
  telemetry: {
    enabled: boolean;
  };
  mcp: {
    enabledServers: string[];
  };
  skills: {
    enabledSkills: string[];
  };
}

// Voice API Types
interface RecognitionOptions {
  language?: string;
  interimResults?: boolean;
  maxDuration?: number;
}

interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: string;
}

interface VoiceAvailability {
  recognition: boolean;
  synthesis: boolean;
  recognitionError?: string;
  synthesisError?: string;
}

interface RecognitionResult {
  text: string;
  isFinal: boolean;
  confidence: number;
}

interface RecognitionError {
  code: 'no-speech' | 'audio-capture' | 'not-allowed' | 'network' | 'unknown';
  message: string;
}

// Skin API Types
interface SkinInfo {
  id: string;
  name: string;
  sourceType: 'builtin' | 'photo' | 'imported';
  thumbnailPath: string | null;
  breed: string | null;
  isActive: boolean;
  createdAt: number;
}

interface PhotoAnalysisResult {
  analysisId: string;
  breed: string;
  confidence: number;
  alternatives: Array<{ breed: string; confidence: number }>;
  previewPath: string;
}

interface ModelGenerationOptions {
  name?: string;
  useCloud?: boolean;
}

interface GenerationProgress {
  analysisId: string;
  stage: 'preparing' | 'generating' | 'rigging' | 'finalizing';
  progress: number;
  message: string;
}

// System API Types
interface SystemInfo {
  platform: 'win32' | 'darwin' | 'linux';
  version: string;
  appVersion: string;
  dataPath: string;
  locale: string;
}

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  onClick?: 'focus' | 'open-chat' | 'show-reminder';
  actionData?: string;
}

interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  downloadUrl: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a typed event listener that returns an unsubscribe function
 */
function createEventListener<T>(
  channel: string,
  callback: (data: T) => void
): () => void {
  const handler = (_event: IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

// ============================================================================
// Window API
// ============================================================================

const windowAPI = {
  move: (x: number, y: number): Promise<void> => {
    return ipcRenderer.invoke('window:move', x, y);
  },

  getPosition: (): Promise<{ x: number; y: number; monitor: number }> => {
    return ipcRenderer.invoke('window:get-position');
  },

  setAlwaysOnTop: (alwaysOnTop: boolean): Promise<void> => {
    return ipcRenderer.invoke('window:set-always-on-top', alwaysOnTop);
  },

  minimize: (): Promise<void> => {
    return ipcRenderer.invoke('window:minimize');
  },

  getDisplays: (): Promise<DisplayInfo[]> => {
    return ipcRenderer.invoke('window:get-displays');
  },
};

// ============================================================================
// Pet API
// ============================================================================

const petAPI = {
  getState: (): Promise<PetState> => {
    return ipcRenderer.invoke('pet:get-state');
  },

  setAnimation: (
    animation: AnimationState,
    options?: AnimationOptions
  ): Promise<void> => {
    return ipcRenderer.invoke('pet:set-animation', animation, options);
  },

  savePosition: (position: PetPosition): Promise<void> => {
    return ipcRenderer.invoke('pet:save-position', position);
  },

  onStateChanged: (callback: (state: PetState) => void): (() => void) => {
    return createEventListener('pet:state-changed', callback);
  },
};

// ============================================================================
// AI API
// ============================================================================

const aiAPI = {
  sendMessage: (conversationId: string, content: string): Promise<string> => {
    return ipcRenderer.invoke('ai:send-message', conversationId, content);
  },

  cancel: (requestId: string): Promise<void> => {
    return ipcRenderer.invoke('ai:cancel', requestId);
  },

  getConversations: (
    limit?: number,
    offset?: number
  ): Promise<ConversationInfo[]> => {
    return ipcRenderer.invoke('ai:get-conversations', limit, offset);
  },

  getMessages: (
    conversationId: string,
    limit?: number
  ): Promise<MessageInfo[]> => {
    return ipcRenderer.invoke('ai:get-messages', conversationId, limit);
  },

  createConversation: (options?: CreateConversationOptions): Promise<string> => {
    return ipcRenderer.invoke('ai:create-conversation', options);
  },

  deleteConversation: (conversationId: string): Promise<void> => {
    return ipcRenderer.invoke('ai:delete-conversation', conversationId);
  },

  getProviders: (): Promise<AIProviderInfo[]> => {
    return ipcRenderer.invoke('ai:get-providers');
  },

  setProviderKey: (providerId: string, apiKey: string): Promise<void> => {
    return ipcRenderer.invoke('ai:set-provider-key', providerId, apiKey);
  },

  hasProviderKey: (providerId: string): Promise<boolean> => {
    return ipcRenderer.invoke('ai:has-provider-key', providerId);
  },

  // Event listeners for streaming responses
  onResponseStart: (
    callback: (data: ResponseStartEvent) => void
  ): (() => void) => {
    return createEventListener('ai:response-start', callback);
  },

  onResponseChunk: (
    callback: (data: ResponseChunkEvent) => void
  ): (() => void) => {
    return createEventListener('ai:response-chunk', callback);
  },

  onResponseComplete: (
    callback: (data: ResponseCompleteEvent) => void
  ): (() => void) => {
    return createEventListener('ai:response-complete', callback);
  },

  onResponseError: (
    callback: (data: ResponseErrorEvent) => void
  ): (() => void) => {
    return createEventListener('ai:response-error', callback);
  },

  onToolCall: (callback: (data: ToolCallEvent) => void): (() => void) => {
    return createEventListener('ai:tool-call', callback);
  },
};

// ============================================================================
// Reminder API
// ============================================================================

const reminderAPI = {
  create: (reminder: CreateReminderInput): Promise<string> => {
    return ipcRenderer.invoke('reminder:create', reminder);
  },

  update: (id: string, updates: UpdateReminderInput): Promise<void> => {
    return ipcRenderer.invoke('reminder:update', id, updates);
  },

  delete: (id: string): Promise<void> => {
    return ipcRenderer.invoke('reminder:delete', id);
  },

  list: (options?: ListRemindersOptions): Promise<ReminderInfo[]> => {
    return ipcRenderer.invoke('reminder:list', options);
  },

  complete: (id: string): Promise<void> => {
    return ipcRenderer.invoke('reminder:complete', id);
  },

  snooze: (id: string, minutes: number): Promise<void> => {
    return ipcRenderer.invoke('reminder:snooze', id, minutes);
  },

  onTriggered: (callback: (reminder: ReminderInfo) => void): (() => void) => {
    return createEventListener('reminder:triggered', callback);
  },
};

// ============================================================================
// Settings API
// ============================================================================

const settingsAPI = {
  get: <T>(key: SettingKey): Promise<T> => {
    return ipcRenderer.invoke('settings:get', key);
  },

  set: <T>(key: SettingKey, value: T): Promise<void> => {
    return ipcRenderer.invoke('settings:set', key, value);
  },

  getAll: (): Promise<Settings> => {
    return ipcRenderer.invoke('settings:get-all');
  },

  reset: (key?: SettingKey): Promise<void> => {
    return ipcRenderer.invoke('settings:reset', key);
  },

  onChanged: (
    callback: (key: SettingKey, value: unknown) => void
  ): (() => void) => {
    const handler = (
      _event: IpcRendererEvent,
      key: SettingKey,
      value: unknown
    ) => callback(key, value);
    ipcRenderer.on('settings:changed', handler);
    return () => {
      ipcRenderer.removeListener('settings:changed', handler);
    };
  },
};

// ============================================================================
// Voice API
// ============================================================================

const voiceAPI = {
  startRecognition: (options?: RecognitionOptions): Promise<void> => {
    return ipcRenderer.invoke('voice:start-recognition', options);
  },

  stopRecognition: (): Promise<void> => {
    return ipcRenderer.invoke('voice:stop-recognition');
  },

  speak: (text: string, options?: SpeakOptions): Promise<void> => {
    return ipcRenderer.invoke('voice:speak', text, options);
  },

  stopSpeaking: (): Promise<void> => {
    return ipcRenderer.invoke('voice:stop-speaking');
  },

  isAvailable: (): Promise<VoiceAvailability> => {
    return ipcRenderer.invoke('voice:is-available');
  },

  onRecognitionResult: (
    callback: (result: RecognitionResult) => void
  ): (() => void) => {
    return createEventListener('voice:recognition-result', callback);
  },

  onRecognitionError: (
    callback: (error: RecognitionError) => void
  ): (() => void) => {
    return createEventListener('voice:recognition-error', callback);
  },
};

// ============================================================================
// Skin API
// ============================================================================

const skinAPI = {
  list: (): Promise<SkinInfo[]> => {
    return ipcRenderer.invoke('skin:list');
  },

  apply: (skinId: string): Promise<void> => {
    return ipcRenderer.invoke('skin:apply', skinId);
  },

  uploadPhoto: (imagePath: string): Promise<PhotoAnalysisResult> => {
    return ipcRenderer.invoke('skin:upload-photo', imagePath);
  },

  generateModel: (
    analysisId: string,
    options?: ModelGenerationOptions
  ): Promise<string> => {
    return ipcRenderer.invoke('skin:generate-model', analysisId, options);
  },

  delete: (skinId: string): Promise<void> => {
    return ipcRenderer.invoke('skin:delete', skinId);
  },

  onGenerationProgress: (
    callback: (progress: GenerationProgress) => void
  ): (() => void) => {
    return createEventListener('skin:generation-progress', callback);
  },
};

// ============================================================================
// System API
// ============================================================================

const systemAPI = {
  getInfo: (): Promise<SystemInfo> => {
    return ipcRenderer.invoke('system:get-info');
  },

  openExternal: (target: string): Promise<void> => {
    return ipcRenderer.invoke('system:open-external', target);
  },

  showNotification: (options: NotificationOptions): Promise<void> => {
    return ipcRenderer.invoke('system:show-notification', options);
  },

  getAutoStart: (): Promise<boolean> => {
    return ipcRenderer.invoke('system:get-auto-start');
  },

  setAutoStart: (enabled: boolean): Promise<void> => {
    return ipcRenderer.invoke('system:set-auto-start', enabled);
  },

  checkUpdate: (): Promise<UpdateInfo | null> => {
    return ipcRenderer.invoke('system:check-update');
  },

  quit: (): Promise<void> => {
    return ipcRenderer.invoke('system:quit');
  },
};

// ============================================================================
// Expose API to Renderer Process
// ============================================================================

/**
 * The electronAPI object exposed to the renderer process.
 * All IPC communication goes through these safe, typed methods.
 */
const electronAPI = {
  window: windowAPI,
  pet: petAPI,
  ai: aiAPI,
  reminder: reminderAPI,
  settings: settingsAPI,
  voice: voiceAPI,
  skin: skinAPI,
  system: systemAPI,
};

// Expose the API via contextBridge
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for global access in renderer
export type ElectronAPI = typeof electronAPI;