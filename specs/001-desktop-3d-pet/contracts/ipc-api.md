# IPC API Contracts: 桌面3D小宠物

**Branch**: `001-desktop-3d-pet` | **Date**: 2026-02-08  
**Purpose**: 定义 Electron 主进程与渲染进程之间的 IPC 通信接口

## Overview

本应用采用 Electron 的 contextBridge 机制实现安全的进程间通信。所有 IPC 调用通过 preload 脚本暴露给渲染进程。

## Preload API Structure

```typescript
// preload/index.ts 暴露的 API 结构
interface ElectronAPI {
  // 窗口控制
  window: WindowAPI;
  // 宠物相关
  pet: PetAPI;
  // AI 对话
  ai: AIAPI;
  // 提醒功能
  reminder: ReminderAPI;
  // 设置管理
  settings: SettingsAPI;
  // 语音功能
  voice: VoiceAPI;
  // 换肤功能
  skin: SkinAPI;
  // 系统功能
  system: SystemAPI;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

---

## 1. Window API

窗口控制相关接口。

### Channels

| Channel | Direction | Description |
|---------|-----------|-------------|
| `window:move` | Renderer → Main | 移动窗口位置 |
| `window:get-position` | Renderer → Main | 获取当前窗口位置 |
| `window:set-always-on-top` | Renderer → Main | 设置窗口置顶 |
| `window:minimize` | Renderer → Main | 最小化到托盘 |
| `window:get-displays` | Renderer → Main | 获取显示器列表 |

### Interface

```typescript
interface WindowAPI {
  /**
   * 移动窗口到指定位置
   * @param x - X坐标
   * @param y - Y坐标
   */
  move(x: number, y: number): Promise<void>;
  
  /**
   * 获取当前窗口位置
   * @returns 窗口位置和所在显示器
   */
  getPosition(): Promise<{
    x: number;
    y: number;
    monitor: number;
  }>;
  
  /**
   * 设置窗口置顶状态
   * @param alwaysOnTop - 是否置顶
   */
  setAlwaysOnTop(alwaysOnTop: boolean): Promise<void>;
  
  /**
   * 最小化窗口到系统托盘
   */
  minimize(): Promise<void>;
  
  /**
   * 获取所有显示器信息
   */
  getDisplays(): Promise<DisplayInfo[]>;
}

interface DisplayInfo {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
}
```

### Implementation Notes

- 窗口位置变化时自动持久化到数据库
- 支持多显示器，记住宠物所在的显示器
- 拖拽边界限制在屏幕可见范围内

---

## 2. Pet API

宠物状态和交互相关接口。

### Channels

| Channel | Direction | Description |
|---------|-----------|-------------|
| `pet:get-state` | Renderer → Main | 获取宠物状态 |
| `pet:set-animation` | Renderer → Main | 设置动画状态 |
| `pet:save-position` | Renderer → Main | 保存宠物位置 |
| `pet:state-changed` | Main → Renderer | 宠物状态变化通知 |

### Interface

```typescript
interface PetAPI {
  /**
   * 获取宠物当前状态
   */
  getState(): Promise<PetState>;
  
  /**
   * 设置宠物动画状态
   * @param animation - 动画状态名称
   * @param options - 动画选项
   */
  setAnimation(
    animation: AnimationState,
    options?: AnimationOptions
  ): Promise<void>;
  
  /**
   * 保存宠物位置
   * @param position - 位置信息
   */
  savePosition(position: PetPosition): Promise<void>;
  
  /**
   * 监听宠物状态变化
   * @param callback - 状态变化回调
   * @returns 取消监听函数
   */
  onStateChanged(callback: (state: PetState) => void): () => void;
}

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
  /** 过渡时长(ms)，默认300 */
  transitionDuration?: number;
  /** 是否循环播放 */
  loop?: boolean;
  /** 播放完成后的状态 */
  nextState?: AnimationState;
}

interface PetState {
  animation: AnimationState;
  position: PetPosition;
  skinId: string;
  emotionalValue: number;
}

