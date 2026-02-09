/**
 * 共享类型定义统一导出
 * 
 * 此文件整合导出所有类型定义，方便其他模块使用
 * 
 * @example
 * ```typescript
 * import { Pet, IEventBus, IChatCapability, EventTypes } from '@/shared/types';
 * ```
 */

// ============================================================================
// 数据模型类型
// ============================================================================
export type {
  // 基础类型
  BaseEntity,
  Timestamp,
  
  // Pet 相关
  PetAnimationState,
  Pet,
  CreatePetInput,
  UpdatePetInput,
  
  // PetSkin 相关
  SkinSource,
  PetSkin,
  CreatePetSkinInput,
  
  // Conversation 相关
  Conversation,
  CreateConversationInput,
  
  // Message 相关
  MessageRole,
  Message,
  CreateMessageInput,
  
  // AIProvider 相关
  AIProviderType,
  AIProviderStatus,
  AIProvider,
  CreateAIProviderInput,
  UpdateAIProviderInput,
  
  // Reminder 相关
  ReminderRepeatType,
  ReminderStatus,
  Reminder,
  CreateReminderInput,
  UpdateReminderInput,
  
  // Settings 相关
  SettingKey,
  Setting,
  SettingsMap,
  
  // MCP 相关
  MCPServerStatus,
  MCPServerConfig,
  MCPTool,
  MCPResource,
  
  // Skill 相关
  SkillMeta,
  SkillStatus,
  Skill,
  
  // 查询类型
  PaginationParams,
  SortParams,
  PaginatedResult,
  MessageQueryParams,
  ConversationQueryParams,
  ReminderQueryParams,
} from './models';

// ============================================================================
// 事件总线类型
// ============================================================================
export {
  // 枚举
  EventPriority,
  // 常量
  DEFAULT_EVENT_BUS_CONFIG,
} from './event-bus';

export type {
  // 基础类型
  EventId,
  BaseEvent,
  CreateEventParams,
  
  // 处理器类型
  EventHandler,
  EventHandlerConfig,
  RegisteredHandler,
  
  // 订阅类型
  SubscriptionToken,
  SubscribeOptions,
  
  // 事件总线接口
  IEventBus,
  EventBusConfig,
  
  // 历史记录类型
  EventHistoryItem,
  IEventHistory,
  
  // 中间件类型
  EventMiddlewareContext,
  EventMiddlewareNext,
  EventMiddleware,
  IEventBusWithMiddleware,
  
  // IPC 类型
  IPCChannel,
  IPCDirection,
  IPCEventDefinition,
  IIPCEventBus,
  
  // 工厂类型
  EventFactory,
  TypedEventFactory,
} from './event-bus';

// 类型守卫
export { isBaseEvent, isCreateEventParams } from './event-bus';

// ============================================================================
// 事件类型常量与负载
// ============================================================================
export { EventTypes, CapabilityEvents } from './events';

