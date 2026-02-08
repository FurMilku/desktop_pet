# Implementation Plan: 桌面3D小宠物

**Branch**: `001-desktop-3d-pet` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-desktop-3d-pet/spec.md`

## Summary

创建一个透明窗口的桌面3D宠物应用，使用 Electron 实现跨平台桌面框架，Three.js 进行3D渲染，支持AI智能对话、工作助手功能、语音交互和照片换肤。技术方案基于可行性报告的方案A（Electron + Three.js），优先实现核心显示和交互功能，逐步扩展AI和高级功能。

## Technical Context

**Language/Version**: TypeScript 5.x (Electron主进程和渲染进程), Node.js 20 LTS  
**Primary Dependencies**: 
- Electron 28+ (桌面框架，透明无边框窗口)
- Three.js r160+ (3D渲染引擎)
- better-sqlite3 (SQLite本地数据库)
- keytar (系统凭证管理器访问)
- electron-log (日志系统)
- @sentry/electron (崩溃报告)
- openai / @anthropic-ai/sdk / ollama-js (AI SDK)
- Web Speech API / whisper.cpp (语音识别)
- say / espeak (语音合成)

**Storage**: SQLite (better-sqlite3) + 文件系统 (3D模型/皮肤资源)  
**Testing**: Vitest (单元测试) + Playwright (E2E测试) + Electron Testing Library  
**Target Platform**: Windows 10+, macOS 10.15+, Ubuntu 20.04+ (Electron跨平台)
**Project Type**: Single Electron应用 (主进程 + 渲染进程架构)  
**Performance Goals**: 
- 30fps渲染帧率 (空闲状态)
- <5秒启动时间
- <200ms交互响应
- <3秒AI首字响应

**Constraints**: 
- <300MB内存占用 (空闲状态)
- <5% CPU占用 (后台运行)
- 支持WebGL2
- 最低4GB系统内存

**Scale/Scope**: 单用户桌面应用，6个用户故事，29个功能需求

## Constitution Check

*GATE: 由于 constitution.md 为模板状态，采用默认最佳实践原则*

| 原则 | 状态 | 说明 |
|------|------|------|
| 单一职责 | ✅ PASS | 清晰的主进程/渲染进程分离，模块化服务设计 |
| 依赖最小化 | ✅ PASS | 仅使用必要的核心依赖，避免过度工程化 |
| 安全优先 | ✅ PASS | API密钥使用系统凭证管理器，不明文存储 |
| 可测试性 | ✅ PASS | 服务层可独立测试，UI与逻辑分离 |
| 渐进式实现 | ✅ PASS | 按用户故事优先级P1-P6逐步实现 |

## Project Structure

### Documentation (this feature)

```text
specs/001-desktop-3d-pet/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output - 技术研究与决策
├── data-model.md        # Phase 1 output - 数据模型定义
├── quickstart.md        # Phase 1 output - 快速开始指南
├── contracts/           # Phase 1 output - API契约
│   ├── ai-service.md    # AI服务接口契约
│   ├── pet-service.md   # 宠物服务接口契约
│   └── ipc-protocol.md  # IPC通信协议
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── main/                    # Electron 主进程
│   ├── index.ts             # 主进程入口
│   ├── window/              # 窗口管理
│   │   ├── main-window.ts   # 透明无边框主窗口
│   │   ├── chat-window.ts   # 对话界面窗口
│   │   └── settings-window.ts # 设置界面窗口
│   ├── services/            # 主进程服务
│   │   ├── ai/              # AI服务
│   │   │   ├── ai-service.ts      # AI服务统一接口
│   │   │   ├── openai-provider.ts # OpenAI实现
│   │   │   ├── claude-provider.ts # Claude实现
│   │   │   └── ollama-provider.ts # Ollama本地实现
│   │   ├── assistant/       # 工作助手服务
│   │   │   ├── reminder-service.ts # 提醒服务
│   │   │   ├── weather-service.ts  # 天气查询
│   │   │   └── app-launcher.ts     # 应用启动器
│   │   ├── voice/           # 语音服务
│   │   │   ├── stt-service.ts     # 语音识别
│   │   │   └── tts-service.ts     # 语音合成
│   │   ├── skin/            # 换肤服务
│   │   │   ├── breed-detector.ts  # 品种识别
│   │   │   └── model-generator.ts # 3D模型生成
│   │   └── storage/         # 存储服务
│   │       ├── database.ts        # SQLite数据库
│   │       └── credential-store.ts # 凭证存储
│   ├── ipc/                 # IPC通信处理
│   │   └── handlers.ts      # IPC消息处理器
│   └── tray/                # 系统托盘
│       └── tray-manager.ts  # 托盘管理
│
├── renderer/                # Electron 渲染进程
│   ├── index.html           # 主窗口HTML
│   ├── main.ts              # 渲染进程入口
│   ├── pet/                 # 3D宠物渲染
│   │   ├── pet-renderer.ts  # Three.js渲染器
│   │   ├── pet-model.ts     # 宠物模型管理
│   │   ├── animation/       # 动画系统
│   │   │   ├── animation-mixer.ts   # 动画混合器
│   │   │   └── animation-states.ts  # 动画状态机
│   │   └── interaction/     # 交互处理
│   │       ├── click-handler.ts    # 点击检测
│   │       └── drag-handler.ts     # 拖拽处理
│   ├── chat/                # 对话界面
│   │   ├── chat-ui.ts       # 对话UI组件
│   │   └── message-renderer.ts # 消息渲染
│   ├── settings/            # 设置界面
│   │   └── settings-ui.ts   # 设置UI组件
│   └── shared/              # 共享工具
│       ├── ipc-client.ts    # IPC客户端
│       └── types.ts         # 类型定义
│
├── preload/                 # 预加载脚本
│   └── index.ts             # 安全的IPC暴露
│
├── shared/                  # 主进程/渲染进程共享
│   ├── types/               # 共享类型定义
│   │   ├── pet.ts           # 宠物相关类型
│   │   ├── conversation.ts  # 对话相关类型
│   │   ├── reminder.ts      # 提醒相关类型
│   │   └── settings.ts      # 设置相关类型
│   └── constants.ts         # 共享常量
│
└── assets/                  # 静态资源
    ├── models/              # 3D模型文件
    │   ├── default-pet.glb  # 默认宠物模型
    │   └── animations/      # 动画文件
    ├── sounds/              # 音效文件
    └── icons/               # 应用图标

