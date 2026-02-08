# Data Model: 桌面3D小宠物

**Branch**: `001-desktop-3d-pet` | **Date**: 2026-02-08  
**Storage**: SQLite (better-sqlite3) + 文件系统

## Overview

本文档定义桌面3D小宠物应用的数据模型。所有结构化数据存储在 SQLite 本地数据库中，3D模型文件和资源存储在本地文件系统。API密钥通过系统凭证管理器安全存储。

## Entity Relationship Diagram

```
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│   Pet       │       │ Conversation │       │   Message   │
│─────────────│       │──────────────│       │─────────────│
│ id (PK)     │       │ id (PK)      │◄──────│ id (PK)     │
│ name        │       │ pet_id (FK)  │1    N │ conv_id (FK)│
│ model_path  │◄──────│ ai_provider  │       │ role        │
│ skin_id(FK) │1    N │ created_at   │       │ content     │
│ position_x  │       │ updated_at   │       │ timestamp   │
│ position_y  │       │ context_json │       │ metadata    │
│ emotion     │       └──────────────┘       └─────────────┘
│ animation   │
└─────────────┘
       │1
       │
       │N
       ▼
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│  PetSkin    │       │  Reminder    │       │ AIProvider  │
│─────────────│       │──────────────│       │─────────────│
│ id (PK)     │       │ id (PK)      │       │ id (PK)     │
│ name        │       │ title        │       │ name        │
│ breed       │       │ trigger_time │       │ type        │
│ photo_path  │       │ repeat_rule  │       │ model       │
│ model_path  │       │ is_completed │       │ endpoint    │
│ rig_data    │       │ created_at   │       │ is_default  │
│ created_at  │       │ notify_title │       │ settings    │
└─────────────┘       └──────────────┘       └─────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      UserSettings                            │
│─────────────────────────────────────────────────────────────│
│ key (PK) │ value (JSON) │ updated_at                        │
│─────────────────────────────────────────────────────────────│
│ Examples: window_position, ai_config, startup_options, etc. │
└─────────────────────────────────────────────────────────────┘
```

---

## Entities

### 1. Pet（宠物）

宠物实体代表当前显示的3D宠物，包含运行时状态和持久化配置。

**表名**: `pets`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID格式，唯一标识符 |
| `name` | TEXT | NOT NULL, DEFAULT '小宠' | 宠物名称 |
| `model_path` | TEXT | NOT NULL | 3D模型文件路径（相对于assets目录）|
| `skin_id` | TEXT | FOREIGN KEY → pet_skins.id, NULLABLE | 当前使用的皮肤ID，NULL表示默认皮肤 |
| `position_x` | REAL | NOT NULL, DEFAULT 0.5 | 窗口X位置（屏幕比例 0-1）|
| `position_y` | REAL | NOT NULL, DEFAULT 0.5 | 窗口Y位置（屏幕比例 0-1）|
| `monitor_id` | TEXT | NULLABLE | 多显示器场景下的显示器标识 |
| `emotion_state` | TEXT | NOT NULL, DEFAULT 'neutral' | 当前情感状态 |
| `animation_state` | TEXT | NOT NULL, DEFAULT 'idle' | 当前动画状态 |
| `created_at` | TEXT | NOT NULL | ISO8601 创建时间 |
| `updated_at` | TEXT | NOT NULL | ISO8601 更新时间 |

**情感状态枚举 (`emotion_state`)**:
- `neutral` - 中性/平静
- `happy` - 开心
- `curious` - 好奇
- `confused` - 困惑
- `thinking` - 思考中
- `sleepy` - 困倦
- `excited` - 兴奋

**动画状态枚举 (`animation_state`)**:
- `idle` - 待机（眨眼、呼吸）
- `idle_look_around` - 待机四处张望
- `react_happy` - 开心反应
- `react_wave` - 挥手
- `thinking` - 思考动作
- `listening` - 倾听状态
- `talking` - 说话状态
- `sleeping` - 睡眠状态
- `dragging` - 被拖拽状态

**索引**:
- `idx_pets_skin_id` ON `skin_id`