interface PetPosition {
  x: number;
  y: number;
  monitor: number;
}
```

---

## 3. AI API

AI 对话相关接口。

### Channels

| Channel | Direction | Description |
|---------|-----------|-------------|
| `ai:send-message` | Renderer → Main | 发送消息 |
| `ai:cancel` | Renderer → Main | 取消当前请求 |
| `ai:get-conversations` | Renderer → Main | 获取对话列表 |
| `ai:get-messages` | Renderer → Main | 获取对话消息 |
| `ai:create-conversation` | Renderer → Main | 创建新对话 |
| `ai:delete-conversation` | Renderer → Main | 删除对话 |
| `ai:get-providers` | Renderer → Main | 获取AI提供商列表 |
| `ai:set-provider-key` | Renderer → Main | 设置API密钥 |
| `ai:response-start` | Main → Renderer | AI开始响应 |
| `ai:response-chunk` | Main → Renderer | AI响应流式输出 |
| `ai:response-complete` | Main → Renderer | AI响应完成 |
| `ai:response-error` | Main → Renderer | AI响应错误 |
| `ai:tool-call` | Main → Renderer | 工具调用通知 |

### Interface

```typescript
interface AIAPI {
  /**
   * 发送消息并获取AI响应
   * @param conversationId - 对话ID
   * @param content - 消息内容
   * @returns 请求ID（用于取消）
   */
  sendMessage(conversationId: string, content: string): Promise<string>;
  
  /**
   * 取消正在进行的AI请求
   * @param requestId - 请求ID
   */
  cancel(requestId: string): Promise<void>;
  
  /**
   * 获取对话列表
   * @param limit - 限制数量，默认20
   * @param offset - 偏移量，默认0
   */
  getConversations(limit?: number, offset?: number): Promise<ConversationInfo[]>;
  
  /**
   * 获取对话消息
   * @param conversationId - 对话ID
   * @param limit - 限制数量
   */
  getMessages(conversationId: string, limit?: number): Promise<MessageInfo[]>;
  
  /**
   * 创建新对话
   * @param options - 对话选项
   */
  createConversation(options?: CreateConversationOptions): Promise<string>;
  
  /**
   * 删除对话
   * @param conversationId - 对话ID
   */
  deleteConversation(conversationId: string): Promise<void>;
  
  /**
   * 获取AI提供商列表
   */
  getProviders(): Promise<AIProviderInfo[]>;
  
  /**
   * 设置AI提供商API密钥
   * @param providerId - 提供商ID
   * @param apiKey - API密钥
   */
  setProviderKey(providerId: string, apiKey: string): Promise<void>;
  
  /**
   * 检查API密钥是否已设置
   * @param providerId - 提供商ID
   */
  hasProviderKey(providerId: string): Promise<boolean>;
  
  // 事件监听
  onResponseStart(callback: (data: ResponseStartEvent) => void): () => void;
  onResponseChunk(callback: (data: ResponseChunkEvent) => void): () => void;
  onResponseComplete(callback: (data: ResponseCompleteEvent) => void): () => void;
  onResponseError(callback: (data: ResponseErrorEvent) => void): () => void;
  onToolCall(callback: (data: ToolCallEvent) => void): () => void;
}

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
  /** 累计内容 */
  accumulated: string;
}

interface ResponseCompleteEvent {
  requestId: string;
  messageId: string;
  content: string;
  /** 情感分析结果：positive/negative/neutral */
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

interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}
```

### Response Time Requirements

- 首字符响应：< 3秒（SC-005）
- 流式输出间隔：< 100ms
- 错误响应：< 1秒

---

## 4. Reminder API

提醒功能相关接口。

### Channels

| Channel | Direction | Description |
|---------|-----------|-------------|
| `reminder:create` | Renderer → Main | 创建提醒 |
| `reminder:update` | Renderer → Main | 更新提醒 |
| `reminder:delete` | Renderer → Main | 删除提醒 |
| `reminder:list` | Renderer → Main | 获取提醒列表 |
| `reminder:complete` | Renderer → Main | 标记完成 |
| `reminder:snooze` | Renderer → Main | 延后提醒 |
| `reminder:triggered` | Main → Renderer | 提醒触发通知 |

### Interface

```typescript
interface ReminderAPI {
  /**
   * 创建提醒
   * @param reminder - 提醒信息
   */
  create(reminder: CreateReminderInput): Promise<string>;
  
  /**
   * 更新提醒
   * @param id - 提醒ID
   * @param updates - 更新内容
   */
  update(id: string, updates: UpdateReminderInput): Promise<void>;
  
  /**
   * 删除提醒
   * @param id - 提醒ID
   */
  delete(id: string): Promise<void>;
  
  /**
   * 获取提醒列表
   * @param options - 查询选项
   */
  list(options?: ListRemindersOptions): Promise<ReminderInfo[]>;
  
  /**
   * 标记提醒完成
   * @param id - 提醒ID
   */
  complete(id: string): Promise<void>;
  
  /**
   * 延后提醒
   * @param id - 提醒ID
   * @param minutes - 延后分钟数
   */
  snooze(id: string, minutes: number): Promise<void>;
  
