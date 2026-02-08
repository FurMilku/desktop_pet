# Research Document: 桌面3D小宠物

**Feature**: 001-desktop-3d-pet  
**Date**: 2026-02-08  
**Purpose**: 解决技术实现中的不确定点，记录技术决策和替代方案

## 1. Electron 透明窗口实现

### 决策
使用 Electron 的透明无边框窗口配置实现桌面宠物悬浮效果。

### 技术细节
```javascript
const mainWindow = new BrowserWindow({
  width: 400,
  height: 400,
  transparent: true,        // 窗口透明
  frame: false,             // 无边框
  alwaysOnTop: true,        // 置顶显示
  skipTaskbar: true,        // 不在任务栏显示
  hasShadow: false,         // 无阴影（避免透明区域出现阴影）
  resizable: false,         // 禁止调整大小
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    preload: path.join(__dirname, 'preload.js')
  }
});

// 设置窗口可点击穿透透明区域
mainWindow.setIgnoreMouseEvents(false);
```

### 平台差异
| 平台 | 透明窗口支持 | 特殊配置 |
|------|-------------|----------|
| Windows 10+ | ✅ 完全支持 | 需要启用 DWM 组合 |
| macOS 10.15+ | ✅ 完全支持 | 默认支持，无需额外配置 |
| Ubuntu 20.04+ | ⚠️ 部分支持 | 需要支持透明的窗口管理器 (Mutter/KWin) |

### 替代方案评估
| 方案 | 优点 | 缺点 | 决策 |
|------|------|------|------|
| Electron 透明窗口 | 跨平台、成熟、文档完善 | 内存占用较高 | ✅ 采用 |
| Tauri | 更轻量、Rust后端 | 透明窗口支持较新、生态较小 | ❌ 放弃 |
| Qt + QML | 原生性能 | 需要编译、分发复杂 | ❌ 放弃 |

### 已解决问题
- 透明区域的鼠标事件处理方案已确认
- 多显示器场景下的窗口定位策略已明确

---

## 2. Three.js 3D渲染集成

### 决策
使用 Three.js WebGLRenderer 在 Electron 渲染进程中实现3D渲染。

### 技术细节
```javascript
// 创建透明背景的渲染器
const renderer = new THREE.WebGLRenderer({
  alpha: true,              // 启用透明背景
  antialias: true,          // 抗锯齿
  powerPreference: 'low-power'  // 优先省电模式
});
renderer.setClearColor(0x000000, 0);  // 透明背景
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

// 模型加载
const loader = new GLTFLoader();
loader.load('models/pet.glb', (gltf) => {
  const model = gltf.scene;
  const animations = gltf.animations;
  
  // 骨骼动画混合器
  const mixer = new THREE.AnimationMixer(model);
  animations.forEach((clip) => {
    mixer.clipAction(clip);
  });
  
  scene.add(model);
});
```

### 性能优化策略
1. **帧率控制**: 空闲时降低到15fps，交互时提升到30fps
2. **LOD系统**: 根据窗口大小动态调整模型细节
3. **渲染按需**: 无动画变化时暂停渲染循环
4. **资源管理**: 及时释放未使用的纹理和几何体

### 动画状态机设计
```text
状态流转:
  IDLE (待机) 
    ├── 3秒无操作 → IDLE_ANIMATION (待机动画循环)
    ├── 用户点击 → REACT (反应动画)
    ├── 用户拖拽 → DRAG (拖拽状态)
    └── 开始对话 → THINKING (思考状态)
  
  REACT → 2秒后 → IDLE
  THINKING → AI回复 → RESPONDING → 回复结束 → IDLE
```

---

## 3. SQLite 本地数据存储

### 决策
使用 better-sqlite3 作为 SQLite 驱动，同步 API 更适合 Electron 主进程。

