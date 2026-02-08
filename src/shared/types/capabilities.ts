/**
 * 能力接口类型定义
 * 定义所有AI能力的接口和类型
 * 
 * 6种AI能力：
 * - Chat能力: AI对话功能
 * - MCP能力: MCP服务器管理
 * - Skills能力: 技能系统
 * - Memory能力: 记忆系统
 * - Agent能力: Agent系统
 * - Voice能力: 语音交互
 */

import type {
  AIProvider,
  AIProviderType,
  Conversation,
  Message,
  MessageRole,
  MCPServerConfig,
  MCPTool,
  MCPResource,
  Skill,
  SkillMeta,
} from './models';

// ============================================================================
// 能力基础类型
// ============================================================================

/**
 * 能力唯一标识符
 */
export type CapabilityId = string;

/**
 * 能力类型枚举
 */
export type CapabilityType = 'chat' | 'mcp' | 'skills' | 'memory' | 'agent' | 'voice';

/**
 * 能力状态
 */
export type CapabilityStatus = 'uninitialized' | 'initializing' | 'ready' | 'error' | 'disabled';

/**
 * 能力元数据
 */
export interface CapabilityMetadata {
  /** 能力ID */
  id: CapabilityId;
  /** 能力类型 */
  type: CapabilityType;
  /** 能力名称 */
  name: string;
  /** 能力描述 */
  description: string;
  /** 版本号 */
  version: string;
  /** 依赖的其他能力 */
  dependencies?: CapabilityType[];
  /** 是否为必需能力 */
  required?: boolean;
}

/**
 * 能力基础接口 - 所有能力必须实现
 */
export interface ICapability {
  /** 能力元数据 */
  readonly metadata: CapabilityMetadata;
  /** 当前状态 */
  readonly status: CapabilityStatus;
  
  /**
   * 初始化能力
   * @returns 初始化是否成功
   */
  initialize(): Promise<boolean>;
  
  /**
   * 销毁能力，释放资源
   */
  destroy(): Promise<void>;
  
  /**
   * 检查能力是否就绪
   */
  isReady(): boolean;
  
  /**
   * 获取能力健康状态
   */
  healthCheck(): Promise<CapabilityHealthStatus>;
}

/**
 * 能力健康状态
 */
export interface CapabilityHealthStatus {
  healthy: boolean;
  status: CapabilityStatus;
  message?: string;
  details?: Record<string, unknown>;
  lastChecked: Date;
}

// ============================================================================
// Chat 能力类型
// ============================================================================

/**
 * 聊天消息输入
 */
export interface ChatMessageInput {
  role: MessageRole;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * 聊天请求选项
 */
export interface ChatRequestOptions {
  /** 使用的 AI 提供商 ID */
  providerId?: string;
  /** 对话 ID */
  conversationId?: string;
  /** 是否启用流式响应 */
  stream?: boolean;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 历史消息上下文 */
  context?: ChatMessageInput[];
  /** 温度参数 (0-2) */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 超时时间 (毫秒) */
  timeout?: number;
  /** 停止序列 */
  stopSequences?: string[];
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  /** 消息 ID */
  messageId: string;
  /** 响应内容 */
  content: string;
  /** 消息角色 */
  role: MessageRole;
  /** 使用的提供商 ID */
  providerId: string;
  /** token 使用统计 */
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 响应时间 (毫秒) */
  responseTime: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 流式聊天回调
 */
export interface StreamingCallbacks {
  /** 收到数据块时调用 */
  onChunk?: (chunk: string, index: number) => void;
  /** 流式传输结束时调用 */
  onComplete?: (fullContent: string) => void;
  /** 发生错误时调用 */
  onError?: (error: Error) => void;
}

/**
 * Chat 能力接口
 */
export interface IChatCapability extends ICapability {
  /**
   * 发送聊天消息
   * @param message 用户消息
   * @param options 请求选项
   * @returns 聊天响应
   */
  chat(message: string, options?: ChatRequestOptions): Promise<ChatResponse>;
  
  /**
   * 发送流式聊天消息
   * @param message 用户消息
   * @param callbacks 流式回调
   * @param options 请求选项
   * @returns 聊天响应
   */
  chatStream(
    message: string,
    callbacks: StreamingCallbacks,
    options?: ChatRequestOptions
  ): Promise<ChatResponse>;
  
