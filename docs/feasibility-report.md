# 桌面3D小宠物可行性报告

## 1. 项目概述

### 1.1 项目目标
开发一个桌面3D小宠物应用程序，宠物可以是：
- 🐱 动物（猫、狗、鸟等）
- 🌱 植物（会动的花朵、树精灵等）
- 👽 外星生物（自定义设计的生物）
- 🔷 可变形几何形状（多边形、流体形状等）

### 1.2 核心功能需求
| 功能 | 描述 | 优先级 |
|------|------|--------|
| 3D渲染 | 在桌面显示3D角色 | 高 |
| 透明窗口 | 无边框透明背景 | 高 |
| 动画系统 | 宠物动作和表情 | 高 |
| **AI助手** | **对接大模型，提供智能对话** | **高** |
| **工作助手** | **日程、提醒、任务执行** | **高** |
| 用户交互 | 点击、拖拽、喂食等 | 中 |
| 物理引擎 | 重力、碰撞检测 | 中 |
| 语音交互 | 语音输入输出 | 中 |
| AI行为 | 自主行为和情感系统 | 低 |

### 1.3 AI助手功能定位
```
┌─────────────────────────────────────────────────────────┐
│                    桌面3D小宠物                          │
│  ┌─────────────────┐    ┌─────────────────────────┐    │
│  │   可爱外观层    │    │      AI智能层           │    │
│  │  - 3D宠物形象   │◄──►│  - 自然语言对话         │    │
│  │  - 动画表情     │    │  - 任务执行助手         │    │
│  │  - 互动反馈     │    │  - 知识问答             │    │
│  └─────────────────┘    └─────────────────────────┘    │
│                              │                          │
│                              ▼                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │              工作助手功能                         │   │
│  │  📅 日程管理  📝 任务提醒  🔍 信息查询           │   │
│  │  📧 邮件处理  📊 数据分析  💡 创意建议           │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 技术可行性分析

### 2.1 技术方案对比

#### 方案A：Electron + Three.js
```
┌─────────────────────────────────────┐
│          Electron 框架              │
│  ┌─────────────────────────────┐   │
│  │      Three.js 3D渲染        │   │
│  │  ┌─────────────────────┐   │   │
│  │  │   WebGL Canvas      │   │   │
│  │  └─────────────────────┘   │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │    透明窗口 + 置顶显示      │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**优点：**
- ✅ 跨平台支持（Windows、macOS、Linux）
- ✅ 丰富的3D生态系统（Three.js成熟稳定）
- ✅ 开发效率高（Web技术栈）
- ✅ 透明窗口支持良好
- ✅ 社区活跃，文档完善

**缺点：**
- ❌ 内存占用较高（~100-200MB）
- ❌ 启动速度相对较慢
- ❌ 打包体积较大（~60-150MB）

**可行性评分：⭐⭐⭐⭐⭐ (5/5)**

---

#### 方案B：Tauri + WebGL/Three.js
```
┌─────────────────────────────────────┐
│           Tauri (Rust)              │
│  ┌─────────────────────────────┐   │
│  │      WebView2/WKWebView     │   │
│  │  ┌─────────────────────┐   │   │
│  │  │  Three.js + WebGL   │   │   │
│  │  └─────────────────────┘   │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**优点：**
- ✅ 极小的打包体积（~5-10MB）
- ✅ 低内存占用（~30-50MB）
- ✅ 快速启动
- ✅ 安全性更高
- ✅ 跨平台支持

**缺点：**
- ❌ 透明窗口支持有限制
- ❌ Rust学习曲线陡峭
- ❌ 社区相对较小

**可行性评分：⭐⭐⭐⭐ (4/5)**

---

#### 方案C：Unity + Desktop Build
```
┌─────────────────────────────────────┐
│           Unity Engine              │
│  ┌─────────────────────────────┐   │
│  │      3D渲染管线              │   │
│  │  ┌─────────────────────┐   │   │
│  │  │   透明窗口插件       │   │   │
│  │  └─────────────────────┘   │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**优点：**
- ✅ 专业级3D渲染能力
- ✅ 丰富的动画系统
- ✅ 物理引擎内置
- ✅ 大量现成资源

**缺点：**
- ❌ 打包体积大（~100-300MB）
- ❌ 透明窗口需要第三方插件
- ❌ 许可证费用（商业用途）
- ❌ 开发环境较重

**可行性评分：⭐⭐⭐ (3/5)**

---

#### 方案D：原生开发 (C++ + OpenGL/DirectX)
```
┌─────────────────────────────────────┐
│         Windows API (C++)           │
│  ┌─────────────────────────────┐   │
│  │    DirectX 11/12 或 OpenGL  │   │
│  │  ┌─────────────────────┐   │   │
│  │  │   自定义渲染引擎    │   │   │
│  │  └─────────────────────┘   │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**优点：**
- ✅ 最高性能
- ✅ 最小内存占用
- ✅ 完全控制

**缺点：**
- ❌ 开发周期长
- ❌ 跨平台困难
- ❌ 维护成本高

**可行性评分：⭐⭐ (2/5)**

---

### 2.2 技术方案推荐

| 方案 | 开发效率 | 性能 | 跨平台 | 打包大小 | 总评 |
|------|----------|------|--------|----------|------|
| Electron + Three.js | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | **推荐** |
| Tauri + Three.js | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 备选 |
| Unity | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | 复杂项目 |
| 原生C++ | ⭐ | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ | 不推荐 |

**🏆 推荐方案：Electron + Three.js**

---

## 3. 技术架构设计

### 3.1 系统架构图
```
┌─────────────────────────────────────────────────────────────┐
│                      用户界面层                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ 宠物显示  │  │ 交互控制  │  │ 对话界面  │  │ 系统托盘  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │ 语音输入  │  │ 设置面板  │  │ 助手面板  │                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      AI智能层 (新增)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  LLM接口     │  │  对话管理     │  │  意图识别     │     │
│  │ (多模型支持) │  │ (上下文记忆)  │  │ (NLU处理)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  语音识别    │  │  语音合成     │  │  工具调用     │     │
│  │  (STT)      │  │  (TTS)       │  │ (Function)   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      核心引擎层                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  3D渲染引擎   │  │   动画系统    │  │   物理引擎    │     │
│  │  (Three.js)  │  │  (骨骼动画)   │  │  (Cannon.js)  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      逻辑控制层                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   行为系统    │  │   情感系统    │  │   状态机      │     │
│  │  (AI决策)    │  │  (心情/需求)  │  │  (FSM)       │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      数据持久层                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  宠物数据     │  │   对话历史    │  │   用户设置    │     │
│  │ (JSON/SQLite)│  │  (向量数据库) │  │  (配置文件)   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐                       │
│  │  资源管理     │  │   知识库      │                       │
│  │  (模型/贴图)  │  │  (RAG存储)   │                       │
│  └──────────────┘  └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心技术栈
```yaml
# 基础框架
前端框架: Electron v28+
3D引擎: Three.js r160+
UI框架: Vue 3 / React 18
动画库: GSAP / Anime.js
物理引擎: Cannon-es / Rapier
状态管理: Pinia / Zustand
构建工具: Vite
包管理: pnpm
语言: TypeScript

# AI智能层 (新增)
LLM接口: OpenAI API / Claude API / 本地LLM
语音识别(STT): Web Speech API / Whisper API / Azure Speech
语音合成(TTS): Web Speech API / Edge TTS / Azure Speech
向量数据库: ChromaDB / LanceDB (本地)
对话框架: LangChain / LlamaIndex
```

