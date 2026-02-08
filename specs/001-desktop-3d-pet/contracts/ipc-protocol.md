# IPC Protocol Contract

**Feature**: 桌面3D小宠物  
**Version**: 1.0.0  
**Date**: 2026-02-08

## Overview

IPC（进程间通信）协议定义了 Electron 主进程与渲染进程之间的通信契约。遵循 Electron 安全最佳实践，使用 `contextBridge` 暴露安全的 API，所有通信通过预定义的通道进行。

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Renderer Process                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    渲染进程代码                           │    │
│  │   window.electronAPI.sendChatMessage(...)               │    │
│  └─────────────────────┬───────────────────────────────────┘    │
│                        │                                         │
│  ┌─────────────────────▼───────────────────────────────────┐    │
│  │                  Preload Script                          │    │
│  │   contextBridge.exposeInMainWorld('electronAPI', {...})  │    │
│  │   ipcRenderer.invoke('chat:send-message', ...)           │    │
│  └─────────────────────┬───────────────────────────────────┘    │
└────────────────────────┼────────────────────────────────────────┘
                         │ IPC Channel
┌────────────────────────┼────────────────────────────────────────┐
│                        │                                         │
│  ┌─────────────────────▼───────────────────────────────────┐    │
│  │                  IPC Handlers                            │    │
│  │   ipcMain.handle('chat:send-message', async (...) => {}) │    │
│  └─────────────────────┬───────────────────────────────────┘    │
│                        │                                         │
│  ┌─────────────────────▼───────────────────────────────────┐    │
│  │                    Main Process                          │    │
│  │   AI Service / Storage / System APIs                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                         Main Process                             │
└─────────────────────────────────────────────────────────────────┘
```

## Channel Naming Convention

通道命名遵循 `domain:action` 格式：

| Domain | Description | Examples |
|--------|-------------|----------|
| `chat` | AI对话相关 | `chat:send-message`, `chat:get-history` |
| `pet` | 宠物状态相关 | `pet:save-state`, `pet:get-state` |
| `reminder` | 提醒相关 | `reminder:create`, `reminder:list` |
| `settings` | 设置相关 | `settings:get`, `settings:set` |
| `window` | 窗口控制 | `window:open-chat`, `window:minimize` |
| `skin` | 换肤相关 | `skin:upload-photo`, `skin:generate-model` |
| `voice` | 语音相关 | `voice:start-recognition`, `voice:synthesize` |
| `system` | 系统操作 | `system:open-app`, `system:get-weather` |
| `storage` | 存储操作 | `storage:get-credential`, `storage:set-credential` |

## Type Definitions

```typescript
// ============================================
// 通用响应类型
// ============================================

/** IPC操作结果 */
interface IPCResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** 流式响应事件 */
interface StreamEvent<T> {
  type: 'data' | 'error' | 'end';
  data?: T;
  error?: string;
}

// ============================================
// 对话相关类型
// ============================================

/** 发送消息请求 */
interface SendMessageRequest {
  conversationId?: string;  // 可选，不提供则创建新对话
  content: string;
  providerId?: string;      // 可选，使用指定的AI提供商
}

/** 发送消息响应 */
interface SendMessageResponse {
  conversationId: string;
  messageId: string;
  content: string;
  emotion: EmotionState;
  toolCalls?: ToolCallResult[];
}

/** 流式消息块 */
interface MessageChunk {
  conversationId: string;
  messageId: string;
  delta: string;           // 增量文本
  emotion?: EmotionState;  // 情感（可能在过程中更新）
}

/** 对话历史请求 */
interface GetHistoryRequest {
  conversationId: string;
  limit?: number;          // 默认50
  before?: string;         // 消息ID，用于分页
}

