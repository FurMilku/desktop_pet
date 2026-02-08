/**
 * 事件类型常量和数据结构定义
 * 定义所有应用内事件的类型标识和负载结构
 */

import type { BaseEvent, CreateEventParams, EventPriority } from './event-bus';
import type {
  Pet,
  PetAnimationState,
  PetSkin,
  Conversation,
  Message,
  AIProvider,
  Reminder,
  Setting,
  SettingKey,
  MCPServerConfig,
  MCPServerStatus,
  Skill,
  SkillStatus,
} from './models';

// ============================================================================
// 事件类型命名空间
// ============================================================================

/**
 * 事件类型常量命名空间
 * 使用分层命名: domain:action 格式
 */
export const EventTypes = {
  // Pet 事件
  PET: {
    CREATED: 'pet:created',
    UPDATED: 'pet:updated',
    DELETED: 'pet:deleted',
    POSITION_CHANGED: 'pet:position-changed',
    ANIMATION_CHANGED: 'pet:animation-changed',
    VISIBILITY_CHANGED: 'pet:visibility-changed',
    SKIN_CHANGED: 'pet:skin-changed',
    INTERACTION: 'pet:interaction',
  },

  // 窗口事件
  WINDOW: {
    CREATED: 'window:created',
    CLOSED: 'window:closed',
    FOCUSED: 'window:focused',
    BLURRED: 'window:blurred',
    MOVED: 'window:moved',
    RESIZED: 'window:resized',
    MINIMIZED: 'window:minimized',
    RESTORED: 'window:restored',
    DISPLAY_CHANGED: 'window:display-changed',
  },

  // AI 事件
  AI: {
    CHAT_STARTED: 'ai:chat-started',
    CHAT_MESSAGE: 'ai:chat-message',
    CHAT_RESPONSE: 'ai:chat-response',
    CHAT_ERROR: 'ai:chat-error',
    CHAT_COMPLETED: 'ai:chat-completed',
    PROVIDER_CHANGED: 'ai:provider-changed',
    PROVIDER_STATUS_CHANGED: 'ai:provider-status-changed',
    STREAMING_CHUNK: 'ai:streaming-chunk',
    STREAMING_END: 'ai:streaming-end',
    TOKEN_USAGE: 'ai:token-usage',
  },

  // 对话事件
  CONVERSATION: {
    CREATED: 'conversation:created',
    UPDATED: 'conversation:updated',
    DELETED: 'conversation:deleted',
    ARCHIVED: 'conversation:archived',
    MESSAGE_ADDED: 'conversation:message-added',
    CLEARED: 'conversation:cleared',
  },

  // MCP 事件
  MCP: {
    SERVER_STARTING: 'mcp:server-starting',
    SERVER_STARTED: 'mcp:server-started',
    SERVER_STOPPED: 'mcp:server-stopped',
    SERVER_ERROR: 'mcp:server-error',
    TOOL_CALLED: 'mcp:tool-called',
    TOOL_RESULT: 'mcp:tool-result',
    RESOURCE_READ: 'mcp:resource-read',
  },

  // 技能事件
  SKILL: {
    LOADED: 'skill:loaded',
    UNLOADED: 'skill:unloaded',
    ACTIVATED: 'skill:activated',
    DEACTIVATED: 'skill:deactivated',
    ERROR: 'skill:error',
    EXECUTED: 'skill:executed',
  },

  // 提醒事件
  REMINDER: {
    CREATED: 'reminder:created',
    UPDATED: 'reminder:updated',
    DELETED: 'reminder:deleted',
    TRIGGERED: 'reminder:triggered',
    DISMISSED: 'reminder:dismissed',
    SNOOZED: 'reminder:snoozed',
  },

  // 语音事件
  VOICE: {
    RECOGNITION_STARTED: 'voice:recognition-started',
    RECOGNITION_RESULT: 'voice:recognition-result',
    RECOGNITION_ERROR: 'voice:recognition-error',
    RECOGNITION_ENDED: 'voice:recognition-ended',
    SYNTHESIS_STARTED: 'voice:synthesis-started',
    SYNTHESIS_ENDED: 'voice:synthesis-ended',
    SYNTHESIS_ERROR: 'voice:synthesis-error',
  },

  // 皮肤事件
  SKIN: {
    CREATED: 'skin:created',
    DELETED: 'skin:deleted',
    GENERATION_STARTED: 'skin:generation-started',
    GENERATION_PROGRESS: 'skin:generation-progress',
    GENERATION_COMPLETED: 'skin:generation-completed',
    GENERATION_ERROR: 'skin:generation-error',
  },

  // 设置事件
  SETTINGS: {
    CHANGED: 'settings:changed',
    RESET: 'settings:reset',
    IMPORTED: 'settings:imported',
    EXPORTED: 'settings:exported',
  },

  // 应用生命周期事件
  APP: {
    READY: 'app:ready',
    BEFORE_QUIT: 'app:before-quit',
    QUIT: 'app:quit',
    UPDATE_AVAILABLE: 'app:update-available',
    UPDATE_DOWNLOADED: 'app:update-downloaded',
    ERROR: 'app:error',
    FOCUS: 'app:focus',
    BLUR: 'app:blur',
  },

  // 系统事件
  SYSTEM: {
    TRAY_CLICK: 'system:tray-click',
    TRAY_DOUBLE_CLICK: 'system:tray-double-click',
    TRAY_RIGHT_CLICK: 'system:tray-right-click',
    SHORTCUT_TRIGGERED: 'system:shortcut-triggered',
    DISPLAY_ADDED: 'system:display-added',
    DISPLAY_REMOVED: 'system:display-removed',
    POWER_SUSPEND: 'system:power-suspend',
    POWER_RESUME: 'system:power-resume',
    NETWORK_ONLINE: 'system:network-online',
    NETWORK_OFFLINE: 'system:network-offline',
  },

  // 数据库事件
  DATABASE: {
    CONNECTED: 'database:connected',
    DISCONNECTED: 'database:disconnected',
    MIGRATION_STARTED: 'database:migration-started',
    MIGRATION_COMPLETED: 'database:migration-completed',
    MIGRATION_ERROR: 'database:migration-error',
    BACKUP_CREATED: 'database:backup-created',
  },

  // 能力事件
  CAPABILITY: {
    REGISTERED: 'capability:registered',
    UNREGISTERED: 'capability:unregistered',
    INITIALIZING: 'capability:initializing',
    READY: 'capability:ready',
    ERROR: 'capability:error',
    HEALTH_CHECK: 'capability:health-check',
  },
} as const;