### 3.3 3D模型格式支持
| 格式 | 描述 | 推荐度 |
|------|------|--------|
| GLTF/GLB | 标准3D格式，支持动画 | ⭐⭐⭐⭐⭐ |
| FBX | 专业格式，动画支持好 | ⭐⭐⭐⭐ |
| OBJ | 简单静态模型 | ⭐⭐⭐ |

---

## 4. 宠物类型实现方案

### 4.1 动物宠物
```javascript
// 示例：骨骼动画驱动的动物模型
class AnimalPet {
  model: GLTF;           // 3D模型
  skeleton: Skeleton;    // 骨骼系统
  animations: {
    idle: AnimationClip,
    walk: AnimationClip,
    run: AnimationClip,
    eat: AnimationClip,
    sleep: AnimationClip
  };
}
```

**技术要点：**
- 使用骨骼动画(Skeletal Animation)
- 动画混合(Animation Blending)
- 表情变形(Morph Targets)

### 4.2 植物宠物
```javascript
// 示例：程序化生长的植物
class PlantPet {
  geometry: BufferGeometry;  // 可变形几何体
  growth: number;            // 生长进度
  sway: ShaderMaterial;      // 摇摆着色器
  
  grow(deltaTime) {
    // L-System或程序化生长
  }
}
```

**技术要点：**
- L-System算法生成
- 顶点着色器实现摇摆
- 程序化纹理

### 4.3 外星生物
```javascript
// 示例：程序化生成的外星生物
class AlienPet {
  mesh: Mesh;
  tentacles: InstancedMesh[];  // 实例化触手
  eyeballs: Object3D[];        // 多眼球
  shader: ShaderMaterial;      // 自定义着色器
}
```

**技术要点：**
- 程序化几何体生成
- 自定义着色器效果
- 粒子系统

### 4.4 可变形几何形状
```javascript
// 示例：流体几何形状
class MorphPet {
  geometry: BufferGeometry;
  morphTargets: BufferGeometry[];  // 变形目标
  
  morph(targetIndex, weight) {
    // GPU驱动的顶点变形
  }
}
```

**技术要点：**
- 顶点变形(Morph Targets)
- Metaball算法
- SDF(符号距离场)渲染

---

## 5. 透明窗口实现

### 5.1 Electron透明窗口配置
```javascript
// main.js
const { BrowserWindow } = require('electron');

const mainWindow = new BrowserWindow({
  width: 400,
  height: 400,
  transparent: true,        // 透明背景
  frame: false,             // 无边框
  alwaysOnTop: true,        // 置顶显示
  hasShadow: false,         // 无阴影
  resizable: false,
  skipTaskbar: true,        // 隐藏任务栏图标
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: false
  }
});

// 启用鼠标穿透（非交互区域）
mainWindow.setIgnoreMouseEvents(true, { forward: true });
```

### 5.2 渲染器透明设置
```javascript
// Three.js透明渲染器
const renderer = new THREE.WebGLRenderer({
  alpha: true,              // 透明背景
  antialias: true,          // 抗锯齿
  premultipliedAlpha: false
});
renderer.setClearColor(0x000000, 0);  // 完全透明
```

---

## 6. 交互系统设计

### 6.1 交互类型
| 交互类型 | 实现方式 | 触发效果 |
|----------|----------|----------|
| 点击 | Raycasting | 宠物反应 |
| 拖拽 | 鼠标事件 | 移动宠物 |
| 双击 | 事件监听 | 打开菜单 |
| 右键 | 上下文菜单 | 设置选项 |
| 悬停 | 鼠标检测 | 高亮效果 |

### 6.2 Raycasting点击检测
```javascript
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onMouseClick(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(petMesh);
  
  if (intersects.length > 0) {
    pet.react('touched');
  }
}
```

---

## 7. 行为与AI系统

### 7.1 有限状态机(FSM)
```
       ┌──────────┐
       │   Idle   │◄─────────────┐
       └────┬─────┘              │
            │ 无聊               │ 完成
            ▼                    │
       ┌──────────┐         ┌───┴────┐
       │  Wander  │────────►│  Eat   │
       └────┬─────┘ 饥饿    └────────┘
            │ 疲劳
            ▼
       ┌──────────┐
       │  Sleep   │
       └──────────┘
```

### 7.2 需求系统
```typescript
interface PetNeeds {
  hunger: number;    // 饥饿度 0-100
  energy: number;    // 精力 0-100
  happiness: number; // 快乐度 0-100
  cleanliness: number; // 清洁度 0-100
}
```

---

## 8. AI大模型接口对接方案

### 8.1 支持的AI模型

#### 云端API方案
| 提供商 | 模型 | 优势 | 劣势 | 费用 |
|--------|------|------|------|------|
| OpenAI | GPT-4o / GPT-4o-mini | 能力强，生态完善 | 需要网络，有成本 | 按token计费 |
| Anthropic | Claude 3.5 Sonnet | 长上下文，安全性好 | 需要网络 | 按token计费 |
| Google | Gemini Pro | 多模态能力 | API限制 | 有免费额度 |
| Azure OpenAI | GPT系列 | 企业级SLA | 配置复杂 | 按token计费 |

#### 本地LLM方案
| 方案 | 模型 | 优势 | 劣势 |
|------|------|------|------|
| Ollama | Llama3, Qwen2, Mistral | 完全离线，隐私好 | 需要GPU，模型较大 |
| LM Studio | 多种GGUF模型 | 图形界面，易用 | 性能依赖硬件 |
| llama.cpp | GGUF格式模型 | 轻量，CPU可运行 | 需要配置 |

### 8.2 AI接口架构设计
```typescript
// AI服务抽象层
interface AIProvider {
  name: string;
  chat(messages: Message[], options?: ChatOptions): Promise<Response>;
  stream(messages: Message[], options?: ChatOptions): AsyncGenerator<string>;
  functionCall?(messages: Message[], tools: Tool[]): Promise<ToolResult>;
}

// 多模型管理器
class AIManager {
  private providers: Map<string, AIProvider>;
  private activeProvider: string;
  
  constructor() {
    this.providers = new Map();
    this.registerProvider('openai', new OpenAIProvider());
    this.registerProvider('claude', new ClaudeProvider());
    this.registerProvider('ollama', new OllamaProvider());
  }
  
  async chat(messages: Message[]): Promise<Response> {
    const provider = this.providers.get(this.activeProvider);
    return provider.chat(messages);
  }
  
  // 流式输出支持
  async *streamChat(messages: Message[]): AsyncGenerator<string> {
    const provider = this.providers.get(this.activeProvider);
    yield* provider.stream(messages);
  }
}
```

### 8.3 OpenAI接口实现
```typescript
import OpenAI from 'openai';

class OpenAIProvider implements AIProvider {
  name = 'openai';
  private client: OpenAI;
  
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  
  async chat(messages: Message[]): Promise<Response> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
    });
    return {
      content: response.choices[0].message.content,
      usage: response.usage,
    };
  }
  
  async *stream(messages: Message[]): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      stream: true,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
  
  // Function Calling支持
  async functionCall(messages: Message[], tools: Tool[]): Promise<ToolResult> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      tools: tools,
      tool_choice: 'auto',
    });
    
    const toolCall = response.choices[0].message.tool_calls?.[0];
    if (toolCall) {
      return {
        name: toolCall.function.name,
        arguments: JSON.parse(toolCall.function.arguments),
      };
    }
    return null;
  }
}
```

