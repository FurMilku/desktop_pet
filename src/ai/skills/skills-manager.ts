/**
 * Skills管理器
 * T079 [US4] 实现 Skills 管理器
 *
 * 功能:
 * - 技能注册与注销
 * - 技能发现与加载
 * - 技能执行
 * - 技能元数据管理
 * - 技能依赖验证
 * - 技能与MCP服务器集成
 *
 * @see specs/001-desktop-3d-pet/spec.md FR-012
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventBus } from '../../shared/services/event-bus';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 技能类别
 */
export type SkillCategory =
  | 'productivity'
  | 'information'
  | 'system'
  | 'entertainment'
  | 'custom';

/**
 * 技能参数类型
 */
export type SkillParameterType = 'string' | 'number' | 'boolean' | 'object' | 'array';

/**
 * 技能参数定义
 */
export interface SkillParameter {
  name: string;
  type: SkillParameterType;
  description: string;
  required: boolean;
  default?: unknown;
  enum?: unknown[];
}

/**
 * 技能示例
 */
export interface SkillExample {
  input: string;
  description: string;
}

/**
 * 技能元数据
 */
export interface SkillMeta {
  name: string;
  displayName: string;
  description: string;
  version: string;
  author?: string;
  category: SkillCategory;
  keywords: string[];
  capabilities: string[];
  mcpServers?: string[];
  parameters?: SkillParameter[];
  examples?: SkillExample[];
}

/**
 * 技能定义
 */
export interface Skill {
  meta: SkillMeta;
  promptTemplate: string;
  path: string;
  enabled: boolean;
}

/**
 * 技能执行上下文
 */
export interface SkillExecutionContext {
  skillName: string;
  parameters: Record<string, unknown>;
  conversationId?: string;
  userId?: string;
}

/**
 * MCP调用结果
 */
export interface MCPCallResult {
  serverName: string;
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * 技能执行结果
 */
export interface SkillExecutionResult {
  success: boolean;
  skillName: string;
  response?: string;
  data?: unknown;
  mcpCalls?: MCPCallResult[];
  error?: string;
  executionTime: number;
}

/**
 * 技能匹配结果
 */
export interface SkillMatchResult {
  skill: Skill;
  confidence: number;
  matchedKeywords: string[];
  suggestedParameters: Record<string, unknown>;
}

/**
 * Skills管理器配置
 */
export interface SkillsManagerConfig {
  skillsDirectory: string;
  autoLoad: boolean;
  enabledByDefault: boolean;
}

/**
 * MCP管理器接口（用于集成）
 */
export interface MCPManagerInterface {
  callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
  getServerStatus(name: string): string;
  listTools(serverName?: string): Array<{ server: string; name: string }>;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// Skills管理器实现
// ============================================================================

/**
 * Skills管理器
 * 负责技能的注册、发现、加载和执行
 */
export class SkillsManager {
  private static instance: SkillsManager | null = null;
  
  private skills: Map<string, Skill> = new Map();
  private config: SkillsManagerConfig;
  private mcpManager: MCPManagerInterface | null = null;
  private eventBus: EventBus;
  private initialized = false;

  /**
   * 构造函数
   */
  private constructor(config: Partial<SkillsManagerConfig> = {}) {
    this.config = {
      skillsDirectory: config.skillsDirectory || './src/skills',
      autoLoad: config.autoLoad ?? true,
      enabledByDefault: config.enabledByDefault ?? true,
    };
    this.eventBus = EventBus.getInstance();
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<SkillsManagerConfig>): SkillsManager {
    if (!SkillsManager.instance) {
      SkillsManager.instance = new SkillsManager(config);
    }
    return SkillsManager.instance;
  }

  /**
   * 重置单例（用于测试）
   */
  static resetInstance(): void {
    SkillsManager.instance = null;
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.config.autoLoad) {
      await this.loadSkillsFromDirectory(this.config.skillsDirectory);
    }

    this.initialized = true;
    this.eventBus.emit('skills:initialized', { skillCount: this.skills.size });
  }

  /**
   * 注册技能
   */
  registerSkill(skill: Skill): void {
    const validation = this.validateSkillMeta(skill.meta);
    if (!validation.valid) {
      throw new Error(`Invalid skill meta: ${validation.errors.join(', ')}`);
    }

    if (this.skills.has(skill.meta.name)) {
      throw new Error(`Skill already registered: ${skill.meta.name}`);
    }

    this.skills.set(skill.meta.name, {
      ...skill,
      enabled: skill.enabled ?? this.config.enabledByDefault,
    });

    this.eventBus.emit('skills:registered', { skillName: skill.meta.name });
  }