// ============================================================================
// 能力事件常量（兼容旧代码）
// ============================================================================

/**
 * 能力事件类型常量
 * @deprecated 使用 EventTypes.CAPABILITY 代替
 */
export const CapabilityEvents = {
  REGISTERED: 'capability:registered',
  UNREGISTERED: 'capability:unregistered',
  INITIALIZING: 'capability:initializing',
  READY: 'capability:ready',
  ERROR: 'capability:error',
  HEALTH_CHECK: 'capability:health-check',
} as const;

// ============================================================================
// 事件负载类型定义
// ============================================================================

// Pet 事件负载
export interface PetCreatedPayload {
  pet: Pet;
}

export interface PetUpdatedPayload {
  pet: Pet;
  changes: Partial<Pet>;
}

export interface PetDeletedPayload {
  petId: string;
}

export interface PetPositionChangedPayload {
  petId: string;
  position: { x: number; y: number };
  displayIndex: number;
}

export interface PetAnimationChangedPayload {
  petId: string;
  previousState: PetAnimationState;
  currentState: PetAnimationState;
  trigger?: string;
}

export interface PetVisibilityChangedPayload {
  petId: string;
  isVisible: boolean;
}

export interface PetSkinChangedPayload {
  petId: string;
  previousSkinId: string | null;
  currentSkinId: string;
  skin: PetSkin;
}

export interface PetInteractionPayload {
  petId: string;
  type: 'click' | 'double-click' | 'right-click' | 'drag-start' | 'drag-end' | 'hover';
  position?: { x: number; y: number };
}

// 窗口事件负载
export interface WindowCreatedPayload {
  windowId: number;
  type: 'main' | 'chat' | 'settings' | 'skin-wizard';
}

export interface WindowClosedPayload {
  windowId: number;
}

export interface WindowMovedPayload {
  windowId: number;
  position: { x: number; y: number };
}

export interface WindowResizedPayload {
  windowId: number;
  size: { width: number; height: number };
}

export interface WindowDisplayChangedPayload {
  windowId: number;
  displayId: number;
  displayIndex: number;
}