  /**
   * 监听提醒触发
   * @param callback - 触发回调
   */
  onTriggered(callback: (reminder: ReminderInfo) => void): () => void;
}

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
  /** 是否包含已完成的 */
  includeCompleted?: boolean;
  /** 开始时间 */
  from?: number;
  /** 结束时间 */
  to?: number;
  /** 限制数量 */
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
```

---

## 5. Settings API

设置管理相关接口。

### Channels

| Channel | Direction | Description |
|---------|-----------|-------------|
| `settings:get` | Renderer → Main | 获取设置值 |
| `settings:set` | Renderer → Main | 设置值 |
| `settings:get-all` | Renderer → Main | 获取所有设置 |
| `settings:reset` | Renderer → Main | 重置设置 |
| `settings:changed` | Main → Renderer | 设置变化通知 |

### Interface

```typescript
interface SettingsAPI {
  /**
   * 获取设置值
   * @param key - 设置键
   * @returns 设置值，未设置则返回默认值
   */
  get<T>(key: SettingKey): Promise<T>;
  
  /**
   * 设置值
   * @param key - 设置键
   * @param value - 设置值
   */
  set<T>(key: SettingKey, value: T): Promise<void>;
  
  /**
   * 获取所有设置
   */
  getAll(): Promise<Settings>;
  
  /**
   * 重置设置为默认值
   * @param key - 设置键（可选，不传则重置所有）
   */
  reset(key?: SettingKey): Promise<void>;
  
  /**
   * 监听设置变化
   * @param callback - 变化回调
   */
  onChanged(callback: (key: SettingKey, value: unknown) => void): () => void;
}

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
```

---

## 6. Voice API

语音功能相关接口。

### Channels

| Channel | Direction | Description |
|---------|-----------|-------------|
| `voice:start-recognition` | Renderer → Main | 开始语音识别 |
| `voice:stop-recognition` | Renderer → Main | 停止语音识别 |
| `voice:speak` | Renderer → Main | 语音合成播放 |
| `voice:stop-speaking` | Renderer → Main | 停止语音播放 |
| `voice:recognition-result` | Main → Renderer | 识别结果 |
| `voice:recognition-error` | Main → Renderer | 识别错误 |

### Interface

```typescript
interface VoiceAPI {
  /**
   * 开始语音识别
   * @param options - 识别选项
   */
  startRecognition(options?: RecognitionOptions): Promise<void>;
  
  /**
   * 停止语音识别
   */
  stopRecognition(): Promise<void>;
  
  /**
   * 语音合成播放
   * @param text - 要播放的文本
   * @param options - 播放选项
   */
  speak(text: string, options?: SpeakOptions): Promise<void>;
  
  /**
   * 停止语音播放
   */
  stopSpeaking(): Promise<void>;
  
  /**
   * 检查语音功能是否可用
   */
  isAvailable(): Promise<VoiceAvailability>;
  
  /**
   * 监听识别结果
   */
  onRecognitionResult(callback: (result: RecognitionResult) => void): () => void;
  
  /**
   * 监听识别错误
   */
  onRecognitionError(callback: (error: RecognitionError) => void): () => void;
}

interface RecognitionOptions {
  /** 语言，默认 zh-CN */
  language?: string;
  /** 是否返回中间结果 */
  interimResults?: boolean;
  /** 最大识别时长(ms)，默认10000 */
  maxDuration?: number;
}

interface SpeakOptions {
  /** 语音速率，默认1.0 */
  rate?: number;
  /** 音调，默认1.0 */
  pitch?: number;
  /** 音量，默认1.0 */
  volume?: number;
  /** 语音名称 */
  voice?: string;
}

interface VoiceAvailability {
  recognition: boolean;
  synthesis: boolean;
  recognitionError?: string;
  synthesisError?: string;
}

interface RecognitionResult {
  /** 识别文本 */
  text: string;
  /** 是否为最终结果 */
  isFinal: boolean;
  /** 置信度 */
  confidence: number;
}

interface RecognitionError {
  code: 'no-speech' | 'audio-capture' | 'not-allowed' | 'network' | 'unknown';
  message: string;
}
```

### Performance Requirements

- 识别延迟：< 500ms（SC-009）
- 识别准确率：≥ 90%（安静环境，SC-008）

---

## 7. Skin API

换肤功能相关接口。

### Channels

| Channel | Direction | Description |
|---------|-----------|-------------|
| `skin:list` | Renderer → Main | 获取皮肤列表 |
| `skin:apply` | Renderer → Main | 应用皮肤 |
| `skin:upload-photo` | Renderer → Main | 上传照片 |
| `skin:generate-model` | Renderer → Main | 生成3D模型 |
| `skin:delete` | Renderer → Main | 删除皮肤 |
| `skin:generation-progress` | Main → Renderer | 生成进度 |

### Interface

```typescript
interface SkinAPI {
  /**
   * 获取皮肤列表
   */
  list(): Promise<SkinInfo[]>;
  
