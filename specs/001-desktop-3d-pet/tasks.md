# Tasks: 桌面3D小宠物

**Input**: Design documents from `/specs/001-desktop-3d-pet/`  
**Prerequisites**: plan.md ✓, spec.md ✓, data-model.md ✓, contracts/ ✓, research.md ✓

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US6)
- Include exact file paths in descriptions

## User Stories Reference

| Story | Priority | Title | Goal |
|-------|----------|-------|------|
| US1 | P1 | 透明窗口3D宠物显示 | 在桌面显示带动画的3D宠物 |
| US2 | P2 | 基础交互：拖拽与点击 | 用户可点击、拖拽宠物 |
| US3 | P3 | AI智能对话 | 与宠物进行自然语言对话 |
| US4 | P4 | 工作助手 | 提醒、天气、应用启动 |
| US5 | P5 | 语音交互 | 语音输入和语音回复 |
| US6 | P6 | 照片换肤 | 上传照片生成自定义宠物模型 |

---

## Phase 1: Setup (项目初始化)

**Purpose**: 项目结构创建和基础配置

- [ ] T001 Create Electron project structure with TypeScript per plan.md
- [ ] T002 Initialize package.json with core dependencies: electron@28+, typescript@5.x, three@r160+, better-sqlite3, keytar, electron-log, @sentry/electron
- [ ] T003 [P] Configure TypeScript (tsconfig.json) for main/renderer/preload separation
- [ ] T004 [P] Configure ESLint and Prettier for TypeScript/Electron
- [ ] T005 [P] Create .gitignore with Electron/Node.js patterns
- [ ] T006 [P] Setup Electron build configuration (electron-builder.yml)
- [ ] T007 Create src/main/index.ts entry point skeleton
- [ ] T008 Create src/renderer/index.html and src/renderer/main.ts skeleton
- [ ] T009 Create src/preload/index.ts with contextBridge skeleton
- [ ] T010 [P] Create src/shared/types/ directory structure for shared type definitions
- [ ] T011 [P] Create src/shared/constants.ts with IPC channel names per ipc-protocol.md
- [ ] T012 Setup Vitest configuration for unit testing in vitest.config.ts
- [ ] T013 [P] Create default 3D pet model placeholder in src/assets/models/default-pet.glb

---

## Phase 2: Foundational (阻塞性基础设施)

**Purpose**: 核心基础设施，所有用户故事都依赖这些组件

**⚠️ CRITICAL**: 此阶段必须完成后才能开始任何用户故事

### 2.1 数据库与存储

- [ ] T014 Implement SQLite database service in src/main/services/storage/database.ts
- [ ] T015 Create database schema migrations in src/main/services/storage/migrations/001_initial.sql per data-model.md
- [ ] T016 [P] Implement credential store service in src/main/services/storage/credential-store.ts using keytar
- [ ] T017 Create database initialization and migration runner in src/main/services/storage/migrator.ts

### 2.2 IPC通信基础

- [ ] T018 Define IPC type definitions in src/shared/types/ipc.ts per ipc-protocol.md
- [ ] T019 Implement IPC handler registration framework in src/main/ipc/handlers.ts
- [ ] T020 Implement preload script with contextBridge API in src/preload/index.ts per ipc-protocol.md
- [ ] T021 Create IPC client wrapper for renderer in src/renderer/shared/ipc-client.ts

### 2.3 窗口管理

- [ ] T022 Implement transparent frameless main window in src/main/window/main-window.ts
- [ ] T023 [P] Implement system tray manager in src/main/tray/tray-manager.ts

### 2.4 日志与错误追踪

- [ ] T024 [P] Configure electron-log in src/main/services/logger.ts with rotation
- [ ] T025 [P] Configure Sentry integration in src/main/services/sentry.ts (opt-in)

### 2.5 共享类型定义

- [ ] T026 [P] Create pet types in src/shared/types/pet.ts per data-model.md
- [ ] T027 [P] Create conversation types in src/shared/types/conversation.ts per data-model.md
- [ ] T028 [P] Create reminder types in src/shared/types/reminder.ts per data-model.md
- [ ] T029 [P] Create settings types in src/shared/types/settings.ts per data-model.md
- [ ] T030 [P] Create AI provider types in src/shared/types/ai-provider.ts per ai-service.md