// AI 事件负载
export interface AIChatStartedPayload {
  conversationId: string;
  providerId: string;
}

export interface AIChatMessagePayload {
  conversationId: string;
  message: Message;
}

export interface AIChatResponsePayload {
  conversationId: string;
  message: Message;
  responseTime: number;
}

export interface AIChatErrorPayload {
  conversationId: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface AIChatCompletedPayload {
  conversationId: string;
  messageCount: number;
  totalTokens: number;
}

export interface AIProviderChangedPayload {
  previousProviderId: string | null;
  currentProviderId: string;
  provider: AIProvider;
}

export interface AIProviderStatusChangedPayload {
  providerId: string;
  previousStatus: AIProvider['status'];
  currentStatus: AIProvider['status'];
}

export interface AIStreamingChunkPayload {
  conversationId: string;
  messageId: string;
  chunk: string;
  index: number;
}

export interface AIStreamingEndPayload {
  conversationId: string;
  messageId: string;
  totalChunks: number;
  fullContent: string;
}

export interface AITokenUsagePayload {
  conversationId: string;
  messageId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// 对话事件负载
export interface ConversationCreatedPayload {
  conversation: Conversation;
}

export interface ConversationUpdatedPayload {
  conversation: Conversation;
  changes: Partial<Conversation>;
}

export interface ConversationDeletedPayload {
  conversationId: string;
}

export interface ConversationArchivedPayload {
  conversationId: string;
  isArchived: boolean;
}

export interface ConversationMessageAddedPayload {
  conversationId: string;
  message: Message;
}

export interface ConversationClearedPayload {
  conversationId: string;
  deletedMessageCount: number;
}

// MCP 事件负载
export interface MCPServerStartingPayload {
  serverName: string;
  config: MCPServerConfig;
}

export interface MCPServerStartedPayload {
  serverName: string;
  tools: string[];
  resources: string[];
}

export interface MCPServerStoppedPayload {
  serverName: string;
  reason?: string;
}

export interface MCPServerErrorPayload {
  serverName: string;
  error: {
    code: string;
    message: string;
    stack?: string;
  };
}

export interface MCPToolCalledPayload {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  callId: string;
}

export interface MCPToolResultPayload {
  serverName: string;
  toolName: string;
  callId: string;
  result: unknown;
  executionTime: number;
}

export interface MCPResourceReadPayload {
  serverName: string;
  uri: string;
  content: unknown;
}

// 技能事件负载
export interface SkillLoadedPayload {
  skill: Skill;
}

export interface SkillUnloadedPayload {
  skillId: string;
}

export interface SkillActivatedPayload {
  skillId: string;
  trigger: string;
}

export interface SkillDeactivatedPayload {
  skillId: string;
}

export interface SkillErrorPayload {
  skillId: string;
  error: {
    code: string;
    message: string;
  };
}

export interface SkillExecutedPayload {
  skillId: string;
  input: string;
  output: string;
  executionTime: number;
}

// 提醒事件负载
export interface ReminderCreatedPayload {
  reminder: Reminder;
}

export interface ReminderUpdatedPayload {
  reminder: Reminder;
  changes: Partial<Reminder>;
}

export interface ReminderDeletedPayload {
  reminderId: string;
}

export interface ReminderTriggeredPayload {
  reminder: Reminder;
}

export interface ReminderDismissedPayload {
  reminderId: string;
}

export interface ReminderSnoozedPayload {
  reminderId: string;
  snoozedUntil: Date;
}

// 语音事件负载
export interface VoiceRecognitionStartedPayload {
  sessionId: string;
  language: string;
}

export interface VoiceRecognitionResultPayload {
  sessionId: string;
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

export interface VoiceRecognitionErrorPayload {
  sessionId: string;
  error: {
    code: string;
    message: string;
  };
}

export interface VoiceRecognitionEndedPayload {
  sessionId: string;
  finalTranscript: string;
}

export interface VoiceSynthesisStartedPayload {
  text: string;
  voice: string;
}

export interface VoiceSynthesisEndedPayload {
  text: string;
  duration: number;
}

export interface VoiceSynthesisErrorPayload {
  text: string;
  error: {
    code: string;
    message: string;
  };
}

// 皮肤事件负载
export interface SkinCreatedPayload {
  skin: PetSkin;
}

export interface SkinDeletedPayload {
  skinId: string;
}

export interface SkinGenerationStartedPayload {
  requestId: string;
  sourceImagePath: string;
}

export interface SkinGenerationProgressPayload {
  requestId: string;
  stage: 'analyzing' | 'generating' | 'rigging' | 'finalizing';
  progress: number; // 0-100
  message?: string;
}

export interface SkinGenerationCompletedPayload {
  requestId: string;
  skin: PetSkin;
  breedInfo: {
    breed: string;
    confidence: number;
  };
}

export interface SkinGenerationErrorPayload {
  requestId: string;
  error: {
    code: string;
    message: string;
  };
}

// 设置事件负载
export interface SettingsChangedPayload {
  key: SettingKey;
  previousValue: unknown;
  currentValue: unknown;
}

export interface SettingsResetPayload {
  keys: SettingKey[];
}

export interface SettingsImportedPayload {
  settings: Partial<Record<SettingKey, unknown>>;
}

export interface SettingsExportedPayload {
  filePath: string;
}

// 应用生命周期事件负载
export interface AppReadyPayload {
  version: string;
  platform: NodeJS.Platform;
}

export interface AppBeforeQuitPayload {
  reason?: string;
}

export interface AppQuitPayload {
  exitCode: number;
}

export interface AppUpdateAvailablePayload {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

export interface AppUpdateDownloadedPayload {
  version: string;
  downloadPath: string;
}

export interface AppErrorPayload {
  error: {
    code: string;
    message: string;
    stack?: string;
  };
  fatal: boolean;
}

// 系统事件负载
export interface SystemTrayClickPayload {
  position: { x: number; y: number };
  bounds: { x: number; y: number; width: number; height: number };
}

export interface SystemShortcutTriggeredPayload {
  accelerator: string;
  action: string;
}

export interface SystemDisplayAddedPayload {
  display: {
    id: number;
    bounds: { x: number; y: number; width: number; height: number };
    workArea: { x: number; y: number; width: number; height: number };
  };
}

export interface SystemDisplayRemovedPayload {
  displayId: number;
}

// 数据库事件负载
export interface DatabaseConnectedPayload {
  path: string;
  version: number;
}

export interface DatabaseDisconnectedPayload {
  reason?: string;
}

export interface DatabaseMigrationStartedPayload {
  fromVersion: number;
  toVersion: number;
}

export interface DatabaseMigrationCompletedPayload {
  fromVersion: number;
  toVersion: number;
  migrationsRun: string[];
}

export interface DatabaseMigrationErrorPayload {
  migrationName: string;
  error: {
    code: string;
    message: string;
  };
}

export interface DatabaseBackupCreatedPayload {
  backupPath: string;
  size: number;
}

// ============================================================================
// 事件类型映射
// ============================================================================

/**
 * 事件类型到负载的映射
 */
export interface EventPayloadMap {
  // Pet 事件
  [EventTypes.PET.CREATED]: PetCreatedPayload;
  [EventTypes.PET.UPDATED]: PetUpdatedPayload;
  [EventTypes.PET.DELETED]: PetDeletedPayload;
  [EventTypes.PET.POSITION_CHANGED]: PetPositionChangedPayload;
  [EventTypes.PET.ANIMATION_CHANGED]: PetAnimationChangedPayload;
  [EventTypes.PET.VISIBILITY_CHANGED]: PetVisibilityChangedPayload;
  [EventTypes.PET.SKIN_CHANGED]: PetSkinChangedPayload;
  [EventTypes.PET.INTERACTION]: PetInteractionPayload;