### 技术细节
```javascript
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

const dbPath = path.join(app.getPath('userData'), 'desktop-pet.db');
const db = new Database(dbPath);

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    title TEXT
  );
  
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );
  
  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    trigger_time INTEGER NOT NULL,
    repeat_rule TEXT,
    completed INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
```

### 替代方案评估
| 方案 | 优点 | 缺点 | 决策 |
|------|------|------|------|
| better-sqlite3 | 同步API、性能好、无依赖 | 需要原生编译 | ✅ 采用 |
| sql.js | 纯JS、无需编译 | 内存占用高、性能较差 | ❌ 放弃 |
| LowDB | 简单、JSON存储 | 不适合大量数据 | ❌ 放弃 |
| IndexedDB | 浏览器原生 | 异步API、调试困难 | ❌ 放弃 |

---

## 4. API密钥安全存储

### 决策
使用 keytar 库访问系统凭证管理器，确保API密钥安全存储。

### 技术细节
```javascript
import keytar from 'keytar';

const SERVICE_NAME = 'DesktopPet';

// 存储API密钥
async function saveApiKey(provider: string, apiKey: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, provider, apiKey);
}

// 获取API密钥
async function getApiKey(provider: string): Promise<string | null> {
  return await keytar.getPassword(SERVICE_NAME, provider);
}

// 删除API密钥
async function deleteApiKey(provider: string): Promise<boolean> {
  return await keytar.deletePassword(SERVICE_NAME, provider);
}
```

### 平台实现
| 平台 | 底层存储 | 加密方式 |
|------|----------|----------|
| Windows | Credential Manager | DPAPI |
| macOS | Keychain | 256-bit AES |
| Linux | libsecret/gnome-keyring | 系统级加密 |

---

## 5. AI服务集成与降级策略

### 决策
实现统一的AI服务接口，支持多提供商和自动降级。

### 架构设计
```typescript
interface AIProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  chat(messages: Message[], options?: ChatOptions): AsyncGenerator<string>;
  supportsFunctionCalling(): boolean;
}

class AIService {
  private providers: AIProvider[] = [];
  private cache: ResponseCache;
  
  async chat(messages: Message[]): AsyncGenerator<string> {
    // 尝试顺序: OpenAI → Claude → Ollama → Cache
    for (const provider of this.providers) {
      if (await provider.isAvailable()) {
        try {
          yield* provider.chat(messages);
          return;
        } catch (error) {
          console.warn(`Provider ${provider.name} failed, trying next...`);
        }
      }
    }
    // 所有提供商失败，尝试缓存
    const cached = this.cache.get(messages);
    if (cached) {
      yield cached;
    } else {
      throw new Error('All AI providers unavailable');
    }
  }
}
```

### 提供商配置
| 提供商 | 模型 | 用途 | 优先级 |
|--------|------|------|--------|
| OpenAI | gpt-4-turbo | 主要对话、Function Calling | 1 |
| Claude | claude-3-sonnet | 备选对话 | 2 |
| Ollama | llama3/mistral | 本地离线 | 3 |

### Function Calling 工具定义
```typescript
const tools = [
  {
    name: 'set_reminder',
    description: '设置一个提醒',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '提醒标题' },
        time: { type: 'string', description: '触发时间，ISO 8601格式' },
        repeat: { type: 'string', enum: ['once', 'daily', 'weekly'] }
      },
      required: ['title', 'time']
    }
  },
  {
    name: 'get_weather',
    description: '查询天气',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: '城市名称' }
      },
      required: ['city']
    }
  },
  {
    name: 'open_application',
    description: '打开应用程序',
    parameters: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: '应用名称' }
      },
      required: ['app_name']
    }
  }
];
```

---

## 6. 语音识别与合成

### 决策
优先使用 Web Speech API，本地备选方案使用 whisper.cpp 和系统TTS。