  /**
   * 获取所有可用的 AI 提供商
   */
  getProviders(): Promise<AIProvider[]>;
  
  /**
   * 获取当前活跃的提供商
   */
  getActiveProvider(): AIProvider | null;
  
  /**
   * 设置活跃的提供商
   * @param providerId 提供商 ID
   */
  setActiveProvider(providerId: string): Promise<void>;
  
  /**
   * 添加 AI 提供商
   * @param provider 提供商配置
   */
  addProvider(provider: Omit<AIProvider, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIProvider>;
  
  /**
   * 移除 AI 提供商
   * @param providerId 提供商 ID
   */
  removeProvider(providerId: string): Promise<void>;
  
  /**
   * 测试提供商连接
   * @param providerId 提供商 ID
   */
  testProvider(providerId: string): Promise<boolean>;
  
  /**
   * 创建新对话
   * @param title 对话标题
   * @param petId 宠物 ID
   */
  createConversation(title: string, petId: string): Promise<Conversation>;
  
  /**
   * 获取对话历史
   * @param conversationId 对话 ID
   * @param limit 消息数量限制
   */
  getConversationHistory(conversationId: string, limit?: number): Promise<Message[]>;
  
  /**
   * 清除对话历史
   * @param conversationId 对话 ID
   */
  clearConversation(conversationId: string): Promise<void>;
}

// ============================================================================
// MCP 能力类型
// ============================================================================

/**
 * MCP 服务器运行时状态
 */
export interface MCPServerRuntime {
  name: string;
  config: MCPServerConfig;
  status: 'stopped' | 'starting' | 'running' | 'error';
  pid?: number;
  startedAt?: Date;
  tools: MCPTool[];
  resources: MCPResource[];
  error?: Error;
}

/**
 * MCP 工具调用参数
 */
export interface MCPToolCallParams {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  timeout?: number;
}

/**
 * MCP 工具调用结果
 */
export interface MCPToolCallResult {
  callId: string;
  serverName: string;
  toolName: string;
  result: unknown;
  executionTime: number;
  isError: boolean;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * MCP 资源读取参数
 */
export interface MCPResourceReadParams {
  serverName: string;
  uri: string;
}

/**
 * MCP 资源读取结果
 */
export interface MCPResourceReadResult {
  uri: string;
  content: unknown;
  mimeType?: string;
}

/**
 * MCP 能力接口
 */
export interface IMCPCapability extends ICapability {
  /**
   * 注册 MCP 服务器配置
   * @param config 服务器配置
   */
  registerServer(config: MCPServerConfig): Promise<void>;
  
  /**
   * 注销 MCP 服务器
   * @param serverName 服务器名称
   */
  unregisterServer(serverName: string): Promise<void>;
  
  /**
   * 启动 MCP 服务器
   * @param serverName 服务器名称
   */
  startServer(serverName: string): Promise<void>;
  
  /**
   * 停止 MCP 服务器
   * @param serverName 服务器名称
   */
  stopServer(serverName: string): Promise<void>;
  
  /**
   * 重启 MCP 服务器
   * @param serverName 服务器名称
   */
  restartServer(serverName: string): Promise<void>;
  
  /**
   * 启动所有已启用的服务器
   */
  startAllServers(): Promise<void>;
  
  /**
   * 停止所有服务器
   */
  stopAllServers(): Promise<void>;
  
  /**
   * 获取所有服务器状态
   */
  getServersStatus(): Map<string, MCPServerRuntime>;
  
  /**
   * 获取指定服务器状态
   * @param serverName 服务器名称
   */
  getServerStatus(serverName: string): MCPServerRuntime | undefined;
  
  /**
   * 获取所有可用工具
   */
  getAllTools(): MCPTool[];
  
  /**
   * 获取指定服务器的工具
   * @param serverName 服务器名称
   */
  getServerTools(serverName: string): MCPTool[];
  
  /**
   * 调用 MCP 工具
   * @param params 调用参数
   */
  callTool(params: MCPToolCallParams): Promise<MCPToolCallResult>;
  
  /**
   * 获取所有可用资源
   */
  getAllResources(): MCPResource[];
  
  /**
   * 获取指定服务器的资源
   * @param serverName 服务器名称
   */
  getServerResources(serverName: string): MCPResource[];
  