**SQL Schema**:
```sql
CREATE TABLE pets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '小宠',
    model_path TEXT NOT NULL,
    skin_id TEXT REFERENCES pet_skins(id) ON DELETE SET NULL,
    position_x REAL NOT NULL DEFAULT 0.5,
    position_y REAL NOT NULL DEFAULT 0.5,
    monitor_id TEXT,
    emotion_state TEXT NOT NULL DEFAULT 'neutral',
    animation_state TEXT NOT NULL DEFAULT 'idle',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_pets_skin_id ON pets(skin_id);
```

---

### 2. Conversation（对话）

对话会话实体，管理用户与AI的对话上下文。

**表名**: `conversations`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID格式，唯一标识符 |
| `pet_id` | TEXT | FOREIGN KEY → pets.id, NOT NULL | 关联的宠物ID |
| `ai_provider_id` | TEXT | FOREIGN KEY → ai_providers.id, NULLABLE | 使用的AI提供商ID |
| `title` | TEXT | NULLABLE | 对话标题（可自动生成）|
| `context_json` | TEXT | NOT NULL, DEFAULT '[]' | JSON格式的上下文摘要 |
| `message_count` | INTEGER | NOT NULL, DEFAULT 0 | 消息数量（冗余字段，提升查询性能）|
| `is_active` | INTEGER | NOT NULL, DEFAULT 1 | 是否为活跃对话 (0/1) |
| `created_at` | TEXT | NOT NULL | ISO8601 创建时间 |
| `updated_at` | TEXT | NOT NULL | ISO8601 最后更新时间 |

**索引**:
- `idx_conversations_pet_id` ON `pet_id`
- `idx_conversations_active` ON `is_active, updated_at DESC`

**SQL Schema**:
```sql
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    ai_provider_id TEXT REFERENCES ai_providers(id) ON DELETE SET NULL,
    title TEXT,
    context_json TEXT NOT NULL DEFAULT '[]',
    message_count INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_conversations_pet_id ON conversations(pet_id);
CREATE INDEX idx_conversations_active ON conversations(is_active, updated_at DESC);
```

---

### 3. Message（消息）

单条对话消息实体。

**表名**: `messages`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID格式，唯一标识符 |
| `conversation_id` | TEXT | FOREIGN KEY → conversations.id, NOT NULL | 所属对话ID |
| `role` | TEXT | NOT NULL | 消息角色：user/assistant/system/tool |
| `content` | TEXT | NOT NULL | 消息内容 |
| `content_type` | TEXT | NOT NULL, DEFAULT 'text' | 内容类型：text/voice/image |
| `tool_calls_json` | TEXT | NULLABLE | Function calling的工具调用JSON |
| `tool_call_id` | TEXT | NULLABLE | 工具调用结果对应的调用ID |
| `emotion_tag` | TEXT | NULLABLE | AI回复关联的情感标签 |
| `token_count` | INTEGER | NULLABLE | Token数量（用于统计）|
| `created_at` | TEXT | NOT NULL | ISO8601 创建时间 |

**角色枚举 (`role`)**:
- `user` - 用户消息
- `assistant` - AI助手回复
- `system` - 系统提示
- `tool` - 工具调用结果

**索引**:
- `idx_messages_conversation_id` ON `conversation_id, created_at ASC`

**SQL Schema**:
```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    tool_calls_json TEXT,
    tool_call_id TEXT,
    emotion_tag TEXT,
    token_count INTEGER,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id, created_at ASC);
```

---

### 4. Reminder（提醒）

提醒实体，支持一次性和周期性提醒。

**表名**: `reminders`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID格式，唯一标识符 |
| `title` | TEXT | NOT NULL | 提醒标题 |
| `description` | TEXT | NULLABLE | 提醒详细描述 |
| `trigger_time` | TEXT | NOT NULL | ISO8601 触发时间 |
| `repeat_rule` | TEXT | NULLABLE | 重复规则（RRULE格式或简化格式）|
| `is_completed` | INTEGER | NOT NULL, DEFAULT 0 | 是否已完成 (0/1) |
| `is_enabled` | INTEGER | NOT NULL, DEFAULT 1 | 是否启用 (0/1) |
| `notify_title` | TEXT | NULLABLE | 系统通知标题（默认使用title）|
| `notify_body` | TEXT | NULLABLE | 系统通知内容 |
| `source_message_id` | TEXT | FOREIGN KEY → messages.id, NULLABLE | 创建此提醒的消息ID |
| `created_at` | TEXT | NOT NULL | ISO8601 创建时间 |
| `updated_at` | TEXT | NOT NULL | ISO8601 更新时间 |