  /**
   * 应用皮肤
   * @param skinId - 皮肤ID
   */
  apply(skinId: string): Promise<void>;
  
  /**
   * 上传宠物照片并识别品种
   * @param imagePath - 图片路径
   */
  uploadPhoto(imagePath: string): Promise<PhotoAnalysisResult>;
  
  /**
   * 从照片生成3D模型
   * @param analysisId - 照片分析ID
   * @param options - 生成选项
   */
  generateModel(
    analysisId: string,
    options?: ModelGenerationOptions
  ): Promise<string>;
  
  /**
   * 删除皮肤
   * @param skinId - 皮肤ID
   */
  delete(skinId: string): Promise<void>;
  
  /**
   * 监听模型生成进度
   */
  onGenerationProgress(callback: (progress: GenerationProgress) => void): () => void;
}

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
  /** 候选品种列表 */
  alternatives: Array<{ breed: string; confidence: number }>;
  /** 预览图路径 */
  previewPath: string;
}

interface ModelGenerationOptions {
  /** 皮肤名称 */
  name?: string;
  /** 使用云端API（Meshy）而非本地 */
  useCloud?: boolean;
}

interface GenerationProgress {
  analysisId: string;
  stage: 'preparing' | 'generating' | 'rigging' | 'finalizing';
  progress: number;
  message: string;
}
```

### Performance Requirements

- 品种识别准确率：≥ 85%（常见品种，SC-010）
- 本地模型生成：< 30秒（有GPU，SC-011）

---

## 8. System API

系统功能相关接口。

### Channels

| Channel | Direction | Description |
|---------|-----------|-------------|
| `system:get-info` | Renderer → Main | 获取系统信息 |
| `system:open-external` | Renderer → Main | 打开外部链接 |
| `system:show-notification` | Renderer → Main | 显示系统通知 |
| `system:get-auto-start` | Renderer → Main | 获取自启动状态 |
| `system:set-auto-start` | Renderer → Main | 设置自启动 |
| `system:check-update` | Renderer → Main | 检查更新 |
| `system:quit` | Renderer → Main | 退出应用 |

### Interface

```typescript
interface SystemAPI {
  /**
   * 获取系统信息
   */
  getInfo(): Promise<SystemInfo>;
  
  /**
   * 打开外部链接或应用
   * @param target - URL或应用路径
   */
  openExternal(target: string): Promise<void>;
  
  /**
   * 显示系统通知
   * @param options - 通知选项
   */
  showNotification(options: NotificationOptions): Promise<void>;
  
  /**
   * 获取自启动状态
   */
  getAutoStart(): Promise<boolean>;
  
  /**
   * 设置自启动
   * @param enabled - 是否启用
   */
  setAutoStart(enabled: boolean): Promise<void>;
  
  /**
   * 检查更新
   */
  checkUpdate(): Promise<UpdateInfo | null>;
  
  /**
   * 退出应用
   */
  quit(): Promise<void>;
}

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
  /** 点击通知时的动作 */
  onClick?: 'focus' | 'open-chat' | 'show-reminder';
  /** 通知关联的数据ID */
  actionData?: string;
}

interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  downloadUrl: string;
}
```

---

## Error Handling

### Error Response Format

```typescript
interface IPCError {
  code: string;
  message: string;
  details?: unknown;
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `ERR_NOT_FOUND` | 资源不存在 |
| `ERR_INVALID_INPUT` | 输入参数无效 |
| `ERR_NETWORK` | 网络错误 |
| `ERR_AI_UNAVAILABLE` | AI服务不可用 |
| `ERR_API_KEY_MISSING` | API密钥未设置 |
| `ERR_PERMISSION_DENIED` | 权限不足 |
| `ERR_TIMEOUT` | 操作超时 |
| `ERR_CANCELLED` | 操作被取消 |
| `ERR_INTERNAL` | 内部错误 |

---

## Security Considerations

1. **Context Isolation**: 渲染进程无法直接访问 Node.js API
2. **Input Validation**: 所有 IPC 输入在主进程中验证
3. **Sanitization**: 敏感信息（API密钥）不通过 IPC 传输
4. **Rate Limiting**: 防止 IPC 调用滥用