  /**
   * 读取 MCP 资源
   * @param params 读取参数
   */
  readResource(params: MCPResourceReadParams): Promise<MCPResourceReadResult>;
}

// ============================================================================
// Skills 能力类型
// ============================================================================

/**
 * 技能执行上下文
 */
export interface SkillExecutionContext {
  /** 触发技能的用户输入 */
  userInput: string;
  /** 对话上下文 */
  conversationContext?: ChatMessageInput[];
  /** 相关的 MCP 工具 */
  availableTools?: MCPTool[];
  /** 用户设置 */
  userSettings?: Record<string, unknown>;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 技能执行结果
 */
export interface SkillExecutionResult {
  /** 技能 ID */
  skillId: string;
  /** 是否成功 */
  success: boolean;
  /** 输出内容 */
  output: string;
  /** 执行时间 (毫秒) */
  executionTime: number;
  /** 使用的 MCP 工具 */
  toolsUsed?: string[];
  /** 建议的宠物动画 */
  suggestedAnimation?: string;
  /** 错误信息 */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 技能匹配结果
 */
export interface SkillMatchResult {
  /** 匹配到的技能 */
  skill: Skill;
  /** 匹配置信度 (0-1) */
  confidence: number;
  /** 匹配的触发词 */
  matchedTrigger?: string;
}

/**
 * Skills 能力接口
 */
export interface ISkillsCapability extends ICapability {
  /**
   * 加载技能
   * @param skillPath 技能目录路径
   */
  loadSkill(skillPath: string): Promise<Skill>;
  
  /**
   * 卸载技能
   * @param skillId 技能 ID
   */
  unloadSkill(skillId: string): Promise<void>;
  
  /**
   * 重新加载技能
   * @param skillId 技能 ID
   */
  reloadSkill(skillId: string): Promise<Skill>;
  
  /**
   * 加载所有技能
   * @param skillsDirectory 技能目录
   */
  loadAllSkills(skillsDirectory: string): Promise<Skill[]>;
  
  /**
   * 获取所有已加载的技能
   */
  getSkills(): Skill[];
  
  /**
   * 获取指定技能
   * @param skillId 技能 ID
   */
  getSkill(skillId: string): Skill | undefined;
  
  /**
   * 启用技能
   * @param skillId 技能 ID
   */
  enableSkill(skillId: string): Promise<void>;
  
  /**
   * 禁用技能
   * @param skillId 技能 ID
   */
  disableSkill(skillId: string): Promise<void>;
  
  /**
   * 根据用户输入匹配技能
   * @param userInput 用户输入
   * @param topK 返回前 K 个匹配结果
   */
  matchSkills(userInput: string, topK?: number): Promise<SkillMatchResult[]>;
  
  /**
   * 执行技能
   * @param skillId 技能 ID
   * @param context 执行上下文
   */
  executeSkill(skillId: string, context: SkillExecutionContext): Promise<SkillExecutionResult>;
  
  /**
   * 获取技能指令内容
   * @param skillId 技能 ID
   */
  getSkillInstruction(skillId: string): Promise<string>;
}

// ============================================================================
// Memory 能力类型
// ============================================================================

/**
 * 记忆类型
 */
export type MemoryType = 'short_term' | 'long_term' | 'episodic' | 'semantic';

/**
 * 记忆条目
 */
export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  embedding?: number[];
  importance: number; // 0-1
  timestamp: Date;
  accessCount: number;
  lastAccessedAt: Date;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

/**
 * 记忆搜索参数
 */
export interface MemorySearchParams {
  query: string;
  type?: MemoryType;
  tags?: string[];
  minImportance?: number;
  limit?: number;
  includeEmbeddings?: boolean;
}

/**
 * 记忆搜索结果
 */
export interface MemorySearchResult {
  entry: MemoryEntry;
  relevanceScore: number;
}

/**
 * 记忆统计
 */
export interface MemoryStats {
  totalEntries: number;
  entriesByType: Record<MemoryType, number>;
  averageImportance: number;
  oldestEntry?: Date;
  newestEntry?: Date;
  storageSize: number;
}

/**
 * Memory 能力接口
 */
export interface IMemoryCapability extends ICapability {
  /**
   * 存储记忆
   * @param content 记忆内容
   * @param type 记忆类型
   * @param metadata 元数据
   */
  store(
    content: string,
    type: MemoryType,
    metadata?: Record<string, unknown>
  ): Promise<MemoryEntry>;
  