export type {
  // Pet 事件负载
  PetCreatedPayload,
  PetUpdatedPayload,
  PetDeletedPayload,
  PetPositionChangedPayload,
  PetAnimationChangedPayload,
  PetVisibilityChangedPayload,
  PetSkinChangedPayload,
  PetInteractionPayload,
  
  // 窗口事件负载
  WindowCreatedPayload,
  WindowClosedPayload,
  WindowMovedPayload,
  WindowResizedPayload,
  WindowDisplayChangedPayload,
  
  // AI 事件负载
  AIChatStartedPayload,
  AIChatMessagePayload,
  AIChatResponsePayload,
  AIChatErrorPayload,
  AIChatCompletedPayload,
  AIProviderChangedPayload,
  AIProviderStatusChangedPayload,
  AIStreamingChunkPayload,
  AIStreamingEndPayload,
  AITokenUsagePayload,
  
  // 对话事件负载
  ConversationCreatedPayload,
  ConversationUpdatedPayload,
  ConversationDeletedPayload,
  ConversationArchivedPayload,
  ConversationMessageAddedPayload,
  ConversationClearedPayload,
  
  // MCP 事件负载
  MCPServerStartingPayload,
  MCPServerStartedPayload,
  MCPServerStoppedPayload,
  MCPServerErrorPayload,
  MCPToolCalledPayload,
  MCPToolResultPayload,
  MCPResourceReadPayload,
  
  // 技能事件负载
  SkillLoadedPayload,
  SkillUnloadedPayload,
  SkillActivatedPayload,
  SkillDeactivatedPayload,
  SkillErrorPayload,
  SkillExecutedPayload,
  
  // 提醒事件负载
  ReminderCreatedPayload,
  ReminderUpdatedPayload,
  ReminderDeletedPayload,
  ReminderTriggeredPayload,
  ReminderDismissedPayload,
  ReminderSnoozedPayload,
  
  // 语音事件负载
  VoiceRecognitionStartedPayload,
  VoiceRecognitionResultPayload,
  VoiceRecognitionErrorPayload,
  VoiceRecognitionEndedPayload,
  VoiceSynthesisStartedPayload,
  VoiceSynthesisEndedPayload,
  VoiceSynthesisErrorPayload,
  
  // 皮肤事件负载
  SkinCreatedPayload,
  SkinDeletedPayload,
  SkinGenerationStartedPayload,
  SkinGenerationProgressPayload,
  SkinGenerationCompletedPayload,
  SkinGenerationErrorPayload,
  
  // 设置事件负载
  SettingsChangedPayload,
  SettingsResetPayload,
  SettingsImportedPayload,
  SettingsExportedPayload,
  
  // 应用生命周期事件负载
  AppReadyPayload,
  AppBeforeQuitPayload,
  AppQuitPayload,
  AppUpdateAvailablePayload,
  AppUpdateDownloadedPayload,
  AppErrorPayload,
  
  // 系统事件负载
  SystemTrayClickPayload,
  SystemShortcutTriggeredPayload,
  SystemDisplayAddedPayload,
  SystemDisplayRemovedPayload,
  
  // 数据库事件负载
  DatabaseConnectedPayload,
  DatabaseDisconnectedPayload,
  DatabaseMigrationStartedPayload,
  DatabaseMigrationCompletedPayload,
  DatabaseMigrationErrorPayload,
  DatabaseBackupCreatedPayload,
  
  // 事件类型映射
  EventPayloadMap,
  EventPayload,
  TypedEvent,
  TypedCreateEventParams,
  AllEventTypes,
  EventTypeValue,
  CreateTypedEvent,
} from './events';

// ============================================================================
// 能力接口类型
// ============================================================================
export {
  // 默认配置
  DEFAULT_VOICE_RECOGNITION_CONFIG,
  DEFAULT_VOICE_SYNTHESIS_CONFIG,
  DEFAULT_AGENT_CONFIG,
  // 类型守卫
  isChatCapability,
  isMCPCapability,
  isSkillsCapability,
  isMemoryCapability,
  isAgentCapability,
  isVoiceCapability,
} from './capabilities';

export type {
  // 基础类型
  CapabilityId,
  CapabilityType,
  CapabilityStatus,
  CapabilityMetadata,
  ICapability,
  CapabilityHealthStatus,
  
  // Chat 能力
  ChatMessageInput,
  ChatRequestOptions,
  ChatResponse,
  StreamingCallbacks,
  IChatCapability,
  
  // MCP 能力
  MCPServerRuntime,
  MCPToolCallParams,
  MCPToolCallResult,
  MCPResourceReadParams,
  MCPResourceReadResult,
  IMCPCapability,
  
  // Skills 能力
  SkillExecutionContext,
  SkillExecutionResult,
  SkillMatchResult,
  ISkillsCapability,
  
  // Memory 能力
  MemoryType,
  MemoryEntry,
  MemorySearchParams,
  MemorySearchResult,
  MemoryStats,
  IMemoryCapability,
  
  // Agent 能力
  AgentThought,
  AgentPlan,
  AgentExecutionContext,
  AgentExecutionResult,
  AgentConfig,
  IAgentCapability,
  
  // Voice 能力
  VoiceRecognitionConfig,
  VoiceRecognitionResult,
  VoiceSynthesisConfig,
  VoiceSynthesisResult,
  VoiceInfo,
  IVoiceCapability,
  
  // 能力注册表
  CapabilityRegistration,
  ICapabilityRegistry,
  
  // 能力工厂
  CapabilityFactory,
  CapabilityFactoryRegistry,
} from './capabilities';