**Checkpoint**: 基础设施就绪 - 用户故事实现可以开始

---

## Phase 3: User Story 1 - 透明窗口3D宠物显示 (Priority: P1) 🎯 MVP

**Goal**: 用户启动应用后，在桌面上看到3D宠物，窗口透明，宠物播放待机动画

**Independent Test**: 启动应用→观察宠物显示→动画自动播放→窗口置顶

### 3.1 Three.js渲染器

- [ ] T031 [US1] Implement IPetRenderer interface in src/renderer/pet/pet-renderer.ts per pet-service.md
- [ ] T032 [US1] Implement GLTF model loader in src/renderer/pet/pet-model.ts
- [ ] T033 [US1] Configure Three.js scene with transparent background in src/renderer/pet/scene-setup.ts

### 3.2 动画系统

- [ ] T034 [US1] Implement IAnimationController interface in src/renderer/pet/animation/animation-controller.ts per pet-service.md
- [ ] T035 [US1] Create animation state machine in src/renderer/pet/animation/animation-states.ts
- [ ] T036 [US1] Implement animation mixer wrapper in src/renderer/pet/animation/animation-mixer.ts

### 3.3 宠物状态管理

- [ ] T037 [US1] Implement IPetStateManager interface in src/renderer/pet/pet-state-manager.ts per pet-service.md
- [ ] T038 [US1] Create Pet entity repository in src/main/services/storage/repositories/pet-repository.ts

### 3.4 IPC集成

- [ ] T039 [US1] Implement pet:get-state handler in src/main/ipc/handlers/pet-handlers.ts
- [ ] T040 [US1] Implement pet:save-state handler in src/main/ipc/handlers/pet-handlers.ts

### 3.5 主窗口集成

- [ ] T041 [US1] Integrate Three.js renderer with main window in src/renderer/main.ts
- [ ] T042 [US1] Implement window always-on-top toggle in src/main/window/main-window.ts
- [ ] T043 [US1] Restore pet position from database on startup in src/renderer/pet/pet-state-manager.ts

**Checkpoint**: User Story 1 完成 - 3D宠物可在透明窗口中显示并播放待机动画

---

## Phase 4: User Story 2 - 基础交互：拖拽与点击 (Priority: P2)

**Goal**: 用户可以点击宠物触发反应动画，拖拽宠物移动到任意位置

**Independent Test**: 单击宠物→播放反应动画 / 拖拽宠物→位置跟随移动 / 双击→打开对话界面

### 4.1 交互处理器

- [ ] T044 [US2] Implement IInteractionHandler interface in src/renderer/pet/interaction/interaction-handler.ts per pet-service.md
- [ ] T045 [US2] Implement click detection with Raycasting in src/renderer/pet/interaction/click-handler.ts
- [ ] T046 [US2] Implement drag handling with bounds constraint in src/renderer/pet/interaction/drag-handler.ts

### 4.2 反应动画

- [ ] T047 [US2] Add click reaction animations (happy jump, wave) in src/renderer/pet/animation/animation-states.ts
- [ ] T048 [US2] Implement triggerReaction method in src/renderer/pet/pet-state-manager.ts

### 4.3 双击打开对话窗口

- [ ] T049 [US2] Create chat window shell in src/main/window/chat-window.ts
- [ ] T050 [US2] Implement window:open-chat IPC handler in src/main/ipc/handlers/window-handlers.ts
- [ ] T051 [US2] Connect double-click to open chat window in src/renderer/pet/interaction/click-handler.ts

### 4.4 右键菜单

- [ ] T052 [US2] Implement context menu in src/renderer/pet/interaction/context-menu.ts
- [ ] T053 [US2] Add menu items: 设置、最小化到托盘、退出

### 4.5 位置持久化

- [ ] T054 [US2] Save pet position on drag end in src/renderer/pet/pet-state-manager.ts
- [ ] T055 [US2] Implement screen bounds detection for multi-monitor in src/main/services/display-service.ts

