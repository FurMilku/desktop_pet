# Research Document: 桌面3D小宠物

**Branch**: `001-desktop-3d-pet` | **Date**: 2026-02-08  
**Purpose**: 记录技术研究决策和最佳实践

## 1. Electron 透明窗口实现

### Decision
使用 Electron 的 `transparent: true` 和 `frame: false` 配置创建透明无边框窗口。

### Rationale
- Electron 28+ 原生支持透明窗口
- 跨平台兼容性好（Windows/macOS/Linux）
- 与 Three.js WebGL 渲染完美配合

### Implementation Details
```typescript
const mainWindow = new BrowserWindow({
  transparent: true,
  frame: false,
  hasShadow: false,
  alwaysOnTop: true,
  skipTaskbar: false,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.js')
  }
});
```

### Platform-Specific Notes
- **Windows**: 需要设置 `hasShadow: false` 避免窗口阴影
- **macOS**: 需要设置 `vibrancy: undefined` 确保完全透明
- **Linux**: 需要启用 compositing，Wayland 可能有兼容性问题

### Alternatives Considered
| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| NW.js | 类似Electron | 社区较小，更新慢 | 不采用 |
| Tauri | 体积小，性能好 | WebGL支持不完善，透明窗口支持有限 | 不采用 |
| Qt/GTK原生 | 性能最好 | 开发复杂度高，需要C++/Python | 不采用 |

---

## 2. Three.js 3D渲染最佳实践

### Decision
使用 Three.js 作为3D渲染引擎，采用 GLTF/GLB 格式模型，实现骨骼动画系统。

### Rationale
- Three.js 是最成熟的 Web 3D 库
- GLTFLoader 支持完整的骨骼动画
- AnimationMixer 提供动画混合和过渡功能

### Implementation Details

#### 渲染器配置
```typescript
const renderer = new THREE.WebGLRenderer({
  alpha: true,           // 透明背景
  antialias: true,       // 抗锯齿
  preserveDrawingBuffer: false
});
renderer.setClearColor(0x000000, 0);  // 完全透明
renderer.setPixelRatio(window.devicePixelRatio);
```

#### 动画状态机
```typescript
interface AnimationState {
  name: string;
  clip: THREE.AnimationClip;
  loop: THREE.LoopOnce | THREE.LoopRepeat;
  transitionDuration: number;
}

const states: AnimationState[] = [
  { name: 'idle', clip: idleClip, loop: THREE.LoopRepeat, transitionDuration: 0.3 },
  { name: 'thinking', clip: thinkingClip, loop: THREE.LoopRepeat, transitionDuration: 0.2 },
  // ... 10种状态
];
```

#### 性能优化
- 使用 `requestAnimationFrame` 渲染循环
- 实现 LOD（Level of Detail）系统
- 窗口最小化时暂停渲染
- 使用 `InstancedMesh` 优化粒子效果

### Alternatives Considered
| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| Babylon.js | 功能强大，内置物理 | 体积较大，学习曲线陡 | 不采用 |
| PlayCanvas | 游戏引擎级功能 | 主要面向游戏开发 | 不采用 |
| A-Frame | VR友好 | 对桌面应用不适合 | 不采用 |

---

## 3. SQLite 数据存储

### Decision
使用 `better-sqlite3` 作为 SQLite 绑定库，同步API简化代码。

### Rationale
- `better-sqlite3` 性能优于 `node-sqlite3`
- 同步API在 Electron 主进程中更易使用
- 支持 WAL 模式提高并发性能

### Implementation Details

#### 数据库初始化
```typescript
import Database from 'better-sqlite3';

const db = new Database(path.join(app.getPath('userData'), 'pet.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
```

#### 表结构设计
```sql
-- 对话表
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 消息表
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- 提醒表
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  trigger_time INTEGER NOT NULL,
  repeat_rule TEXT,
  completed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 用户设置表
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### Migration Strategy
- 使用版本号追踪数据库 schema
- 启动时检查并执行必要的迁移
- 备份旧数据库文件后再迁移

### Alternatives Considered
| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| electron-store | 简单键值存储 | 不支持复杂查询 | 不适合 |
| LowDB | JSON文件存储 | 性能差，不支持大数据量 | 不适合 |
| IndexedDB | 浏览器原生 | 异步API复杂 | 不适合 |

---

## 4. AI 服务集成

### Decision
实现多 LLM 提供商支持（OpenAI、Claude、Ollama），统一接口抽象。

### Rationale
- 用户可选择不同的AI服务
- 支持本地部署（Ollama）保护隐私
- 云端服务不可用时自动降级

### Implementation Details

#### Provider 接口
```typescript
interface ILLMProvider {
  readonly name: string;
  readonly isLocal: boolean;
  
