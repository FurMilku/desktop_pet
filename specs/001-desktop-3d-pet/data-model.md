# Data Model: 桌面3D小宠物

**Branch**: `001-desktop-3d-pet` | **Date**: 2026-02-08  
**Source**: [spec.md](./spec.md) Key Entities 章节

## Overview

本文档定义桌面3D小宠物应用的数据模型，所有实体均使用SQLite本地数据库持久化存储。

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐
│   UserSettings  │       │    AIProvider   │
└─────────────────┘       └────────┬────────┘
                                   │
                                   │ 1:N (对话使用的AI配置)
                                   ▼
┌─────────────────┐       ┌─────────────────┐
│      Pet        │       │  Conversation   │
│  (内存/配置)     │       └────────┬────────┘
└─────────────────┘                │
                                   │ 1:N
                                   ▼
┌─────────────────┐       ┌─────────────────┐
│    PetSkin      │       │    Message      │
└─────────────────┘       └─────────────────┘

┌─────────────────┐
│    Reminder     │
└─────────────────┘
```

## Entities

### 1. Pet（宠物）

**描述**: 3D宠物实体，大部分状态在内存中维护，仅持久化位置和外观配置。

**存储**: 部分SQLite（位置、皮肤ID），部分内存（动画状态、情感状态）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | 宠物唯一标识（默认为 'default'） |
| position_x | INTEGER | NOT NULL, DEFAULT 100 | 窗口X坐标 |
| position_y | INTEGER | NOT NULL, DEFAULT 100 | 窗口Y坐标 |
| position_monitor | INTEGER | DEFAULT 0 | 所在显示器索引 |
| current_skin_id | TEXT | FK → PetSkin.id, NULLABLE | 当前使用的皮肤ID |
| created_at | INTEGER | NOT NULL | 创建时间戳 |
| updated_at | INTEGER | NOT NULL | 更新时间戳 |

**内存状态**（不持久化）:
- `animationState`: 当前动画状态（idle/thinking/happy/sad/confused/drag/listening/celebrating/sleepy/curious）
- `emotionalState`: 情感状态值（0-100）
- `modelData`: Three.js 模型引用

**状态转换规则**:
```
idle ←→ thinking（收到用户消息）
idle ←→ happy（积极AI回复）
idle ←→ sad（消极AI回复）
idle ←→ confused（AI无法理解）
idle ←→ listening（语音输入中）
idle ←→ celebrating（任务完成）
idle ←→ sleepy（长时间无交互，>5分钟）
idle ←→ curious（新消息/新事物）
any → drag（用户拖拽中）
drag → idle（释放鼠标）
```

---

### 2. Conversation（对话）

**描述**: 对话会话实体，包含消息历史和上下文配置。

**存储**: SQLite

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID，对话唯一标识 |
| title | TEXT | NULLABLE | 对话标题（可由AI自动生成） |
| ai_provider_id | TEXT | FK → AIProvider.id, NULLABLE | 使用的AI提供商配置 |
| system_prompt | TEXT | NULLABLE | 自定义系统提示词 |
| context_length | INTEGER | DEFAULT 20 | 上下文保持轮数 |
| created_at | INTEGER | NOT NULL | 创建时间戳 |
| updated_at | INTEGER | NOT NULL | 最后更新时间戳 |

**索引**:
- `idx_conversation_updated` ON (updated_at DESC) - 按更新时间排序

**业务规则**:
- 默认保持最近20轮对话上下文（SC-006）
- 对话标题可在首次AI回复后自动生成

---

### 3. Message（消息）

**描述**: 单条对话消息，包含角色、内容和时间信息。

**存储**: SQLite

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID，消息唯一标识 |
| conversation_id | TEXT | FK → Conversation.id, NOT NULL | 所属对话ID |
| role | TEXT | NOT NULL, CHECK IN ('user','assistant','system') | 消息角色 |
| content | TEXT | NOT NULL | 消息内容 |
| tokens | INTEGER | NULLABLE | Token计数（用于上下文管理） |
| tool_calls | TEXT | NULLABLE | JSON格式的工具调用记录 |
| tool_result | TEXT | NULLABLE | JSON格式的工具执行结果 |
| created_at | INTEGER | NOT NULL | 创建时间戳 |

**索引**:
- `idx_message_conversation` ON (conversation_id, created_at ASC) - 按对话和时间排序

**业务规则**:
- `role` 取值：`user`（用户消息）、`assistant`（AI回复）、`system`（系统消息）
- `tool_calls` 格式：`[{"name": "tool_name", "arguments": {...}}]`
- `tool_result` 格式：`{"success": true, "result": ...}`

---

### 4. Reminder（提醒）

**描述**: 提醒实体，支持一次性和周期性提醒。

**存储**: SQLite

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID，提醒唯一标识 |
| title | TEXT | NOT NULL | 提醒标题 |
| description | TEXT | NULLABLE | 提醒详细描述 |
| trigger_time | INTEGER | NOT NULL | 触发时间戳（毫秒） |
| repeat_rule | TEXT | NULLABLE | 重复规则（RRULE格式或简化格式） |
| repeat_end | INTEGER | NULLABLE | 重复结束时间戳 |
| completed | INTEGER | DEFAULT 0 | 是否已完成（0/1） |
| snoozed_until | INTEGER | NULLABLE | 延后至时间戳 |
| created_at | INTEGER | NOT NULL | 创建时间戳 |
| updated_at | INTEGER | NOT NULL | 更新时间戳 |

**索引**:
- `idx_reminder_trigger` ON (trigger_time ASC) WHERE completed = 0 - 未完成提醒按触发时间排序
- `idx_reminder_completed` ON (completed, updated_at DESC) - 按完成状态和时间排序

**重复规则格式**:
```typescript
// 简化格式
type RepeatRule = 
  | 'daily'           // 每天
  | 'weekly'          // 每周
  | 'monthly'         // 每月
  | 'yearly'          // 每年
  | 'weekdays'        // 工作日
  | `every:${number}:${'minutes'|'hours'|'days'}`; // 自定义间隔

