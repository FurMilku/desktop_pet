# 桌面3D小宠物 - 快速开始指南

**Feature**: 001-desktop-3d-pet  
**Date**: 2026-02-08  
**Related**: [spec.md](./spec.md) | [plan.md](./plan.md) | [data-model.md](./data-model.md)

## 开发环境配置

### 系统要求

| 要求 | 最低配置 | 推荐配置 |
|------|----------|----------|
| 操作系统 | Windows 10 / macOS 10.15 / Ubuntu 20.04 | Windows 11 / macOS 13+ / Ubuntu 22.04 |
| Node.js | 20.x LTS | 20.x LTS (最新) |
| RAM | 8GB | 16GB |
| 显卡 | WebGL2 支持 | 独立显卡 (用于3D模型生成) |
| 磁盘空间 | 2GB | 5GB (含Ollama模型) |

### 必需工具

```bash
# 检查 Node.js 版本 (需要 20.x)
node --version

# 检查 npm 版本
npm --version

# 安装 pnpm (推荐的包管理器)
npm install -g pnpm
```

### 可选工具

```bash
# Ollama (本地AI推理) - 推荐用于离线开发
# Windows: 从 https://ollama.ai 下载安装包
# macOS:
brew install ollama

# Linux:
curl -fsSL https://ollama.ai/install.sh | sh

# 下载推荐模型
ollama pull llama3
ollama pull mistral
```

## 项目初始化

### 1. 创建项目结构

```bash
# 创建项目目录
mkdir desktop-3d-pet
cd desktop-3d-pet

# 初始化 package.json
pnpm init

# 安装 Electron 和 TypeScript
pnpm add -D electron electron-builder typescript @types/node

# 安装 Three.js
pnpm add three @types/three

# 安装数据库和存储
pnpm add better-sqlite3 keytar
pnpm add -D @types/better-sqlite3

# 安装 AI SDK
pnpm add openai @anthropic-ai/sdk ollama

# 安装日志和错误追踪
pnpm add electron-log @sentry/electron

# 安装测试框架
pnpm add -D vitest @vitest/ui playwright @playwright/test
```

### 2. 配置 TypeScript

创建 `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": false,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 3. 配置 Electron

创建 `electron-builder.yml`:

```yaml
appId: com.desktop-pet.app
productName: Desktop 3D Pet
directories:
  buildResources: build
  output: release
files:
  - dist/**/*
  - assets/**/*
  - "!**/*.map"
win:
  target:
    - nsis
  icon: assets/icons/icon.ico
mac:
  target:
    - dmg
  icon: assets/icons/icon.icns
  category: public.app-category.utilities
linux:
  target:
    - AppImage
    - deb
  icon: assets/icons
  category: Utility
```

### 4. 创建基础目录结构

```bash
# 创建源码目录
mkdir -p src/main/window
mkdir -p src/main/services/ai
mkdir -p src/main/services/assistant
mkdir -p src/main/services/voice
mkdir -p src/main/services/skin
mkdir -p src/main/services/storage
mkdir -p src/main/ipc
mkdir -p src/main/tray

mkdir -p src/renderer/pet/animation
mkdir -p src/renderer/pet/interaction
mkdir -p src/renderer/chat
mkdir -p src/renderer/settings
mkdir -p src/renderer/shared

mkdir -p src/preload
mkdir -p src/shared/types

# 创建资源目录
mkdir -p assets/models/animations
mkdir -p assets/sounds
mkdir -p assets/icons

# 创建测试目录
mkdir -p tests/unit/services
mkdir -p tests/unit/renderer
mkdir -p tests/integration/ipc
mkdir -p tests/e2e/scenarios
```

## 运行与调试

### 开发模式启动

```bash
# 编译 TypeScript
pnpm run build

# 启动 Electron (开发模式)
pnpm run dev