**重复规则格式 (`repeat_rule`)**:
- `null` - 一次性提醒
- `daily` - 每天
- `weekly` - 每周
- `monthly` - 每月
- `weekdays` - 工作日（周一至周五）
- `RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR` - iCalendar RRULE格式

**索引**:
- `idx_reminders_trigger` ON `is_enabled, is_completed, trigger_time`

**SQL Schema**:
```sql
CREATE TABLE reminders (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    trigger_time TEXT NOT NULL,
    repeat_rule TEXT,
    is_completed INTEGER NOT NULL DEFAULT 0,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    notify_title TEXT,
    notify_body TEXT,
    source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_reminders_trigger ON reminders(is_enabled, is_completed, trigger_time);
```

---

### 5. AIProvider（AI提供商）

AI服务配置实体。API密钥不存储在此表中，而是通过系统凭证管理器存储。

**表名**: `ai_providers`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID格式，唯一标识符 |
| `name` | TEXT | NOT NULL | 显示名称（如 "OpenAI GPT-4"）|
| `type` | TEXT | NOT NULL | 提供商类型：openai/claude/ollama |
| `model` | TEXT | NOT NULL | 模型名称（如 "gpt-4", "claude-3-sonnet"）|
| `endpoint` | TEXT | NULLABLE | 自定义API端点（Ollama或兼容API）|
| `is_default` | INTEGER | NOT NULL, DEFAULT 0 | 是否为默认提供商 (0/1) |
| `is_enabled` | INTEGER | NOT NULL, DEFAULT 1 | 是否启用 (0/1) |
| `priority` | INTEGER | NOT NULL, DEFAULT 100 | 降级优先级（数字越小优先级越高）|
| `settings_json` | TEXT | NOT NULL, DEFAULT '{}' | JSON格式的额外设置 |
| `created_at` | TEXT | NOT NULL | ISO8601 创建时间 |
| `updated_at` | TEXT | NOT NULL | ISO8601 更新时间 |

**提供商类型枚举 (`type`)**:
- `openai` - OpenAI API (GPT系列)
- `claude` - Anthropic Claude API
- `ollama` - 本地Ollama服务
- `openai_compatible` - OpenAI兼容API

**设置JSON结构 (`settings_json`)**:
```json
{
  "temperature": 0.7,
  "max_tokens": 2048,
  "top_p": 1.0,
  "frequency_penalty": 0.0,
  "presence_penalty": 0.0,
  "system_prompt": "你是一只可爱的桌面小宠物..."
}
```

**凭证存储键名约定**:
- keytar service: `desktop-pet-ai`
- keytar account: `{provider_id}` (使用provider的UUID)

**索引**:
- `idx_ai_providers_default` ON `is_default, is_enabled`
- `idx_ai_providers_priority` ON `is_enabled, priority ASC`

**SQL Schema**:
```sql
CREATE TABLE ai_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    model TEXT NOT NULL,
    endpoint TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 100,
    settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_ai_providers_default ON ai_providers(is_default, is_enabled);
CREATE INDEX idx_ai_providers_priority ON ai_providers(is_enabled, priority ASC);
```

---

### 6. PetSkin（宠物皮肤）

自定义宠物皮肤实体，包含用户上传的照片和生成的3D模型。

**表名**: `pet_skins`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID格式，唯一标识符 |
| `name` | TEXT | NOT NULL | 皮肤名称 |
| `breed` | TEXT | NULLABLE | 识别出的宠物品种 |
| `breed_confidence` | REAL | NULLABLE | 品种识别置信度 (0-1) |
| `photo_path` | TEXT | NOT NULL | 原始照片存储路径 |
| `model_path` | TEXT | NULLABLE | 生成的3D模型路径 |
| `thumbnail_path` | TEXT | NULLABLE | 缩略图路径 |
| `rig_data_json` | TEXT | NULLABLE | 骨骼绑定数据JSON |
| `generation_status` | TEXT | NOT NULL, DEFAULT 'pending' | 生成状态 |
| `generation_error` | TEXT | NULLABLE | 生成失败的错误信息 |
| `generation_method` | TEXT | NULLABLE | 生成方式：local_triposr/meshy_api |
| `created_at` | TEXT | NOT NULL | ISO8601 创建时间 |
| `updated_at` | TEXT | NOT NULL | ISO8601 更新时间 |