  /**
   * 注销技能
   */
  unregisterSkill(name: string): void {
    if (!this.skills.has(name)) {
      throw new Error(`Skill not found: ${name}`);
    }

    this.skills.delete(name);
    this.eventBus.emit('skills:unregistered', { skillName: name });
  }

  /**
   * 获取技能
   */
  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * 获取所有技能
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 按类别获取技能
   */
  getSkillsByCategory(category: SkillCategory): Skill[] {
    return Array.from(this.skills.values()).filter(
      (skill) => skill.meta.category === category
    );
  }

  /**
   * 获取启用的技能
   */
  getEnabledSkills(): Skill[] {
    return Array.from(this.skills.values()).filter((skill) => skill.enabled);
  }

  /**
   * 从目录加载技能
   */
  async loadSkillsFromDirectory(directory: string): Promise<number> {
    let loadedCount = 0;

    try {
      const entries = await fs.readdir(directory);

      for (const entry of entries) {
        const skillPath = path.join(directory, entry);
        const metaPath = path.join(skillPath, 'meta.json');
        const promptPath = path.join(skillPath, 'skill.md');

        try {
          const stat = await fs.stat(skillPath);
          if (!stat.isDirectory()) continue;

          // 检查必需文件是否存在
          let metaExists = false;
          let promptExists = false;

          try {
            await fs.access(metaPath);
            metaExists = true;
          } catch {
            // 文件不存在
          }

          try {
            await fs.access(promptPath);
            promptExists = true;
          } catch {
            // 文件不存在
          }

          if (!metaExists || !promptExists) continue;

          const metaContent = await fs.readFile(metaPath, 'utf-8');
          const promptContent = await fs.readFile(promptPath, 'utf-8');

          const meta = JSON.parse(metaContent) as SkillMeta;

          // 验证元数据
          const validation = this.validateSkillMeta(meta);
          if (!validation.valid) {
            console.warn(`Invalid skill meta for ${entry}: ${validation.errors.join(', ')}`);
            continue;
          }

          const skill: Skill = {
            meta,
            promptTemplate: promptContent,
            path: skillPath,
            enabled: this.config.enabledByDefault,
          };

          // 直接添加，避免重复验证
          if (!this.skills.has(meta.name)) {
            this.skills.set(meta.name, skill);
            loadedCount++;
          }
        } catch (error) {
          // 跳过无效技能
          console.warn(`Failed to load skill from ${entry}:`, error);
          continue;
        }
      }

      this.eventBus.emit('skills:loaded', { count: loadedCount, directory });
      return loadedCount;
    } catch (error) {
      console.warn(`Failed to read skills directory ${directory}:`, error);
      return 0;
    }
  }

  /**
   * 重新加载技能
   */
  async reloadSkills(): Promise<void> {
    this.skills.clear();
    await this.loadSkillsFromDirectory(this.config.skillsDirectory);
    this.eventBus.emit('skills:reloaded', { skillCount: this.skills.size });
  }

  /**
   * 启用技能
   */
  enableSkill(name: string): void {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }
    skill.enabled = true;
    this.eventBus.emit('skills:enabled', { skillName: name });
  }