# 或者使用 watch 模式
pnpm run watch
```

### package.json 脚本配置

```json
{
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch",
    "dev": "electron .",
    "start": "pnpm run build && pnpm run dev",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "lint": "eslint src --ext .ts",
    "package": "electron-builder"
  }
}
```

### VS Code 调试配置

创建 `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Electron: Main",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "args": ["."],
      "outputCapture": "std",
      "sourceMaps": true,
      "preLaunchTask": "npm: build"
    },
    {
      "name": "Electron: Renderer",
      "type": "chrome",
      "request": "attach",
      "port": 9222,
      "webRoot": "${workspaceFolder}/src/renderer",
      "sourceMaps": true
    }
  ],
  "compounds": [
    {
      "name": "Electron: All",
      "configurations": ["Electron: Main", "Electron: Renderer"]
    }
  ]
}
```

### 开启 DevTools

在主进程中添加调试支持:

```typescript
// src/main/index.ts
if (process.env.NODE_ENV === 'development') {
  mainWindow.webContents.openDevTools({ mode: 'detach' });
}
```

## 关键测试场景

### User Story 1: 透明窗口3D宠物显示

#### 测试场景 1.1: 应用启动显示宠物

```typescript
// tests/e2e/scenarios/pet-display.spec.ts
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('应用启动后显示3D宠物', async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();
  
  // 等待宠物模型加载
  await window.waitForSelector('#pet-canvas', { timeout: 5000 });
  
  // 验证窗口透明
  const isTransparent = await window.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor === 'transparent';
  });
  expect(isTransparent).toBe(true);
  
  // 验证宠物渲染正常
  const canvasVisible = await window.isVisible('#pet-canvas');
  expect(canvasVisible).toBe(true);
  
  await app.close();
});
```

#### 测试场景 1.2: 待机动画播放

```typescript
test('宠物自动播放待机动画', async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();
  
  // 等待3秒让待机动画启动
  await window.waitForTimeout(3000);
  
  // 验证动画状态
  const animationState = await window.evaluate(() => {
    return (window as any).petAnimationState;
  });
  expect(animationState).toBe('idle');
  
  await app.close();
});
```

### User Story 2: 基础交互

#### 测试场景 2.1: 点击宠物触发反应

```typescript
test('点击宠物触发反应动画', async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();
  
  // 获取宠物位置并点击
  const canvas = await window.$('#pet-canvas');
  await canvas?.click();
  
  // 验证动画切换到反应状态
  const animationState = await window.evaluate(() => {
    return (window as any).petAnimationState;
  });
  expect(['happy', 'wave', 'jump']).toContain(animationState);
  
  await app.close();
});
```

#### 测试场景 2.2: 拖拽宠物移动

```typescript
test('拖拽宠物移动位置', async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();
  
  const canvas = await window.$('#pet-canvas');
  const initialBounds = await canvas?.boundingBox();
  
  // 执行拖拽
  await canvas?.dragTo(await window.$('body'), {
    targetPosition: { x: 200, y: 200 }
  });
  
  // 验证位置变化
  const newBounds = await canvas?.boundingBox();
  expect(newBounds?.x).not.toBe(initialBounds?.x);
  expect(newBounds?.y).not.toBe(initialBounds?.y);
  
  await app.close();
});
```

### User Story 3: AI智能对话

#### 测试场景 3.1: 发送消息并接收回复

```typescript
// tests/integration/ai-chat.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { AIService } from '../../src/main/services/ai/ai-service';

describe('AI对话服务', () => {
  it('应该成功发送消息并接收回复', async () => {
    const aiService = new AIService({
      provider: 'openai',
      model: 'gpt-4',
      apiKey: process.env.OPENAI_API_KEY
    });
    
    const response = await aiService.chat({
      messages: [{ role: 'user', content: '你好' }]
    });
    
    expect(response).toBeDefined();
    expect(response.content).toBeTruthy();
  });
  
  it('云端失败时应该降级到本地Ollama', async () => {
    const aiService = new AIService({
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'invalid-key',
      fallback: { provider: 'ollama', model: 'llama3' }
    });
    
    const response = await aiService.chat({
      messages: [{ role: 'user', content: '你好' }]
    });
    
    expect(response.provider).toBe('ollama');
  });
});
```

### User Story 4: 工作助手

#### 测试场景 4.1: 设置提醒

```typescript
// tests/unit/services/reminder.spec.ts
import { describe, it, expect } from 'vitest';
import { ReminderService } from '../../src/main/services/assistant/reminder-service';

