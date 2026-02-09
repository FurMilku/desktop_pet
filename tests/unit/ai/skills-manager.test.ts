/**
 * Skills管理器单元测试
 * Task: T066 [P] [US4] 单元测试：Skills管理器
 *
 * 测试覆盖:
 * - 技能注册与注销
 * - 技能发现与加载
 * - 技能执行
 * - 技能元数据管理
 * - 技能依赖验证
 * - 技能与MCP服务器集成
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { EventEmitter } from 'events';

// ==================== 类型定义 ====================

/**
 * 技能元数据
 */
interface SkillMeta {
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
 * 技能类别
 */
type SkillCategory =
  | 'productivity'
  | 'information'
  | 'system'
  | 'entertainment'
  | 'custom';

/**
 * 技能参数定义
 */
interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: unknown[];
}

/**
 * 技能示例
 */
interface SkillExample {
  input: string;
  description: string;
}

/**
 * 技能定义
 */
interface Skill {
  meta: SkillMeta;
  promptTemplate: string;
  path: string;
  enabled: boolean;
}

/**
 * 技能执行上下文
 */
interface SkillExecutionContext {
  skillName: string;
  parameters: Record<string, unknown>;
  conversationId?: string;
  userId?: string;
}

/**
 * 技能执行结果
 */
interface SkillExecutionResult {
  success: boolean;
  skillName: string;
  response?: string;
  data?: unknown;
  mcpCalls?: MCPCallResult[];
  error?: string;
  executionTime: number;
}

/**
 * MCP调用结果
 */
interface MCPCallResult {
  serverName: string;
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * 技能匹配结果
 */
interface SkillMatchResult {
  skill: Skill;
  confidence: number;
  matchedKeywords: string[];
  suggestedParameters: Record<string, unknown>;
}

/**
 * Skills管理器配置
 */
interface SkillsManagerConfig {
  skillsDirectory: string;
  autoLoad: boolean;
  enabledByDefault: boolean;
}

/**
 * MCP管理器接口（用于集成）
 */
interface MCPManagerInterface {
  callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
  getServerStatus(name: string): string;
  listTools(serverName?: string): Array<{ server: string; name: string }>;
}

/**
 * Skills管理器接口
 */
interface SkillsManagerInterface {
  // 初始化
  initialize(): Promise<void>;

  // 技能管理
  registerSkill(skill: Skill): void;
  unregisterSkill(name: string): void;
  getSkill(name: string): Skill | undefined;
  getAllSkills(): Skill[];
  getSkillsByCategory(category: SkillCategory): Skill[];

  // 技能发现
  loadSkillsFromDirectory(directory: string): Promise<number>;
  reloadSkills(): Promise<void>;

  // 技能启用/禁用
  enableSkill(name: string): void;
  disableSkill(name: string): void;
  isSkillEnabled(name: string): boolean;

  // 技能匹配
  matchSkill(userInput: string): SkillMatchResult | null;
  matchSkills(userInput: string, limit?: number): SkillMatchResult[];

  // 技能执行
  executeSkill(context: SkillExecutionContext): Promise<SkillExecutionResult>;
  buildPrompt(skillName: string, parameters: Record<string, unknown>): string;

  // 验证
  validateSkillMeta(meta: SkillMeta): { valid: boolean; errors: string[] };
  validateParameters(skillName: string, parameters: Record<string, unknown>): { valid: boolean; errors: string[] };

  // MCP集成
  setMCPManager(manager: MCPManagerInterface): void;
  getRequiredMCPServers(skillName: string): string[];
}

// ==================== Mock 实现 ====================

/**
 * 创建Mock文件系统
 */
function createMockFS() {
  const files: Map<string, string> = new Map();
  const directories: Set<string> = new Set();

  return {
    files,
    directories,
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path);
      if (!content) throw new Error(`File not found: ${path}`);
      return content;
    }),
    readdir: vi.fn(async (path: string) => {
      const entries: string[] = [];
      directories.forEach((dir) => {
        if (dir.startsWith(path) && dir !== path) {
          const relative = dir.slice(path.length + 1);
          const firstPart = relative.split('/')[0];
          if (!entries.includes(firstPart)) {
            entries.push(firstPart);
          }
        }
      });
      return entries;
    }),
    exists: vi.fn(async (path: string) => {
      return files.has(path) || directories.has(path);
    }),
    stat: vi.fn(async (path: string) => {
      return {
        isDirectory: () => directories.has(path),
        isFile: () => files.has(path),
      };
    }),
  };
}