// 或使用标准 RRULE 格式
// "FREQ=WEEKLY;BYDAY=MO,WE,FR"
```

**业务规则**:
- 触发时显示系统通知 + 宠物提醒动画（FR-016）
- 支持延后（snooze）功能
- 周期性提醒在触发后自动计算下次触发时间

---

### 5. AIProvider（AI提供商）

**描述**: AI服务配置，API密钥单独通过系统凭证管理器存储。

**存储**: SQLite（配置），系统凭证管理器（API密钥）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | 提供商唯一标识（如 'openai-gpt4'） |
| name | TEXT | NOT NULL | 显示名称 |
| type | TEXT | NOT NULL, CHECK IN ('openai','claude','ollama','custom') | 提供商类型 |
| model | TEXT | NOT NULL | 模型名称（如 'gpt-4-turbo'） |
| base_url | TEXT | NULLABLE | 自定义API端点（用于代理或本地部署） |
| is_local | INTEGER | DEFAULT 0 | 是否为本地模型（0/1） |
| max_tokens | INTEGER | DEFAULT 4096 | 最大输出token数 |
| temperature | REAL | DEFAULT 0.7 | 温度参数 |
| priority | INTEGER | DEFAULT 0 | 降级优先级（数字越小优先级越高） |
| enabled | INTEGER | DEFAULT 1 | 是否启用（0/1） |
| created_at | INTEGER | NOT NULL | 创建时间戳 |
| updated_at | INTEGER | NOT NULL | 更新时间戳 |

**索引**:
- `idx_provider_priority` ON (priority ASC, enabled DESC) - 按优先级排序启用的提供商

**预置配置**:
```sql
INSERT INTO ai_providers (id, name, type, model, is_local, priority) VALUES
  ('openai-gpt4', 'OpenAI GPT-4', 'openai', 'gpt-4-turbo', 0, 1),
  ('claude-sonnet', 'Claude 3.5 Sonnet', 'claude', 'claude-3-5-sonnet-20241022', 0, 2),
  ('ollama-llama', 'Ollama Llama', 'ollama', 'llama3.2', 1, 10);
```

**安全说明**:
- API密钥通过 `keytar` 存储在系统凭证管理器
- 密钥键名格式：`desktop-pet:{provider_id}`
- 禁止在数据库或日志中存储明文密钥（NFR-004）

---

### 6. PetSkin（宠物皮肤）

**描述**: 自定义皮肤实体，存储用户上传的照片和生成的3D模型信息。

**存储**: SQLite（元数据），文件系统（模型文件、照片）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID，皮肤唯一标识 |
| name | TEXT | NOT NULL | 皮肤名称 |
| source_type | TEXT | NOT NULL, CHECK IN ('builtin','photo','imported') | 来源类型 |
| original_photo_path | TEXT | NULLABLE | 原始照片路径（相对于userData） |
| model_path | TEXT | NOT NULL | 3D模型文件路径（相对于userData） |
| thumbnail_path | TEXT | NULLABLE | 缩略图路径 |
| breed | TEXT | NULLABLE | 识别出的宠物品种 |
| breed_confidence | REAL | NULLABLE | 品种识别置信度（0-1） |
| rig_data | TEXT | NULLABLE | JSON格式的骨骼绑定数据 |
| animation_mappings | TEXT | NULLABLE | JSON格式的动画映射配置 |
| is_active | INTEGER | DEFAULT 0 | 是否为当前使用的皮肤 |
| created_at | INTEGER | NOT NULL | 创建时间戳 |
| updated_at | INTEGER | NOT NULL | 更新时间戳 |

**文件存储结构**:
```
{userData}/skins/
├── {skin_id}/
│   ├── original.jpg      # 原始照片
│   ├── model.glb         # 生成的3D模型
│   ├── thumbnail.png     # 缩略图
│   └── rig.json          # 骨骼绑定配置
```

**预置皮肤**:
```sql
INSERT INTO pet_skins (id, name, source_type, model_path, is_active) VALUES
  ('default-cat', '默认小猫', 'builtin', 'assets/models/default-pet.glb', 1);