describe('提醒服务', () => {
  it('应该成功创建提醒', async () => {
    const reminderService = new ReminderService();
    
    const reminder = await reminderService.create({
      title: '测试提醒',
      triggerAt: new Date(Date.now() + 60000), // 1分钟后
      repeat: null
    });
    
    expect(reminder.id).toBeDefined();
    expect(reminder.status).toBe('pending');
  });
  
  it('提醒到期时应该触发通知', async () => {
    const reminderService = new ReminderService();
    const notificationSpy = vi.fn();
    reminderService.on('trigger', notificationSpy);
    
    await reminderService.create({
      title: '即时提醒',
      triggerAt: new Date(Date.now() + 100), // 100ms后
      repeat: null
    });
    
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(notificationSpy).toHaveBeenCalled();
  });
});
```

### 性能测试

```typescript
// tests/performance/rendering.spec.ts
import { describe, it, expect } from 'vitest';

describe('渲染性能', () => {
  it('帧率应该维持在30fps以上', async () => {
    const frames: number[] = [];
    let lastTime = performance.now();
    
    // 收集1秒内的帧率数据
    for (let i = 0; i < 60; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const now = performance.now();
      frames.push(1000 / (now - lastTime));
      lastTime = now;
    }
    
    const avgFps = frames.reduce((a, b) => a + b, 0) / frames.length;
    expect(avgFps).toBeGreaterThanOrEqual(30);
  });
  
  it('内存占用应该低于300MB', async () => {
    const memory = (performance as any).memory;
    if (memory) {
      const usedMB = memory.usedJSHeapSize / (1024 * 1024);
      expect(usedMB).toBeLessThan(300);
    }
  });
});
```

## 环境变量配置

创建 `.env.example`:

```bash
# AI服务配置 (至少配置一个)
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
OLLAMA_HOST=http://localhost:11434

# Sentry错误追踪 (可选)
SENTRY_DSN=https://your-sentry-dsn

# 开发模式
NODE_ENV=development

# 天气API (用于工作助手)
WEATHER_API_KEY=your-weather-api-key

# 换肤功能 (可选)
MESHY_API_KEY=your-meshy-api-key
```

## 常见问题排查

### 1. Electron 无法启动

```bash
# 清除缓存并重新安装
rm -rf node_modules
rm -rf dist
pnpm install
pnpm run build
```

### 2. better-sqlite3 编译失败

```bash
# Windows: 安装 Visual Studio Build Tools
npm install --global windows-build-tools

# macOS: 安装 Xcode Command Line Tools
xcode-select --install

# 重新编译原生模块
pnpm rebuild better-sqlite3
```

### 3. Three.js 模型加载失败

- 确保模型文件为 GLTF/GLB 格式
- 检查模型路径是否正确（使用绝对路径或相对于 assets 目录）
- 验证模型是否包含正确的骨骼动画数据

### 4. AI服务连接失败

- 检查 API 密钥是否正确配置
- 验证网络连接
- 检查 Ollama 服务是否运行: `ollama list`
- 查看日志文件: `%APPDATA%/desktop-3d-pet/logs/` (Windows)

### 5. 透明窗口不生效

- 确保 Electron 版本 >= 28
- 检查窗口配置: `transparent: true`, `frame: false`
- 某些 Linux 桌面环境需要额外配置合成器

## 下一步

1. 运行 `/speckit.tasks` 生成详细任务分解
2. 按照 User Story 优先级 (P1 → P6) 逐步实现
3. 每完成一个 User Story 进行独立测试验证