/** 工具调用结果 */
interface ToolCallResult {
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

// ============================================
// 宠物状态类型
// ============================================

/** 宠物状态（简化版，用于IPC传输） */
interface PetStateData {
  id: string;
  name: string;
  skinId: string | null;
  positionX: number;
  positionY: number;
  scale: number;
  emotion: string;
  isVisible: boolean;
}

// ============================================
// 提醒类型
// ============================================

/** 创建提醒请求 */
interface CreateReminderRequest {
  title: string;
  description?: string;
  triggerAt: string;       // ISO 8601 格式
  repeatRule?: string;     // RRULE格式，如 "FREQ=DAILY;INTERVAL=1"
}

/** 提醒数据 */
interface ReminderData {
  id: string;
  title: string;
  description: string | null;
  triggerAt: string;
  repeatRule: string | null;
  isCompleted: boolean;
  createdAt: string;
}

// ============================================
// 设置类型
// ============================================

/** 设置键值对 */
interface SettingEntry {
  key: string;
  value: string;           // JSON序列化的值
}

/** AI提供商配置 */
interface AIProviderConfig {
  id: string;
  type: 'openai' | 'claude' | 'ollama';
  name: string;
  modelId: string;
  isDefault: boolean;
  isEnabled: boolean;
  // 注意：API密钥不通过IPC传输
}

// ============================================
// 换肤类型
// ============================================

/** 上传照片请求 */
interface UploadPhotoRequest {
  imageData: string;       // Base64编码的图片数据
  fileName: string;
}

/** 品种识别结果 */
interface BreedDetectionResult {
  breed: string;
  confidence: number;
  alternatives: Array<{
    breed: string;
    confidence: number;
  }>;
}

/** 模型生成进度 */
interface ModelGenerationProgress {
  stage: 'preprocessing' | 'generating' | 'rigging' | 'complete' | 'error';
  progress: number;        // 0-100
  message?: string;
}

// ============================================
// 语音类型
// ============================================

/** 语音识别结果 */
interface SpeechRecognitionResult {
  text: string;
  confidence: number;
  isFinal: boolean;
}

/** 语音合成请求 */
interface SpeechSynthesisRequest {
  text: string;
  voice?: string;          // 语音ID
  speed?: number;          // 0.5-2.0
}

// ============================================
// 系统操作类型
// ============================================

/** 天气查询结果 */
interface WeatherResult {
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
  forecast: Array<{
    date: string;
    high: number;
    low: number;
    condition: string;
  }>;
}

/** 应用启动请求 */
interface LaunchAppRequest {
  appName: string;         // 应用名称或路径
  args?: string[];         // 启动参数
}
```

## Channel Definitions

### Chat Channels

#### `chat:send-message` (Invoke)

发送对话消息并获取AI回复。

```typescript
// Renderer → Main
interface Request {
  conversationId?: string;
  content: string;
  providerId?: string;
}

// Main → Renderer
interface Response extends IPCResult<SendMessageResponse> {}

// 使用示例
const result = await window.electronAPI.sendChatMessage({
  content: '你好，今天天气怎么样？'
});
```

#### `chat:send-message-stream` (Invoke + Events)

流式发送消息，通过事件返回增量响应。

```typescript
// Renderer → Main (启动流)
interface Request {
  conversationId?: string;
  content: string;
  providerId?: string;
}

// Main → Renderer (返回流ID)
interface Response extends IPCResult<{ streamId: string }> {}

// Main → Renderer (事件通道: chat:stream:{streamId})
interface StreamData extends StreamEvent<MessageChunk> {}

// 使用示例
const { data } = await window.electronAPI.sendChatMessageStream({
  content: '讲一个故事'
});
window.electronAPI.onChatStream(data.streamId, (event) => {
  if (event.type === 'data') {
    console.log('Delta:', event.data.delta);
  } else if (event.type === 'end') {
    console.log('Stream ended');
  }
});
```

#### `chat:get-history` (Invoke)

获取对话历史。

```typescript
// Renderer → Main
interface Request {
  conversationId: string;
  limit?: number;
  before?: string;
}

// Main → Renderer
interface Response extends IPCResult<{
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: string;
    toolCalls?: ToolCallResult[];
  }>;
  hasMore: boolean;
}> {}
```

#### `chat:list-conversations` (Invoke)

列出所有对话。

```typescript
// Renderer → Main
interface Request {
  limit?: number;
  offset?: number;
}

// Main → Renderer
interface Response extends IPCResult<{
  conversations: Array<{
    id: string;
    title: string;
    lastMessageAt: string;
    messageCount: number;
  }>;
  total: number;
}> {}
```

#### `chat:delete-conversation` (Invoke)

删除对话。

```typescript
// Renderer → Main
interface Request {
  conversationId: string;
}

// Main → Renderer
interface Response extends IPCResult<void> {}
```

---

### Pet Channels

#### `pet:get-state` (Invoke)

获取当前宠物状态。

```typescript
// Renderer → Main
interface Request {}

// Main → Renderer
interface Response extends IPCResult<PetStateData> {}
```

#### `pet:save-state` (Invoke)

保存宠物状态。

```typescript
// Renderer → Main
interface Request {
  state: PetStateData;
}