  chat(messages: Message[], options?: ChatOptions): AsyncGenerator<string>;
  complete(prompt: string, options?: CompleteOptions): Promise<string>;
  healthCheck(): Promise<boolean>;
}
```

#### 降级策略
```typescript
class AIServiceManager {
  private providers: ILLMProvider[] = [];
  private cache: ResponseCache;
  
  async chat(messages: Message[]): AsyncGenerator<string> {
    // 1. 检查缓存
    const cached = this.cache.get(messages);
    if (cached) {
      yield* this.streamCached(cached);
      return;
    }
    
    // 2. 尝试主要提供商
    for (const provider of this.providers) {
      try {
        if (await provider.healthCheck()) {
          const response = [];
          for await (const chunk of provider.chat(messages)) {
            response.push(chunk);
            yield chunk;
          }
          this.cache.set(messages, response.join(''));
          return;
        }
      } catch (error) {
        console.error(`Provider ${provider.name} failed:`, error);
      }
    }
    
    throw new Error('All AI providers unavailable');
  }
}
```

#### 流式输出
- 使用 `AsyncGenerator` 实现流式响应
- 前端通过事件总线接收 `ai:response:chunk` 事件
- 支持取消正在进行的请求

### Alternatives Considered
| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| 仅OpenAI | 简单 | 单点故障，无离线支持 | 不采用 |
| LangChain | 功能丰富 | 过度复杂，依赖过多 | 不采用 |
| 自研抽象层 | 完全控制 | 开发成本高 | 采用简化版 |

---

## 5. MCP 服务器实现

### Decision
使用 `@modelcontextprotocol/sdk` 实现 MCP 服务器，采用 stdio 传输方式。

### Rationale
- MCP 是标准化的工具集成协议
- stdio 传输简单可靠，易于调试
- 支持工具和资源的动态发现

### Implementation Details

#### MCP 服务器结构
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'reminder-server',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {}
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'create_reminder',
      description: '创建定时提醒',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '提醒标题' },
          time: { type: 'string', description: '触发时间 (ISO 8601)' }
        },
        required: ['title', 'time']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'create_reminder') {
    const { title, time } = request.params.arguments;
    // 创建提醒逻辑
    return { content: [{ type: 'text', text: `已创建提醒: ${title}` }] };
  }
});
```

#### 服务器配置
```json
{
  "mcpServers": {
    "system-tools": {
      "command": "node",
      "args": ["mcp-servers/system-tools/index.js"],
      "env": {}
    },
    "reminder": {
      "command": "node", 
      "args": ["mcp-servers/reminder/index.js"],
      "env": {}
    }
  }
}
```

---

## 6. 语音识别与合成

### Decision
使用 Web Speech API 作为默认方案，支持可选的云端服务（Azure Speech / Whisper）。

### Rationale
- Web Speech API 免费且内置于浏览器
- 无需额外依赖，开箱即用
- 云端服务作为可选增强

### Implementation Details

#### 语音识别
```typescript
class SpeechRecognition {
  private recognition: globalThis.SpeechRecognition;
  
  constructor() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'zh-CN';
  }
  
  start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        resolve(transcript);
      };
      this.recognition.onerror = reject;
      this.recognition.start();
    });
  }
}
```

#### 语音合成
```typescript
class SpeechSynthesis {
  speak(text: string, options?: SpeakOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = options?.rate ?? 1.0;
      utterance.pitch = options?.pitch ?? 1.0;
      utterance.onend = () => resolve();
      utterance.onerror = reject;
      window.speechSynthesis.speak(utterance);
    });
  }
}
```

### Limitations
- Web Speech API 在某些 Linux 发行版上可能不可用
- 语音识别准确率依赖浏览器实现
- 需要网络连接（大多数浏览器实现）

---

## 7. 照片换肤：3D模型生成

### Decision
使用 TripoSR（本地）+ Meshy API（云端）混合方案生成3D模型。

### Rationale
- TripoSR 支持本地运行，保护用户隐私
- Meshy API 作为备选，无需本地GPU
- 两者输出 GLTF 格式，兼容 Three.js

### Implementation Details

#### TripoSR 本地调用
```typescript
import { spawn } from 'child_process';

async function generateModel(imagePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn('python', [
      '-m', 'tsr',
      '--image', imagePath,
      '--output', outputPath,
      '--format', 'glb'
    ]);
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`TripoSR exited with code ${code}`));
      }
    });
  });
}
```