  /**
   * 检索记忆
   * @param id 记忆 ID
   */
  retrieve(id: string): Promise<MemoryEntry | null>;
  
  /**
   * 搜索记忆
   * @param params 搜索参数
   */
  search(params: MemorySearchParams): Promise<MemorySearchResult[]>;
  
  /**
   * 更新记忆重要性
   * @param id 记忆 ID
   * @param importance 新的重要性分数
   */
  updateImportance(id: string, importance: number): Promise<void>;
  
  /**
   * 删除记忆
   * @param id 记忆 ID
   */
  delete(id: string): Promise<void>;
  
  /**
   * 清除指定类型的记忆
   * @param type 记忆类型
   */
  clearByType(type: MemoryType): Promise<number>;
  
  /**
   * 清除所有记忆
   */
  clearAll(): Promise<void>;
  
  /**
   * 获取记忆统计
   */
  getStats(): Promise<MemoryStats>;
  
  /**
   * 整合记忆（将短期记忆转为长期记忆）
   * @param threshold 重要性阈值
   */
  consolidate(threshold?: number): Promise<number>;
  
  /**
   * 遗忘低重要性记忆
   * @param threshold 重要性阈值
   * @param olderThan 时间阈值
   */
  forget(threshold: number, olderThan?: Date): Promise<number>;
  
  /**
   * 为内容生成嵌入向量
   * @param content 内容
   */
  generateEmbedding(content: string): Promise<number[]>;
}

// ============================================================================
// Agent 能力类型
// ============================================================================

/**
 * Agent 思考步骤
 */
export interface AgentThought {
  step: number;
  thought: string;
  action?: string;
  actionInput?: Record<string, unknown>;
  observation?: string;
  timestamp: Date;
}

/**
 * Agent 执行计划
 */
export interface AgentPlan {
  goal: string;
  steps: string[];
  currentStep: number;
  status: 'planning' | 'executing' | 'completed' | 'failed';
}

/**
 * Agent 执行上下文
 */
export interface AgentExecutionContext {
  /** 用户请求 */
  userRequest: string;
  /** 可用工具 */
  availableTools: MCPTool[];
  /** 可用技能 */
  availableSkills: Skill[];
  /** 相关记忆 */
  relevantMemories?: MemoryEntry[];
  /** 最大思考步骤 */
  maxSteps?: number;
  /** 超时时间 (毫秒) */
  timeout?: number;
}

/**
 * Agent 执行结果
 */
export interface AgentExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 最终响应 */
  response: string;
  /** 思考过程 */
  thoughts: AgentThought[];
  /** 执行计划 */
  plan?: AgentPlan;
  /** 使用的工具 */
  toolsUsed: string[];
  /** 使用的技能 */
  skillsUsed: string[];
  /** 总执行时间 (毫秒) */
  executionTime: number;
  /** 错误信息 */
  error?: {
    code: string;
    message: string;
    step?: number;
  };
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  /** Agent 名称 */
  name: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 最大思考步骤 */
  maxSteps: number;
  /** 默认超时时间 */
  defaultTimeout: number;
  /** 是否启用规划 */
  enablePlanning: boolean;
  /** 是否启用反思 */
  enableReflection: boolean;
}

/**
 * Agent 能力接口
 */
export interface IAgentCapability extends ICapability {
  /**
   * 执行 Agent 任务
   * @param context 执行上下文
   */
  execute(context: AgentExecutionContext): Promise<AgentExecutionResult>;
  
  /**
   * 创建执行计划
   * @param goal 目标
   * @param context 上下文
   */
  createPlan(goal: string, context: AgentExecutionContext): Promise<AgentPlan>;
  
  /**
   * 执行计划中的单个步骤
   * @param plan 执行计划
   * @param context 上下文
   */
  executeStep(plan: AgentPlan, context: AgentExecutionContext): Promise<AgentThought>;
  
  /**
   * 反思执行结果
   * @param result 执行结果
   */
  reflect(result: AgentExecutionResult): Promise<string>;
  
  /**
   * 获取 Agent 配置
   */
  getConfig(): AgentConfig;
  
  /**
   * 更新 Agent 配置
   * @param config 配置更新
   */
  updateConfig(config: Partial<AgentConfig>): Promise<void>;
  