### 8.4 本地Ollama接口实现
```typescript
class OllamaProvider implements AIProvider {
  name = 'ollama';
  private baseUrl = 'http://localhost:11434';
  
  async chat(messages: Message[]): Promise<Response> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3:8b',
        messages: messages,
        stream: false,
      }),
    });
    
    const data = await response.json();
    return { content: data.message.content };
  }
  
  async *stream(messages: Message[]): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3:8b',
        messages: messages,
        stream: true,
      }),
    });
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(Boolean);
      
      for (const line of lines) {
        const data = JSON.parse(line);
        if (data.message?.content) {
          yield data.message.content;
        }
      }
    }
  }
}
```

### 8.5 对话上下文管理
```typescript
class ConversationManager {
  private history: Message[] = [];
  private maxTokens = 4000;
  private systemPrompt: string;
  
  constructor() {
    this.systemPrompt = `你是一只可爱的桌面宠物助手。你的性格活泼友好，
    会用可爱的语气回答问题，同时也能帮助用户完成各种工作任务。
    当用户需要帮助时，你会认真负责地协助。
    当用户想聊天时，你会表现得活泼可爱。`;
  }
  
  addUserMessage(content: string) {
    this.history.push({ role: 'user', content });
    this.trimHistory();
  }
  
  addAssistantMessage(content: string) {
    this.history.push({ role: 'assistant', content });
  }
  
  getMessages(): Message[] {
    return [
      { role: 'system', content: this.systemPrompt },
      ...this.history,
    ];
  }
  
  private trimHistory() {
    // 简单的token估算和裁剪
    while (this.estimateTokens() > this.maxTokens && this.history.length > 2) {
      this.history.shift();
    }
  }
  
  private estimateTokens(): number {
    return this.history.reduce((acc, msg) => acc + msg.content.length / 4, 0);
  }
}
```

---

## 9. 工作助手功能设计

### 9.1 功能模块概览
```
┌─────────────────────────────────────────────────────────────┐
│                     工作助手功能                             │
├─────────────────────────────────────────────────────────────┤
│  📅 日程管理        │  📝 任务管理         │  ⏰ 提醒功能    │
│  - 查看日程         │  - 创建任务          │  - 定时提醒     │
│  - 添加事件         │  - 任务列表          │  - 周期提醒     │
│  - 日程提醒         │  - 任务完成          │  - 智能提醒     │
├─────────────────────────────────────────────────────────────┤
│  🔍 信息查询        │  📧 邮件辅助         │  💡 智能建议    │
│  - 天气查询         │  - 邮件摘要          │  - 工作建议     │
│  - 新闻摘要         │  - 快速回复          │  - 时间管理     │
│  - 知识问答         │  - 邮件分类          │  - 效率提升     │
├─────────────────────────────────────────────────────────────┤
│  📊 数据处理        │  🖥️ 系统控制         │  📁 文件操作    │
│  - 数据分析         │  - 打开应用          │  - 文件搜索     │
│  - 表格处理         │  - 系统设置          │  - 快速预览     │
│  - 图表生成         │  - 快捷操作          │  - 文件整理     │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Function Calling工具定义
```typescript
// 工作助手工具定义
const assistantTools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'create_reminder',
      description: '创建一个提醒事项',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '提醒标题' },
          time: { type: 'string', description: '提醒时间，ISO格式' },
          repeat: { 
            type: 'string', 
            enum: ['none', 'daily', 'weekly', 'monthly'],
            description: '重复类型' 
          },
        },
        required: ['title', 'time'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: '在电脑中搜索文件',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          fileType: { type: 'string', description: '文件类型过滤' },
          path: { type: 'string', description: '搜索路径' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_application',
      description: '打开指定的应用程序',
      parameters: {
        type: 'object',
        properties: {
          appName: { type: 'string', description: '应用程序名称' },
        },
        required: ['appName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '获取天气信息',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名称' },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_note',
      description: '创建笔记',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题' },
          content: { type: 'string', description: '笔记内容' },
          tags: { type: 'array', items: { type: 'string' }, description: '标签' },
        },
        required: ['content'],
      },
    },
  },
];
```

### 9.3 工具执行器实现
```typescript
class ToolExecutor {
  async execute(toolName: string, args: any): Promise<string> {
    switch (toolName) {
      case 'create_reminder':
        return this.createReminder(args);
      case 'search_files':
        return this.searchFiles(args);
      case 'open_application':
        return this.openApplication(args);
      case 'get_weather':
        return this.getWeather(args);
      case 'create_note':
        return this.createNote(args);
      default:
        return `未知工具: ${toolName}`;
    }
  }
  
  private async createReminder(args: { title: string; time: string; repeat?: string }) {
    // 使用Electron的通知API
    const { Notification } = require('electron');
    const reminderTime = new Date(args.time);
    
    // 存储到本地数据库
    await db.reminders.add({
      title: args.title,
      time: reminderTime,
      repeat: args.repeat || 'none',
      created: new Date(),
    });
    
    // 设置定时器
    const delay = reminderTime.getTime() - Date.now();
    if (delay > 0) {
      setTimeout(() => {
        new Notification({
          title: '⏰ 提醒',
          body: args.title,
        }).show();
      }, delay);
    }
    
    return `已创建提醒: "${args.title}"，时间: ${reminderTime.toLocaleString()}`;
  }
  
  private async searchFiles(args: { query: string; fileType?: string; path?: string }) {
    const { exec } = require('child_process');
    const searchPath = args.path || require('os').homedir();
    
    // Windows搜索命令
    const command = `where /r "${searchPath}" *${args.query}*${args.fileType || ''}`;
    
    return new Promise((resolve) => {
      exec(command, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(`未找到匹配 "${args.query}" 的文件`);
        } else {
          const files = stdout.trim().split('\n').slice(0, 5);
          resolve(`找到以下文件:\n${files.join('\n')}`);
        }
      });
    });
  }
  
  private async openApplication(args: { appName: string }) {
    const { shell } = require('electron');
    
    // 常用应用映射
    const appMap: Record<string, string> = {
      '记事本': 'notepad',
      '计算器': 'calc',
      '浏览器': 'chrome',
      '文件管理器': 'explorer',
      'vscode': 'code',
    };
    
    const appCommand = appMap[args.appName.toLowerCase()] || args.appName;
    
    try {
      require('child_process').exec(`start ${appCommand}`);
      return `已打开: ${args.appName}`;
    } catch {
      return `无法打开: ${args.appName}`;
    }
  }
  
  private async getWeather(args: { city: string }) {
    // 使用免费天气API
    try {
      const response = await fetch(
        `https://wttr.in/${encodeURIComponent(args.city)}?format=j1`
      );
      const data = await response.json();
      const current = data.current_condition[0];
      
      return `${args.city}天气: ${current.temp_C}°C, ${current.weatherDesc[0].value}`;
    } catch {
      return `无法获取${args.city}的天气信息`;
    }
  }
  
  private async createNote(args: { title?: string; content: string; tags?: string[] }) {
    const note = {
      id: Date.now().toString(),
      title: args.title || '无标题笔记',
      content: args.content,
      tags: args.tags || [],
      created: new Date(),
    };
    
    await db.notes.add(note);
    return `已创建笔记: "${note.title}"`;
  }
}
```

### 9.4 语音交互实现
```typescript
// 语音识别 (STT)
class SpeechRecognition {
  private recognition: any;
  private isListening = false;
  
  constructor() {
    // 使用Web Speech API (Electron支持)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'zh-CN';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
  }
  
