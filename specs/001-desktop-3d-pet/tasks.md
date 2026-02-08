# Tasks: 桌面3D小宠物

**Input**: Design documents from `/specs/001-desktop-3d-pet/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Tests**: 本项目遵循测试优先原则，每个用户故事包含测试任务。

**Organization**: 任务按用户故事分组，支持独立实现和测试。

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 任务所属用户故事（US1-US6）
- 包含精确文件路径

---

## Phase 1: Setup（项目初始化）

**Purpose**: 项目初始化和基础结构创建

- [x] T001 初始化 Electron + TypeScript 项目，配置 package.json
- [x] T002 配置 TypeScript (tsconfig.json) 和构建工具 (electron-builder)
- [x] T003 [P] 配置 ESLint + Prettier 代码规范
- [x] T004 [P] 配置 Vitest 单元测试框架
- [x] T005 [P] 配置 Playwright E2E测试框架
- [x] T006 创建项目目录结构 (src/main/, src/renderer/, src/ai/, src/shared/, src/preload/, src/skills/, tests/, assets/, mcp-servers/)
- [x] T007 [P] 配置 .gitignore, .prettierignore, .eslintignore
- [x] T008 [P] 创建 README.md 项目说明文档

---

## Phase 2: Foundational（基础设施）

**Purpose**: 核心基础设施，必须在所有用户故事前完成

**⚠️ CRITICAL**: 此阶段完成前不能开始任何用户故事

### 数据库与存储

- [x] T009 实现 SQLite 数据库服务 in src/shared/services/database.ts
- [x] T010 创建数据库 schema 和迁移脚本 in src/shared/services/migrations.ts
- [x] T011 [P] 实现凭证存储服务 (keytar) in src/shared/services/credential-store.ts

### 共享类型定义

- [x] T012 [P] 定义数据模型类型 in src/shared/types/models.ts
- [x] T013 [P] 定义事件总线类型 in src/shared/types/event-bus.ts
- [x] T014 [P] 定义事件类型常量和数据结构 in src/shared/types/events.ts
- [x] T015 [P] 定义能力接口类型 in src/shared/types/capabilities.ts

### 核心服务

- [x] T016 实现事件总线核心服务 in src/shared/services/event-bus.ts
- [x] T017 实现能力注册表服务 in src/shared/services/capability-registry.ts

### Electron 主进程基础

- [x] T018 创建 Electron 主进程入口 in src/main/index.ts
- [x] T019 [P] 创建预加载脚本 in src/preload/index.ts
- [x] T020 [P] 实现日志服务 (electron-log) in src/main/logger.ts
- [x] T021 [P] 集成 Sentry 错误追踪 in src/main/sentry.ts

### IPC 通信框架

- [x] T022 创建 IPC 处理器基础框架 in src/main/ipc-handlers.ts
- [x] T023 [P] 实现 Settings API IPC 处理器 in src/main/ipc/settings-handler.ts

**Checkpoint**: 基础设施就绪 - 可开始用户故事实现

---

## Phase 3: User Story 1 - 透明窗口3D宠物显示 (Priority: P1) 🎯 MVP

**Goal**: 用户启动应用后，在桌面上看到一个可爱的3D小宠物，窗口背景透明，宠物播放待机动画

**Independent Test**: 启动应用，观察宠物是否正确显示在透明窗口中，动画是否流畅播放

### Tests for User Story 1

- [x] T024 [P] [US1] E2E测试：应用启动和窗口显示 in tests/e2e/pet-display.test.ts
- [x] T025 [P] [US1] 单元测试：动画状态机 in tests/unit/pet/animation.test.ts
- [x] T026 [P] [US1] 单元测试：窗口管理器 in tests/unit/main/window-manager.test.ts
- [x] T026a [P] [US1] 单元测试：WebGL不支持降级处理 in tests/unit/pet/webgl-fallback.test.ts

### Implementation for User Story 1

#### 窗口管理

- [x] T027 [US1] 实现透明无边框窗口管理器（含多显示器位置记忆）in src/main/window-manager.ts
- [x] T028 [US1] 实现 Window API IPC 处理器 in src/main/ipc/window-handler.ts

#### 3D渲染核心

- [x] T029 [US1] 创建渲染进程入口 in src/renderer/main.ts
- [x] T030 [US1] 创建入口 HTML in src/renderer/index.html
- [x] T031 [US1] 实现 Three.js 3D渲染器 in src/renderer/pet/pet-renderer.ts
- [x] T032 [US1] 实现骨骼动画系统 in src/renderer/pet/pet-animation.ts

#### 数据模型

- [x] T033 [P] [US1] 创建 Pet 实体数据访问层 in src/shared/models/pet.ts
- [x] T034 [P] [US1] 创建 PetSkin 实体数据访问层 in src/shared/models/pet-skin.ts

#### Pet API

- [x] T035 [US1] 实现 Pet API IPC 处理器 in src/main/ipc/pet-handler.ts

#### 资源文件

- [x] T036 [P] [US1] 准备默认宠物3D模型 in assets/models/default-pet.glb
- [x] T037 [P] [US1] 准备 idle 待机动画 in assets/animations/idle.glb

**Checkpoint**: User Story 1 完成 - 可独立运行和测试，作为 MVP 展示

---

## Phase 4: User Story 2 - 基础交互：拖拽与点击 (Priority: P2)

**Goal**: 用户可以点击宠物触发反应动画，拖拽宠物移动位置，双击打开对话界面

**Independent Test**: 点击宠物观察反应动画，拖拽宠物观察位置变化

### Tests for User Story 2

- [ ] T038 [P] [US2] E2E测试：宠物交互 in tests/e2e/pet-interaction.test.ts
- [x] T039 [P] [US2] 单元测试：用户交互处理 in tests/unit/pet/interaction.test.ts

### Implementation for User Story 2

- [x] T040 [US2] 实现鼠标点击检测 (Raycasting) in src/renderer/pet/pet-interaction.ts
- [ ] T041 [US2] 实现宠物拖拽功能 in src/renderer/pet/pet-drag.ts
- [ ] T042 [US2] 实现右键上下文菜单 in src/renderer/ui/context-menu.ts
- [ ] T043 [P] [US2] 准备 happy 开心动画 in assets/animations/happy.glb
- [ ] T044 [P] [US2] 准备 drag 拖拽动画 in assets/animations/drag.glb
- [ ] T045 [P] [US2] 准备 curious 好奇动画 in assets/animations/curious.glb

**Checkpoint**: User Story 1 + 2 完成 - 宠物可显示和交互

---

## Phase 5: User Story 3 - AI智能对话 (Priority: P3)

**Goal**: 用户可以与宠物进行自然语言对话，AI生成回复，宠物表情随之变化

**Independent Test**: 打开对话界面，输入问题，观察AI回复和宠物动画

### Tests for User Story 3

- [ ] T046 [P] [US3] E2E测试：AI对话流程 in tests/e2e/ai-chat.test.ts
- [ ] T047 [P] [US3] 单元测试：Chat管理器 in tests/unit/ai/chat-manager.test.ts
- [ ] T048 [P] [US3] 集成测试：AI服务集成 in tests/integration/ai-integration.test.ts
- [ ] T048a [P] [US3] 单元测试：20轮对话上下文保持 (SC-006) in tests/unit/ai/conversation-context.test.ts

### Implementation for User Story 3

#### 数据模型

- [ ] T049 [P] [US3] 创建 Conversation 实体数据访问层 in src/shared/models/conversation.ts
- [ ] T050 [P] [US3] 创建 Message 实体数据访问层 in src/shared/models/message.ts
- [ ] T051 [P] [US3] 创建 AIProvider 实体数据访问层 in src/shared/models/ai-provider.ts

#### AI Chat能力

- [ ] T052 [US3] 实现 Chat 能力管理器 in src/ai/chat/chat-manager.ts
- [ ] T053 [P] [US3] 实现 OpenAI Provider in src/ai/chat/providers/openai-provider.ts
- [ ] T054 [P] [US3] 实现 Claude Provider in src/ai/chat/providers/claude-provider.ts
- [ ] T055 [P] [US3] 实现 Ollama Provider in src/ai/chat/providers/ollama-provider.ts

#### AI服务初始化

- [ ] T056 [US3] 实现 AI 服务初始化器 in src/main/ai-service.ts

#### IPC API

- [ ] T057 [US3] 实现 AI API IPC 处理器 in src/main/ipc/ai-handler.ts

#### UI组件

- [ ] T058 [US3] 实现对话气泡组件 in src/renderer/ui/chat-bubble.ts
- [ ] T059 [US3] 实现独立聊天窗口组件 in src/renderer/ui/chat-window.ts

#### 宠物-AI桥接

- [ ] T060 [US3] 实现宠物-AI桥接器 in src/renderer/pet/pet-ai-bridge.ts

#### 动画资源

- [ ] T061 [P] [US3] 准备 thinking 思考动画 in assets/animations/thinking.glb
- [ ] T062 [P] [US3] 准备 sad 难过动画 in assets/animations/sad.glb
- [ ] T063 [P] [US3] 准备 confused 困惑动画 in assets/animations/confused.glb

**Checkpoint**: User Story 1-3 完成 - 宠物可显示、交互、对话

---

## Phase 6: User Story 4 - 工作助手：提醒与快捷操作 (Priority: P4)

**Goal**: 用户可以通过自然语言让宠物设置提醒、查询天气、打开应用程序

**Independent Test**: 请求宠物设置提醒、查询天气、打开应用，验证各功能

### Tests for User Story 4

- [ ] T064 [P] [US4] 单元测试：提醒服务 in tests/unit/services/reminder.test.ts
- [ ] T065 [P] [US4] 单元测试：MCP管理器 in tests/unit/ai/mcp-manager.test.ts
- [ ] T066 [P] [US4] 单元测试：Skills管理器 in tests/unit/ai/skills-manager.test.ts
- [ ] T067 [P] [US4] 集成测试：MCP服务器集成 in tests/integration/mcp-integration.test.ts

### Implementation for User Story 4

#### 数据模型

- [ ] T068 [US4] 创建 Reminder 实体数据访问层 in src/shared/models/reminder.ts

#### 提醒功能

- [ ] T069 [US4] 实现提醒服务 in src/main/services/reminder-service.ts
- [ ] T070 [US4] 实现 Reminder API IPC 处理器 in src/main/ipc/reminder-handler.ts

#### System API

- [ ] T071 [US4] 实现 System API IPC 处理器 in src/main/ipc/system-handler.ts

#### 系统托盘

- [ ] T072 [US4] 实现系统托盘管理器 in src/main/tray-manager.ts

#### MCP能力

- [ ] T073 [US4] 实现 MCP 服务器管理器 in src/ai/mcp/mcp-manager.ts

#### MCP服务器实现

- [ ] T074 [P] [US4] 实现 system-tools MCP服务器 in mcp-servers/system-tools/index.ts
- [ ] T075 [P] [US4] 实现 reminder MCP服务器 in mcp-servers/reminder/index.ts
- [ ] T076 [P] [US4] 实现 notes MCP服务器 in mcp-servers/notes/index.ts
- [ ] T077 [P] [US4] 实现 weather-api MCP服务器 in mcp-servers/weather-api/index.ts
- [ ] T078 [P] [US4] 实现 calendar MCP服务器 in mcp-servers/calendar/index.ts

#### Skills能力

- [ ] T079 [US4] 实现 Skills 管理器 in src/ai/skills/skills-manager.ts

#### 技能定义

- [ ] T080 [P] [US4] 创建 weather 技能 in src/skills/weather/meta.json, skill.md
- [ ] T081 [P] [US4] 创建 reminder 技能 in src/skills/reminder/meta.json, skill.md
- [ ] T082 [P] [US4] 创建 notes 技能 in src/skills/notes/meta.json, skill.md
- [ ] T083 [P] [US4] 创建 app-launcher 技能 in src/skills/app-launcher/meta.json, skill.md
- [ ] T084 [P] [US4] 创建 calendar 技能 in src/skills/calendar/meta.json, skill.md
- [ ] T085 [P] [US4] 创建 quick-search 技能 in src/skills/quick-search/meta.json, skill.md

#### Memory能力

- [ ] T086 [US4] 实现 Memory 管理器 in src/ai/memory/memory-manager.ts

#### Agent能力

- [ ] T087 [US4] 实现 Agent 管理器 in src/ai/agent/agent-manager.ts

#### 动画资源

- [ ] T088 [P] [US4] 准备 celebrating 庆祝动画 in assets/animations/celebrating.glb

**Checkpoint**: User Story 1-4 完成 - 宠物具备完整助手功能

---

## Phase 7: User Story 5 - 语音交互 (Priority: P5)

**Goal**: 用户可以通过语音与宠物对话，宠物可以用语音回复

**Independent Test**: 点击麦克风，说话，听取宠物语音回复

### Tests for User Story 5

- [ ] T089 [P] [US5] 单元测试：语音识别服务 in tests/unit/services/voice-recognition.test.ts
- [ ] T090 [P] [US5] 单元测试：语音合成服务 in tests/unit/services/voice-synthesis.test.ts

### Implementation for User Story 5

- [ ] T091 [US5] 实现语音识别服务 (STT) in src/main/services/voice-recognition.ts
- [ ] T092 [US5] 实现语音合成服务 (TTS) in src/main/services/voice-synthesis.ts
- [ ] T093 [US5] 实现 Voice API IPC 处理器 in src/main/ipc/voice-handler.ts
- [ ] T094 [US5] 实现语音输入UI组件 in src/renderer/ui/voice-input.ts
- [ ] T095 [P] [US5] 准备 listening 倾听动画 in assets/animations/listening.glb

**Checkpoint**: User Story 1-5 完成 - 支持语音交互

---

## Phase 8: User Story 6 - 照片换肤 (Priority: P6)

**Goal**: 用户可以上传宠物照片，系统识别品种并生成3D模型

**Independent Test**: 上传照片，观察品种识别结果，查看生成的3D模型

### Tests for User Story 6

- [ ] T096 [P] [US6] 单元测试：品种识别服务 in tests/unit/services/breed-recognition.test.ts
- [ ] T097 [P] [US6] 单元测试：3D模型生成服务 in tests/unit/services/model-generation.test.ts

### Implementation for User Story 6

- [ ] T098 [US6] 实现品种识别服务 in src/main/services/breed-recognition.ts
- [ ] T099 [US6] 实现3D模型生成服务 (TripoSR/Meshy) in src/main/services/model-generation.ts
- [ ] T100 [US6] 实现骨骼自动绑定服务 in src/main/services/rig-binding.ts
- [ ] T101 [US6] 实现 Skin API IPC 处理器 in src/main/ipc/skin-handler.ts
- [ ] T102 [US6] 实现换肤向导UI组件 in src/renderer/ui/skin-wizard.ts

**Checkpoint**: 所有用户故事完成 - 完整功能

---

## Phase 9: Polish & 跨领域关注点

**Purpose**: 完善和优化

### 设置与配置

- [ ] T103 实现设置面板UI组件 in src/renderer/ui/settings-panel.ts
- [ ] T104 实现自动更新服务（含HTTPS签名验证）in src/main/auto-updater.ts
- [ ] T105 实现开机自启动功能 in src/main/auto-launch.ts

### 动画补充

- [ ] T106 [P] 准备 sleepy 瞌睡动画 in assets/animations/sleepy.glb

### 图标资源

- [ ] T107 [P] 准备系统托盘图标 in assets/icons/tray-icon.png
- [ ] T108 [P] 准备应用图标 in assets/icons/app-icon.ico

### 样式

- [ ] T109 [P] 创建全局样式文件 in src/renderer/styles/global.css
- [ ] T110 [P] 创建UI组件样式 in src/renderer/styles/components.css

### 文档

- [ ] T111 [P] 更新 README.md 使用说明
- [ ] T112 [P] 创建 API 文档 in docs/api.md
- [ ] T113 运行 quickstart.md 验证所有功能

### 性能优化

- [ ] T114 性能优化：确保30fps渲染帧率
- [ ] T115 性能优化：确保<5s应用启动时间
- [ ] T116 性能优化：确保<300MB内存占用

### 构建与发布

- [ ] T117 配置 electron-builder 打包配置
- [ ] T118 构建 Windows 安装包
- [ ] T119 [P] 构建 macOS 安装包
- [ ] T120 [P] 构建 Linux 安装包

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖 - 可立即开始
- **Foundational (Phase 2)**: 依赖 Setup 完成 - **阻塞所有用户故事**
- **User Stories (Phase 3-8)**: 依赖 Foundational 完成
  - 可按优先级顺序执行 (P1 → P2 → P3 → P4 → P5 → P6)
  - 或多人并行开发不同故事
- **Polish (Phase 9)**: 依赖所有期望的用户故事完成

### User Story Dependencies

| 用户故事 | 依赖 | 说明 |
|---------|------|------|
| US1 透明窗口3D宠物 | Foundational | 无其他故事依赖，可作为 MVP |
| US2 基础交互 | US1 | 需要宠物显示和动画系统 |
| US3 AI智能对话 | US1 | 需要宠物和动画桥接 |
| US4 工作助手 | US3 | 需要AI对话基础 |
| US5 语音交互 | US3 | 需要AI对话基础 |
| US6 照片换肤 | US1 | 需要宠物渲染系统 |

### Within Each User Story

1. Tests 先写并确保 FAIL
2. 数据模型先于服务
3. 服务先于API处理器
4. 核心实现先于集成
5. 故事完成后再进入下一优先级

### Parallel Opportunities

```
Phase 1 (Setup):
  T003, T004, T005, T007, T008 可并行