  /**
   * 中止正在执行的任务
   */
  abort(): Promise<void>;
  
  /**
   * 获取当前执行状态
   */
  getExecutionStatus(): {
    isExecuting: boolean;
    currentStep?: number;
    currentThought?: AgentThought;
  };
}

// ============================================================================
// Voice 能力类型
// ============================================================================

/**
 * 语音识别配置
 */
export interface VoiceRecognitionConfig {
  /** 语言代码 (e.g., 'zh-CN', 'en-US') */
  language: string;
  /** 是否持续识别 */
  continuous: boolean;
  /** 是否返回中间结果 */
  interimResults: boolean;
  /** 最大静音时间 (毫秒) */
  maxSilence?: number;
  /** 超时时间 (毫秒) */
  timeout?: number;
}

/**
 * 语音识别结果
 */
export interface VoiceRecognitionResult {
  /** 识别到的文本 */
  transcript: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 是否为最终结果 */
  isFinal: boolean;
  /** 语言代码 */
  language: string;
  /** 识别耗时 (毫秒) */
  processingTime?: number;
}

/**
 * 语音合成配置
 */
export interface VoiceSynthesisConfig {
  /** 语音名称/ID */
  voice: string;
  /** 语言代码 */
  language: string;
  /** 语速 (0.1-10) */
  rate: number;
  /** 音调 (0-2) */
  pitch: number;
  /** 音量 (0-1) */
  volume: number;
}

/**
 * 语音合成结果
 */
export interface VoiceSynthesisResult {
  /** 合成的文本 */
  text: string;
  /** 音频时长 (毫秒) */
  duration: number;
  /** 音频数据 (可选) */
  audioData?: ArrayBuffer;
}

/**
 * 可用语音信息
 */
export interface VoiceInfo {
  /** 语音 ID */
  id: string;
  /** 语音名称 */
  name: string;
  /** 语言代码 */
  language: string;
  /** 是否为本地语音 */
  isLocal: boolean;
  /** 语音性别 */
  gender?: 'male' | 'female' | 'neutral';
}

/**
 * Voice 能力接口
 */
export interface IVoiceCapability extends ICapability {
  /**
   * 开始语音识别
   * @param config 识别配置
   */
  startRecognition(config?: Partial<VoiceRecognitionConfig>): Promise<void>;
  
  /**
   * 停止语音识别
   */
  stopRecognition(): Promise<VoiceRecognitionResult>;
  
  /**
   * 检查是否正在识别
   */
  isRecognizing(): boolean;
  
  /**
   * 监听识别结果
   * @param callback 结果回调
   */
  onRecognitionResult(
    callback: (result: VoiceRecognitionResult) => void
  ): () => void;
  
  /**
   * 监听识别错误
   * @param callback 错误回调
   */
  onRecognitionError(
    callback: (error: Error) => void
  ): () => void;
  
  /**
   * 合成语音
   * @param text 要合成的文本
   * @param config 合成配置
   */
  synthesize(
    text: string,
    config?: Partial<VoiceSynthesisConfig>
  ): Promise<VoiceSynthesisResult>;
  
  /**
   * 播放合成的语音
   * @param text 要播放的文本
   * @param config 合成配置
   */
  speak(text: string, config?: Partial<VoiceSynthesisConfig>): Promise<void>;
  
  /**
   * 停止语音播放
   */
  stopSpeaking(): Promise<void>;
  
  /**
   * 检查是否正在播放
   */
  isSpeaking(): boolean;
  
  /**
   * 获取可用的语音列表
   */
  getAvailableVoices(): Promise<VoiceInfo[]>;
  
  /**
   * 获取默认语音识别配置
   */
  getRecognitionConfig(): VoiceRecognitionConfig;
  
  /**
   * 设置默认语音识别配置
   * @param config 配置
   */
  setRecognitionConfig(config: Partial<VoiceRecognitionConfig>): void;
  
  /**
   * 获取默认语音合成配置
   */
  getSynthesisConfig(): VoiceSynthesisConfig;
  
  /**
   * 设置默认语音合成配置
   * @param config 配置
   */
  setSynthesisConfig(config: Partial<VoiceSynthesisConfig>): void;
  