  start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (event.results[0].isFinal) {
          resolve(transcript);
        }
      };
      
      this.recognition.onerror = (event: any) => {
        reject(event.error);
      };
      
      this.recognition.start();
      this.isListening = true;
    });
  }
  
  stop() {
    this.recognition.stop();
    this.isListening = false;
  }
}

// 语音合成 (TTS)
class TextToSpeech {
  private synth: SpeechSynthesis;
  private voice: SpeechSynthesisVoice | null = null;
  
  constructor() {
    this.synth = window.speechSynthesis;
    this.initVoice();
  }
  
  private initVoice() {
    // 选择中文语音
    const voices = this.synth.getVoices();
    this.voice = voices.find(v => v.lang.includes('zh')) || voices[0];
  }
  
  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = this.voice;
      utterance.rate = 1.0;
      utterance.pitch = 1.2; // 稍微调高音调，更可爱
      
      utterance.onend = () => resolve();
      this.synth.speak(utterance);
    });
  }
  
  stop() {
    this.synth.cancel();
  }
}
```

### 9.5 宠物与AI助手联动
```typescript
class PetAssistant {
  private pet: Pet3D;
  private aiManager: AIManager;
  private conversation: ConversationManager;
  private toolExecutor: ToolExecutor;
  private stt: SpeechRecognition;
  private tts: TextToSpeech;
  
  constructor(pet: Pet3D) {
    this.pet = pet;
    this.aiManager = new AIManager();
    this.conversation = new ConversationManager();
    this.toolExecutor = new ToolExecutor();
    this.stt = new SpeechRecognition();
    this.tts = new TextToSpeech();
  }
  
  // 处理用户输入
  async handleUserInput(input: string): Promise<void> {
    // 宠物表现出"思考"动画
    this.pet.playAnimation('thinking');
    this.pet.setExpression('curious');
    
    // 添加用户消息
    this.conversation.addUserMessage(input);
    
    try {
      // 调用AI获取响应
      const response = await this.aiManager.chat(this.conversation.getMessages());
      
      // 检查是否需要执行工具
      if (response.toolCall) {
        const toolResult = await this.toolExecutor.execute(
          response.toolCall.name,
          response.toolCall.arguments
        );
        
        // 将工具结果加入对话
        this.conversation.addAssistantMessage(toolResult);
        
        // 宠物表现出"完成任务"动画
        this.pet.playAnimation('happy');
        this.pet.setExpression('proud');
      } else {
        // 普通对话响应
        this.conversation.addAssistantMessage(response.content);
        
        // 根据内容调整宠物表情
        this.adjustPetExpression(response.content);
      }
      
      // 语音播报响应
      await this.tts.speak(response.content);
      
      // 恢复待机状态
      this.pet.playAnimation('idle');
      
    } catch (error) {
      // 宠物表现出"困惑"表情
      this.pet.playAnimation('confused');
      this.pet.setExpression('sad');
      
      await this.tts.speak('抱歉，我遇到了一些问题...');
    }
  }
  
  // 语音对话
  async startVoiceChat(): Promise<void> {
    // 宠物表现出"倾听"动画
    this.pet.playAnimation('listening');
    this.pet.setExpression('attentive');
    
    try {
      const userSpeech = await this.stt.start();
      await this.handleUserInput(userSpeech);
    } catch (error) {
      this.pet.playAnimation('confused');
    }
  }
  
  // 根据AI响应调整宠物表情
  private adjustPetExpression(content: string) {
    if (content.includes('开心') || content.includes('好的') || content.includes('！')) {
      this.pet.setExpression('happy');
      this.pet.playAnimation('bounce');
    } else if (content.includes('抱歉') || content.includes('不好意思')) {
      this.pet.setExpression('apologetic');
    } else {
      this.pet.setExpression('neutral');
    }
  }
}
```

---

## 10. 图生3D模型与换肤功能

### 10.1 功能概述

为满足用户个性化需求，系统支持用户上传家养宠物照片，自动生成对应的3D模型，实现"换肤"功能。

```
┌─────────────────────────────────────────────────────────────┐
│                    图生3D换肤流程                            │
│                                                             │
│  📸 用户上传照片    🔍 品种识别      🎨 3D模型生成          │
│       │                │                  │                 │
│       ▼                ▼                  ▼                 │
│  ┌─────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │ 宠物照片 │───►│ CV识别模型  │───►│ Image-to-3D │        │
│  │ (猫/狗等)│    │ (品种/姿态) │    │   生成模型   │        │
│  └─────────┘    └─────────────┘    └──────┬──────┘        │
│                                           │                │
│                                           ▼                │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                    后处理管线                        │  │
│  │  🦴 骨骼绑定  →  🎭 纹理迁移  →  🏃 动画适配        │  │
│  └─────────────────────────────────────────────────────┘  │
│                           │                                │
│                           ▼                                │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              🐾 个性化3D桌面宠物                      │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 支持的宠物类型

| 类别 | 支持品种 | 换肤复杂度 | 备注 |
|------|----------|------------|------|
| 🐱 猫 | 美短、英短、布偶、橘猫、狸花等 | ⭐⭐⭐ | 毛发渲染挑战 |
| 🐕 狗 | 柯基、柴犬、金毛、哈士奇、泰迪等 | ⭐⭐⭐ | 体型差异大 |
| 🦎 蜥蜴 | 鬃狮蜥、豹纹守宫、蓝舌石龙子等 | ⭐⭐ | 鳞片纹理 |
| 🐢 乌龟 | 巴西龟、草龟、陆龟等 | ⭐⭐ | 壳纹理关键 |
| 🐍 蛇 | 玉米蛇、球蟒、王蛇等 | ⭐⭐ | 花纹识别 |
| 🐹 仓鼠 | 金丝熊、三线、布丁等 | ⭐⭐ | 体型小巧 |
| 🐰 兔子 | 荷兰侏儒、垂耳兔、安哥拉等 | ⭐⭐⭐ | 毛发蓬松 |
| 🐦 鸟类 | 虎皮鹦鹉、玄凤、文鸟等 | ⭐⭐⭐⭐ | 羽毛复杂 |

### 10.3 Image-to-3D技术方案

#### 方案对比

| 技术方案 | 描述 | 优点 | 缺点 | 推荐度 |
|----------|------|------|------|--------|
| **TripoSR** | 单图快速3D重建 | 速度快(< 1s)、开源 | 细节一般 | ⭐⭐⭐⭐⭐ |
| **Wonder3D** | 多视角一致性生成 | 质量高、几何准确 | 速度较慢 | ⭐⭐⭐⭐ |
| **Zero-1-to-3** | 扩散模型单图生成 | 效果好、研究成熟 | 需要GPU | ⭐⭐⭐⭐ |
| **OpenLRM** | 大规模重建模型 | 泛化能力强 | 资源消耗大 | ⭐⭐⭐ |
| **InstantMesh** | 即时网格生成 | 速度与质量平衡 | 较新技术 | ⭐⭐⭐⭐ |
| **Rodin Gen-1** | 商用3D生成 | 质量最高 | 付费API | ⭐⭐⭐⭐ |
| **Meshy API** | 商用图生3D | 易集成、支持好 | 按次付费 | ⭐⭐⭐⭐ |

