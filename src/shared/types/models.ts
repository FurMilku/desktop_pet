/**
 * 数据模型类型定义
 * 定义所有实体的 TypeScript 接口
 */

// ============================================================================
// 基础类型
// ============================================================================

/**
 * 实体基础接口 - 所有数据库实体继承此接口
 */
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 时间戳类型 - ISO 8601 格式字符串或 Date 对象
 */
export type Timestamp = Date | string;

// ============================================================================
// Pet 相关类型
// ============================================================================

/**
 * 宠物动画状态枚举
 */
export type PetAnimationState =
  | 'idle'       // 待机
  | 'thinking'   // 思考
  | 'happy'      // 开心
  | 'sad'        // 难过
  | 'confused'   // 困惑
  | 'curious'    // 好奇
  | 'drag'       // 拖拽
  | 'listening'  // 倾听
  | 'celebrating'// 庆祝
  | 'sleepy';    // 瞌睡

/**
 * 宠物实体
 */
export interface Pet extends BaseEntity {
  name: string;
  currentSkinId: string | null;
  positionX: number;
  positionY: number;
  displayIndex: number; // 显示器索引
  animationState: PetAnimationState;
  scale: number;
  isVisible: boolean;
}

/**
 * 创建宠物输入参数
 */
export interface CreatePetInput {
  name: string;
  positionX?: number;
  positionY?: number;
  displayIndex?: number;
  scale?: number;
}

/**
 * 更新宠物输入参数
 */
export interface UpdatePetInput {
  name?: string;
  currentSkinId?: string | null;
  positionX?: number;
  positionY?: number;
  displayIndex?: number;
  animationState?: PetAnimationState;
  scale?: number;
  isVisible?: boolean;
}

// ============================================================================
// PetSkin 相关类型
// ============================================================================

/**
 * 皮肤来源类型
 */
export type SkinSource = 'builtin' | 'generated' | 'imported';

/**
 * 宠物皮肤实体
 */
export interface PetSkin extends BaseEntity {
  name: string;
  modelPath: string;
  thumbnailPath: string | null;
  source: SkinSource;
  breedInfo: string | null; // JSON 格式的品种信息
  isDefault: boolean;
}

/**
 * 创建皮肤输入参数
 */
export interface CreatePetSkinInput {
  name: string;
  modelPath: string;
  thumbnailPath?: string;
  source: SkinSource;
  breedInfo?: string;
  isDefault?: boolean;
}

// ============================================================================
// Conversation 相关类型
// ============================================================================

/**
 * 对话实体
 */
export interface Conversation extends BaseEntity {
  title: string;
  petId: string;
  providerId: string | null;
  messageCount: number;
  lastMessageAt: Timestamp | null;
  isArchived: boolean;
}

/**
 * 创建对话输入参数
 */
export interface CreateConversationInput {
  title?: string;
  petId: string;
  providerId?: string;
}

// ============================================================================
// Message 相关类型
// ============================================================================

/**
 * 消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * 消息实体
 */
export interface Message extends BaseEntity {
  conversationId: string;
  role: MessageRole;
  content: string;
  tokenCount: number | null;
  metadata: string | null; // JSON 格式的元数据
}

/**
 * 创建消息输入参数
 */