// Main → Renderer
interface Response extends IPCResult<void> {}
```

#### `pet:list-skins` (Invoke)

列出可用皮肤。

```typescript
// Renderer → Main
interface Request {}

// Main → Renderer
interface Response extends IPCResult<{
  skins: Array<{
    id: string;
    name: string;
    thumbnailPath: string;
    breed: string | null;
    isDefault: boolean;
  }>;
}> {}
```

---

### Reminder Channels

#### `reminder:create` (Invoke)

创建提醒。

```typescript
// Renderer → Main
interface Request extends CreateReminderRequest {}

// Main → Renderer
interface Response extends IPCResult<ReminderData> {}
```

#### `reminder:list` (Invoke)

列出提醒。

```typescript
// Renderer → Main
interface Request {
  includeCompleted?: boolean;
  from?: string;           // ISO 8601
  to?: string;             // ISO 8601
}

// Main → Renderer
interface Response extends IPCResult<{
  reminders: ReminderData[];
}> {}
```

#### `reminder:complete` (Invoke)

标记提醒完成。

```typescript
// Renderer → Main
interface Request {
  reminderId: string;
}

// Main → Renderer
interface Response extends IPCResult<void> {}
```

#### `reminder:delete` (Invoke)

删除提醒。

```typescript
// Renderer → Main
interface Request {
  reminderId: string;
}

// Main → Renderer
interface Response extends IPCResult<void> {}
```

#### `reminder:triggered` (Event: Main → Renderer)

提醒触发事件。

```typescript
// Main → Renderer
interface EventData {
  reminder: ReminderData;
}
```

---

### Settings Channels

#### `settings:get` (Invoke)

获取设置值。

```typescript
// Renderer → Main
interface Request {
  key: string;
}

// Main → Renderer
interface Response extends IPCResult<{
  value: string | null;    // JSON序列化的值
}> {}
```

#### `settings:set` (Invoke)

设置值。

```typescript
// Renderer → Main
interface Request {
  key: string;
  value: string;           // JSON序列化的值
}

// Main → Renderer
interface Response extends IPCResult<void> {}
```

#### `settings:get-all` (Invoke)

获取所有设置。

```typescript
// Renderer → Main
interface Request {}

// Main → Renderer
interface Response extends IPCResult<{
  settings: SettingEntry[];
}> {}
```

#### `settings:list-ai-providers` (Invoke)

列出AI提供商配置。

```typescript
// Renderer → Main
interface Request {}

// Main → Renderer
interface Response extends IPCResult<{
  providers: AIProviderConfig[];
}> {}
```

#### `settings:save-ai-provider` (Invoke)

保存AI提供商配置。

```typescript
// Renderer → Main
interface Request {
  provider: Omit<AIProviderConfig, 'id'> & { id?: string };
  apiKey?: string;         // 仅在新建或更新密钥时提供
}

// Main → Renderer
interface Response extends IPCResult<{
  providerId: string;
}> {}
```

#### `settings:check-ai-provider` (Invoke)

测试AI提供商连接。

```typescript
// Renderer → Main
interface Request {
  providerId: string;
}

// Main → Renderer
interface Response extends IPCResult<{
  available: boolean;
  latency?: number;        // ms
  error?: string;
}> {}
```

---

### Window Channels

#### `window:open-chat` (Invoke)

打开对话窗口。

```typescript
// Renderer → Main
interface Request {
  conversationId?: string;
}

// Main → Renderer
interface Response extends IPCResult<void> {}
```

#### `window:open-settings` (Invoke)

打开设置窗口。

```typescript
// Renderer → Main
interface Request {
  tab?: 'general' | 'ai' | 'appearance' | 'about';
}

// Main → Renderer
interface Response extends IPCResult<void> {}
```

#### `window:minimize-to-tray` (Invoke)

最小化到托盘。

```typescript
// Renderer → Main
interface Request {}

// Main → Renderer
interface Response extends IPCResult<void> {}
```

#### `window:quit` (Invoke)

退出应用。

```typescript
// Renderer → Main
interface Request {}

// Main → Renderer
interface Response extends IPCResult<void> {}
```

---

### Skin Channels

#### `skin:upload-photo` (Invoke)

上传宠物照片。

```typescript
// Renderer → Main
interface Request extends UploadPhotoRequest {}