**Checkpoint**: User Story 2 完成 - 用户可与宠物进行基础交互

---

## Phase 5: User Story 3 - AI智能对话 (Priority: P3)

**Goal**: 用户通过对话界面与宠物进行自然语言对话，AI生成回复并调整宠物表情

**Independent Test**: 打开对话界面→输入问题→AI回复→宠物表情变化

### 5.1 AI服务核心

- [ ] T056 [US3] Implement IAIService interface in src/main/services/ai/ai-service.ts per ai-service.md
- [ ] T057 [US3] Implement IAIProvider interface base class in src/main/services/ai/base-provider.ts

### 5.2 AI提供商实现

- [ ] T058 [P] [US3] Implement OpenAI provider in src/main/services/ai/providers/openai-provider.ts
- [ ] T059 [P] [US3] Implement Claude provider in src/main/services/ai/providers/claude-provider.ts
- [ ] T060 [P] [US3] Implement Ollama provider in src/main/services/ai/providers/ollama-provider.ts

### 5.3 降级策略与缓存

- [ ] T061 [US3] Implement provider fallback logic in src/main/services/ai/ai-service.ts per ai-service.md degradation strategy
- [ ] T062 [US3] Implement response cache in src/main/services/ai/response-cache.ts per data-model.md response_cache table
- [ ] T063 [US3] Create ai_providers repository in src/main/services/storage/repositories/ai-provider-repository.ts

### 5.4 对话存储

- [ ] T064 [US3] Create conversations repository in src/main/services/storage/repositories/conversation-repository.ts
- [ ] T065 [US3] Create messages repository in src/main/services/storage/repositories/message-repository.ts

### 5.5 对话IPC处理器

- [ ] T066 [US3] Implement chat:send-message handler in src/main/ipc/handlers/chat-handlers.ts
- [ ] T067 [US3] Implement chat:send-message-stream handler with SSE in src/main/ipc/handlers/chat-handlers.ts
- [ ] T068 [US3] Implement chat:get-history handler in src/main/ipc/handlers/chat-handlers.ts
- [ ] T069 [US3] Implement chat:list-conversations handler in src/main/ipc/handlers/chat-handlers.ts

### 5.6 对话界面

- [ ] T070 [US3] Create chat UI component in src/renderer/chat/chat-ui.ts
- [ ] T071 [US3] Implement message renderer with streaming support in src/renderer/chat/message-renderer.ts
- [ ] T072 [US3] Create chat input component with send button in src/renderer/chat/chat-input.ts

### 5.7 表情联动

- [ ] T073 [US3] Parse emotion tag from AI response in src/main/services/ai/emotion-parser.ts
- [ ] T074 [US3] Connect AI emotion to pet state in src/renderer/chat/chat-pet-bridge.ts
- [ ] T075 [US3] Add thinking animation trigger during AI processing in src/renderer/pet/pet-state-manager.ts

**Checkpoint**: User Story 3 完成 - AI对话功能可用，宠物表情随回复变化

---

## Phase 6: User Story 4 - 工作助手 (Priority: P4)

**Goal**: 用户可通过自然语言让宠物设置提醒、查询天气、打开应用

**Independent Test**: 说"提醒我3点开会"→创建提醒 / "今天北京天气"→返回天气 / "打开记事本"→启动应用

### 6.1 Function Calling集成

- [ ] T076 [US4] Define tool definitions in src/main/services/ai/tools/tool-definitions.ts per ai-service.md
- [ ] T077 [US4] Implement tool executor in src/main/services/ai/tools/tool-executor.ts

### 6.2 提醒服务

- [ ] T078 [US4] Implement reminder service in src/main/services/assistant/reminder-service.ts
- [ ] T079 [US4] Create reminders repository in src/main/services/storage/repositories/reminder-repository.ts
- [ ] T080 [US4] Implement reminder scheduler with system notifications in src/main/services/assistant/reminder-scheduler.ts
- [ ] T081 [US4] Implement set_reminder tool in src/main/services/ai/tools/set-reminder-tool.ts

### 6.3 提醒IPC处理器