#### 推荐方案：混合架构
```
┌─────────────────────────────────────────────────────────────┐
│                    图生3D混合架构                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │   本地快速生成    │    │   云端高质量生成   │              │
│  │   (TripoSR)      │    │   (Meshy/Rodin)  │              │
│  │                  │    │                  │              │
│  │  • 实时预览      │    │  • 最终模型       │              │
│  │  • 离线可用      │    │  • 高精度细节     │              │
│  │  • 低精度快速    │    │  • PBR材质       │              │
│  └────────┬─────────┘    └────────┬─────────┘              │
│           │                       │                        │
│           └───────────┬───────────┘                        │
│                       ▼                                    │
│           ┌──────────────────────┐                        │
│           │    质量选择器        │                        │
│           │  快速预览 / 高质量   │                        │
│           └──────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### 10.4 TripoSR本地集成方案

```typescript
// TripoSR Python后端服务
// 通过Electron的子进程调用
class TripoSRService {
  private pythonProcess: ChildProcess | null = null;
  private modelPath = './models/triposr';
  
  async initialize(): Promise<void> {
    // 启动Python服务
    this.pythonProcess = spawn('python', [
      './backend/triposr_server.py',
      '--model-path', this.modelPath,
      '--port', '8765'
    ]);
    
    await this.waitForReady();
  }
  
  async generateMesh(imagePath: string): Promise<MeshResult> {
    const response = await fetch('http://localhost:8765/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_path: imagePath,
        output_format: 'glb',
        texture_resolution: 1024,
      })
    });
    
    return response.json();
  }
}