  // 窗口事件
  [EventTypes.WINDOW.CREATED]: WindowCreatedPayload;
  [EventTypes.WINDOW.CLOSED]: WindowClosedPayload;
  [EventTypes.WINDOW.FOCUSED]: { windowId: number };
  [EventTypes.WINDOW.BLURRED]: { windowId: number };
  [EventTypes.WINDOW.MOVED]: WindowMovedPayload;
  [EventTypes.WINDOW.RESIZED]: WindowResizedPayload;
  [EventTypes.WINDOW.MINIMIZED]: { windowId: number };
  [EventTypes.WINDOW.RESTORED]: { windowId: number };
  [EventTypes.WINDOW.DISPLAY_CHANGED]: WindowDisplayChangedPayload;

  // AI 事件
  [EventTypes.AI.CHAT_STARTED]: AIChatStartedPayload;
  [EventTypes.AI.CHAT_MESSAGE]: AIChatMessagePayload;
  [EventTypes.AI.CHAT_RESPONSE]: AIChatResponsePayload;
  [EventTypes.AI.CHAT_ERROR]: AIChatErrorPayload;
  [EventTypes.AI.CHAT_COMPLETED]: AIChatCompletedPayload;
  [EventTypes.AI.PROVIDER_CHANGED]: AIProviderChangedPayload;
  [EventTypes.AI.PROVIDER_STATUS_CHANGED]: AIProviderStatusChangedPayload;
  [EventTypes.AI.STREAMING_CHUNK]: AIStreamingChunkPayload;
  [EventTypes.AI.STREAMING_END]: AIStreamingEndPayload;
  [EventTypes.AI.TOKEN_USAGE]: AITokenUsagePayload;