**生成状态枚举 (`generation_status`)**:
- `pending` - 等待处理
- `detecting_breed` - 正在识别品种
- `generating_model` - 正在生成3D模型
- `binding_rig` - 正在绑定骨骼
- `completed` - 完成
- `failed` - 失败

**骨骼绑定数据结构 (`rig_data_json`)**:
```json
{
  "skeleton_type": "quadruped",
  "bone_mapping": {
    "root": "Armature",
    "spine": ["Spine1", "Spine2", "Spine3"],
    "head": "Head",
    "tail": ["Tail1", "Tail2", "Tail3"],
    "legs": {
      "front_left": ["FrontLeftShoulder", "FrontLeftLeg", "FrontLeftFoot"],
      "front_right": ["FrontRightShoulder", "FrontRightLeg", "FrontRightFoot"],
      "back_left": ["BackLeftHip", "BackLeftLeg", "BackLeftFoot"],
      "back_right": ["BackRightHip", "BackRightLeg", "BackRightFoot"]
    }
  },
  "animation_compatible": true
}
```

**文件存储路径约定**:
- 照片: `{userData}/skins/{skin_id}/photo.{ext}`
- 模型: `{userData}/skins/{skin_id}/model.glb`
- 缩略图: `{userData}/skins/{skin_id}/thumbnail.png`

**索引**:
- `idx_pet_skins_status` ON `generation_status`

**SQL Schema**:
```sql
CREATE TABLE pet_skins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    breed TEXT,
    breed_confidence REAL,
    photo_path TEXT NOT NULL,
    model_path TEXT,
    thumbnail_path TEXT,
    rig_data_json TEXT,
    generation_status TEXT NOT NULL DEFAULT 'pending',
    generation_error TEXT,
    generation_method TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_pet_skins_status ON pet_skins(generation_status);
```

---

### 7. UserSettings（用户设置）

键值对形式的用户偏好设置。

**表名**: `user_settings`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `key` | TEXT | PRIMARY KEY | 设置键名 |
| `value` | TEXT | NOT NULL | JSON格式的设置值 |
| `updated_at` | TEXT | NOT NULL | ISO8601 更新时间 |

**预定义设置键**:

| 键名 | 值类型 | 默认值 | 说明 |
|------|--------|--------|------|
| `window_position` | `{x: number, y: number, monitor?: string}` | `{x: 0.8, y: 0.8}` | 窗口位置 |
| `window_scale` | `number` | `1.0` | 宠物缩放比例 |
| `always_on_top` | `boolean` | `true` | 是否置顶显示 |
| `start_on_boot` | `boolean` | `false` | 开机自启动 |
| `start_minimized` | `boolean` | `false` | 启动时最小化到托盘 |
| `default_ai_provider` | `string` | `null` | 默认AI提供商ID |
| `voice_input_enabled` | `boolean` | `false` | 是否启用语音输入 |
| `voice_output_enabled` | `boolean` | `false` | 是否启用语音输出 |
| `tts_voice` | `string` | `'default'` | TTS语音选择 |
| `tts_speed` | `number` | `1.0` | TTS语速 |
| `stt_language` | `string` | `'zh-CN'` | STT识别语言 |
| `theme` | `'light' \| 'dark' \| 'system'` | `'system'` | 界面主题 |
| `pet_idle_animations` | `boolean` | `true` | 是否启用待机动画 |
| `notification_sound` | `boolean` | `true` | 提醒是否播放声音 |
| `telemetry_enabled` | `boolean` | `true` | 是否启用遥测/崩溃报告 |
| `last_active_conversation` | `string` | `null` | 上次活跃的对话ID |

**SQL Schema**:
```sql
CREATE TABLE user_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

---

## Database Initialization

### 初始化脚本

```sql
-- 创建表（按依赖顺序）
-- 1. 无依赖的表
CREATE TABLE IF NOT EXISTS ai_providers (...);
CREATE TABLE IF NOT EXISTS pet_skins (...);
CREATE TABLE IF NOT EXISTS user_settings (...);

-- 2. 依赖 pet_skins 的表
CREATE TABLE IF NOT EXISTS pets (...);