tests/
├── unit/                    # 单元测试
│   ├── services/            # 服务测试
│   └── renderer/            # 渲染逻辑测试
├── integration/             # 集成测试
│   └── ipc/                 # IPC通信测试
└── e2e/                     # E2E测试
    └── scenarios/           # 场景测试
```

**Structure Decision**: 采用 Electron 标准的主进程/渲染进程分离架构。主进程负责系统级操作（文件系统、数据库、AI API调用），渲染进程负责UI和3D渲染。通过预加载脚本和IPC实现安全的进程间通信。

## Complexity Tracking

> 无违反宪法原则的情况，无需记录复杂性偏差。

| 违反项 | 必要原因 | 拒绝更简单替代方案的理由 |
|--------|----------|-------------------------|
| - | - | - |

## 技术栈详细说明

### Electron 配置

- **窗口类型**: 透明无边框窗口 (`transparent: true`, `frame: false`)
- **置顶模式**: `alwaysOnTop: true`, `skipTaskbar: true`
- **安全策略**: 启用 `contextIsolation`, 禁用 `nodeIntegration`
- **IPC通信**: 使用 `contextBridge` 安全暴露API

### Three.js 渲染

- **渲染器**: WebGLRenderer with `alpha: true`
- **模型格式**: GLTF/GLB (支持骨骼动画)
- **动画系统**: AnimationMixer + AnimationAction
- **交互检测**: Raycaster for click/hover detection

### 数据持久化

- **数据库**: better-sqlite3 (同步API，适合Electron)
- **存储位置**: `app.getPath('userData')`
- **凭证存储**: keytar (系统凭证管理器)

### AI 集成

- **主要提供商**: OpenAI (GPT-4), Claude (Sonnet)
- **本地备选**: Ollama (llama3, mistral)
- **降级策略**: 云端失败 → 本地Ollama → 缓存响应
- **Function Calling**: 支持工具调用 (提醒、天气、应用启动)

### 语音系统

- **STT**: Web Speech API (Chrome) / whisper.cpp (本地)
- **TTS**: say (macOS) / espeak (Linux) / SAPI (Windows)

### 换肤功能

- **品种识别**: TensorFlow.js + 预训练模型
- **3D生成**: 本地TripoSR 或 Meshy API
- **骨骼绑定**: Three.js SkeletonUtils

## 下一步

执行 Phase 0 生成 research.md，解决技术不确定点后继续 Phase 1 设计阶段。