  // 对话事件
  [EventTypes.CONVERSATION.CREATED]: ConversationCreatedPayload;
  [EventTypes.CONVERSATION.UPDATED]: ConversationUpdatedPayload;
  [EventTypes.CONVERSATION.DELETED]: ConversationDeletedPayload;
  [EventTypes.CONVERSATION.ARCHIVED]: ConversationArchivedPayload;
  [EventTypes.CONVERSATION.MESSAGE_ADDED]: ConversationMessageAddedPayload;
  [EventTypes.CONVERSATION.CLEARED]: ConversationClearedPayload;

  // MCP 事件
  [EventTypes.MCP.SERVER_STARTING]: MCPServerStartingPayload;
  [EventTypes.MCP.SERVER_STARTED]: MCPServerStartedPayload;
  [EventTypes.MCP.SERVER_STOPPED]: MCPServerStoppedPayload;
  [EventTypes.MCP.SERVER_ERROR]: MCPServerErrorPayload;
  [EventTypes.MCP.TOOL_CALLED]: MCPToolCalledPayload;
  [EventTypes.MCP.TOOL_RESULT]: MCPToolResultPayload;
  [EventTypes.MCP.RESOURCE_READ]: MCPResourceReadPayload;

  // 技能事件
  [EventTypes.SKILL.LOADED]: SkillLoadedPayload;
  [EventTypes.SKILL.UNLOADED]: SkillUnloadedPayload;
  [EventTypes.SKILL.ACTIVATED]: SkillActivatedPayload;
  [EventTypes.SKILL.DEACTIVATED]: SkillDeactivatedPayload;
  [EventTypes.SKILL.ERROR]: SkillErrorPayload;
  [EventTypes.SKILL.EXECUTED]: SkillExecutedPayload;

  // 提醒事件
  [EventTypes.REMINDER.CREATED]: ReminderCreatedPayload;
  [EventTypes.REMINDER.UPDATED]: ReminderUpdatedPayload;
  [EventTypes.REMINDER.DELETED]: ReminderDeletedPayload;
  [EventTypes.REMINDER.TRIGGERED]: ReminderTriggeredPayload;
  [EventTypes.REMINDER.DISMISSED]: ReminderDismissedPayload;
  [EventTypes.REMINDER.SNOOZED]: ReminderSnoozedPayload;

  // 语音事件
  [EventTypes.VOICE.RECOGNITION_STARTED]: VoiceRecognitionStartedPayload;
  [EventTypes.VOICE.RECOGNITION_RESULT]: VoiceRecognitionResultPayload;
  [EventTypes.VOICE.RECOGNITION_ERROR]: VoiceRecognitionErrorPayload;
  [EventTypes.VOICE.RECOGNITION_ENDED]: VoiceRecognitionEndedPayload;
  [EventTypes.VOICE.SYNTHESIS_STARTED]: VoiceSynthesisStartedPayload;
  [EventTypes.VOICE.SYNTHESIS_ENDED]: VoiceSynthesisEndedPayload;
  [EventTypes.VOICE.SYNTHESIS_ERROR]: VoiceSynthesisErrorPayload;