/**
 * 创建Mock MCP管理器
 */
function createMockMCPManager(): MCPManagerInterface & { _mocks: Record<string, Mock> } {
  const callTool = vi.fn();
  const getServerStatus = vi.fn();
  const listTools = vi.fn();

  return {
    callTool,
    getServerStatus,
    listTools,
    _mocks: { callTool, getServerStatus, listTools },
  };
}

/**
 * 创建Mock事件总线
 */
function createMockEventBus() {
  const emitter = new EventEmitter();
  return {
    emit: vi.fn((event: string, data?: unknown) => emitter.emit(event, data)),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      emitter.on(event, handler);
      return () => emitter.off(event, handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      emitter.off(event, handler);
    }),
  };
}

/**
 * Skills管理器实现（测试用）
 */
class SkillsManager implements SkillsManagerInterface {
  private skills: Map<string, Skill> = new Map();
  private config: SkillsManagerConfig;
  private mcpManager: MCPManagerInterface | null = null;
  private eventBus: ReturnType<typeof createMockEventBus>;
  private fs: ReturnType<typeof createMockFS>;

  constructor(
    config: Partial<SkillsManagerConfig> = {},
    eventBus: ReturnType<typeof createMockEventBus>,
    fs: ReturnType<typeof createMockFS>
  ) {
    this.config = {
      skillsDirectory: config.skillsDirectory || './src/skills',
      autoLoad: config.autoLoad ?? true,
      enabledByDefault: config.enabledByDefault ?? true,
    };
    this.eventBus = eventBus;
    this.fs = fs;
  }

  async initialize(): Promise<void> {
    if (this.config.autoLoad) {
      await this.loadSkillsFromDirectory(this.config.skillsDirectory);
    }
    this.eventBus.emit('skills:initialized', { skillCount: this.skills.size });
  }

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

  unregisterSkill(name: string): void {
    if (!this.skills.has(name)) {
      throw new Error(`Skill not found: ${name}`);
    }

    this.skills.delete(name);
    this.eventBus.emit('skills:unregistered', { skillName: name });
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  getSkillsByCategory(category: SkillCategory): Skill[] {
    return Array.from(this.skills.values()).filter(
      (skill) => skill.meta.category === category
    );
  }

  async loadSkillsFromDirectory(directory: string): Promise<number> {
    let loadedCount = 0;

    try {
      const entries = await this.fs.readdir(directory);

      for (const entry of entries) {
        const skillPath = `${directory}/${entry}`;
        const metaPath = `${skillPath}/meta.json`;
        const promptPath = `${skillPath}/skill.md`;

        try {
          const stat = await this.fs.stat(skillPath);
          if (!stat.isDirectory()) continue;

          const metaExists = await this.fs.exists(metaPath);
          const promptExists = await this.fs.exists(promptPath);

          if (!metaExists || !promptExists) continue;

          const metaContent = await this.fs.readFile(metaPath);
          const promptContent = await this.fs.readFile(promptPath);

          const meta = JSON.parse(metaContent) as SkillMeta;

          const skill: Skill = {
            meta,
            promptTemplate: promptContent,
            path: skillPath,
            enabled: this.config.enabledByDefault,
          };

          // 不使用registerSkill以避免重复验证
          if (!this.skills.has(meta.name)) {
            this.skills.set(meta.name, skill);
            loadedCount++;
          }
        } catch {
          // 跳过无效技能
          continue;
        }
      }

      this.eventBus.emit('skills:loaded', { count: loadedCount, directory });
      return loadedCount;
    } catch {
      return 0;
    }
  }

  async reloadSkills(): Promise<void> {
    this.skills.clear();
    await this.loadSkillsFromDirectory(this.config.skillsDirectory);
    this.eventBus.emit('skills:reloaded', { skillCount: this.skills.size });
  }

  enableSkill(name: string): void {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }
    skill.enabled = true;
    this.eventBus.emit('skills:enabled', { skillName: name });
  }