// Main → Renderer
interface Response extends IPCResult<{
  photoId: string;
  filePath: string;
}> {}
```

#### `skin:detect-breed` (Invoke)

识别宠物品种。

```typescript
// Renderer → Main
interface Request {
  photoId: string;
}

// Main → Renderer
interface Response extends IPCResult<BreedDetectionResult> {}
```

#### `skin:generate-model` (Invoke)

生成3D模型（长时间操作，通过事件返回进度）。

```typescript
// Renderer → Main
interface Request {
  photoId: string;
  breed: string;
}

// Main → Renderer (立即返回任务ID)
interface Response extends IPCResult<{
  taskId: string;
}> {}

// Main → Renderer (事件通道: skin:generation-progress:{taskId})
interface ProgressEvent extends ModelGenerationProgress {}
```

#### `skin:apply` (Invoke)

应用皮肤。

```typescript
// Renderer → Main
interface Request {
  skinId: string;
}

// Main → Renderer
interface Response extends IPCResult<void> {}
```

#### `skin:delete` (Invoke)

删除皮肤。

```typescript
// Renderer → Main
interface Request {
  skinId: string;
}

// Main → Renderer
interface Response extends IPCResult<void> {}
```

---

### Voice Channels

#### `voice:start-recognition` (Invoke)

开始语音识别。

```typescript
// Renderer → Main
interface Request {}

// Main → Renderer (返回会话ID)
interface Response extends IPCResult<{
  sessionId: string;
}> {}

// Main → Renderer (事件通道: voice:recognition:{sessionId})
interface RecognitionEvent extends StreamEvent<SpeechRecognitionResult> {}
```

#### `voice:stop-recognition` (Invoke)

停止语音识别。

```typescript
// Renderer → Main
interface Request {
  sessionId: string;
}

// Main → Renderer
interface Response extends IPCResult<{
  finalText: string;
}> {}
```

#### `voice:synthesize` (Invoke)

语音合成。

```typescript
// Renderer → Main
interface Request extends SpeechSynthesisRequest {}

// Main → Renderer
interface Response extends IPCResult<{
  audioData: string;       // Base64编码的音频数据
  duration: number;        // 秒
}> {}
```

#### `voice:list-voices` (Invoke)

列出可用语音。

```typescript
// Renderer → Main
interface Request {}

// Main → Renderer
interface Response extends IPCResult<{
  voices: Array<{
    id: string;
    name: string;
    language: string;
    gender: 'male' | 'female' | 'neutral';
  }>;
}> {}
```

---

### System Channels

#### `system:get-weather` (Invoke)

获取天气信息。

```typescript
// Renderer → Main
interface Request {
  location?: string;       // 不提供则使用IP定位
}

// Main → Renderer
interface Response extends IPCResult<WeatherResult> {}
```

#### `system:launch-app` (Invoke)

启动应用程序。

```typescript
// Renderer → Main
interface Request extends LaunchAppRequest {}

// Main → Renderer
interface Response extends IPCResult<{
  success: boolean;
  pid?: number;
}> {}
```

#### `system:create-note` (Invoke)

创建笔记（保存到本地文件）。

```typescript
// Renderer → Main
interface Request {
  title: string;
  content: string;
}

// Main → Renderer
interface Response extends IPCResult<{
  filePath: string;
}> {}
```

#### `system:get-displays` (Invoke)

获取显示器信息。

```typescript
// Renderer → Main
interface Request {}

// Main → Renderer
interface Response extends IPCResult<{
  displays: Array<{
    id: number;
    name: string;
    bounds: { x: number; y: number; width: number; height: number };
    isPrimary: boolean;
  }>;
}> {}
```

---

### Storage Channels

#### `storage:get-credential` (Invoke)

获取凭证（检查是否存在，不返回实际值）。

```typescript
// Renderer → Main
interface Request {
  service: string;
  account: string;
}

// Main → Renderer
interface Response extends IPCResult<{
  exists: boolean;
}> {}
```

#### `storage:set-credential` (Invoke)

设置凭证。

```typescript
// Renderer → Main
interface Request {
  service: string;
  account: string;
  password: string;
}

// Main → Renderer
interface Response extends IPCResult<void> {}
```

#### `storage:delete-credential` (Invoke)

删除凭证。

```typescript
// Renderer → Main
interface Request {
  service: string;
  account: string;
}