export interface CreateMessageInput {
  conversationId: string;
  role: MessageRole;
  content: string;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// AIProvider 相关类型
// ============================================================================

/**
 * AI 提供商类型
 */
export type AIProviderType = 'openai' | 'claude' | 'ollama';

/**
 * AI 提供商状态
 */
export type AIProviderStatus = 'active' | 'inactive' | 'error';

/**
 * AI 提供商实体
 */
export interface AIProvider extends BaseEntity {
  name: string;
  type: AIProviderType;
  baseUrl: string | null;
  modelId: string;
  isDefault: boolean;
  status: AIProviderStatus;
  lastUsedAt: Timestamp | null;
  config: string | null; // JSON 格式的配置
}

/**
 * 创建 AI 提供商输入参数
 */
export interface CreateAIProviderInput {
  name: string;
  type: AIProviderType;
  baseUrl?: string;
  modelId: string;
  isDefault?: boolean;
  config?: Record<string, unknown>;
}

/**
 * 更新 AI 提供商输入参数
 */
export interface UpdateAIProviderInput {
  name?: string;
  baseUrl?: string;
  modelId?: string;
  isDefault?: boolean;
  status?: AIProviderStatus;
  config?: Record<string, unknown>;
}

// ============================================================================
// Reminder 相关类型
// ============================================================================

/**
 * 提醒重复类型
 */
export type ReminderRepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * 提醒状态
 */
export type ReminderStatus = 'pending' | 'triggered' | 'dismissed' | 'snoozed';

/**
 * 提醒实体
 */
export interface Reminder extends BaseEntity {
  title: string;
  description: string | null;
  triggerAt: Timestamp;
  repeatType: ReminderRepeatType;
  repeatInterval: number | null;
  status: ReminderStatus;
  snoozedUntil: Timestamp | null;
  conversationId: string | null; // 关联的对话ID
}

/**
 * 创建提醒输入参数
 */
export interface CreateReminderInput {
  title: string;
  description?: string;
  triggerAt: Timestamp;
  repeatType?: ReminderRepeatType;
  repeatInterval?: number;
  conversationId?: string;
}

/**
 * 更新提醒输入参数
 */
export interface UpdateReminderInput {
  title?: string;
  description?: string;
  triggerAt?: Timestamp;
  repeatType?: ReminderRepeatType;
  repeatInterval?: number;
  status?: ReminderStatus;
  snoozedUntil?: Timestamp;
}

// ============================================================================
// Settings 相关类型
// ============================================================================

/**
 * 应用设置键
 */
export type SettingKey =
  | 'theme'
  | 'language'
  | 'autoStart'
  | 'alwaysOnTop'
  | 'defaultProviderId'
  | 'voiceEnabled'
  | 'voiceLanguage'
  | 'notificationsEnabled'
  | 'petScale'
  | 'animationSpeed';

/**
 * 设置实体
 */
export interface Setting extends BaseEntity {
  key: SettingKey;
  value: string; // JSON 编码的值
  description: string | null;
}

/**
 * 设置值类型映射
 */
export interface SettingsMap {
  theme: 'light' | 'dark' | 'system';
  language: string;
  autoStart: boolean;
  alwaysOnTop: boolean;
  defaultProviderId: string | null;
  voiceEnabled: boolean;
  voiceLanguage: string;
  notificationsEnabled: boolean;
  petScale: number;
  animationSpeed: number;
}

// ============================================================================
// MCP 相关类型
// ============================================================================

/**
 * MCP 服务器状态
 */
export type MCPServerStatus = 'stopped' | 'starting' | 'running' | 'error';

/**
 * MCP 服务器配置
 */
export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP 资源定义
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// ============================================================================
// Skill 相关类型
// ============================================================================

/**
 * 技能元数据
 */
export interface SkillMeta {
  name: string;
  version: string;
  description: string;
  author?: string;
  dependencies?: string[];
  mcpServers?: string[];
  triggers?: string[];
}

/**
 * 技能状态
 */
export type SkillStatus = 'enabled' | 'disabled' | 'error';

/**
 * 技能实例
 */
export interface Skill {
  id: string;
  meta: SkillMeta;
  status: SkillStatus;
  instructionPath: string;
  lastUsedAt: Timestamp | null;
}

// ============================================================================
// 查询与过滤类型
// ============================================================================

/**
 * 分页参数
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  offset?: number;
  limit?: number;
}

/**
 * 排序参数
 */
export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 消息查询参数
 */
export interface MessageQueryParams extends PaginationParams {
  conversationId: string;
  role?: MessageRole;
}

/**
 * 对话查询参数
 */
export interface ConversationQueryParams extends PaginationParams, SortParams {
  petId?: string;
  isArchived?: boolean;
}

/**
 * 提醒查询参数
 */
export interface ReminderQueryParams extends PaginationParams {
  status?: ReminderStatus;
  fromDate?: Timestamp;
  toDate?: Timestamp;
}