  // 皮肤事件
  [EventTypes.SKIN.CREATED]: SkinCreatedPayload;
  [EventTypes.SKIN.DELETED]: SkinDeletedPayload;
  [EventTypes.SKIN.GENERATION_STARTED]: SkinGenerationStartedPayload;
  [EventTypes.SKIN.GENERATION_PROGRESS]: SkinGenerationProgressPayload;
  [EventTypes.SKIN.GENERATION_COMPLETED]: SkinGenerationCompletedPayload;
  [EventTypes.SKIN.GENERATION_ERROR]: SkinGenerationErrorPayload;

  // 设置事件
  [EventTypes.SETTINGS.CHANGED]: SettingsChangedPayload;
  [EventTypes.SETTINGS.RESET]: SettingsResetPayload;
  [EventTypes.SETTINGS.IMPORTED]: SettingsImportedPayload;
  [EventTypes.SETTINGS.EXPORTED]: SettingsExportedPayload;

  // 应用生命周期事件
  [EventTypes.APP.READY]: AppReadyPayload;
  [EventTypes.APP.BEFORE_QUIT]: AppBeforeQuitPayload;
  [EventTypes.APP.QUIT]: AppQuitPayload;
  [EventTypes.APP.UPDATE_AVAILABLE]: AppUpdateAvailablePayload;
  [EventTypes.APP.UPDATE_DOWNLOADED]: AppUpdateDownloadedPayload;
  [EventTypes.APP.ERROR]: AppErrorPayload;
  [EventTypes.APP.FOCUS]: Record<string, never>;
  [EventTypes.APP.BLUR]: Record<string, never>;

  // 系统事件
  [EventTypes.SYSTEM.TRAY_CLICK]: SystemTrayClickPayload;
  [EventTypes.SYSTEM.TRAY_DOUBLE_CLICK]: SystemTrayClickPayload;
  [EventTypes.SYSTEM.TRAY_RIGHT_CLICK]: SystemTrayClickPayload;
  [EventTypes.SYSTEM.SHORTCUT_TRIGGERED]: SystemShortcutTriggeredPayload;
  [EventTypes.SYSTEM.DISPLAY_ADDED]: SystemDisplayAddedPayload;
  [EventTypes.SYSTEM.DISPLAY_REMOVED]: SystemDisplayRemovedPayload;
  [EventTypes.SYSTEM.POWER_SUSPEND]: Record<string, never>;
  [EventTypes.SYSTEM.POWER_RESUME]: Record<string, never>;
  [EventTypes.SYSTEM.NETWORK_ONLINE]: Record<string, never>;
  [EventTypes.SYSTEM.NETWORK_OFFLINE]: Record<string, never>;

  // 数据库事件
  [EventTypes.DATABASE.CONNECTED]: DatabaseConnectedPayload;
  [EventTypes.DATABASE.DISCONNECTED]: DatabaseDisconnectedPayload;
  [EventTypes.DATABASE.MIGRATION_STARTED]: DatabaseMigrationStartedPayload;
  [EventTypes.DATABASE.MIGRATION_COMPLETED]: DatabaseMigrationCompletedPayload;
  [EventTypes.DATABASE.MIGRATION_ERROR]: DatabaseMigrationErrorPayload;
  [EventTypes.DATABASE.BACKUP_CREATED]: DatabaseBackupCreatedPayload;
}

// ============================================================================
// 类型化事件辅助类型
// ============================================================================

/**
 * 获取特定事件类型的负载类型
 */
export type EventPayload<T extends keyof EventPayloadMap> = EventPayloadMap[T];

/**
 * 类型化的事件对象
 */
export type TypedEvent<T extends keyof EventPayloadMap> = BaseEvent<EventPayloadMap[T]>;

/**
 * 类型化的事件创建参数
 */
export type TypedCreateEventParams<T extends keyof EventPayloadMap> = Omit<CreateEventParams<EventPayloadMap[T]>, 'type'> & {
  type: T;
};

/**
 * 所有事件类型的联合类型
 */
export type AllEventTypes = keyof EventPayloadMap;

/**
 * 事件类型值的联合类型
 */
export type EventTypeValue = EventPayloadMap[keyof EventPayloadMap];

// ============================================================================
// 事件创建辅助函数类型
// ============================================================================

/**
 * 创建类型化事件的函数签名
 */
export type CreateTypedEvent = <T extends keyof EventPayloadMap>(
  type: T,
  payload: EventPayloadMap[T],
  options?: {
    source?: string;
    priority?: EventPriority;
    metadata?: Record<string, unknown>;
  }
) => TypedEvent<T>;