// Main → Renderer
interface Response extends IPCResult<void> {}
```

## Preload Script Implementation

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// 类型安全的IPC调用包装
function invoke<TRequest, TResponse>(channel: string) {
  return async (request: TRequest): Promise<TResponse> => {
    return ipcRenderer.invoke(channel, request);
  };
}

// 类型安全的事件监听包装
function on<TData>(channel: string) {
  return (callback: (data: TData) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: TData) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

// 暴露给渲染进程的API
const electronAPI = {
  // Chat
  sendChatMessage: invoke<SendMessageRequest, IPCResult<SendMessageResponse>>('chat:send-message'),
  sendChatMessageStream: invoke<SendMessageRequest, IPCResult<{ streamId: string }>>('chat:send-message-stream'),
  onChatStream: (streamId: string, callback: (event: StreamEvent<MessageChunk>) => void) => {
    return on<StreamEvent<MessageChunk>>(`chat:stream:${streamId}`)(callback);
  },
  getChatHistory: invoke<GetHistoryRequest, IPCResult<{ messages: any[]; hasMore: boolean }>>('chat:get-history'),
  listConversations: invoke<{ limit?: number; offset?: number }, IPCResult<{ conversations: any[]; total: number }>>('chat:list-conversations'),
  deleteConversation: invoke<{ conversationId: string }, IPCResult<void>>('chat:delete-conversation'),

  // Pet
  getPetState: invoke<{}, IPCResult<PetStateData>>('pet:get-state'),
  savePetState: invoke<{ state: PetStateData }, IPCResult<void>>('pet:save-state'),
  listPetSkins: invoke<{}, IPCResult<{ skins: any[] }>>('pet:list-skins'),

  // Reminder
  createReminder: invoke<CreateReminderRequest, IPCResult<ReminderData>>('reminder:create'),
  listReminders: invoke<{ includeCompleted?: boolean; from?: string; to?: string }, IPCResult<{ reminders: ReminderData[] }>>('reminder:list'),
  completeReminder: invoke<{ reminderId: string }, IPCResult<void>>('reminder:complete'),
  deleteReminder: invoke<{ reminderId: string }, IPCResult<void>>('reminder:delete'),
  onReminderTriggered: on<{ reminder: ReminderData }>('reminder:triggered'),

  // Settings
  getSetting: invoke<{ key: string }, IPCResult<{ value: string | null }>>('settings:get'),
  setSetting: invoke<{ key: string; value: string }, IPCResult<void>>('settings:set'),
  getAllSettings: invoke<{}, IPCResult<{ settings: SettingEntry[] }>>('settings:get-all'),
  listAIProviders: invoke<{}, IPCResult<{ providers: AIProviderConfig[] }>>('settings:list-ai-providers'),
  saveAIProvider: invoke<{ provider: any; apiKey?: string }, IPCResult<{ providerId: string }>>('settings:save-ai-provider'),
  checkAIProvider: invoke<{ providerId: string }, IPCResult<{ available: boolean; latency?: number; error?: string }>>('settings:check-ai-provider'),

  // Window
  openChatWindow: invoke<{ conversationId?: string }, IPCResult<void>>('window:open-chat'),
  openSettingsWindow: invoke<{ tab?: string }, IPCResult<void>>('window:open-settings'),
  minimizeToTray: invoke<{}, IPCResult<void>>('window:minimize-to-tray'),
  quit: invoke<{}, IPCResult<void>>('window:quit'),

  // Skin
  uploadPhoto: invoke<UploadPhotoRequest, IPCResult<{ photoId: string; filePath: string }>>('skin:upload-photo'),
  detectBreed: invoke<{ photoId: string }, IPCResult<BreedDetectionResult>>('skin:detect-breed'),
  generateModel: invoke<{ photoId: string; breed: string }, IPCResult<{ taskId: string }>>('skin:generate-model'),
  onModelGenerationProgress: (taskId: string, callback: (progress: ModelGenerationProgress) => void) => {
    return on<ModelGenerationProgress>(`skin:generation-progress:${taskId}`)(callback);
  },
  applySkin: invoke<{ skinId: string }, IPCResult<void>>('skin:apply'),
  deleteSkin: invoke<{ skinId: string }, IPCResult<void>>('skin:delete'),

  // Voice
  startRecognition: invoke<{}, IPCResult<{ sessionId: string }>>('voice:start-recognition'),
  stopRecognition: invoke<{ sessionId: string }, IPCResult<{ finalText: string }>>('voice:stop-recognition'),
  onRecognitionResult: (sessionId: string, callback: (result: StreamEvent<SpeechRecognitionResult>) => void) => {
    return on<StreamEvent<SpeechRecognitionResult>>(`voice:recognition:${sessionId}`)(callback);
  },
  synthesizeSpeech: invoke<SpeechSynthesisRequest, IPCResult<{ audioData: string; duration: number }>>('voice:synthesize'),
  listVoices: invoke<{}, IPCResult<{ voices: any[] }>>('voice:list-voices'),

  // System
  getWeather: invoke<{ location?: string }, IPCResult<WeatherResult>>('system:get-weather'),
  launchApp: invoke<LaunchAppRequest, IPCResult<{ success: boolean; pid?: number }>>('system:launch-app'),
  createNote: invoke<{ title: string; content: string }, IPCResult<{ filePath: string }>>('system:create-note'),
  getDisplays: invoke<{}, IPCResult<{ displays: any[] }>>('system:get-displays'),

  // Storage (凭证管理)
  checkCredential: invoke<{ service: string; account: string }, IPCResult<{ exists: boolean }>>('storage:get-credential'),
  setCredential: invoke<{ service: string; account: string; password: string }, IPCResult<void>>('storage:set-credential'),
  deleteCredential: invoke<{ service: string; account: string }, IPCResult<void>>('storage:delete-credential'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript类型声明
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
```