- [ ] T082 [US4] Implement reminder:create handler in src/main/ipc/handlers/reminder-handlers.ts
- [ ] T083 [US4] Implement reminder:list handler in src/main/ipc/handlers/reminder-handlers.ts
- [ ] T084 [US4] Implement reminder:complete handler in src/main/ipc/handlers/reminder-handlers.ts
- [ ] T085 [US4] Implement reminder:triggered event emitter in src/main/ipc/handlers/reminder-handlers.ts

### 6.4 天气服务

- [ ] T086 [US4] Implement weather service in src/main/services/assistant/weather-service.ts
- [ ] T087 [US4] Implement get_weather tool in src/main/services/ai/tools/get-weather-tool.ts
- [ ] T088 [US4] Implement system:get-weather handler in src/main/ipc/handlers/system-handlers.ts

### 6.5 应用启动服务

- [ ] T089 [US4] Implement app launcher service in src/main/services/assistant/app-launcher.ts
- [ ] T090 [US4] Implement open_application tool in src/main/services/ai/tools/open-application-tool.ts
- [ ] T091 [US4] Implement system:launch-app handler in src/main/ipc/handlers/system-handlers.ts

### 6.6 笔记服务

- [ ] T092 [US4] Implement note service in src/main/services/assistant/note-service.ts
- [ ] T093 [US4] Implement create_note tool in src/main/services/ai/tools/create-note-tool.ts
- [ ] T094 [US4] Implement system:create-note handler in src/main/ipc/handlers/system-handlers.ts

### 6.7 提醒动画联动

- [ ] T095 [US4] Add remind animation to pet state manager in src/renderer/pet/pet-state-manager.ts
- [ ] T096 [US4] Connect reminder:triggered event to pet animation in src/renderer/main.ts

**Checkpoint**: User Story 4 完成 - 工作助手功能可用

---

## Phase 7: User Story 5 - 语音交互 (Priority: P5)

**Goal**: 用户可通过语音与宠物对话，宠物可语音回复

**Independent Test**: 点击麦克风→说话→文字显示 / AI回复→语音播放

### 7.1 语音识别服务

- [ ] T097 [US5] Implement STT service interface in src/main/services/voice/stt-service.ts
- [ ] T098 [US5] Implement Web Speech API adapter in src/main/services/voice/web-speech-adapter.ts
- [ ] T099 [US5] Implement voice:start-recognition handler in src/main/ipc/handlers/voice-handlers.ts
- [ ] T100 [US5] Implement voice:stop-recognition handler in src/main/ipc/handlers/voice-handlers.ts

### 7.2 语音合成服务

- [ ] T101 [US5] Implement TTS service interface in src/main/services/voice/tts-service.ts
- [ ] T102 [US5] Implement platform-specific TTS (say/espeak/SAPI) in src/main/services/voice/platform-tts.ts
- [ ] T103 [US5] Implement voice:synthesize handler in src/main/ipc/handlers/voice-handlers.ts
- [ ] T104 [US5] Implement voice:list-voices handler in src/main/ipc/handlers/voice-handlers.ts

### 7.3 语音UI集成

- [ ] T105 [US5] Add microphone button to chat UI in src/renderer/chat/voice-input.ts
- [ ] T106 [US5] Add audio playback for TTS in src/renderer/chat/voice-output.ts
- [ ] T107 [US5] Add listening animation to pet in src/renderer/pet/animation/animation-states.ts

### 7.4 语音设置

- [ ] T108 [US5] Add voice settings to user settings in src/main/services/storage/repositories/settings-repository.ts
- [ ] T109 [US5] Create voice settings UI section in src/renderer/settings/voice-settings.ts

**Checkpoint**: User Story 5 完成 - 语音交互功能可用

---

## Phase 8: User Story 6 - 照片换肤 (Priority: P6)

**Goal**: 用户上传宠物照片，系统识别品种并生成3D模型

**Independent Test**: 上传照片→品种识别→3D模型生成→应用到宠物

### 8.1 品种识别

- [ ] T110 [US6] Implement breed detector service in src/main/services/skin/breed-detector.ts
- [ ] T111 [US6] Integrate TensorFlow.js breed classification model in src/main/services/skin/tf-breed-model.ts
- [ ] T112 [US6] Implement skin:detect-breed handler in src/main/ipc/handlers/skin-handlers.ts