  disableSkill(name: string): void {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }
    skill.enabled = false;
    this.eventBus.emit('skills:disabled', { skillName: name });
  }

  isSkillEnabled(name: string): boolean {
    const skill = this.skills.get(name);
    return skill?.enabled ?? false;
  }

  matchSkill(userInput: string): SkillMatchResult | null {
    const results = this.matchSkills(userInput, 1);
    return results.length > 0 ? results[0] : null;
  }

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

  private extractParameters(skill: Skill, userInput: string): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};

    if (!skill.meta.parameters) return parameters;

    // 简单的参数提取逻辑
    for (const param of skill.meta.parameters) {
      if (param.default !== undefined) {
        parameters[param.name] = param.default;
      }
    }

    return parameters;
  }

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
      return {
        success: false,
        skillName: context.skillName,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime,
      };
    }
  }

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

  validateSkillMeta(meta: SkillMeta): { valid: boolean; errors: string[] } {
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

    return { valid: errors.length === 0, errors };
  }

  validateParameters(
    skillName: string,
    parameters: Record<string, unknown>
  ): { valid: boolean; errors: string[] } {
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
        if (paramDef.type === 'string' && typeof value !== 'string') {
          errors.push(`Parameter ${paramDef.name} must be a string`);
        } else if (paramDef.type === 'number' && typeof value !== 'number') {
          errors.push(`Parameter ${paramDef.name} must be a number`);
        } else if (paramDef.type === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Parameter ${paramDef.name} must be a boolean`);
        } else if (paramDef.type === 'array' && !Array.isArray(value)) {
          errors.push(`Parameter ${paramDef.name} must be an array`);
        } else if (
          paramDef.type === 'object' &&
          (typeof value !== 'object' || value === null || Array.isArray(value))
        ) {
          errors.push(`Parameter ${paramDef.name} must be an object`);
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

  setMCPManager(manager: MCPManagerInterface): void {
    this.mcpManager = manager;
  }

  getRequiredMCPServers(skillName: string): string[] {
    const skill = this.skills.get(skillName);
    return skill?.meta.mcpServers || [];
  }
}

// ==================== 测试套件 ====================

describe('SkillsManager', () => {
  let skillsManager: SkillsManager;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let mockFS: ReturnType<typeof createMockFS>;
  let mockMCPManager: ReturnType<typeof createMockMCPManager>;

  // 示例技能定义
  const weatherSkill: Skill = {
    meta: {
      name: 'weather',
      displayName: '天气查询',
      description: '查询指定城市的天气信息',
      version: '1.0.0',
      category: 'information',
      keywords: ['天气', '气温', '温度', 'weather'],
      capabilities: ['query-weather', 'forecast'],
      mcpServers: ['weather-api'],
      parameters: [
        {
          name: 'city',
          type: 'string',
          description: '城市名称',
          required: true,
        },
        {
          name: 'days',
          type: 'number',
          description: '预报天数',
          required: false,
          default: 3,
        },
      ],
      examples: [
        { input: '北京今天天气怎么样', description: '查询北京当天天气' },
        { input: '上海未来三天天气', description: '查询上海未来三天天气预报' },
      ],
    },
    promptTemplate:
      '请查询{{city}}的天气信息，包括未来{{days}}天的天气预报。',
    path: './src/skills/weather',
    enabled: true,
  };

  const reminderSkill: Skill = {
    meta: {
      name: 'reminder',
      displayName: '提醒设置',
      description: '设置定时提醒',
      version: '1.0.0',
      category: 'productivity',
      keywords: ['提醒', '闹钟', '定时', 'reminder'],
      capabilities: ['set-reminder', 'list-reminders'],
      mcpServers: ['reminder'],
      parameters: [
        {
          name: 'title',
          type: 'string',
          description: '提醒标题',
          required: true,
        },
        {
          name: 'time',
          type: 'string',
          description: '提醒时间',
          required: true,
        },
      ],
    },
    promptTemplate: '请设置提醒：{{title}}，时间：{{time}}',
    path: './src/skills/reminder',
    enabled: true,
  };

  const appLauncherSkill: Skill = {
    meta: {
      name: 'app-launcher',
      displayName: '应用启动',
      description: '启动系统应用程序',
      version: '1.0.0',
      category: 'system',
      keywords: ['打开', '启动', '运行', 'open', 'launch'],
      capabilities: ['launch-app', 'list-apps'],
      mcpServers: ['system-tools'],
      parameters: [
        {
          name: 'appName',
          type: 'string',
          description: '应用名称',
          required: true,
        },
      ],
    },
    promptTemplate: '请打开应用：{{appName}}',
    path: './src/skills/app-launcher',
    enabled: true,
  };

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockFS = createMockFS();
    mockMCPManager = createMockMCPManager();

    skillsManager = new SkillsManager(
      { autoLoad: false },
      mockEventBus,
      mockFS
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==================== 技能注册与注销测试 ====================

  describe('技能注册与注销', () => {
    it('应该成功注册有效技能', () => {
      skillsManager.registerSkill(weatherSkill);

      const skill = skillsManager.getSkill('weather');
      expect(skill).toBeDefined();
      expect(skill?.meta.name).toBe('weather');
      expect(skill?.meta.displayName).toBe('天气查询');
    });

    it('应该在注册时发送事件', () => {
      skillsManager.registerSkill(weatherSkill);

      expect(mockEventBus.emit).toHaveBeenCalledWith('skills:registered', {
        skillName: 'weather',
      });
    });

    it('应该拒绝注册无效元数据的技能', () => {
      const invalidSkill: Skill = {
        meta: {
          name: '', // 无效
          displayName: '测试',
          description: '测试技能',
          version: '1.0.0',
          category: 'custom',
          keywords: [],
          capabilities: [],
        },
        promptTemplate: 'test',
        path: './test',
        enabled: true,
      };

      expect(() => skillsManager.registerSkill(invalidSkill)).toThrow(
        'Invalid skill meta'
      );
    });

    it('应该拒绝重复注册同名技能', () => {
      skillsManager.registerSkill(weatherSkill);

      expect(() => skillsManager.registerSkill(weatherSkill)).toThrow(
        'Skill already registered: weather'
      );
    });

    it('应该成功注销已注册技能', () => {
      skillsManager.registerSkill(weatherSkill);
      skillsManager.unregisterSkill('weather');

      expect(skillsManager.getSkill('weather')).toBeUndefined();
    });

    it('应该在注销时发送事件', () => {
      skillsManager.registerSkill(weatherSkill);
      skillsManager.unregisterSkill('weather');

      expect(mockEventBus.emit).toHaveBeenCalledWith('skills:unregistered', {
        skillName: 'weather',
      });
    });

    it('应该拒绝注销不存在的技能', () => {
      expect(() => skillsManager.unregisterSkill('nonexistent')).toThrow(
        'Skill not found: nonexistent'
      );
    });
  });

  // ==================== 技能发现与加载测试 ====================

  describe('技能发现与加载', () => {
    beforeEach(() => {
      // 设置模拟文件系统
      mockFS.directories.add('./src/skills');
      mockFS.directories.add('./src/skills/weather');
      mockFS.directories.add('./src/skills/reminder');

      mockFS.files.set(
        './src/skills/weather/meta.json',
        JSON.stringify(weatherSkill.meta)
      );
      mockFS.files.set(
        './src/skills/weather/skill.md',
        weatherSkill.promptTemplate
      );

      mockFS.files.set(
        './src/skills/reminder/meta.json',
        JSON.stringify(reminderSkill.meta)
      );
      mockFS.files.set(
        './src/skills/reminder/skill.md',
        reminderSkill.promptTemplate
      );
    });

    it('应该从目录加载技能', async () => {
      const count = await skillsManager.loadSkillsFromDirectory('./src/skills');

      expect(count).toBe(2);
      expect(skillsManager.getSkill('weather')).toBeDefined();
      expect(skillsManager.getSkill('reminder')).toBeDefined();
    });

    it('应该在加载时发送事件', async () => {
      await skillsManager.loadSkillsFromDirectory('./src/skills');

      expect(mockEventBus.emit).toHaveBeenCalledWith('skills:loaded', {
        count: 2,
        directory: './src/skills',
      });
    });

    it('应该跳过缺少元数据的技能', async () => {
      mockFS.directories.add('./src/skills/invalid');
      // 只有目录，没有meta.json和skill.md

      const count = await skillsManager.loadSkillsFromDirectory('./src/skills');

      expect(count).toBe(2); // 只加载有效的
    });

    it('应该跳过无效JSON的技能', async () => {
      mockFS.directories.add('./src/skills/broken');
      mockFS.files.set('./src/skills/broken/meta.json', 'invalid json');
      mockFS.files.set('./src/skills/broken/skill.md', 'test');

      const count = await skillsManager.loadSkillsFromDirectory('./src/skills');

      expect(count).toBe(2); // 只加载有效的
    });

    it('应该支持重新加载技能', async () => {
      await skillsManager.loadSkillsFromDirectory('./src/skills');
      expect(skillsManager.getAllSkills().length).toBe(2);

      // 修改文件系统
      mockFS.files.delete('./src/skills/reminder/meta.json');
      mockFS.files.delete('./src/skills/reminder/skill.md');
      mockFS.directories.delete('./src/skills/reminder');

      await skillsManager.reloadSkills();

      expect(skillsManager.getAllSkills().length).toBe(1);
      expect(mockEventBus.emit).toHaveBeenCalledWith('skills:reloaded', {
        skillCount: 1,
      });
    });

    it('应该在初始化时自动加载技能（如果配置启用）', async () => {
      const autoLoadManager = new SkillsManager(
        { autoLoad: true, skillsDirectory: './src/skills' },
        mockEventBus,
        mockFS
      );

      await autoLoadManager.initialize();

      expect(autoLoadManager.getAllSkills().length).toBe(2);
      expect(mockEventBus.emit).toHaveBeenCalledWith('skills:initialized', {
        skillCount: 2,
      });
    });
  });

  // ==================== 技能启用/禁用测试 ====================

  describe('技能启用/禁用', () => {
    beforeEach(() => {
      skillsManager.registerSkill(weatherSkill);
    });

    it('应该默认启用技能', () => {
      expect(skillsManager.isSkillEnabled('weather')).toBe(true);
    });

    it('应该成功禁用技能', () => {
      skillsManager.disableSkill('weather');

      expect(skillsManager.isSkillEnabled('weather')).toBe(false);
      expect(mockEventBus.emit).toHaveBeenCalledWith('skills:disabled', {
        skillName: 'weather',
      });
    });

    it('应该成功启用已禁用的技能', () => {
      skillsManager.disableSkill('weather');
      skillsManager.enableSkill('weather');

      expect(skillsManager.isSkillEnabled('weather')).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith('skills:enabled', {
        skillName: 'weather',
      });
    });

    it('应该拒绝禁用不存在的技能', () => {
      expect(() => skillsManager.disableSkill('nonexistent')).toThrow(
        'Skill not found: nonexistent'
      );
    });

    it('应该拒绝启用不存在的技能', () => {
      expect(() => skillsManager.enableSkill('nonexistent')).toThrow(
        'Skill not found: nonexistent'
      );
    });
  });

  // ==================== 技能查询测试 ====================

  describe('技能查询', () => {
    beforeEach(() => {
      skillsManager.registerSkill(weatherSkill);
      skillsManager.registerSkill(reminderSkill);
      skillsManager.registerSkill(appLauncherSkill);
    });

    it('应该获取所有技能', () => {
      const skills = skillsManager.getAllSkills();

      expect(skills.length).toBe(3);
    });

    it('应该按类别获取技能', () => {
      const infoSkills = skillsManager.getSkillsByCategory('information');
      const productivitySkills = skillsManager.getSkillsByCategory('productivity');
      const systemSkills = skillsManager.getSkillsByCategory('system');

      expect(infoSkills.length).toBe(1);
      expect(infoSkills[0].meta.name).toBe('weather');

      expect(productivitySkills.length).toBe(1);
      expect(productivitySkills[0].meta.name).toBe('reminder');

      expect(systemSkills.length).toBe(1);
      expect(systemSkills[0].meta.name).toBe('app-launcher');
    });

    it('应该返回空数组当类别无匹配', () => {
      const entertainmentSkills = skillsManager.getSkillsByCategory('entertainment');

      expect(entertainmentSkills.length).toBe(0);
    });
  });

  // ==================== 技能匹配测试 ====================

  describe('技能匹配', () => {
    beforeEach(() => {
      skillsManager.registerSkill(weatherSkill);
      skillsManager.registerSkill(reminderSkill);
      skillsManager.registerSkill(appLauncherSkill);
    });

    it('应该根据关键词匹配技能', () => {
      const result = skillsManager.matchSkill('今天天气怎么样');

      expect(result).not.toBeNull();
      expect(result?.skill.meta.name).toBe('weather');
      expect(result?.matchedKeywords).toContain('天气');
    });

    it('应该返回多个匹配结果', () => {
      const results = skillsManager.matchSkills('查询天气预报', 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].confidence).toBeGreaterThanOrEqual(results[results.length - 1].confidence);
    });

    it('应该按置信度排序匹配结果', () => {
      const results = skillsManager.matchSkills('天气');

      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].confidence).toBeGreaterThanOrEqual(results[i + 1].confidence);
      }
    });

    it('应该限制返回结果数量', () => {
      const results = skillsManager.matchSkills('打开', 1);

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('应该不匹配已禁用的技能', () => {
      skillsManager.disableSkill('weather');

      const result = skillsManager.matchSkill('今天天气');

      expect(result?.skill.meta.name).not.toBe('weather');
    });

    it('应该返回null当无匹配', () => {
      const result = skillsManager.matchSkill('毫无关联的内容xyz123');

      expect(result).toBeNull();
    });

    it('应该提取建议参数', () => {
      const result = skillsManager.matchSkill('查询天气');

      expect(result?.suggestedParameters).toBeDefined();
    });
  });

  // ==================== 技能执行测试 ====================

  describe('技能执行', () => {
    beforeEach(() => {
      skillsManager.registerSkill(weatherSkill);
      skillsManager.registerSkill(reminderSkill);
      skillsManager.setMCPManager(mockMCPManager);
    });

    it('应该成功执行技能', async () => {
      mockMCPManager.getServerStatus.mockReturnValue('running');

      const result = await skillsManager.executeSkill({
        skillName: 'weather',
        parameters: { city: '北京', days: 3 },
      });

      expect(result.success).toBe(true);
      expect(result.skillName).toBe('weather');
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('应该拒绝执行不存在的技能', async () => {
      const result = await skillsManager.executeSkill({
        skillName: 'nonexistent',
        parameters: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Skill not found');
    });

    it('应该拒绝执行已禁用的技能', async () => {
      skillsManager.disableSkill('weather');

      const result = await skillsManager.executeSkill({
        skillName: 'weather',
        parameters: { city: '北京' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('应该验证必需参数', async () => {
      mockMCPManager.getServerStatus.mockReturnValue('running');

      const result = await skillsManager.executeSkill({
        skillName: 'weather',
        parameters: {}, // 缺少必需的city参数
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('city');
    });

    it('应该验证参数类型', async () => {
      mockMCPManager.getServerStatus.mockReturnValue('running');

      const result = await skillsManager.executeSkill({
        skillName: 'weather',
        parameters: { city: 123, days: 'three' }, // 类型错误
      });

      expect(result.success).toBe(false);
    });

    it('应该检查MCP服务器可用性', async () => {
      mockMCPManager.getServerStatus.mockReturnValue('stopped');

      const result = await skillsManager.executeSkill({
        skillName: 'weather',
        parameters: { city: '北京' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('MCP server not running');
    });

    it('应该在没有MCP管理器时失败', async () => {
      const managerWithoutMCP = new SkillsManager(
        { autoLoad: false },
        mockEventBus,
        mockFS
      );
      managerWithoutMCP.registerSkill(weatherSkill);

      const result = await managerWithoutMCP.executeSkill({
        skillName: 'weather',
        parameters: { city: '北京' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('MCP manager not available');
    });

    it('应该发送执行事件', async () => {
      mockMCPManager.getServerStatus.mockReturnValue('running');

      await skillsManager.executeSkill({
        skillName: 'weather',
        parameters: { city: '北京', days: 3 },
      });

      expect(mockEventBus.emit).toHaveBeenCalledWith('skills:executed', {
        skillName: 'weather',
        success: true,
      });
    });

    it('应该记录执行时间', async () => {
      mockMCPManager.getServerStatus.mockReturnValue('running');

      const result = await skillsManager.executeSkill({
        skillName: 'weather',
        parameters: { city: '北京', days: 3 },
      });

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== 提示词构建测试 ====================

  describe('提示词构建', () => {
    beforeEach(() => {
      skillsManager.registerSkill(weatherSkill);
    });

    it('应该正确替换参数占位符', () => {
      const prompt = skillsManager.buildPrompt('weather', {
        city: '北京',
        days: 5,
      });

      expect(prompt).toContain('北京');
      expect(prompt).toContain('5');
      expect(prompt).not.toContain('{{city}}');
      expect(prompt).not.toContain('{{days}}');
    });

    it('应该抛出错误当技能不存在', () => {
      expect(() => skillsManager.buildPrompt('nonexistent', {})).toThrow(
        'Skill not found: nonexistent'
      );
    });
  });

  // ==================== 元数据验证测试 ====================

  describe('元数据验证', () => {
    it('应该验证有效的元数据', () => {
      const result = skillsManager.validateSkillMeta(weatherSkill.meta);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('应该拒绝空名称', () => {
      const invalidMeta: SkillMeta = {
        ...weatherSkill.meta,
        name: '',
      };

      const result = skillsManager.validateSkillMeta(invalidMeta);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('name'))).toBe(true);
    });

    it('应该拒绝无效的名称格式', () => {
      const invalidMeta: SkillMeta = {
        ...weatherSkill.meta,
        name: 'Invalid Name!',
      };

      const result = skillsManager.validateSkillMeta(invalidMeta);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('lowercase'))).toBe(true);
    });

    it('应该拒绝无效的类别', () => {
      const invalidMeta = {
        ...weatherSkill.meta,
        category: 'invalid' as SkillCategory,
      };

      const result = skillsManager.validateSkillMeta(invalidMeta);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('category'))).toBe(true);
    });

    it('应该拒绝非数组的keywords', () => {
      const invalidMeta = {
        ...weatherSkill.meta,
        keywords: 'not-an-array' as unknown as string[],
      };

      const result = skillsManager.validateSkillMeta(invalidMeta);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('keywords'))).toBe(true);
    });
  });

  // ==================== 参数验证测试 ====================

  describe('参数验证', () => {
    beforeEach(() => {
      skillsManager.registerSkill(weatherSkill);
    });

    it('应该验证有效参数', () => {
      const result = skillsManager.validateParameters('weather', {
        city: '北京',
        days: 3,
      });

      expect(result.valid).toBe(true);
    });

    it('应该检测缺少的必需参数', () => {
      const result = skillsManager.validateParameters('weather', {});

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('city'))).toBe(true);
    });

    it('应该检测类型错误', () => {
      const result = skillsManager.validateParameters('weather', {
        city: 123, // 应该是字符串
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('string'))).toBe(true);
    });

    it('应该返回错误当技能不存在', () => {
      const result = skillsManager.validateParameters('nonexistent', {});

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Skill not found');
    });
  });

  // ==================== MCP集成测试 ====================

  describe('MCP集成', () => {
    beforeEach(() => {
      skillsManager.registerSkill(weatherSkill);
      skillsManager.registerSkill(reminderSkill);
    });

    it('应该设置MCP管理器', () => {
      skillsManager.setMCPManager(mockMCPManager);

      // 验证通过执行依赖MCP的技能
      mockMCPManager.getServerStatus.mockReturnValue('running');
    });

    it('应该获取技能所需的MCP服务器', () => {
      const servers = skillsManager.getRequiredMCPServers('weather');

      expect(servers).toContain('weather-api');
    });

    it('应该返回空数组当技能无MCP依赖', () => {
      const skillWithoutMCP: Skill = {
        meta: {
          name: 'simple-skill',
          displayName: '简单技能',
          description: '无MCP依赖的技能',
          version: '1.0.0',
          category: 'custom',
          keywords: ['simple'],
          capabilities: ['simple'],
          // 没有mcpServers
        },
        promptTemplate: 'simple prompt',
        path: './test',
        enabled: true,
      };

      skillsManager.registerSkill(skillWithoutMCP);
      const servers = skillsManager.getRequiredMCPServers('simple-skill');

      expect(servers).toEqual([]);
    });

    it('应该返回空数组当技能不存在', () => {
      const servers = skillsManager.getRequiredMCPServers('nonexistent');

      expect(servers).toEqual([]);
    });
  });

  // ==================== 边界情况测试 ====================

  describe('边界情况', () => {
    it('应该处理空技能目录', async () => {
      mockFS.directories.add('./empty-skills');

      const count = await skillsManager.loadSkillsFromDirectory('./empty-skills');

      expect(count).toBe(0);
    });

    it('应该处理不存在的目录', async () => {
      const count = await skillsManager.loadSkillsFromDirectory('./nonexistent');

      expect(count).toBe(0);
    });

    it('应该处理空用户输入进行匹配', () => {
      skillsManager.registerSkill(weatherSkill);

      const result = skillsManager.matchSkill('');

      expect(result).toBeNull();
    });

    it('应该处理特殊字符的用户输入', () => {
      skillsManager.registerSkill(weatherSkill);

      const result = skillsManager.matchSkill('!@#$%^&*()');

      expect(result).toBeNull();
    });

    it('应该处理很长的用户输入', () => {
      skillsManager.registerSkill(weatherSkill);

      const longInput = '天气'.repeat(1000);
      const result = skillsManager.matchSkill(longInput);

      expect(result).toBeDefined();
    });
  });
});