## Main Process Handler Registration

```typescript
// src/main/ipc/handlers.ts
import { ipcMain, BrowserWindow } from 'electron';

// Handler注册辅助函数
function handle<TRequest, TResponse>(
  channel: string,
  handler: (request: TRequest, window: BrowserWindow) => Promise<TResponse>
) {
  ipcMain.handle(channel, async (event, request: TRequest) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    try {
      const data = await handler(request, window!);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: {
          code: error.code || 'UNKNOWN_ERROR',
          message: error.message,
          details: error.details,
        },
      };
    }
  });
}

// 注册所有handlers
export function registerIPCHandlers() {
  // Chat handlers
  handle('chat:send-message', async (request, window) => {
    const aiService = getAIService();
    return aiService.sendMessage(request);
  });

  handle('chat:send-message-stream', async (request, window) => {
    const streamId = generateStreamId();
    const aiService = getAIService();
    
    // 异步处理流
    aiService.sendMessageStream(request, {
      onChunk: (chunk) => {
        window.webContents.send(`chat:stream:${streamId}`, {
          type: 'data',
          data: chunk,
        });
      },
      onEnd: () => {
        window.webContents.send(`chat:stream:${streamId}`, {
          type: 'end',
        });
      },
      onError: (error) => {
        window.webContents.send(`chat:stream:${streamId}`, {
          type: 'error',
          error: error.message,
        });
      },
    });

    return { streamId };
  });

  // ... 其他handlers
}
```

## Error Codes

| Code | Description | Recovery |
|------|-------------|----------|
| `INVALID_REQUEST` | 请求参数无效 | 检查请求参数 |
| `NOT_FOUND` | 资源不存在 | 检查ID是否正确 |
| `AI_SERVICE_ERROR` | AI服务错误 | 重试或切换提供商 |
| `AI_RATE_LIMITED` | AI服务限流 | 等待后重试 |
| `AI_TIMEOUT` | AI服务超时 | 重试 |
| `STORAGE_ERROR` | 存储操作失败 | 检查磁盘空间 |
| `CREDENTIAL_ERROR` | 凭证操作失败 | 检查系统凭证管理器 |
| `VOICE_ERROR` | 语音服务错误 | 检查麦克风权限 |
| `MODEL_GENERATION_ERROR` | 模型生成失败 | 重试或更换照片 |
| `NETWORK_ERROR` | 网络错误 | 检查网络连接 |
| `PERMISSION_DENIED` | 权限不足 | 检查应用权限 |
| `UNKNOWN_ERROR` | 未知错误 | 查看日志 |

## Security Considerations

1. **Context Isolation**: 始终启用 `contextIsolation: true`
2. **Node Integration**: 始终禁用 `nodeIntegration: false`
3. **API密钥**: 不通过IPC传输API密钥值，仅在Main进程中使用
4. **输入验证**: 所有IPC请求在Main进程中进行验证
5. **文件路径**: 验证所有文件路径，防止路径遍历攻击
6. **命令执行**: `system:launch-app` 仅允许白名单应用

## Related Contracts

- [AI Service Contract](./ai-service.md) - AI对话服务接口
- [Pet Service Contract](./pet-service.md) - 宠物渲染和状态管理