### 语音识别 (STT)
```typescript
// Web Speech API (Electron/Chromium 内置)
const recognition = new webkitSpeechRecognition();
recognition.continuous = false;
recognition.interimResults = true;
recognition.lang = 'zh-CN';

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  const isFinal = event.results[0].isFinal;
  // 处理识别结果
};

// 本地备选: whisper.cpp (通过 node-addon 或子进程)
// 适用于离线场景或需要更高准确率的场景
```

### 语音合成 (TTS)
```typescript
// 跨平台TTS方案
import say from 'say';

function speak(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    say.speak(text, undefined, 1.0, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// 或使用 Web Speech API (更简单但声音较机械)
const utterance = new SpeechSynthesisUtterance(text);
utterance.lang = 'zh-CN';
speechSynthesis.speak(utterance);
```

---

## 7. 换肤功能技术方案

### 决策
品种识别使用 TensorFlow.js + MobileNet，3D生成使用本地 TripoSR 或云端 Meshy API。

### 品种识别流程
```text
用户上传照片 
  → 图片预处理 (裁剪、归一化)
  → TensorFlow.js MobileNet 特征提取
  → 品种分类器 (预训练模型)
  → 返回品种名称和置信度
```

### 3D模型生成
| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| TripoSR (本地) | 免费、离线可用 | 需要GPU、生成较慢 | 有独显用户 |
| Meshy API (云端) | 质量高、快速 | 收费、需要网络 | 无GPU用户 |

### 骨骼绑定方案
1. **预制骨骼模板**: 为常见宠物类型（猫、狗）准备骨骼模板
2. **自动绑定**: 使用 Mixamo 或自定义算法将生成的模型绑定到骨骼
3. **动画复用**: 绑定后的模型可复用预制动画

---

## 8. 日志与错误追踪

### 决策
使用 electron-log 进行本地日志，Sentry 进行崩溃报告（用户可选）。

### 日志配置
```typescript
import log from 'electron-log';

// 配置日志级别
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// 日志轮转
log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB

// 日志路径: userData/logs/
log.transports.file.resolvePathFn = () => {
  return path.join(app.getPath('userData'), 'logs', 'main.log');
};

// 过滤敏感信息
log.hooks.push((message, transport) => {
  // 移除可能包含的API密钥或对话内容
  return filterSensitiveData(message);
});
```

### Sentry 集成
```typescript
import * as Sentry from '@sentry/electron';

// 仅在用户同意后初始化
if (userSettings.enableCrashReporting) {
  Sentry.init({
    dsn: 'YOUR_SENTRY_DSN',
    beforeSend(event) {
      // 过滤敏感信息
      delete event.user;
      return event;
    }
  });
}
```

---

## 9. 打包与分发

### 决策
使用 electron-builder 进行多平台打包，支持自动更新。

### 打包配置
```json
{
  "appId": "com.example.desktop-pet",
  "productName": "桌面小宠物",
  "directories": {
    "buildResources": "build",
    "output": "dist"
  },
  "files": [
    "out/**/*",
    "assets/**/*"
  ],
  "win": {
    "target": ["nsis"],
    "icon": "assets/icons/icon.ico"
  },
  "mac": {
    "target": ["dmg"],
    "icon": "assets/icons/icon.icns",
    "category": "public.app-category.utilities"
  },
  "linux": {
    "target": ["AppImage", "deb"],
    "icon": "assets/icons/icon.png",
    "category": "Utility"
  },
  "publish": {
    "provider": "github",
    "releaseType": "release"
  }
}
```

---

## 待解决问题

所有技术不确定点已在本文档中解决，可进入 Phase 1 设计阶段。

## 参考资料

- [Electron 透明窗口文档](https://www.electronjs.org/docs/latest/tutorial/window-customization)
- [Three.js 文档](https://threejs.org/docs/)
- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3)
- [keytar 文档](https://github.com/atom/node-keytar)
- [OpenAI API 文档](https://platform.openai.com/docs)
- [Sentry Electron 文档](https://docs.sentry.io/platforms/javascript/guides/electron/)