// Python服务端 (triposr_server.py)
/*
from flask import Flask, request, jsonify
import triposr

app = Flask(__name__)
model = triposr.load_model('stabilityai/triposr')

@app.route('/generate', methods=['POST'])
def generate():
    data = request.json
    image_path = data['image_path']
    
    # 生成3D网格
    mesh = model.generate(
        image_path,
        output_format=data.get('output_format', 'glb'),
        texture_resolution=data.get('texture_resolution', 1024)
    )
    
    output_path = f'./output/{uuid.uuid4()}.glb'
    mesh.export(output_path)
    
    return jsonify({
        'success': True,
        'model_path': output_path,
        'vertices': len(mesh.vertices),
        'faces': len(mesh.faces)
    })
*/
```

### 10.5 云端API集成（Meshy）

```typescript
class MeshyAPIService {
  private apiKey: string;
  private baseUrl = 'https://api.meshy.ai/v2';
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  // 从图片生成3D模型
  async imageToMesh(imageUrl: string, options?: ImageTo3DOptions): Promise<TaskResult> {
    // 步骤1: 创建任务
    const createResponse = await fetch(`${this.baseUrl}/image-to-3d`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageUrl,
        enable_pbr: true,  // 启用PBR材质
        ai_model: 'meshy-4',
        topology: 'quad',  // 四边面拓扑，适合动画
        target_polycount: 30000,
      })
    });
    
    const { result: taskId } = await createResponse.json();
    
    // 步骤2: 轮询任务状态
    return this.pollTaskStatus(taskId);
  }
  
  private async pollTaskStatus(taskId: string): Promise<TaskResult> {
    while (true) {
      const response = await fetch(`${this.baseUrl}/image-to-3d/${taskId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      
      const task = await response.json();
      
      if (task.status === 'SUCCEEDED') {
        return {
          modelUrl: task.model_urls.glb,
          textureUrls: task.texture_urls,
          thumbnailUrl: task.thumbnail_url,
        };
      } else if (task.status === 'FAILED') {
        throw new Error(`生成失败: ${task.error_message}`);
      }
      
      // 等待后继续轮询
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}
```

### 10.6 自动骨骼绑定（Auto-Rigging）

#### 技术方案对比

| 方案 | 描述 | 适用场景 | 复杂度 |
|------|------|----------|--------|
| **Mixamo** | Adobe自动绑定服务 | 人形/双足 | ⭐ |
| **RigNet** | AI骨骼预测 | 通用模型 | ⭐⭐⭐ |
| **Pinocchio** | 经典骨骼嵌入 | 简单模型 | ⭐⭐ |
| **预制骨骼模板** | 针对宠物类型 | 本项目推荐 | ⭐⭐ |
| **Blender Auto-Rig** | 开源方案 | 离线处理 | ⭐⭐⭐ |

#### 推荐方案：预制骨骼模板 + 网格变形

```typescript
// 骨骼模板系统
class SkeletonTemplateSystem {
  private templates: Map<PetType, SkeletonTemplate> = new Map();
  
  constructor() {
    // 加载预制骨骼模板
    this.templates.set('cat', this.loadTemplate('cat_skeleton.json'));
    this.templates.set('dog', this.loadTemplate('dog_skeleton.json'));
    this.templates.set('lizard', this.loadTemplate('lizard_skeleton.json'));
    this.templates.set('turtle', this.loadTemplate('turtle_skeleton.json'));
    this.templates.set('snake', this.loadTemplate('snake_skeleton.json'));
  }
  
  // 将骨骼模板适配到新生成的网格
  async bindSkeleton(mesh: THREE.Mesh, petType: PetType): Promise<THREE.SkinnedMesh> {
    const template = this.templates.get(petType);
    if (!template) throw new Error(`未支持的宠物类型: ${petType}`);
    
    // 1. 分析网格边界和比例
    const boundingBox = new THREE.Box3().setFromObject(mesh);
    const meshSize = boundingBox.getSize(new THREE.Vector3());
    
    // 2. 缩放骨骼模板以匹配网格
    const skeleton = template.skeleton.clone();
    this.scaleSkeleton(skeleton, meshSize, template.originalSize);
    
    // 3. 计算顶点权重（蒙皮）
    const skinWeights = this.calculateSkinWeights(mesh.geometry, skeleton);
    
    // 4. 创建SkinnedMesh
    const skinnedMesh = new THREE.SkinnedMesh(mesh.geometry, mesh.material);
    skinnedMesh.add(skeleton.bones[0]); // 添加根骨骼
    skinnedMesh.bind(skeleton);
    
    // 5. 应用蒙皮权重
    mesh.geometry.setAttribute('skinIndex', skinWeights.indices);
    mesh.geometry.setAttribute('skinWeight', skinWeights.weights);
    
    return skinnedMesh;
  }
  
  private calculateSkinWeights(
    geometry: THREE.BufferGeometry, 
    skeleton: THREE.Skeleton
  ): SkinWeightData {
    const positions = geometry.getAttribute('position');
    const vertexCount = positions.count;
    
    const skinIndices: number[] = [];
    const skinWeights: number[] = [];
    
    for (let i = 0; i < vertexCount; i++) {
      const vertex = new THREE.Vector3(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i)
      );
      
      // 找到最近的4个骨骼及其权重
      const nearest = this.findNearestBones(vertex, skeleton.bones, 4);
      
      skinIndices.push(...nearest.indices);
      skinWeights.push(...nearest.weights);
    }
    
    return {
      indices: new THREE.Uint16BufferAttribute(skinIndices, 4),
      weights: new THREE.Float32BufferAttribute(skinWeights, 4),
    };
  }
}
```

#### 骨骼模板示例（猫）

```json
{
  "name": "cat_skeleton",
  "bones": [
    { "name": "root", "parent": null, "position": [0, 0, 0] },
    { "name": "spine_01", "parent": "root", "position": [0, 0.1, 0] },
    { "name": "spine_02", "parent": "spine_01", "position": [0, 0.08, 0] },
    { "name": "spine_03", "parent": "spine_02", "position": [0, 0.08, 0] },
    { "name": "neck", "parent": "spine_03", "position": [0, 0.05, 0.02] },
    { "name": "head", "parent": "neck", "position": [0, 0.04, 0.02] },
    { "name": "jaw", "parent": "head", "position": [0, -0.01, 0.02] },
    { "name": "ear_L", "parent": "head", "position": [0.02, 0.03, 0] },
    { "name": "ear_R", "parent": "head", "position": [-0.02, 0.03, 0] },
    { "name": "tail_01", "parent": "root", "position": [0, 0.02, -0.1] },
    { "name": "tail_02", "parent": "tail_01", "position": [0, 0, -0.05] },
    { "name": "tail_03", "parent": "tail_02", "position": [0, 0, -0.05] },
    { "name": "leg_front_L", "parent": "spine_02", "position": [0.04, -0.05, 0.03] },
    { "name": "leg_front_R", "parent": "spine_02", "position": [-0.04, -0.05, 0.03] },
    { "name": "leg_back_L", "parent": "root", "position": [0.04, -0.05, -0.05] },
    { "name": "leg_back_R", "parent": "root", "position": [-0.04, -0.05, -0.05] }
  ],
  "animations": ["idle", "walk", "run", "sit", "sleep", "jump"]
}
```

### 10.7 品种识别（计算机视觉）

```typescript
// 宠物品种识别服务
class PetBreedRecognition {
  private model: tf.GraphModel | null = null;
  private labels: string[] = [];
  
  async initialize() {
    // 加载预训练模型（可使用MobileNet微调版本）
    this.model = await tf.loadGraphModel('./models/pet_breed_classifier/model.json');
    this.labels = await this.loadLabels('./models/pet_breed_classifier/labels.json');
  }
  
  async recognize(imageElement: HTMLImageElement): Promise<RecognitionResult> {
    // 预处理图像
    const tensor = tf.browser.fromPixels(imageElement)
      .resizeBilinear([224, 224])
      .expandDims(0)
      .div(255.0);
    
    // 推理
    const predictions = await this.model!.predict(tensor) as tf.Tensor;
    const probabilities = await predictions.data();
    
    // 获取Top-3结果
    const topK = this.getTopK(probabilities, 3);
    
    return {
      species: topK[0].label.split('_')[0], // cat, dog, etc.
      breed: topK[0].label,
      confidence: topK[0].probability,
      alternatives: topK.slice(1),
    };
  }
  
  // 根据识别结果获取宠物元数据
  getPetMetadata(breed: string): PetMetadata {
    const metadata: Record<string, PetMetadata> = {
      'cat_persian': { 
        bodyType: 'fluffy', 
        furLength: 'long', 
        personality: 'calm',
        skeletonType: 'cat_standard'
      },
      'cat_siamese': { 
        bodyType: 'slender', 
        furLength: 'short', 
        personality: 'vocal',
        skeletonType: 'cat_slender'
      },
      'dog_corgi': { 
        bodyType: 'short_legs', 
        furLength: 'medium', 
        personality: 'energetic',
        skeletonType: 'dog_short'
      },
      'dog_husky': { 
        bodyType: 'athletic', 
        furLength: 'thick', 
        personality: 'playful',
        skeletonType: 'dog_medium'
      },
      // ... 更多品种
    };
    
    return metadata[breed] || { bodyType: 'standard', furLength: 'short', personality: 'neutral', skeletonType: 'default' };
  }
}
```

### 10.8 纹理与皮肤迁移

```typescript
class TextureTransfer {
  // 从照片提取纹理特征
  async extractTextureFeatures(image: HTMLImageElement): Promise<TextureFeatures> {
    // 使用Canvas进行颜色分析
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // 提取主色调
    const dominantColors = this.extractDominantColors(imageData, 5);
    
    // 提取纹理模式（条纹、斑点等）
    const pattern = await this.detectPattern(imageData);
    
    return {
      dominantColors,
      pattern,
      brightness: this.calculateBrightness(imageData),
      contrast: this.calculateContrast(imageData),
    };
  }
  
  // 将纹理特征应用到3D模型
  async applyTexture(
    mesh: THREE.Mesh, 
    features: TextureFeatures,
    originalImage: HTMLImageElement
  ): Promise<void> {
    // 方案1: 直接投影纹理
    const projectedTexture = await this.projectTexture(mesh, originalImage);
    
    // 方案2: 生成程序化纹理
    const proceduralTexture = this.generateProceduralTexture(features);
    
    // 混合两种纹理
    const finalTexture = this.blendTextures(projectedTexture, proceduralTexture, 0.7);
    
    // 应用到材质
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.map = finalTexture;
    material.needsUpdate = true;
  }
  
  // 为不同图案类型生成纹理
  private generateProceduralTexture(features: TextureFeatures): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    
    // 基础色
    ctx.fillStyle = features.dominantColors[0];
    ctx.fillRect(0, 0, 1024, 1024);
    
    // 根据图案类型添加细节
    switch (features.pattern.type) {
      case 'tabby': // 虎斑
        this.drawTabbyPattern(ctx, features);
        break;
      case 'spotted': // 斑点
        this.drawSpottedPattern(ctx, features);
        break;
      case 'solid': // 纯色
        // 已经填充基础色
        break;
      case 'bicolor': // 双色
        this.drawBicolorPattern(ctx, features);
        break;
    }
    
    return new THREE.CanvasTexture(canvas);
  }
}
```

### 10.9 姿态模拟与动画适配

```typescript
class PoseSimulation {
  private mixers: Map<string, THREE.AnimationMixer> = new Map();
  private clips: Map<string, THREE.AnimationClip[]> = new Map();
  
  // 从照片检测姿态
  async detectPoseFromImage(image: HTMLImageElement): Promise<PetPose> {
    // 使用姿态检测模型（可选：MediaPipe、OpenPose等）
    // 对于宠物，使用专门的动物姿态估计模型
    
    // 简化版：基于轮廓分析
    const contour = await this.extractContour(image);
    const pose = this.analyzePoseFromContour(contour);
    
    return pose;
  }
  
  // 根据检测到的姿态设置初始动画
  async setInitialPose(mesh: THREE.SkinnedMesh, pose: PetPose): Promise<void> {
    const mixer = new THREE.AnimationMixer(mesh);
    this.mixers.set(mesh.uuid, mixer);
    
    // 根据姿态选择最接近的动画片段
    const closestAnimation = this.findClosestAnimation(pose);
    
    // 播放动画并暂停在合适的帧
    const action = mixer.clipAction(closestAnimation);
    action.play();
    action.paused = true;
    action.time = this.findBestFrame(closestAnimation, pose);
  }
  
  // 品种特定的行为动画
  getBreedSpecificAnimations(breed: string): AnimationSet {
    const breedAnimations: Record<string, AnimationSet> = {
      'cat_persian': {
        idle: ['loaf', 'groom', 'nap'],
        happy: ['purr', 'slow_blink', 'knead'],
        playful: ['pounce', 'chase_tail'],
      },
      'dog_corgi': {
        idle: ['sit', 'pant', 'wag_tail'],
        happy: ['zoomies', 'spin', 'sploot'],
        playful: ['play_bow', 'fetch_ready'],
      },
      'lizard_bearded_dragon': {
        idle: ['bask', 'head_bob', 'arm_wave'],
        happy: ['relaxed_pose'],
        alert: ['puff_beard'],
      },
      // ... 更多品种
    };
    
    return breedAnimations[breed] || this.getDefaultAnimations();
  }
}
```

### 10.10 完整换肤流程

```typescript
class PetSkinSystem {
  private breedRecognition: PetBreedRecognition;
  private tripoSR: TripoSRService;
  private meshyAPI: MeshyAPIService;
  private skeletonSystem: SkeletonTemplateSystem;
  private textureTransfer: TextureTransfer;
  private poseSimulation: PoseSimulation;
  
  async createPetFromPhoto(photoFile: File): Promise<CustomPet> {
    // 显示进度
    this.emit('progress', { stage: 'uploading', progress: 0 });
    
    // 1. 加载并预处理图片
    const image = await this.loadImage(photoFile);
    this.emit('progress', { stage: 'analyzing', progress: 10 });
    
    // 2. 品种识别
    const recognition = await this.breedRecognition.recognize(image);
    console.log(`识别结果: ${recognition.breed} (${(recognition.confidence * 100).toFixed(1)}%)`);
    this.emit('progress', { stage: 'recognized', progress: 20, breed: recognition.breed });
    
    // 3. 生成3D模型（用户可选快速/高质量）
    let meshResult: MeshResult;
    const quality = await this.promptUserForQuality();
    
    if (quality === 'fast') {
      // 本地快速生成
      this.emit('progress', { stage: 'generating_local', progress: 30 });
      meshResult = await this.tripoSR.generateMesh(photoFile.path);
    } else {
      // 云端高质量生成
      this.emit('progress', { stage: 'generating_cloud', progress: 30 });
      const imageUrl = await this.uploadToTempStorage(photoFile);
      meshResult = await this.meshyAPI.imageToMesh(imageUrl);
    }
    this.emit('progress', { stage: 'mesh_ready', progress: 60 });
    
    // 4. 加载生成的网格
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(meshResult.modelUrl);
    const mesh = gltf.scene.children[0] as THREE.Mesh;
    
    // 5. 骨骼绑定
    this.emit('progress', { stage: 'rigging', progress: 70 });
    const petType = recognition.species as PetType;
    const skinnedMesh = await this.skeletonSystem.bindSkeleton(mesh, petType);
    
    // 6. 纹理迁移
    this.emit('progress', { stage: 'texturing', progress: 80 });
    const textureFeatures = await this.textureTransfer.extractTextureFeatures(image);
    await this.textureTransfer.applyTexture(skinnedMesh, textureFeatures, image);
    
    // 7. 姿态检测与初始化
    this.emit('progress', { stage: 'posing', progress: 90 });
    const initialPose = await this.poseSimulation.detectPoseFromImage(image);
    await this.poseSimulation.setInitialPose(skinnedMesh, initialPose);
    
    // 8. 获取品种特定动画
    const animations = this.poseSimulation.getBreedSpecificAnimations(recognition.breed);
    
    this.emit('progress', { stage: 'complete', progress: 100 });
    
    return {
      mesh: skinnedMesh,
      breed: recognition.breed,
      species: recognition.species,
      animations,
      metadata: this.breedRecognition.getPetMetadata(recognition.breed),
      originalPhoto: image,
    };
  }
}
```

### 10.11 UI设计：换肤向导

```typescript
// 换肤向导组件
const SkinWizard: React.FC = () => {
  const [step, setStep] = useState<'upload' | 'recognize' | 'generate' | 'customize' | 'complete'>('upload');
  const [progress, setProgress] = useState(0);
  const [petData, setPetData] = useState<CustomPet | null>(null);
  
  return (
    <div className="skin-wizard">
      {/* 步骤指示器 */}
      <StepIndicator steps={['上传照片', '识别品种', '生成模型', '自定义', '完成']} current={step} />
      
      {step === 'upload' && (
        <UploadStep onUpload={handleUpload} />
      )}
      
      {step === 'recognize' && (
        <RecognizeStep 
          progress={progress}
          breed={petData?.breed}
          confidence={petData?.confidence}
        />
      )}
      
      {step === 'generate' && (
        <GenerateStep
          progress={progress}
          onQualitySelect={handleQualitySelect}
        />
      )}
      
      {step === 'customize' && petData && (
        <CustomizeStep
          pet={petData}
          onColorAdjust={handleColorAdjust}
          onPatternEdit={handlePatternEdit}
          onAccessoryAdd={handleAccessoryAdd}
        />
      )}
      
      {step === 'complete' && petData && (
        <CompleteStep
          pet={petData}
          onConfirm={handleConfirm}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
};
```

### 10.12 技术风险与挑战

| 挑战 | 风险等级 | 解决方案 |
|------|----------|----------|
| 图生3D质量不稳定 | 高 | 多方案fallback，用户可选重试 |
| 毛发渲染性能 | 中 | 使用简化毛发着色器，LOD系统 |
| 骨骼绑定变形 | 中 | 预制模板 + 手动微调选项 |
| 品种识别准确率 | 中 | 用户确认/手动选择品种 |
| GPU要求高 | 中 | 云端处理选项，降级方案 |
| API成本 | 低 | 本地方案为主，云端按需 |

### 10.13 硬件要求

| 功能 | 最低配置 | 推荐配置 |
|------|----------|----------|
| 本地图生3D (TripoSR) | GTX 1060 6GB | RTX 3060 12GB |
| 品种识别 | 无独显要求 | 任意独显 |
| 3D渲染换肤宠物 | GTX 1050 | GTX 1660+ |
| 仅使用云端生成 | 无独显要求 | - |

---

## 11. 性能优化策略

### 11.1 渲染优化
- **LOD系统**：根据距离切换模型精度
- **实例化渲染**：重复对象使用InstancedMesh
- **遮挡剔除**：不渲染被遮挡的对象
- **帧率限制**：空闲时降低到30fps

### 11.2 内存优化
- **纹理压缩**：使用KTX2/Basis格式
- **几何体共享**：相同模型共享BufferGeometry
- **按需加载**：Lazy loading资源

### 11.3 电池优化
- **空闲检测**：用户不活动时降低帧率
- **GPU休眠**：最小化时停止渲染
- **唤醒事件**：用户交互时恢复

---

## 12. 开发计划

### 12.1 里程碑规划
```
Phase 1: 基础框架 (2周)
├── Electron项目搭建
├── Three.js集成
├── 透明窗口实现
└── 基础渲染管线

Phase 2: 核心功能 (3周)
├── 3D模型加载
├── 动画系统
├── 交互系统
└── 状态机实现

Phase 3: 宠物系统 (3周)
├── 动物宠物
├── 植物宠物
├── 外星生物
└── 几何形状宠物

Phase 4: AI助手集成 (3周) [新增]
├── LLM接口对接
├── 对话系统实现
├── Function Calling工具
└── 语音交互系统

Phase 5: 工作助手功能 (2周) [新增]
├── 提醒系统
├── 文件操作
├── 系统控制
└── 知识库集成

Phase 6: 图生3D与换肤系统 (3周) [新增]
├── Image-to-3D集成 (TripoSR/Meshy)
├── 品种识别模型
├── 自动骨骼绑定系统
├── 纹理迁移与皮肤生成
└── 换肤向导UI

Phase 7: 完善优化 (2周)
├── 性能优化
├── UI界面
├── 系统托盘
└── 打包发布
```

### 12.2 时间估算
| 阶段 | 时间 | 人力 | 说明 |
|------|------|------|------|
| 基础框架 | 2周 | 1人 | Electron + Three.js |
| 核心功能 | 3周 | 1-2人 | 渲染、动画、交互 |
| 宠物系统 | 3周 | 1-2人 | 四种宠物类型 |
| **AI助手集成** | **3周** | **1-2人** | **LLM对接、对话系统** |
| **工作助手功能** | **2周** | **1人** | **工具、提醒、语音** |
| **图生3D与换肤** | **3周** | **1-2人** | **Image-to-3D、骨骼绑定** |
| 完善优化 | 2周 | 1人 | 性能、打包 |
| **总计** | **18周** | **1-2人** | - |

### 12.3 AI功能开发详细计划
```
Week 1-2: AI基础架构
├── Day 1-2: AI Provider抽象层设计与实现
├── Day 3-4: OpenAI/Claude API对接
├── Day 5-7: 本地Ollama对接
└── Day 8-10: 对话上下文管理

Week 3: 对话系统完善
├── Day 1-2: 流式输出实现
├── Day 3-4: 错误处理与重试机制
├── Day 5-6: 对话历史持久化
└── Day 7: 多模型切换UI

Week 4-5: 工作助手功能
├── Day 1-3: Function Calling框架
├── Day 4-5: 提醒系统实现
├── Day 6-7: 文件搜索功能
├── Day 8-9: 系统控制功能
└── Day 10: 语音交互集成

Week 6-8: 图生3D与换肤功能
├── Day 1-3: TripoSR本地集成
├── Day 4-5: Meshy API对接
├── Day 6-7: 品种识别模型训练/集成
├── Day 8-10: 骨骼模板系统
├── Day 11-12: 自动蒙皮算法
├── Day 13-14: 纹理迁移实现
└── Day 15: 换肤向导UI完成
```

---

## 13. 风险评估

### 13.1 技术风险
| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 透明窗口兼容性 | 中 | 高 | 多平台测试 |
| 性能问题 | 中 | 中 | 优化策略 |
| 3D模型获取 | 低 | 中 | 使用免费资源 |
| **AI API稳定性** | **中** | **高** | **多模型fallback** |
| **本地LLM性能** | **中** | **中** | **模型量化、硬件要求说明** |
| **语音识别准确率** | **中** | **低** | **提供文字输入备选** |
| **图生3D质量** | **高** | **中** | **多方案fallback、用户重试** |
| **骨骼绑定变形** | **中** | **中** | **预制模板、手动微调** |

### 13.2 项目风险
| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 范围蔓延 | 高 | 高 | 严格需求管理 |
| 技术复杂性 | 中 | 中 | 原型验证 |
| **AI成本控制** | **中** | **中** | **支持本地LLM、设置调用限制** |
| **隐私合规** | **低** | **高** | **本地处理优先、明确隐私政策** |

### 13.3 AI功能特有风险
| 风险 | 描述 | 缓解措施 |
|------|------|----------|
| API密钥泄露 | 用户API Key可能被窃取 | 安全存储(keytar)、本地加密 |
| 响应延迟 | 网络延迟影响体验 | 流式输出、本地fallback |
| 内容安全 | AI可能生成不当内容 | 内容过滤、使用安全模型 |
| 依赖单一供应商 | API变更或停服 | 多供应商支持、本地备选 |

### 13.4 图生3D功能特有风险
| 风险 | 描述 | 缓解措施 |
|------|------|----------|
| 生成质量不稳定 | 不同照片生成效果差异大 | 提供质量预览、支持重试 |
| GPU资源需求高 | 本地生成需要较好显卡 | 提供云端选项、降级方案 |
| 骨骼适配问题 | 生成模型与骨骼模板不匹配 | 多套骨骼模板、手动调整 |
| 品种识别错误 | 识别准确率有限 | 用户手动确认/选择品种 |
| API成本累积 | 云端生成按次收费 | 本地优先、限制调用频率 |

---

## 14. 结论与建议

### 14.1 可行性结论

**✅ 项目完全可行（含AI助手功能）**

技术方案成熟，有大量先例可参考。推荐使用 **Electron + Three.js + LLM API** 方案，理由：
1. 开发效率高
2. 社区支持好
3. 跨平台能力强
4. 透明窗口支持完善
5. **AI接口生态成熟**（OpenAI、Claude、Ollama等）
6. **Function Calling能力强**，可扩展各种工作助手功能
7. **图生3D技术成熟**（TripoSR、Meshy等方案可用）
8. **换肤功能增强个性化**，提升用户粘性

### 14.2 建议

1. **分阶段开发**：先实现MVP（最小可行产品）
2. **原型验证**：先做透明窗口+基础3D渲染demo
3. **模块化设计**：方便后期扩展新宠物类型和AI功能
4. **性能优先**：从一开始就关注性能指标
5. **AI多模型支持**：不依赖单一AI供应商
6. **隐私优先**：敏感数据本地处理，支持本地LLM
7. **图生3D混合架构**：本地快速预览 + 云端高质量生成
8. **换肤功能渐进式**：先支持常见品种，逐步扩展

### 14.3 下一步行动
- [ ] 创建Electron + Three.js原型项目
- [ ] 验证透明窗口在Windows上的表现
- [ ] 收集/制作测试用3D模型
- [ ] 设计宠物行为状态机
- [ ] **搭建AI接口抽象层原型**
- [ ] **验证OpenAI/Ollama对接**
- [ ] **实现基础对话功能demo**
- [ ] **设计Function Calling工具框架**
- [ ] **验证TripoSR本地集成**
- [ ] **测试Meshy API图生3D效果**
- [ ] **准备宠物品种识别数据集**
- [ ] **设计骨骼模板系统**

### 14.4 MVP功能范围建议
```
MVP v1.0 (必须功能)
├── 🐱 一种宠物类型（动物）
├── 🪟 透明窗口显示
├── 🎬 基础动画（待机、互动）
├── 🤖 AI对话功能（文字）
├── 💬 基础工作助手（提醒、天气）
└── ⚙️ 设置面板

MVP v1.1 (增强功能)
├── 🌱 更多宠物类型
├── 🎙️ 语音交互
├── 📁 文件操作助手
├── 📊 更多工作工具
└── 🎨 宠物自定义

MVP v1.2 (换肤功能)
├── 📸 照片上传换肤
├── 🐱 猫狗品种识别
├── 🦴 自动骨骼绑定
├── 🎭 纹理迁移
└── 🔧 手动微调选项
```

---

## 附录

### A. 参考项目
- [Shimeji](https://kilkakon.com/shimeji/) - 经典桌面宠物
- [Desktop Goose](https://samperson.itch.io/desktop-goose) - 桌面鹅
- [Tamagotchi](https://tamagotchi.com/) - 电子宠物鼻祖

### B. 资源链接
- Three.js文档: https://threejs.org/docs/
- Electron文档: https://www.electronjs.org/docs
- 免费3D模型: https://sketchfab.com/
- GLTF查看器: https://gltf-viewer.donmccurdy.com/

### C. 技术文章
- Electron透明窗口: https://www.electronjs.org/docs/latest/tutorial/window-customization
- Three.js性能优化: https://discoverthreejs.com/tips-and-tricks/

### D. AI相关资源
- OpenAI API文档: https://platform.openai.com/docs
- Claude API文档: https://docs.anthropic.com/
- Ollama文档: https://ollama.ai/
- LangChain文档: https://js.langchain.com/docs/
- Web Speech API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API

### E. 工作助手参考
- Function Calling指南: https://platform.openai.com/docs/guides/function-calling
- Electron通知API: https://www.electronjs.org/docs/latest/api/notification
- Node.js文件系统: https://nodejs.org/api/fs.html

### F. 图生3D与换肤资源
- TripoSR: https://github.com/VAST-AI-Research/TripoSR
- Meshy API: https://docs.meshy.ai/
- Wonder3D: https://github.com/xxlong0/Wonder3D
- InstantMesh: https://github.com/TencentARC/InstantMesh
- TensorFlow.js: https://www.tensorflow.org/js
- 宠物品种数据集: https://www.kaggle.com/datasets/zippyz/cats-and-dogs-breeds-classification-oxford-dataset