-- 3. 依赖 pets 和 ai_providers 的表
CREATE TABLE IF NOT EXISTS conversations (...);

-- 4. 依赖 conversations 的表
CREATE TABLE IF NOT EXISTS messages (...);
CREATE TABLE IF NOT EXISTS reminders (...);

-- 插入默认数据
INSERT OR IGNORE INTO pets (id, name, model_path, created_at, updated_at)
VALUES ('default-pet', '小宠', 'models/default-pet.glb', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO ai_providers (id, name, type, model, is_default, priority, created_at, updated_at)
VALUES 
    ('provider-ollama-default', 'Ollama (本地)', 'ollama', 'llama3', 0, 100, datetime('now'), datetime('now'));
```

### 数据迁移策略

- **版本管理**: 使用 `user_settings` 表中的 `db_version` 键记录当前数据库版本
- **迁移脚本**: 在 `src/main/services/storage/migrations/` 目录存放迁移脚本
- **命名约定**: `001_initial.sql`, `002_add_voice_settings.sql`, ...
- **回滚支持**: 每个迁移脚本包含 `-- UP` 和 `-- DOWN` 两部分

---

## Response Cache（AI响应缓存）

为支持离线体验和降级策略，实现简单的响应缓存。

**表名**: `response_cache`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID格式 |
| `query_hash` | TEXT | NOT NULL, UNIQUE | 用户查询的哈希值 |
| `query_text` | TEXT | NOT NULL | 原始查询文本 |
| `response_text` | TEXT | NOT NULL | 缓存的响应 |
| `provider_type` | TEXT | NOT NULL | 生成响应的AI类型 |
| `hit_count` | INTEGER | NOT NULL, DEFAULT 0 | 命中次数 |
| `created_at` | TEXT | NOT NULL | 创建时间 |
| `last_hit_at` | TEXT | NULLABLE | 最后命中时间 |
| `expires_at` | TEXT | NULLABLE | 过期时间 |

**SQL Schema**:
```sql
CREATE TABLE response_cache (
    id TEXT PRIMARY KEY,
    query_hash TEXT NOT NULL UNIQUE,
    query_text TEXT NOT NULL,
    response_text TEXT NOT NULL,
    provider_type TEXT NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_hit_at TEXT,
    expires_at TEXT
);

CREATE INDEX idx_response_cache_hash ON response_cache(query_hash);
CREATE INDEX idx_response_cache_expires ON response_cache(expires_at);
```

---

## File System Structure

除SQLite数据库外，以下数据存储在文件系统中：

```
{userData}/
├── database.sqlite          # SQLite数据库文件
├── database.sqlite-wal      # WAL日志（如果启用）
├── database.sqlite-shm      # 共享内存文件
├── logs/                    # 日志文件目录
│   ├── main.log            # 主日志
│   └── main.old.log        # 轮转的旧日志
├── skins/                   # 用户自定义皮肤
│   └── {skin_id}/
│       ├── photo.jpg       # 原始照片
│       ├── model.glb       # 生成的3D模型
│       └── thumbnail.png   # 缩略图
└── cache/                   # 临时缓存
    └── models/             # 模型缓存
```

**路径获取**:
- Windows: `%APPDATA%/desktop-3d-pet/`
- macOS: `~/Library/Application Support/desktop-3d-pet/`
- Linux: `~/.config/desktop-3d-pet/`

---

## Data Validation Rules

### Pet
- `name`: 1-50字符
- `position_x`, `position_y`: 0.0-1.0范围
- `emotion_state`, `animation_state`: 必须是枚举值

### Conversation
- `context_json`: 有效JSON数组
- `message_count`: >= 0

### Message
- `role`: 必须是 user/assistant/system/tool
- `content`: 不能为空
- `content_type`: 必须是 text/voice/image

### Reminder
- `title`: 1-200字符
- `trigger_time`: 有效ISO8601时间戳
- `repeat_rule`: null或有效格式

### AIProvider
- `name`: 1-100字符
- `type`: 必须是枚举值
- `model`: 不能为空
- `priority`: 1-1000
- `settings_json`: 有效JSON对象

### PetSkin
- `name`: 1-50字符
- `breed_confidence`: 0.0-1.0范围
- `generation_status`: 必须是枚举值

### UserSettings
- `key`: 1-100字符，字母数字下划线
- `value`: 有效JSON