Phase 2 (Foundational):
  T011, T012-T015, T020, T021, T023 可并行

Phase 3 (US1):
  T024-T026 测试可并行
  T033, T034 数据模型可并行
  T036, T037 资源文件可并行

Phase 4 (US2):
  T038, T039 测试可并行
  T043-T045 动画资源可并行

Phase 5 (US3):
  T046-T048 测试可并行
  T049-T051 数据模型可并行
  T053-T055 AI Providers 可并行
  T061-T063 动画资源可并行

Phase 6 (US4):
  T064-T067 测试可并行
  T074-T078 MCP服务器可并行
  T080-T085 技能定义可并行

Phase 7 (US5):
  T089, T090 测试可并行

Phase 8 (US6):
  T096, T097 测试可并行
```

---

## Parallel Example: User Story 1

```bash
# 测试任务并行启动:
Task: T024 - E2E测试：应用启动和窗口显示
Task: T025 - 单元测试：动画状态机
Task: T026 - 单元测试：窗口管理器

# 数据模型并行:
Task: T033 - 创建 Pet 实体数据访问层
Task: T034 - 创建 PetSkin 实体数据访问层

# 资源文件并行:
Task: T036 - 准备默认宠物3D模型
Task: T037 - 准备 idle 待机动画
```

---

## Implementation Strategy

### MVP First (仅 User Story 1)

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational (**关键 - 阻塞所有故事**)
3. 完成 Phase 3: User Story 1
4. **停止并验证**: 独立测试 User Story 1
5. 如就绪可部署/演示

### Incremental Delivery（增量交付）

1. Setup + Foundational → 基础就绪
2. 添加 US1 → 独立测试 → 部署/演示 (MVP!)
3. 添加 US2 → 独立测试 → 部署/演示
4. 添加 US3 → 独立测试 → 部署/演示
5. 添加 US4 → 独立测试 → 部署/演示
6. 添加 US5 → 独立测试 → 部署/演示
7. 添加 US6 → 独立测试 → 部署/演示
8. 每个故事增加价值而不破坏之前的功能

### Parallel Team Strategy（并行团队策略）

多开发者情况:
1. 团队共同完成 Setup + Foundational
2. Foundational 完成后:
   - 开发者 A: User Story 1 (P1)
   - 开发者 B: User Story 3 (P3)（需等 US1 动画系统）
   - 开发者 C: User Story 4 (P4)（需等 US3 AI基础）
3. 故事独立完成并集成

---

## Summary

| 指标 | 数值 |
|------|------|
| 总任务数 | 120 |
| Phase 1 (Setup) | 8 tasks |
| Phase 2 (Foundational) | 15 tasks |
| Phase 3 (US1 - MVP) | 14 tasks |
| Phase 4 (US2) | 8 tasks |
| Phase 5 (US3) | 18 tasks |
| Phase 6 (US4) | 25 tasks |
| Phase 7 (US5) | 7 tasks |
| Phase 8 (US6) | 7 tasks |
| Phase 9 (Polish) | 18 tasks |
| 可并行任务 | 58 tasks (48%) |

### MVP Scope（最小可行产品范围）

仅完成 **Phase 1 + Phase 2 + Phase 3 (User Story 1)** = 37 tasks

用户可以:
- 启动应用看到透明窗口中的3D宠物
- 宠物播放待机动画
- 窗口置顶显示

---

## Notes

- [P] 任务 = 不同文件，无依赖，可并行
- [Story] 标签将任务映射到具体用户故事，便于追溯
- 每个用户故事应可独立完成和测试
- 实现前确保测试失败
- 每个任务或逻辑组完成后提交
- 在任何检查点停止以独立验证故事
- 避免：模糊任务、同文件冲突、破坏独立性的跨故事依赖