  /**
   * 禁用技能
   */
  disableSkill(name: string): void {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }
    skill.enabled = false;
    this.eventBus.emit('skills:disabled', { skillName: name });
  }

  /**
   * 检查技能是否启用
   */
  isSkillEnabled(name: string): boolean {
    const skill = this.skills.get(name);
    return skill?.enabled ?? false;
  }

  /**
   * 匹配单个技能
   */
  matchSkill(userInput: string): SkillMatchResult | null {
    const results = this.matchSkills(userInput, 1);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * 匹配多个技能
   */
  matchSkills(userInput: string, limit: number = 5): SkillMatchResult[] {
    const input = userInput.toLowerCase();
    const results: SkillMatchResult[] = [];

    for (const skill of this.skills.values()) {
      if (!skill.enabled) continue;

      const matchedKeywords: string[] = [];
      let confidence = 0;

      // 关键词匹配
      for (const keyword of skill.meta.keywords) {
        if (input.includes(keyword.toLowerCase())) {
          matchedKeywords.push(keyword);
          confidence += 0.2;
        }
      }

      // 技能名称匹配
      if (input.includes(skill.meta.name.toLowerCase())) {
        confidence += 0.3;
      }

      // 显示名称匹配
      if (input.includes(skill.meta.displayName.toLowerCase())) {
        confidence += 0.25;
      }

      // 能力匹配
      for (const capability of skill.meta.capabilities) {
        if (input.includes(capability.toLowerCase())) {
          confidence += 0.15;
        }
      }

      // 限制最大置信度
      confidence = Math.min(confidence, 1.0);

      if (confidence > 0) {
        results.push({
          skill,
          confidence,
          matchedKeywords,
          suggestedParameters: this.extractParameters(skill, userInput),
        });
      }
    }

    // 按置信度排序
    results.sort((a, b) => b.confidence - a.confidence);

    return results.slice(0, limit);
  }

  /**
   * 从用户输入提取参数
   */
  private extractParameters(skill: Skill, userInput: string): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};

    if (!skill.meta.parameters) return parameters;

    // 设置默认值
    for (const param of skill.meta.parameters) {
      if (param.default !== undefined) {
        parameters[param.name] = param.default;
      }
    }

    // TODO: 实现更智能的参数提取
    // 可以使用正则表达式或NLP来从用户输入中提取参数值

    return parameters;
  }

  /**
   * 执行技能
   */
  async executeSkill(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const skill = this.skills.get(context.skillName);

    if (!skill) {
      return {
        success: false,
        skillName: context.skillName,
        error: `Skill not found: ${context.skillName}`,
        executionTime: Date.now() - startTime,
      };
    }

    if (!skill.enabled) {
      return {
        success: false,
        skillName: context.skillName,
        error: `Skill is disabled: ${context.skillName}`,
        executionTime: Date.now() - startTime,
      };
    }

    // 验证参数
    const validation = this.validateParameters(context.skillName, context.parameters);
    if (!validation.valid) {
      return {
        success: false,
        skillName: context.skillName,
        error: `Invalid parameters: ${validation.errors.join(', ')}`,
        executionTime: Date.now() - startTime,
      };
    }

    // 检查MCP服务器依赖
    const mcpCalls: MCPCallResult[] = [];
    if (skill.meta.mcpServers && skill.meta.mcpServers.length > 0) {
      if (!this.mcpManager) {
        return {
          success: false,
          skillName: context.skillName,
          error: 'MCP manager not available',
          executionTime: Date.now() - startTime,
        };
      }

      // 检查所需MCP服务器状态
      for (const serverName of skill.meta.mcpServers) {
        const status = this.mcpManager.getServerStatus(serverName);
        if (status !== 'running') {
          return {
            success: false,
            skillName: context.skillName,
            error: `Required MCP server not running: ${serverName}`,
            executionTime: Date.now() - startTime,
            mcpCalls,
          };
        }
      }
    }

    try {
      // 构建提示词
      const prompt = this.buildPrompt(context.skillName, context.parameters);

      this.eventBus.emit('skills:executed', {
        skillName: context.skillName,
        success: true,
      });

      return {
        success: true,
        skillName: context.skillName,
        response: prompt,
        data: context.parameters,
        mcpCalls,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.eventBus.emit('skills:executed', {
        skillName: context.skillName,
        success: false,
        error: errorMessage,
      });

      return {
        success: false,
        skillName: context.skillName,
        error: errorMessage,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 构建提示词
   */
  buildPrompt(skillName: string, parameters: Record<string, unknown>): string {
    const skill = this.skills.get(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }

    let prompt = skill.promptTemplate;

    // 替换参数占位符
    for (const [key, value] of Object.entries(parameters)) {
      const placeholder = `{{${key}}}`;
      prompt = prompt.replace(new RegExp(placeholder, 'g'), String(value));
    }

    return prompt;
  }

  /**
   * 验证技能元数据
   */
  validateSkillMeta(meta: SkillMeta): ValidationResult {
    const errors: string[] = [];

    if (!meta.name || typeof meta.name !== 'string') {
      errors.push('name is required and must be a string');
    } else if (!/^[a-z][a-z0-9-]*$/.test(meta.name)) {
      errors.push('name must be lowercase alphanumeric with hyphens');
    }

    if (!meta.displayName || typeof meta.displayName !== 'string') {
      errors.push('displayName is required and must be a string');
    }

    if (!meta.description || typeof meta.description !== 'string') {
      errors.push('description is required and must be a string');
    }

    if (!meta.version || typeof meta.version !== 'string') {
      errors.push('version is required and must be a string');
    }

    if (!meta.category) {
      errors.push('category is required');
    } else {
      const validCategories: SkillCategory[] = [
        'productivity',
        'information',
        'system',
        'entertainment',
        'custom',
      ];
      if (!validCategories.includes(meta.category)) {
        errors.push(`category must be one of: ${validCategories.join(', ')}`);
      }
    }

    if (!Array.isArray(meta.keywords)) {
      errors.push('keywords must be an array');
    }

    if (!Array.isArray(meta.capabilities)) {
      errors.push('capabilities must be an array');
    }

    // 验证参数定义
    if (meta.parameters) {
      if (!Array.isArray(meta.parameters)) {
        errors.push('parameters must be an array');
      } else {
        for (let i = 0; i < meta.parameters.length; i++) {
          const param = meta.parameters[i];
          if (!param.name) {
            errors.push(`parameters[${i}].name is required`);
          }
          if (!param.type) {
            errors.push(`parameters[${i}].type is required`);
          }
          if (!param.description) {
            errors.push(`parameters[${i}].description is required`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 验证参数
   */
  validateParameters(
    skillName: string,
    parameters: Record<string, unknown>
  ): ValidationResult {
    const skill = this.skills.get(skillName);
    if (!skill) {
      return { valid: false, errors: [`Skill not found: ${skillName}`] };
    }

    const errors: string[] = [];
    const paramDefs = skill.meta.parameters || [];

    // 检查必需参数
    for (const paramDef of paramDefs) {
      if (paramDef.required && !(paramDef.name in parameters)) {
        errors.push(`Missing required parameter: ${paramDef.name}`);
      }

      if (paramDef.name in parameters) {
        const value = parameters[paramDef.name];

        // 类型检查
        switch (paramDef.type) {
          case 'string':
            if (typeof value !== 'string') {
              errors.push(`Parameter ${paramDef.name} must be a string`);
            }
            break;
          case 'number':
            if (typeof value !== 'number') {
              errors.push(`Parameter ${paramDef.name} must be a number`);
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              errors.push(`Parameter ${paramDef.name} must be a boolean`);
            }
            break;
          case 'array':
            if (!Array.isArray(value)) {
              errors.push(`Parameter ${paramDef.name} must be an array`);
            }
            break;
          case 'object':
            if (typeof value !== 'object' || value === null || Array.isArray(value)) {
              errors.push(`Parameter ${paramDef.name} must be an object`);
            }
            break;
        }

        // 枚举检查
        if (paramDef.enum && !paramDef.enum.includes(value)) {
          errors.push(
            `Parameter ${paramDef.name} must be one of: ${paramDef.enum.join(', ')}`
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 设置MCP管理器
   */
  setMCPManager(manager: MCPManagerInterface): void {
    this.mcpManager = manager;
  }

  /**
   * 获取MCP管理器
   */
  getMCPManager(): MCPManagerInterface | null {
    return this.mcpManager;
  }

  /**
   * 获取技能所需的MCP服务器
   */
  getRequiredMCPServers(skillName: string): string[] {
    const skill = this.skills.get(skillName);
    return skill?.meta.mcpServers || [];
  }

  /**
   * 获取技能数量
   */
  getSkillCount(): number {
    return this.skills.size;
  }

  /**
   * 清除所有技能
   */
  clearSkills(): void {
    this.skills.clear();
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取配置
   */
  getConfig(): SkillsManagerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SkillsManagerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * 生成技能提示上下文
   * 用于将技能信息注入到AI对话中
   */
  generateSkillsContext(): string {
    const enabledSkills = this.getEnabledSkills();
    
    if (enabledSkills.length === 0) {
      return '';
    }

    const skillDescriptions = enabledSkills.map((skill) => {
      const params = skill.meta.parameters
        ?.map((p) => `${p.name}${p.required ? '*' : ''}: ${p.description}`)
        .join(', ');
      
      return `- ${skill.meta.displayName}: ${skill.meta.description}${params ? ` (参数: ${params})` : ''}`;
    });

    return `可用技能:\n${skillDescriptions.join('\n')}`;
  }

  /**
   * 根据用户意图推荐技能
   */
  recommendSkillsForIntent(intent: string): Skill[] {
    const matches = this.matchSkills(intent, 3);
    return matches
      .filter((match) => match.confidence > 0.3)
      .map((match) => match.skill);
  }

  /**
   * 获取技能统计信息
   */
  getStatistics(): {
    total: number;
    enabled: number;
    disabled: number;
    byCategory: Record<SkillCategory, number>;
  } {
    const all = this.getAllSkills();
    const enabled = all.filter((s) => s.enabled).length;
    
    const byCategory: Record<SkillCategory, number> = {
      productivity: 0,
      information: 0,
      system: 0,
      entertainment: 0,
      custom: 0,
    };

    for (const skill of all) {
      byCategory[skill.meta.category]++;
    }

    return {
      total: all.length,
      enabled,
      disabled: all.length - enabled,
      byCategory,
    };
  }
}

// 导出默认实例
export default SkillsManager;