### 8.2 照片上传与存储

- [ ] T113 [US6] Implement skin:upload-photo handler in src/main/ipc/handlers/skin-handlers.ts
- [ ] T114 [US6] Create pet_skins repository in src/main/services/storage/repositories/skin-repository.ts
- [ ] T115 [US6] Implement file system storage for skins in src/main/services/skin/skin-storage.ts

### 8.3 3D模型生成

- [ ] T116 [US6] Implement model generator service interface in src/main/services/skin/model-generator.ts
- [ ] T117 [US6] Implement local TripoSR adapter in src/main/services/skin/triposr-adapter.ts
- [ ] T118 [US6] Implement Meshy API adapter as fallback in src/main/services/skin/meshy-adapter.ts
- [ ] T119 [US6] Implement skin:generate-model handler with progress events in src/main/ipc/handlers/skin-handlers.ts

### 8.4 骨骼绑定

- [ ] T120 [US6] Implement auto rigging service in src/main/services/skin/auto-rigger.ts
- [ ] T121 [US6] Map generated model to predefined skeleton in src/main/services/skin/skeleton-mapper.ts

### 8.5 换肤UI

- [ ] T122 [US6] Create skin wizard UI in src/renderer/skin/skin-wizard.ts
- [ ] T123 [US6] Create photo upload component in src/renderer/skin/photo-upload.ts
- [ ] T124 [US6] Create breed confirmation UI in src/renderer/skin/breed-confirm.ts
- [ ] T125 [US6] Create model preview component in src/renderer/skin/model-preview.ts

### 8.6 皮肤应用

- [ ] T126 [US6] Implement skin:apply handler in src/main/ipc/handlers/skin-handlers.ts
- [ ] T127 [US6] Implement pet:list-skins handler in src/main/ipc/handlers/pet-handlers.ts
- [ ] T128 [US6] Connect skin change to pet renderer in src/renderer/pet/pet-state-manager.ts

**Checkpoint**: User Story 6 完成 - 照片换肤功能可用

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: 跨功能优化和收尾工作

### 9.1 设置系统

- [ ] T129 Create settings window in src/main/window/settings-window.ts
- [ ] T130 Implement settings:get handler in src/main/ipc/handlers/settings-handlers.ts
- [ ] T131 Implement settings:set handler in src/main/ipc/handlers/settings-handlers.ts
- [ ] T132 Implement settings:get-all handler in src/main/ipc/handlers/settings-handlers.ts
- [ ] T133 Create settings UI with tabs in src/renderer/settings/settings-ui.ts
- [ ] T134 [P] Create general settings tab in src/renderer/settings/general-settings.ts
- [ ] T135 [P] Create AI provider settings tab in src/renderer/settings/ai-settings.ts
- [ ] T136 [P] Create appearance settings tab in src/renderer/settings/appearance-settings.ts

### 9.2 系统功能

- [ ] T137 Implement startup on boot option in src/main/services/system/auto-launch.ts
- [ ] T138 Implement window:minimize-to-tray handler in src/main/ipc/handlers/window-handlers.ts
- [ ] T139 Implement window:quit handler in src/main/ipc/handlers/window-handlers.ts
- [ ] T140 Implement system:get-displays handler in src/main/ipc/handlers/system-handlers.ts

### 9.3 错误处理与用户体验

- [ ] T141 Add global error boundary in src/renderer/main.ts
- [ ] T142 Implement WebGL support detection with friendly error in src/renderer/pet/webgl-check.ts
- [ ] T143 Add loading states for all async operations in src/renderer/shared/loading-state.ts
- [ ] T144 Add empty states for conversations and reminders

### 9.4 性能优化

- [ ] T145 Implement FPS throttling when idle in src/renderer/pet/pet-renderer.ts
- [ ] T146 Add memory management for model loading in src/renderer/pet/pet-model.ts
- [ ] T147 Optimize SQLite queries with proper indexing in src/main/services/storage/database.ts

### 9.5 文档与测试

