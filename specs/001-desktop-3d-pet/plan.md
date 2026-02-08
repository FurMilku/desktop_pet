# Implementation Plan: 桌面3D小宠物

**Branch**: `001-desktop-3d-pet` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-desktop-3d-pet/spec.md`

## Summary

基于 Electron + Three.js 构建桌面3D小宠物应用，实现透明窗口3D渲染、用户交互、AI智能对话、工作助手功能、语音交互和照片换肤等功能。应用采用事件驱动架构，AI功能模块与宠物核心系统松耦合，支持渐进增强。

## Technical Context

**Language/Version**: TypeScript 5.x  
**Primary Dependencies**: 
- Electron 28+ (桌面框架，透明窗口支持)
- Three.js (3D渲染引擎)
- better-sqlite3 (SQLite数据库)
- electron-log (日志记录)
- @sentry/electron (崩溃报告)
- keytar (系统凭证管理)
- openai / @anthropic-ai/sdk / ollama (AI服务)
- @anthropic-ai/mcp-client (MCP客户端)

**Storage**: SQLite (better-sqlite3) - 本地持久化存储对话历史、用户设置、提醒等  
**Testing**: Vitest (单元测试) + Playwright (E2E测试) + Electron Testing  
**Target Platform**: Windows 10+, macOS 10.15+, Ubuntu 20.04+  
**Project Type**: single (Electron桌面应用)  
**Performance Goals**: 
- 30fps渲染帧率
- <5s应用启动时间
- <200ms交互响应延迟
- <3s AI首字符响应时间

**Constraints**: 
- <300MB内存占用（空闲状态）
- <5% CPU占用（后台运行）
- 支持24小时连续运行
- 支持离线模式（本地Ollama + 响应缓存）

**Scale/Scope**: 单用户桌面应用，支持10种动画状态，5个MCP服务器，6个预定义技能

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> 注意：项目宪法模板尚未填充具体原则。以下为本项目采用的基础开发原则：

| 原则 | 状态 | 说明 |
|------|------|------|
| 模块化设计 | ✅ PASS | AI功能与宠物核心系统松耦合，通过事件总线通信 |
| 类型安全 | ✅ PASS | 使用TypeScript，完整的类型定义 |
| 测试优先 | ✅ PASS | Vitest单元测试 + Playwright E2E测试 |
| 渐进增强 | ✅ PASS | 宠物核心功能无AI时仍可独立运行 |
| 安全存储 | ✅ PASS | API密钥使用系统凭证管理器存储 |
| 可观测性 | ✅ PASS | electron-log本地日志 + Sentry崩溃报告 |

## Project Structure

### Documentation (this feature)

```text
specs/001-desktop-3d-pet/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── main/                        # Electron主进程
│   ├── index.ts                 # 主进程入口
│   ├── window-manager.ts        # 窗口管理（透明窗口）
│   ├── tray-manager.ts          # 系统托盘
│   ├── ai-service.ts            # AI服务初始化器
│   ├── ipc-handlers.ts          # IPC通信处理
│   └── auto-updater.ts          # 自动更新
│
├── renderer/                    # Electron渲染进程
│   ├── index.html               # 入口HTML
│   ├── index.ts                 # 渲染进程入口
│   ├── pet/                     # 宠物核心系统
│   │   ├── pet-renderer.ts      # 3D渲染器
│   │   ├── pet-animation.ts     # 动画状态机
│   │   ├── pet-interaction.ts   # 用户交互处理
│   │   └── pet-ai-bridge.ts     # AI桥接器
│   ├── ui/                      # UI组件
│   │   ├── chat-bubble.ts       # 对话气泡
│   │   ├── chat-window.ts       # 独立聊天窗口
│   │   ├── settings-panel.ts    # 设置面板
│   │   └── skin-wizard.ts       # 换肤向导
│   └── styles/                  # 样式文件
│
├── ai/                          # AI功能模块
│   ├── chat/                    # Chat能力
│   │   ├── chat-manager.ts      # Chat管理器
│   │   └── providers/           # LLM提供商
│   │       ├── openai-provider.ts
│   │       ├── claude-provider.ts
│   │       └── ollama-provider.ts
│   ├── mcp/                     # MCP服务器管理
│   │   └── mcp-manager.ts
│   ├── skills/                  # 技能系统
│   │   └── skills-manager.ts
│   ├── memory/                  # 记忆系统
│   │   └── memory-manager.ts
│   └── agent/                   # Agent系统
│       └── agent-manager.ts
│
├── shared/                      # 共享代码
│   ├── types/                   # 类型定义
│   │   ├── event-bus.ts         # 事件总线类型
│   │   ├── events.ts            # 事件定义
│   │   ├── capabilities.ts      # 能力接口
│   │   └── models.ts            # 数据模型类型
│   ├── services/                # 共享服务
│   │   ├── event-bus.ts         # 事件总线实现
│   │   ├── capability-registry.ts
│   │   ├── database.ts          # SQLite服务
│   │   └── credential-store.ts  # 凭证存储
│   └── utils/                   # 工具函数
│
├── preload/                     # Electron预加载脚本
│   └── index.ts
│
└── skills/                      # 技能定义目录
    ├── weather/
    │   ├── meta.json
    │   └── skill.md
    ├── reminder/
    │   ├── meta.json
    │   └── skill.md
    ├── notes/
    │   ├── meta.json
    │   └── skill.md
    ├── app-launcher/
    │   ├── meta.json
    │   └── skill.md
    ├── calendar/
    │   ├── meta.json
    │   └── skill.md
    └── quick-search/
        ├── meta.json
        └── skill.md

tests/
├── unit/                        # 单元测试
│   ├── ai/
│   ├── pet/
│   └── shared/
├── integration/                 # 集成测试
│   ├── ai-integration.test.ts
│   └── mcp-integration.test.ts
└── e2e/                         # E2E测试
    ├── pet-display.test.ts
    ├── pet-interaction.test.ts
    └── ai-chat.test.ts

assets/
├── models/                      # 3D模型
│   └── default-pet.glb          # 默认宠物模型
├── animations/                  # 动画文件
│   ├── idle.glb
│   ├── thinking.glb
│   ├── happy.glb
│   └── ...                      # 10种动画状态
└── icons/                       # 图标资源
    ├── tray-icon.png
    └── app-icon.ico

mcp-servers/                     # MCP服务器实现
├── system-tools/
│   └── index.ts
├── reminder/
│   └── index.ts
├── notes/
│   └── index.ts
├── weather-api/
│   └── index.ts
└── calendar/
    └── index.ts
```

**Structure Decision**: 采用 Electron 标准项目结构，将主进程、渲染进程、AI模块、共享代码分离。AI功能模块独立于宠物核心系统，通过事件总线和能力接口通信，实现松耦合设计。MCP服务器作为独立进程运行，通过stdio传输与主应用通信。

## Complexity Tracking

> 本项目无宪法违规需要说明。

| 设计决策 | 原因 | 替代方案未采用原因 |
|----------|------|-------------------|
| 事件总线架构 | AI模块与宠物系统需要异步解耦通信 | 直接调用会导致强耦合，不利于渐进增强 |
| 6种能力接口 | 每种AI能力有不同的生命周期和依赖关系 | 单一接口无法表达能力差异和依赖关系 |
| MCP服务器作为子进程 | 符合MCP协议标准，支持stdio传输 | 进程内实现不符合MCP设计理念 |