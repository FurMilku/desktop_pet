<!--
SYNC IMPACT REPORT
==================
Version Change: N/A → 1.0.0 (Initial ratification)
Modified Principles: N/A (new document)
Added Sections:
  - Core Principles (6 principles)
  - Development Standards
  - Quality Gates & Review Process
  - Governance
Removed Sections: N/A
Templates Status:
  - templates/spec-template.md: ✅ Compatible
  - templates/plan-template.md: ✅ Compatible
  - templates/tasks-template.md: ✅ Compatible
Follow-up TODOs: None
-->

# 桌面3D小宠物 (Desktop 3D Pet) Constitution

## Core Principles

### I. 模块化设计 (Modular Design)

AI功能模块与宠物核心系统**必须**松耦合，通过事件总线进行通信。

- 所有AI能力（Chat、MCP、Skills、Memory、Agent）必须实现统一的 `Capability` 接口
- 能力模块之间禁止直接调用，必须通过事件总线 (`EventBus`) 通信
- 宠物渲染系统 (`pet/`) 与AI系统 (`ai/`) 之间仅通过 `pet-ai-bridge.ts` 交互
- 每个MCP服务器必须作为独立进程运行，通过stdio传输通信

**理由**: 确保宠物核心功能在无AI服务时仍可独立运行，支持渐进增强。

### II. 类型安全 (Type Safety)

所有代码**必须**使用TypeScript编写，并提供完整的类型定义。

- 禁止使用 `any` 类型，除非有明确的类型断言注释说明原因
- 所有公共API必须有完整的类型签名
- 事件系统必须使用类型化事件定义 (`shared/types/events.ts`)
- IPC通信必须使用类型化的消息接口

**理由**: 在编译时捕获错误，提高代码可维护性和重构安全性。

### III. 测试优先 (Test First)

关键功能**必须**有对应的测试覆盖。

- 单元测试：使用 Vitest，覆盖所有服务层和工具函数
- E2E测试：使用 Playwright，覆盖关键用户流程
- 集成测试：覆盖AI服务集成、MCP服务器通信
- 测试覆盖率目标：核心模块 ≥80%

**理由**: 确保功能正确性，支持安全重构。

### IV. 渐进增强 (Progressive Enhancement)

宠物核心功能**必须**在无AI服务时仍可独立运行。

- 宠物3D渲染、动画、基础交互不依赖AI模块
- AI功能作为增强层，通过事件订阅机制接入
- 离线模式必须提供降级体验（本地Ollama或响应缓存）
- 能力初始化失败不应阻塞应用启动

**理由**: 提供可靠的基础体验，AI功能作为锦上添花。

### V. 安全存储 (Secure Storage)

敏感信息**必须**使用系统凭证管理器存储。

- API密钥必须通过 `keytar` 存储在系统凭证管理器中
- 禁止在配置文件、日志或代码中硬编码密钥
- SQLite数据库存储非敏感用户数据和对话历史
- 凭证访问必须通过 `credential-store.ts` 服务统一管理

**理由**: 保护用户的API密钥和敏感数据不被泄露。

### VI. 可观测性 (Observability)

应用**必须**提供完整的日志和错误追踪能力。

- 使用 `electron-log` 记录本地日志（分级：debug, info, warn, error）
- 使用 `@sentry/electron` 上报崩溃和异常（用户可配置开关）
- 关键操作必须记录日志：AI请求、MCP调用、用户交互事件
- 性能指标必须可追踪：渲染帧率、AI响应时间、内存占用

**理由**: 支持问题诊断和性能优化。

## Development Standards

### 代码组织

- **主进程** (`src/main/`): Electron主进程代码，窗口管理、系统集成
- **渲染进程** (`src/renderer/`): UI组件、宠物渲染、用户交互
- **AI模块** (`src/ai/`): 所有AI相关功能，与渲染进程松耦合
- **共享代码** (`src/shared/`): 类型定义、事件总线、工具函数
- **MCP服务器** (`mcp-servers/`): 独立的MCP服务器实现

### 性能标准

| 指标 | 目标值 | 测量方法 |
|------|--------|----------|
| 渲染帧率 | ≥30fps | Performance API |
| 应用启动 | <5s | 冷启动到可交互 |
| 交互响应 | <200ms | 点击到视觉反馈 |
| AI首字符 | <3s | 发送到首字符显示 |
| 内存占用 | <300MB | 空闲状态 |
| CPU占用 | <5% | 后台运行 |

### 依赖管理

- Electron 28+ (桌面框架)
- Three.js (3D渲染)
- better-sqlite3 (本地数据库)
- 所有依赖必须锁定版本号，避免隐式升级

## Quality Gates & Review Process

### 代码审查要求

1. 所有PR必须通过以下检查：
   - TypeScript编译无错误
   - ESLint无警告
   - 单元测试通过
   - 类型覆盖检查

2. 功能变更必须包含：
   - 对应的测试用例
   - 类型定义更新
   - 必要的文档更新

### 发布检查清单

- [ ] 所有测试通过
- [ ] 无TypeScript编译错误
- [ ] 性能指标达标
- [ ] 安全扫描无高危漏洞
- [ ] 更新日志已编写

## Governance

宪法是本项目的最高指导原则，所有开发活动必须遵循。

### 修订流程

1. 提出修订建议（说明原因和影响）
2. 评估对现有代码的影响
3. 更新宪法文档
4. 执行必要的代码迁移
5. 更新版本号（遵循语义化版本）

### 版本规则

- **MAJOR**: 删除或重新定义核心原则
- **MINOR**: 新增原则或实质性扩展指导
- **PATCH**: 措辞澄清、格式修正、非语义性优化

### 合规验证

- 所有PR必须验证宪法合规性
- `/speckit.analyze` 命令会检查宪法对齐
- 违反宪法的设计需要在 `plan.md` 的 Complexity Tracking 中说明理由

**Version**: 1.0.0 | **Ratified**: 2026-02-08 | **Last Amended**: 2026-02-08