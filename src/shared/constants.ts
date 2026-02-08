/**
 * 共享常量定义
 * IPC通道名称和其他全局常量
 * @see specs/001-desktop-3d-pet/contracts/ipc-protocol.md
 */

// ============================================================
// IPC 通道名称常量
// ============================================================

/**
 * 宠物相关IPC通道
 */
export const PET_CHANNELS = {
  GET_STATE: 'pet:get-state',
  SAVE_STATE: 'pet:save-state',
  LIST_SKINS: 'pet:list-skins',
} as const;

/**
 * 对话相关IPC通道
 */
export const CHAT_CHANNELS = {
  SEND_MESSAGE: 'chat:send-message',
  SEND_MESSAGE_STREAM: 'chat:send-message-stream',
  GET_HISTORY: 'chat:get-history',
  LIST_CONVERSATIONS: 'chat:list-conversations',
} as const;

/**
 * 提醒相关IPC通道
 */
export const REMINDER_CHANNELS = {
  CREATE: 'reminder:create',
  LIST: 'reminder:list',
  COMPLETE: 'reminder:complete',
  TRIGGERED: 'reminder:triggered',
} as const;

/**
 * 语音相关IPC通道
 */
export const VOICE_CHANNELS = {
  START_RECOGNITION: 'voice:start-recognition',
  STOP_RECOGNITION: 'voice:stop-recognition',
  SYNTHESIZE: 'voice:synthesize',
  LIST_VOICES: 'voice:list-voices',
} as const;

/**
 * 换肤相关IPC通道
 */
export const SKIN_CHANNELS = {
  UPLOAD_PHOTO: 'skin:upload-photo',
  DETECT_BREED: 'skin:detect-breed',
  GENERATE_MODEL: 'skin:generate-model',
  APPLY: 'skin:apply',
} as const;

/**
 * 设置相关IPC通道
 */
export const SETTINGS_CHANNELS = {
  GET: 'settings:get',
  SET: 'settings:set',
  GET_ALL: 'settings:get-all',
} as const;

/**
 * 窗口相关IPC通道
 */
export const WINDOW_CHANNELS = {
  OPEN_CHAT: 'window:open-chat',
  MINIMIZE_TO_TRAY: 'window:minimize-to-tray',
  QUIT: 'window:quit',
} as const;

/**
 * 系统相关IPC通道
 */
export const SYSTEM_CHANNELS = {
  GET_WEATHER: 'system:get-weather',
  LAUNCH_APP: 'system:launch-app',
  CREATE_NOTE: 'system:create-note',
  GET_DISPLAYS: 'system:get-displays',
} as const;

// ============================================================
// 应用常量
// ============================================================

/**
 * 应用元数据
 */
export const APP_INFO = {
  NAME: 'Desktop 3D Pet',
  VERSION: '0.1.0',
  AUTHOR: 'Desktop Pet Team',
} as const;

/**
 * 默认配置
 */
export const DEFAULTS = {
  /** 默认宠物模型文件名 */
  PET_MODEL: 'default-pet.glb',
  /** 默认渲染帧率 */
  TARGET_FPS: 30,
  /** 空闲时降低的帧率 */
  IDLE_FPS: 15,
  /** AI响应超时时间(ms) */
  AI_TIMEOUT: 30000,
  /** AI首字响应目标时间(ms) */
  AI_FIRST_TOKEN_TARGET: 3000,
} as const;

/**
 * 窗口配置
 */
export const WINDOW_CONFIG = {
  /** 主窗口默认宽度 */
  MAIN_WIDTH: 300,
  /** 主窗口默认高度 */
  MAIN_HEIGHT: 400,
  /** 对话窗口默认宽度 */
  CHAT_WIDTH: 400,
  /** 对话窗口默认高度 */
  CHAT_HEIGHT: 600,
  /** 设置窗口默认宽度 */
  SETTINGS_WIDTH: 500,
  /** 设置窗口默认高度 */
  SETTINGS_HEIGHT: 450,
} as const;

/**
 * 动画状态名称
 */
export const ANIMATION_STATES = {
  IDLE: 'idle',
  HAPPY: 'happy',
  SAD: 'sad',
  THINKING: 'thinking',
  LISTENING: 'listening',
  SPEAKING: 'speaking',
  WAVE: 'wave',
  JUMP: 'jump',
  REMIND: 'remind',
} as const;

/**
 * AI提供商标识
 */
export const AI_PROVIDERS = {
  OPENAI: 'openai',
  CLAUDE: 'claude',
  OLLAMA: 'ollama',
} as const;

/**
 * 数据库配置
 */
export const DATABASE = {
  /** 数据库文件名 */
  FILENAME: 'desktop-pet.db',
  /** 最大对话历史条数 */
  MAX_CONVERSATION_HISTORY: 100,
  /** 缓存响应过期时间(秒) */
  CACHE_TTL_SECONDS: 86400, // 24 hours
} as const;