  /**
   * 检查语音功能是否可用
   */
  checkAvailability(): Promise<{
    recognition: boolean;
    synthesis: boolean;
    reason?: string;
  }>;
}

// ============================================================================
// 能力注册表类型
// ============================================================================

/**
 * 能力注册信息
 */
export interface CapabilityRegistration<T extends ICapability = ICapability> {
  capability: T;
  registeredAt: Date;
  initializeOrder: number;
}

/**
 * 能力注册表接口
 */
export interface ICapabilityRegistry {
  /**
   * 注册能力
   * @param capability 能力实例
   */
  register<T extends ICapability>(capability: T): void;
  
  /**
   * 注销能力
   * @param type 能力类型
   */
  unregister(type: CapabilityType): void;
  
  /**
   * 获取能力
   * @param type 能力类型
   */
  get<T extends ICapability>(type: CapabilityType): T | undefined;
  
  /**
   * 检查能力是否已注册
   * @param type 能力类型
   */
  has(type: CapabilityType): boolean;
  
  /**
   * 获取所有已注册的能力
   */
  getAll(): Map<CapabilityType, CapabilityRegistration>;
  
  /**
   * 初始化所有能力（按依赖顺序）
   */
  initializeAll(): Promise<void>;
  
  /**
   * 销毁所有能力
   */
  destroyAll(): Promise<void>;
  
  /**
   * 获取所有能力的健康状态
   */
  healthCheckAll(): Promise<Map<CapabilityType, CapabilityHealthStatus>>;
}

// ============================================================================
// 类型守卫
// ============================================================================

/**
 * 检查是否为 Chat 能力
 */
export function isChatCapability(capability: ICapability): capability is IChatCapability {
  return capability.metadata.type === 'chat';
}

/**
 * 检查是否为 MCP 能力
 */
export function isMCPCapability(capability: ICapability): capability is IMCPCapability {
  return capability.metadata.type === 'mcp';
}

/**
 * 检查是否为 Skills 能力
 */
export function isSkillsCapability(capability: ICapability): capability is ISkillsCapability {
  return capability.metadata.type === 'skills';
}

/**
 * 检查是否为 Memory 能力
 */
export function isMemoryCapability(capability: ICapability): capability is IMemoryCapability {
  return capability.metadata.type === 'memory';
}

/**
 * 检查是否为 Agent 能力
 */
export function isAgentCapability(capability: ICapability): capability is IAgentCapability {
  return capability.metadata.type === 'agent';
}

/**
 * 检查是否为 Voice 能力
 */
export function isVoiceCapability(capability: ICapability): capability is IVoiceCapability {
  return capability.metadata.type === 'voice';
}

// ============================================================================
// 能力工厂类型
// ============================================================================

/**
 * 能力工厂函数类型
 */
export type CapabilityFactory<T extends ICapability> = (
  config?: Record<string, unknown>
) => T;

/**
 * 能力工厂注册表
 */
export interface CapabilityFactoryRegistry {
  /**
   * 注册能力工厂
   * @param type 能力类型
   * @param factory 工厂函数
   */
  registerFactory<T extends ICapability>(
    type: CapabilityType,
    factory: CapabilityFactory<T>
  ): void;
  
  /**
   * 获取能力工厂
   * @param type 能力类型
   */
  getFactory<T extends ICapability>(type: CapabilityType): CapabilityFactory<T> | undefined;
  
  /**
   * 创建能力实例
   * @param type 能力类型
   * @param config 配置
   */
  create<T extends ICapability>(type: CapabilityType, config?: Record<string, unknown>): T;
}

// ============================================================================
// 默认配置
// ============================================================================

/**
 * 默认语音识别配置
 */
export const DEFAULT_VOICE_RECOGNITION_CONFIG: VoiceRecognitionConfig = {
  language: 'zh-CN',
  continuous: false,
  interimResults: true,
  maxSilence: 3000,
  timeout: 30000,
};

/**
 * 默认语音合成配置
 */
export const DEFAULT_VOICE_SYNTHESIS_CONFIG: VoiceSynthesisConfig = {
  voice: 'default',
  language: 'zh-CN',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
};

/**
 * 默认 Agent 配置
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  name: 'PetAgent',
  systemPrompt: 'You are a helpful desktop pet assistant.',
  maxSteps: 10,
  defaultTimeout: 60000,
  enablePlanning: true,
  enableReflection: false,
};