#### 自动骨骼绑定
- 使用预定义的骨骼模板
- 顶点权重映射算法
- 支持基础动画（idle, walk）

### Requirements
- **TripoSR**: Python 3.9+, CUDA 11.8+, 8GB+ VRAM
- **Meshy API**: 付费API，无本地要求

---

## 8. 系统凭证存储

### Decision
使用 `keytar` 库访问操作系统凭证管理器。

### Rationale
- 跨平台支持 Windows/macOS/Linux
- API密钥不存储在文件中
- 符合安全最佳实践

### Implementation Details
```typescript
import * as keytar from 'keytar';

const SERVICE_NAME = 'desktop-pet';

async function setApiKey(provider: string, key: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, provider, key);
}

async function getApiKey(provider: string): Promise<string | null> {
  return keytar.getPassword(SERVICE_NAME, provider);
}

async function deleteApiKey(provider: string): Promise<boolean> {
  return keytar.deletePassword(SERVICE_NAME, provider);
}
```

### Platform Support
| 平台 | 后端 |
|------|------|
| Windows | Credential Manager |
| macOS | Keychain |
| Linux | libsecret (GNOME Keyring) |

---

## 9. 事件总线实现

### Decision
自研轻量级事件总线，支持类型安全和优先级。

### Rationale
- 现有库（mitt, EventEmitter3）不支持优先级
- 需要与TypeScript深度集成
- 控制代码体积

### Implementation Details
```typescript
type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

interface EventSubscription {
  handler: EventHandler;
  priority: number;
  once: boolean;
}

class EventBus {
  private handlers = new Map<string, EventSubscription[]>();
  
  on<T>(event: string, handler: EventHandler<T>, priority = 0): () => void {
    const subscriptions = this.handlers.get(event) ?? [];
    const subscription: EventSubscription = { handler: handler as EventHandler, priority, once: false };
    subscriptions.push(subscription);
    subscriptions.sort((a, b) => b.priority - a.priority);
    this.handlers.set(event, subscriptions);
    
    return () => this.off(event, handler);
  }
  
  async emit<T>(event: string, data: T): Promise<void> {
    const subscriptions = this.handlers.get(event) ?? [];
    for (const { handler, once } of subscriptions) {
      await handler(data);
      if (once) {
        this.off(event, handler);
      }
    }
  }
  
  off(event: string, handler: EventHandler): void {
    const subscriptions = this.handlers.get(event) ?? [];
    this.handlers.set(event, subscriptions.filter(s => s.handler !== handler));
  }
}
```

---

## 10. 构建与打包

### Decision
使用 electron-builder 进行应用打包和分发。

### Rationale
- 支持所有目标平台
- 内置自动更新支持
- 配置灵活，社区活跃

### Configuration
```json
{
  "build": {
    "appId": "com.desktop-pet.app",
    "productName": "桌面小宠物",
    "directories": {
      "output": "dist"
    },
    "files": [
      "build/**/*",
      "assets/**/*",
      "node_modules/**/*"
    ],
    "win": {
      "target": ["nsis", "portable"],
      "icon": "assets/icons/app-icon.ico"
    },
    "mac": {
      "target": ["dmg", "zip"],
      "icon": "assets/icons/app-icon.icns",
      "category": "public.app-category.entertainment"
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "icon": "assets/icons",
      "category": "Utility"
    },
    "publish": {
      "provider": "github",
      "owner": "your-org",
      "repo": "desktop-pet"
    }
  }
}
```

---

## Summary

| 技术领域 | 决策 | 理由 |
|----------|------|------|
| 桌面框架 | Electron 28+ | 最成熟的跨平台方案，原生支持透明窗口 |
| 3D渲染 | Three.js | Web 3D 标准，骨骼动画支持完善 |
| 数据存储 | better-sqlite3 | 高性能本地存储，同步API |
| AI服务 | 多Provider抽象 | 灵活切换，支持本地/云端 |
| 工具集成 | MCP协议 | 标准化协议，可扩展 |
| 语音交互 | Web Speech API | 免费内置，开箱即用 |
| 3D生成 | TripoSR + Meshy | 本地优先，云端备选 |
| 凭证存储 | keytar | 系统级安全存储 |
| 事件通信 | 自研EventBus | 类型安全，支持优先级 |
| 打包分发 | electron-builder | 全平台支持，自动更新 |