- [ ] T148 [P] Create README.md with setup instructions
- [ ] T149 [P] Create user guide in docs/user-guide.md
- [ ] T150 [P] Add unit tests for AI service in tests/unit/ai-service.test.ts
- [ ] T151 [P] Add unit tests for database operations in tests/unit/database.test.ts
- [ ] T152 Run quickstart.md validation scenarios

**Checkpoint**: 项目完成 - 所有用户故事实现并优化

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Foundational) ─── BLOCKS ALL USER STORIES
    │
    ├──────────────────────────────────────────────┐
    │                                              │
    ▼                                              ▼
Phase 3 (US1: 3D显示)                    (其他US可并行开发)
    │
    ▼
Phase 4 (US2: 交互) ─── 依赖 US1 的渲染器
    │
    ▼
Phase 5 (US3: AI对话) ─── 依赖 US2 的对话窗口
    │
    ▼
Phase 6 (US4: 工作助手) ─── 依赖 US3 的AI服务
    │
    ▼
Phase 7 (US5: 语音) ─── 依赖 US3 的对话UI
    │
    ▼
Phase 8 (US6: 换肤) ─── 依赖 US1 的渲染器
    │
    ▼
Phase 9 (Polish)
```

### User Story Dependencies

| Story | Depends On | Can Start After |
|-------|------------|-----------------|
| US1 (P1) | Phase 2 | Foundational complete |
| US2 (P2) | US1 | T043 (US1 complete) |
| US3 (P3) | US2 | T055 (US2 complete) |
| US4 (P4) | US3 | T075 (US3 AI service ready) |
| US5 (P5) | US3 | T072 (US3 chat UI ready) |
| US6 (P6) | US1 | T043 (US1 renderer ready) |

### Parallel Opportunities

**Phase 2 (Foundational)**:
```
T016 credential-store ─┬─ 并行
T024 logger           ─┤
T025 sentry           ─┤
T026-T030 types       ─┘
```

**Phase 5 (US3 AI Providers)**:
```
T058 OpenAI provider  ─┬─ 并行
T059 Claude provider  ─┤
T060 Ollama provider  ─┘
```

**Phase 9 (Polish)**:
```
T134 general-settings ─┬─ 并行
T135 ai-settings      ─┤
T136 appearance       ─┘
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T013)
2. Complete Phase 2: Foundational (T014-T030)
3. Complete Phase 3: User Story 1 (T031-T043)
4. **STOP and VALIDATE**: 启动应用，验证3D宠物显示
5. Demo/发布 MVP 版本

### Incremental Delivery

| Milestone | Stories Included | Key Features |
|-----------|------------------|--------------|
| MVP | US1 | 3D宠物显示，待机动画 |
| Alpha | US1 + US2 | 点击/拖拽交互 |
| Beta | US1-US4 | AI对话，工作助手 |
| RC | US1-US5 | 语音交互 |
| 1.0 | US1-US6 | 完整功能，照片换肤 |

---

## Summary

| Phase | Task Range | Count | Focus |
|-------|------------|-------|-------|
| 1. Setup | T001-T013 | 13 | 项目初始化 |
| 2. Foundational | T014-T030 | 17 | 基础设施 |
| 3. US1 (P1) | T031-T043 | 13 | 3D显示 |
| 4. US2 (P2) | T044-T055 | 12 | 交互 |
| 5. US3 (P3) | T056-T075 | 20 | AI对话 |
| 6. US4 (P4) | T076-T096 | 21 | 工作助手 |
| 7. US5 (P5) | T097-T109 | 13 | 语音交互 |
| 8. US6 (P6) | T110-T128 | 19 | 照片换肤 |
| 9. Polish | T129-T152 | 24 | 优化收尾 |
| **Total** | T001-T152 | **152** | |

---

## Notes

- [P] tasks = 不同文件，无依赖，可并行
- [Story] label = 映射到具体用户故事便于追踪
- 每个用户故事应可独立完成和测试
- 每完成一个任务后提交代码
- 在任何 Checkpoint 处可暂停验证
- 避免：模糊任务、同文件冲突、破坏独立性的跨故事依赖