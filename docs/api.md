# API 文档

桌面3D小宠物应用的完整 API 参考文档。

## 目录

- [IPC API](#ipc-api)
  - [Pet API](#pet-api)
  - [AI API](#ai-api)
  - [Settings API](#settings-api)
  - [Window API](#window-api)
  - [Reminder API](#reminder-api)
  - [Voice API](#voice-api)
  - [Skin API](#skin-api)
  - [System API](#system-api)
- [事件系统](#事件系统)
- [MCP 服务器 API](#mcp-服务器-api)
- [数据模型](#数据模型)

---

## IPC API

所有 IPC 通信通过 `window.electronAPI` 对象在渲染进程中访问。

### Pet API

宠物状态和动画控制。

#### `pet:getState`

获取宠物当前状态。

```typescript
// 请求
window.electronAPI.invoke('pet:getState')

// 响应
interface PetState {
  id: string;
  name: string;
  skinId: string;
  mood: 'happy' | 'neutral' | 'sad' | 'excited' | 'sleepy';
  energy: number; // 0-100
  animationState: string;
  position: { x: number; y: number };
}
```

#### `pet:setPosition`

设置宠物窗口位置。

```typescript
// 请求
window.electronAPI.invoke('pet:setPosition', {
  x: number;
  y: number;
})

// 响应
{ success: boolean }
```

#### `pet:playAnimation`

播放指定动画。

```typescript
// 请求
window.electronAPI.invoke('pet:playAnimation', {
  animation: 'idle' | 'happy' | 'sad' | 'thinking' | 'drag' | 'curious' | 
             'confused' | 'celebrating' | 'listening' | 'sleepy';
  loop?: boolean;
})

// 响应
{ success: boolean }
```

#### `pet:updateMood`

更新宠物情绪。

```typescript
// 请求
window.electronAPI.invoke('pet:updateMood', {
  mood: 'happy' | 'neutral' | 'sad' | 'excited' | 'sleepy';
})

// 响应
{ success: boolean }
```

---

### AI API

AI 对话和智能功能。

#### `ai:sendMessage`

发送消息给 AI。

```typescript
// 请求
window.electronAPI.invoke('ai:sendMessage', {
  conversationId?: string;
  message: string;
  attachments?: Array<{
    type: 'image' | 'file';
    data: string; // base64
    name: string;
  }>;
})

// 响应
interface AIResponse {
  conversationId: string;
  messageId: string;
  content: string;
  emotion?: 'happy' | 'neutral' | 'sad' | 'excited' | 'curious' | 'confused';
  actions?: Array<{
    type: string;
    params: Record<string, any>;
  }>;
}
```

#### `ai:getConversations`

获取对话历史列表。

```typescript
// 请求
window.electronAPI.invoke('ai:getConversations', {
  limit?: number;
  offset?: number;
})

// 响应
interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  lastMessageAt: string; // ISO 8601
  messageCount: number;
}[]
```

#### `ai:getConversation`

获取单个对话详情。

```typescript
// 请求
window.electronAPI.invoke('ai:getConversation', {
  conversationId: string;
})

// 响应
interface ConversationDetail {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}
```

#### `ai:deleteConversation`

删除对话。

```typescript
// 请求
window.electronAPI.invoke('ai:deleteConversation', {
  conversationId: string;
})

// 响应
{ success: boolean }
```

#### `ai:getProviders`

获取可用的 AI 提供商列表。

```typescript
// 请求
window.electronAPI.invoke('ai:getProviders')

// 响应
interface AIProvider {
  id: string;
  name: string;
  type: 'openai' | 'claude' | 'ollama';
  isConfigured: boolean;
  isAvailable: boolean;
  models: string[];
}[]
```

#### `ai:setProvider`

设置活动 AI 提供商。

```typescript
// 请求
window.electronAPI.invoke('ai:setProvider', {
  providerId: string;
  model?: string;
})

// 响应
{ success: boolean }
```

---

### Settings API

应用设置管理。

#### `settings:get`

获取设置值。

```typescript
// 请求
window.electronAPI.invoke('settings:get', {
  key: string;
})

// 响应
any // 设置值
```

#### `settings:set`

设置值。

```typescript
// 请求
window.electronAPI.invoke('settings:set', {
  key: string;
  value: any;
})

// 响应
{ success: boolean }
```

#### `settings:getAll`

获取所有设置。

```typescript
// 请求
window.electronAPI.invoke('settings:getAll')

// 响应
interface Settings {
  // 通用设置
  language: string;
  theme: 'light' | 'dark' | 'system';
  autoLaunch: boolean;
  
  // AI 设置
  aiProvider: string;
  aiModel: string;
  aiApiKey?: string;
  ollamaEndpoint?: string;
  
  // 宠物设置
  petName: string;
  petSkin: string;
  animationQuality: 'low' | 'medium' | 'high';
  
  // 语音设置
  voiceEnabled: boolean;
  voiceLanguage: string;
  voiceSpeed: number;
  
  // 窗口设置
  alwaysOnTop: boolean;
  rememberPosition: boolean;
  defaultDisplay: number;
}
```

#### `settings:reset`

重置所有设置为默认值。

```typescript
// 请求
window.electronAPI.invoke('settings:reset')

// 响应
{ success: boolean }
```

---

### Window API

窗口管理。

#### `window:minimize`

最小化窗口到托盘。

```typescript
// 请求
window.electronAPI.invoke('window:minimize')

// 响应
{ success: boolean }
```

#### `window:setAlwaysOnTop`

设置窗口置顶状态。

```typescript
// 请求
window.electronAPI.invoke('window:setAlwaysOnTop', {
  alwaysOnTop: boolean;
})

// 响应
{ success: boolean }
```

#### `window:getDisplays`

获取可用显示器列表。

```typescript
// 请求
window.electronAPI.invoke('window:getDisplays')

// 响应
interface Display {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
  scaleFactor: number;
}[]
```

#### `window:moveToDisplay`

移动窗口到指定显示器。

```typescript
// 请求
window.electronAPI.invoke('window:moveToDisplay', {
  displayId: number;
})

// 响应
{ success: boolean }
```

#### `window:openChat`

打开独立聊天窗口。

```typescript
// 请求
window.electronAPI.invoke('window:openChat')

// 响应
{ success: boolean }
```

#### `window:openSettings`

打开设置面板。

```typescript
// 请求
window.electronAPI.invoke('window:openSettings')

// 响应
{ success: boolean }
```

---

### Reminder API

提醒功能。

#### `reminder:create`

创建提醒。

```typescript
// 请求
window.electronAPI.invoke('reminder:create', {
  title: string;
  description?: string;
  dueAt: string; // ISO 8601
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
})

// 响应
interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueAt: string;
  repeat: string;
  isCompleted: boolean;
  createdAt: string;
}
```

#### `reminder:list`

获取提醒列表。

```typescript
// 请求
window.electronAPI.invoke('reminder:list', {
  includeCompleted?: boolean;
  limit?: number;
})

// 响应
Reminder[]
```

#### `reminder:complete`

标记提醒为完成。

```typescript
// 请求
window.electronAPI.invoke('reminder:complete', {
  id: string;
})

// 响应
{ success: boolean }
```

#### `reminder:delete`

删除提醒。

```typescript
// 请求
window.electronAPI.invoke('reminder:delete', {
  id: string;
})

// 响应
{ success: boolean }
```

---

### Voice API

语音功能。

#### `voice:startListening`

开始语音识别。

```typescript
// 请求
window.electronAPI.invoke('voice:startListening', {
  language?: string; // 默认: 'zh-CN'
})

// 响应
{ success: boolean; sessionId: string }
```

#### `voice:stopListening`

停止语音识别。

```typescript
// 请求
window.electronAPI.invoke('voice:stopListening', {
  sessionId: string;
})

// 响应
{ 
  success: boolean;
  transcript: string;
  confidence: number;
}
```

#### `voice:speak`

文字转语音。

```typescript
// 请求
window.electronAPI.invoke('voice:speak', {
  text: string;
  language?: string;
  speed?: number; // 0.5 - 2.0
  voice?: string;
})

// 响应
{ success: boolean }
```

#### `voice:stopSpeaking`

停止语音播放。

```typescript
// 请求
window.electronAPI.invoke('voice:stopSpeaking')

// 响应
{ success: boolean }
```

#### `voice:getVoices`

获取可用语音列表。

```typescript
// 请求
window.electronAPI.invoke('voice:getVoices')

// 响应
interface Voice {
  id: string;
  name: string;
  language: string;
  isDefault: boolean;
}[]
```

---

### Skin API

宠物换肤功能。

#### `skin:list`

获取可用皮肤列表。

```typescript
// 请求
window.electronAPI.invoke('skin:list')

// 响应
interface PetSkin {
  id: string;
  name: string;
  type: 'default' | 'custom';
  thumbnailPath: string;
  modelPath: string;
  breed?: string;
  createdAt: string;
}[]
```

#### `skin:apply`

应用皮肤。

```typescript
// 请求
window.electronAPI.invoke('skin:apply', {
  skinId: string;
})

// 响应
{ success: boolean }
```

#### `skin:createFromPhoto`

从照片创建皮肤。

```typescript
// 请求
window.electronAPI.invoke('skin:createFromPhoto', {
  photoData: string; // base64
  name?: string;
})

// 响应 (流式)
// 通过事件推送进度
interface SkinCreationProgress {
  stage: 'analyzing' | 'recognizing' | 'generating' | 'rigging' | 'complete';
  progress: number; // 0-100
  message: string;
  result?: {
    skinId: string;
    breed: string;
    confidence: number;
  };
}
```

#### `skin:delete`

删除自定义皮肤。

```typescript
// 请求
window.electronAPI.invoke('skin:delete', {
  skinId: string;
})

// 响应
{ success: boolean }
```

---

### System API

系统功能。

#### `system:openApp`

打开应用程序。

```typescript
// 请求
window.electronAPI.invoke('system:openApp', {
  appName: string;
})

// 响应
{ success: boolean; error?: string }
```

#### `system:getInstalledApps`

获取已安装应用列表。

```typescript
// 请求
window.electronAPI.invoke('system:getInstalledApps')

// 响应
interface InstalledApp {
  name: string;
  path: string;
  icon?: string;
}[]
```

#### `system:search`

执行系统搜索。

```typescript
// 请求
window.electronAPI.invoke('system:search', {
  query: string;
  type?: 'web' | 'files' | 'apps';
})

// 响应
{ success: boolean; url?: string }
```

#### `system:getWeather`

获取天气信息。

```typescript
// 请求
window.electronAPI.invoke('system:getWeather', {
  location?: string; // 默认使用IP定位
})

// 响应
interface Weather {
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  forecast: Array<{
    date: string;
    high: number;
    low: number;
    condition: string;
  }>;
}
```

---

## 事件系统

应用使用事件总线进行组件间通信。

### 订阅事件

```typescript
window.electronAPI.on(channel: string, callback: (data: any) => void)
```

### 取消订阅

```typescript
window.electronAPI.off(channel: string, callback: (data: any) => void)
```

### 事件类型

#### Pet 事件

| 事件名 | 数据 | 描述 |
|--------|------|------|
| `pet:stateChanged` | `PetState` | 宠物状态变化 |
| `pet:animationStarted` | `{ animation: string }` | 动画开始播放 |
| `pet:animationEnded` | `{ animation: string }` | 动画播放结束 |
| `pet:clicked` | `{ x: number; y: number }` | 宠物被点击 |
| `pet:dragging` | `{ x: number; y: number }` | 宠物正在拖拽 |
| `pet:dropped` | `{ x: number; y: number }` | 宠物拖拽结束 |

#### AI 事件

| 事件名 | 数据 | 描述 |
|--------|------|------|
| `ai:messageReceived` | `AIResponse` | 收到 AI 回复 |
| `ai:streamChunk` | `{ chunk: string }` | 流式响应片段 |
| `ai:streamEnd` | `{ messageId: string }` | 流式响应结束 |
| `ai:error` | `{ error: string }` | AI 错误 |

#### Voice 事件

| 事件名 | 数据 | 描述 |
|--------|------|------|
| `voice:transcript` | `{ text: string; isFinal: boolean }` | 语音识别结果 |
| `voice:listening` | `{ isListening: boolean }` | 监听状态变化 |
| `voice:speaking` | `{ isSpeaking: boolean }` | 语音播放状态 |

#### Reminder 事件

| 事件名 | 数据 | 描述 |
|--------|------|------|
| `reminder:due` | `Reminder` | 提醒到期 |
| `reminder:created` | `Reminder` | 提醒创建 |
| `reminder:completed` | `{ id: string }` | 提醒完成 |

#### System 事件

| 事件名 | 数据 | 描述 |
|--------|------|------|
| `system:trayClicked` | `void` | 托盘图标点击 |
| `system:updateAvailable` | `{ version: string }` | 有可用更新 |
| `system:updateDownloaded` | `{ version: string }` | 更新下载完成 |

---

## MCP 服务器 API

内置 MCP 服务器提供的工具和资源。

### system-tools

系统工具服务器。

#### 工具

| 工具名 | 参数 | 描述 |
|--------|------|------|
| `open_application` | `{ name: string }` | 打开应用程序 |
| `list_applications` | `{}` | 列出已安装应用 |
| `execute_command` | `{ command: string }` | 执行系统命令 |
| `get_system_info` | `{}` | 获取系统信息 |

### reminder

提醒服务器。

#### 工具

| 工具名 | 参数 | 描述 |
|--------|------|------|
| `create_reminder` | `{ title, dueAt, repeat? }` | 创建提醒 |
| `list_reminders` | `{ includeCompleted? }` | 列出提醒 |
| `complete_reminder` | `{ id }` | 完成提醒 |
| `delete_reminder` | `{ id }` | 删除提醒 |

### notes

笔记服务器。

#### 工具

| 工具名 | 参数 | 描述 |
|--------|------|------|
| `create_note` | `{ title, content }` | 创建笔记 |
| `list_notes` | `{ limit? }` | 列出笔记 |
| `search_notes` | `{ query }` | 搜索笔记 |
| `delete_note` | `{ id }` | 删除笔记 |

### weather-api

天气服务器。

#### 工具

| 工具名 | 参数 | 描述 |
|--------|------|------|
| `get_current_weather` | `{ location? }` | 获取当前天气 |
| `get_forecast` | `{ location?, days? }` | 获取天气预报 |

### calendar

日历服务器。

#### 工具

| 工具名 | 参数 | 描述 |
|--------|------|------|
| `create_event` | `{ title, start, end?, description? }` | 创建事件 |
| `list_events` | `{ date?, range? }` | 列出事件 |
| `delete_event` | `{ id }` | 删除事件 |

---

## 数据模型

### Pet

```typescript
interface Pet {
  id: string;
  name: string;
  skinId: string;
  mood: 'happy' | 'neutral' | 'sad' | 'excited' | 'sleepy';
  energy: number;
  lastInteraction: string;
  createdAt: string;
  updatedAt: string;
}
```

### PetSkin

```typescript
interface PetSkin {
  id: string;
  name: string;
  type: 'default' | 'custom';
  modelPath: string;
  thumbnailPath: string;
  breed?: string;
  sourcePhotoPath?: string;
  createdAt: string;
}
```

### Conversation

```typescript
interface Conversation {
  id: string;
  title: string;
  providerId: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}
```

### Message

```typescript
interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  emotion?: string;
  actions?: string; // JSON
  createdAt: string;
}
```

### Reminder

```typescript
interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueAt: string;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  isCompleted: boolean;
  completedAt?: string;
  createdAt: string;
}
```

### AIProvider

```typescript
interface AIProvider {
  id: string;
  name: string;
  type: 'openai' | 'claude' | 'ollama';
  endpoint?: string;
  isActive: boolean;
  createdAt: string;
}
```

---

## 错误处理

所有 API 调用可能返回错误：

```typescript
interface APIError {
  code: string;
  message: string;
  details?: any;
}
```

### 常见错误码

| 错误码 | 描述 |
|--------|------|
| `INVALID_PARAMS` | 参数无效 |
| `NOT_FOUND` | 资源不存在 |
| `UNAUTHORIZED` | 未授权 |
| `AI_ERROR` | AI 服务错误 |
| `NETWORK_ERROR` | 网络错误 |
| `INTERNAL_ERROR` | 内部错误 |

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-02-09 | 初始版本 |