```

---

### 7. UserSettings（用户设置）

**描述**: 用户偏好设置，键值对存储。

**存储**: SQLite

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| key | TEXT | PK | 设置键名 |
| value | TEXT | NOT NULL | 设置值（JSON格式） |
| updated_at | INTEGER | NOT NULL | 更新时间戳 |

**预定义设置项**:

| 键名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `window.alwaysOnTop` | boolean | true | 窗口置顶 |
| `window.startMinimized` | boolean | false | 启动时最小化 |
| `window.opacity` | number | 1.0 | 窗口透明度 |
| `pet.idleTimeout` | number | 300000 | 进入瞌睡状态的空闲时间(ms) |
| `pet.animationSpeed` | number | 1.0 | 动画播放速度 |
| `ai.defaultProvider` | string | 'openai-gpt4' | 默认AI提供商 |
| `ai.streamingEnabled` | boolean | true | 启用流式输出 |
| `chat.mode` | string | 'bubble' | 对话模式: 'bubble' 或 'window' |
| `chat.maxHistory` | number | 20 | 上下文保持轮数 |
| `voice.enabled` | boolean | false | 启用语音功能 |
| `voice.autoSpeak` | boolean | false | AI自动语音回复 |
| `voice.language` | string | 'zh-CN' | 语音识别语言 |
| `system.autoStart` | boolean | false | 开机自启动 |
| `system.checkUpdates` | boolean | true | 自动检查更新 |
| `telemetry.enabled` | boolean | true | 启用错误报告(Sentry) |
| `mcp.enabledServers` | string[] | ['system-tools','reminder','notes','weather-api','calendar'] | 启用的MCP服务器 |
| `skills.enabledSkills` | string[] | ['weather','reminder','notes','app-launcher','calendar','quick-search'] | 启用的技能 |

---

## Database Schema (SQLite)

```sql
-- 创建数据库表
PRAGMA foreign_keys = ON;

-- 宠物表
CREATE TABLE IF NOT EXISTS pets (
  id TEXT PRIMARY KEY DEFAULT 'default',
  position_x INTEGER NOT NULL DEFAULT 100,
  position_y INTEGER NOT NULL DEFAULT 100,
  position_monitor INTEGER DEFAULT 0,
  current_skin_id TEXT REFERENCES pet_skins(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 对话表
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  ai_provider_id TEXT REFERENCES ai_providers(id),
  system_prompt TEXT,
  context_length INTEGER DEFAULT 20,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversation_updated ON conversations(updated_at DESC);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens INTEGER,
  tool_calls TEXT,
  tool_result TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_message_conversation ON messages(conversation_id, created_at ASC);

-- 提醒表
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  trigger_time INTEGER NOT NULL,
  repeat_rule TEXT,
  repeat_end INTEGER,
  completed INTEGER DEFAULT 0,
  snoozed_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminder_trigger ON reminders(trigger_time ASC) WHERE completed = 0;
CREATE INDEX IF NOT EXISTS idx_reminder_completed ON reminders(completed, updated_at DESC);

-- AI提供商表
CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('openai', 'claude', 'ollama', 'custom')),
  model TEXT NOT NULL,
  base_url TEXT,
  is_local INTEGER DEFAULT 0,
  max_tokens INTEGER DEFAULT 4096,
  temperature REAL DEFAULT 0.7,
  priority INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_provider_priority ON ai_providers(priority ASC, enabled DESC);

-- 宠物皮肤表
CREATE TABLE IF NOT EXISTS pet_skins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('builtin', 'photo', 'imported')),
  original_photo_path TEXT,
  model_path TEXT NOT NULL,
  thumbnail_path TEXT,
  breed TEXT,
  breed_confidence REAL,
  rig_data TEXT,
  animation_mappings TEXT,
  is_active INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 用户设置表
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 插入默认数据
INSERT OR IGNORE INTO pets (id, position_x, position_y, created_at, updated_at) 
VALUES ('default', 100, 100, strftime('%s','now')*1000, strftime('%s','now')*1000);

INSERT OR IGNORE INTO ai_providers (id, name, type, model, is_local, priority, created_at, updated_at) VALUES
  ('openai-gpt4', 'OpenAI GPT-4', 'openai', 'gpt-4-turbo', 0, 1, strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('claude-sonnet', 'Claude 3.5 Sonnet', 'claude', 'claude-3-5-sonnet-20241022', 0, 2, strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('ollama-llama', 'Ollama Llama', 'ollama', 'llama3.2', 1, 10, strftime('%s','now')*1000, strftime('%s','now')*1000);

INSERT OR IGNORE INTO pet_skins (id, name, source_type, model_path, is_active, created_at, updated_at)
VALUES ('default-cat', '默认小猫', 'builtin', 'assets/models/default-pet.glb', 1, strftime('%s','now')*1000, strftime('%s','now')*1000);
```

## Migration Strategy

### Version Tracking
```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  description TEXT
);
```

### Migration Process
1. 应用启动时检查 `schema_version` 表
2. 比较当前版本与目标版本
3. 按顺序执行迁移脚本
4. 迁移前自动备份数据库文件

### Backup Location
```
{userData}/backups/pet.db.{timestamp}.bak