/**
 * 设置面板UI组件
 * T103 实现设置面板UI组件
 * 
 * 功能：
 * - 通用设置（语言、主题、开机自启动）
 * - AI配置（Provider选择、API密钥管理）
 * - 宠物设置（默认皮肤、动画速度）
 * - 语音设置（STT/TTS配置）
 * - 快捷键设置
 * - 关于页面
 */

import { EventEmitter } from 'events';

// 设置分类
export type SettingsCategory = 
  | 'general'
  | 'ai'
  | 'pet'
  | 'voice'
  | 'shortcuts'
  | 'about';

// 设置项类型
export type SettingType = 
  | 'toggle'
  | 'select'
  | 'input'
  | 'password'
  | 'slider'
  | 'color'
  | 'shortcut'
  | 'button';

// 设置项定义
interface SettingItem {
  id: string;
  type: SettingType;
  label: string;
  description?: string;
  value: unknown;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  action?: () => void;
  validate?: (value: unknown) => boolean;
}

// 设置分组
interface SettingsGroup {
  id: string;
  title: string;
  icon: string;
  items: SettingItem[];
}

// 设置数据
export interface SettingsData {
  general: {
    language: string;
    theme: 'light' | 'dark' | 'system';
    autoLaunch: boolean;
    minimizeToTray: boolean;
    showInTaskbar: boolean;
  };
  ai: {
    provider: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
  };
  pet: {
    defaultSkin: string;
    animationSpeed: number;
    size: number;
    opacity: number;
    alwaysOnTop: boolean;
    clickThrough: boolean;
  };
  voice: {
    sttEnabled: boolean;
    sttProvider: string;
    ttsEnabled: boolean;
    ttsProvider: string;
    ttsVoice: string;
    ttsSpeed: number;
    ttsVolume: number;
  };
  shortcuts: {
    toggleChat: string;
    toggleVoice: string;
    hidePet: string;
    openSettings: string;
    quickCommand: string;
  };
}

// 设置面板选项
export interface SettingsPanelOptions {
  container: HTMLElement;
  initialSettings?: Partial<SettingsData>;
  onSave?: (settings: SettingsData) => void;
  onCancel?: () => void;
  theme?: 'light' | 'dark';
}

/**
 * 设置面板组件
 */
export class SettingsPanel extends EventEmitter {
  private container: HTMLElement;
  private options: SettingsPanelOptions;
  private settings: SettingsData;
  private currentCategory: SettingsCategory = 'general';
  private isOpen = false;
  private isDirty = false;
  private originalSettings: SettingsData;

  constructor(options: SettingsPanelOptions) {
    super();
    this.container = options.container;
    this.options = options;
    this.settings = this.createDefaultSettings();
    
    // 合并初始设置
    if (options.initialSettings) {
      this.settings = this.mergeSettings(this.settings, options.initialSettings);
    }
    
    this.originalSettings = JSON.parse(JSON.stringify(this.settings));
  }

  /**
   * 打开设置面板
   */
  open(category?: SettingsCategory): void {
    if (this.isOpen) return;
    
    this.isOpen = true;
    this.currentCategory = category ?? 'general';
    this.isDirty = false;
    this.originalSettings = JSON.parse(JSON.stringify(this.settings));
    
    this.render();
    this.setupEventListeners();
    this.container.classList.add('settings-panel-open');
    
    this.emit('open');
  }

  /**
   * 关闭设置面板
   */
  close(): void {
    if (!this.isOpen) return;
    
    if (this.isDirty) {
      this.showUnsavedChangesDialog();
      return;
    }
    
    this.forceClose();
  }

  /**
   * 强制关闭（不检查未保存更改）
   */
  private forceClose(): void {
    this.isOpen = false;
    this.container.classList.remove('settings-panel-open');
    this.container.innerHTML = '';
    
    this.emit('close');
  }

  /**
   * 获取当前设置
   */
  getSettings(): SettingsData {
    return JSON.parse(JSON.stringify(this.settings));
  }

  /**
   * 更新设置
   */
  updateSettings(newSettings: Partial<SettingsData>): void {
    this.settings = this.mergeSettings(this.settings, newSettings);
    if (this.isOpen) {
      this.render();
    }
  }

  /**
   * 创建默认设置
   */
  private createDefaultSettings(): SettingsData {
    return {
      general: {
        language: 'zh-CN',
        theme: 'dark',
        autoLaunch: false,
        minimizeToTray: true,
        showInTaskbar: true,
      },
      ai: {
        provider: 'openai',
        apiKey: '',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2048,
        systemPrompt: '你是一个可爱的桌面宠物助手，性格活泼友好。',
      },
      pet: {
        defaultSkin: 'default',
        animationSpeed: 1.0,
        size: 1.0,
        opacity: 1.0,
        alwaysOnTop: true,
        clickThrough: false,
      },
      voice: {
        sttEnabled: false,
        sttProvider: 'browser',
        ttsEnabled: true,
        ttsProvider: 'browser',
        ttsVoice: 'default',
        ttsSpeed: 1.0,
        ttsVolume: 0.8,
      },
      shortcuts: {
        toggleChat: 'Ctrl+Shift+C',
        toggleVoice: 'Ctrl+Shift+V',
        hidePet: 'Ctrl+Shift+H',
        openSettings: 'Ctrl+,',
        quickCommand: 'Ctrl+Shift+P',
      },
    };
  }

  /**
   * 合并设置
   */
  private mergeSettings(base: SettingsData, updates: Partial<SettingsData>): SettingsData {
    const result = JSON.parse(JSON.stringify(base));
    
    for (const category of Object.keys(updates) as (keyof SettingsData)[]) {
      if (updates[category]) {
        result[category] = { ...result[category], ...updates[category] };
      }
    }
    
    return result;
  }

  /**
   * 渲染设置面板
   */
  private render(): void {
    const theme = this.options.theme ?? 'dark';
    
    this.container.innerHTML = `
      <div class="settings-panel settings-panel--${theme}">
        <div class="settings-panel__overlay"></div>
        <div class="settings-panel__dialog">
          <div class="settings-panel__header">
            <h2 class="settings-panel__title">设置</h2>
            <button class="settings-panel__close" aria-label="关闭">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <div class="settings-panel__body">
            <nav class="settings-panel__nav">
              ${this.renderNavigation()}
            </nav>
            
            <div class="settings-panel__content">
              ${this.renderContent()}
            </div>
          </div>
          
          <div class="settings-panel__footer">
            <button class="settings-panel__btn settings-panel__btn--secondary" id="btn-reset">
              恢复默认
            </button>
            <div class="settings-panel__footer-right">
              <button class="settings-panel__btn settings-panel__btn--secondary" id="btn-cancel">
                取消
              </button>
              <button class="settings-panel__btn settings-panel__btn--primary" id="btn-save" ${!this.isDirty ? 'disabled' : ''}>
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <style>
        ${this.getStyles()}
      </style>
    `;
  }

  /**
   * 渲染导航菜单
   */
  private renderNavigation(): string {
    const categories = [
      { id: 'general', label: '通用', icon: '⚙️' },
      { id: 'ai', label: 'AI 配置', icon: '🤖' },
      { id: 'pet', label: '宠物', icon: '🐾' },
      { id: 'voice', label: '语音', icon: '🎤' },
      { id: 'shortcuts', label: '快捷键', icon: '⌨️' },
      { id: 'about', label: '关于', icon: 'ℹ️' },
    ];

    return categories.map(cat => `
      <button 
        class="settings-panel__nav-item ${cat.id === this.currentCategory ? 'settings-panel__nav-item--active' : ''}"
        data-category="${cat.id}"
      >
        <span class="settings-panel__nav-icon">${cat.icon}</span>
        <span class="settings-panel__nav-label">${cat.label}</span>
      </button>
    `).join('');
  }

  /**
   * 渲染内容区域
   */
  private renderContent(): string {
    switch (this.currentCategory) {
      case 'general':
        return this.renderGeneralSettings();
      case 'ai':
        return this.renderAISettings();
      case 'pet':
        return this.renderPetSettings();
      case 'voice':
        return this.renderVoiceSettings();
      case 'shortcuts':
        return this.renderShortcutsSettings();
      case 'about':
        return this.renderAboutPage();
      default:
        return '';
    }
  }

  /**
   * 渲染通用设置
   */
  private renderGeneralSettings(): string {
    const { general } = this.settings;
    
    return `
      <div class="settings-panel__section">
        <h3 class="settings-panel__section-title">通用设置</h3>
        
        <div class="settings-panel__group">
          ${this.renderSelect('general.language', '语言', general.language, [
            { value: 'zh-CN', label: '简体中文' },
            { value: 'zh-TW', label: '繁體中文' },
            { value: 'en-US', label: 'English' },
            { value: 'ja-JP', label: '日本語' },
          ])}
          
          ${this.renderSelect('general.theme', '主题', general.theme, [
            { value: 'light', label: '浅色' },
            { value: 'dark', label: '深色' },
            { value: 'system', label: '跟随系统' },
          ])}
          
          ${this.renderToggle('general.autoLaunch', '开机自启动', general.autoLaunch, '启动系统时自动运行桌面宠物')}
          
          ${this.renderToggle('general.minimizeToTray', '最小化到托盘', general.minimizeToTray, '关闭窗口时最小化到系统托盘')}
          
          ${this.renderToggle('general.showInTaskbar', '显示在任务栏', general.showInTaskbar, '在任务栏显示应用图标')}
        </div>
      </div>
    `;
  }

  /**
   * 渲染AI设置
   */
  private renderAISettings(): string {
    const { ai } = this.settings;
    
    return `
      <div class="settings-panel__section">
        <h3 class="settings-panel__section-title">AI 配置</h3>
        
        <div class="settings-panel__group">
          ${this.renderSelect('ai.provider', 'AI 提供商', ai.provider, [
            { value: 'openai', label: 'OpenAI' },
            { value: 'claude', label: 'Claude (Anthropic)' },
            { value: 'ollama', label: 'Ollama (本地)' },
          ])}
          
          ${this.renderPassword('ai.apiKey', 'API 密钥', ai.apiKey, '输入您的 API 密钥')}
          
          ${this.renderSelect('ai.model', '模型', ai.model, this.getModelsForProvider(ai.provider))}
          
          ${this.renderSlider('ai.temperature', '创造性 (Temperature)', ai.temperature, 0, 2, 0.1, '较低的值更确定，较高的值更随机')}
          
          ${this.renderSlider('ai.maxTokens', '最大回复长度', ai.maxTokens, 256, 8192, 256, '单次回复的最大 token 数量')}
          
          ${this.renderTextarea('ai.systemPrompt', '系统提示词', ai.systemPrompt, '定义宠物的性格和行为')}
        </div>
      </div>
    `;
  }

  /**
   * 渲染宠物设置
   */
  private renderPetSettings(): string {
    const { pet } = this.settings;
    
    return `
      <div class="settings-panel__section">
        <h3 class="settings-panel__section-title">宠物设置</h3>
        
        <div class="settings-panel__group">
          ${this.renderSelect('pet.defaultSkin', '默认皮肤', pet.defaultSkin, [
            { value: 'default', label: '默认宠物' },
            { value: 'cat', label: '小猫' },
            { value: 'dog', label: '小狗' },
            { value: 'custom', label: '自定义皮肤' },
          ])}
          
          ${this.renderSlider('pet.animationSpeed', '动画速度', pet.animationSpeed, 0.5, 2.0, 0.1, '调整宠物动画的播放速度')}
          
          ${this.renderSlider('pet.size', '宠物大小', pet.size, 0.5, 2.0, 0.1, '调整宠物在屏幕上的大小')}
          
          ${this.renderSlider('pet.opacity', '透明度', pet.opacity, 0.3, 1.0, 0.1, '调整宠物的透明度')}
          
          ${this.renderToggle('pet.alwaysOnTop', '始终置顶', pet.alwaysOnTop, '宠物窗口始终显示在其他窗口上方')}
          
          ${this.renderToggle('pet.clickThrough', '点击穿透', pet.clickThrough, '鼠标点击可穿透宠物窗口（宠物区域外）')}
        </div>
      </div>
    `;
  }

  /**
   * 渲染语音设置
   */
  private renderVoiceSettings(): string {
    const { voice } = this.settings;
    
    return `
      <div class="settings-panel__section">
        <h3 class="settings-panel__section-title">语音识别 (STT)</h3>
        
        <div class="settings-panel__group">
          ${this.renderToggle('voice.sttEnabled', '启用语音识别', voice.sttEnabled, '允许通过语音与宠物对话')}
          
          ${this.renderSelect('voice.sttProvider', '识别引擎', voice.sttProvider, [
            { value: 'browser', label: '浏览器内置' },
            { value: 'whisper', label: 'OpenAI Whisper' },
            { value: 'azure', label: 'Azure Speech' },
          ], !voice.sttEnabled)}
        </div>
      </div>
      
      <div class="settings-panel__section">
        <h3 class="settings-panel__section-title">语音合成 (TTS)</h3>
        
        <div class="settings-panel__group">
          ${this.renderToggle('voice.ttsEnabled', '启用语音回复', voice.ttsEnabled, '让宠物用语音回复您')}
          
          ${this.renderSelect('voice.ttsProvider', '合成引擎', voice.ttsProvider, [
            { value: 'browser', label: '浏览器内置' },
            { value: 'elevenlabs', label: 'ElevenLabs' },
            { value: 'azure', label: 'Azure Speech' },
          ], !voice.ttsEnabled)}
          
          ${this.renderSelect('voice.ttsVoice', '声音', voice.ttsVoice, [
            { value: 'default', label: '默认声音' },
            { value: 'female1', label: '女声 1' },
            { value: 'female2', label: '女声 2' },
            { value: 'male1', label: '男声 1' },
            { value: 'male2', label: '男声 2' },
          ], !voice.ttsEnabled)}
          
          ${this.renderSlider('voice.ttsSpeed', '语速', voice.ttsSpeed, 0.5, 2.0, 0.1, '调整语音播放速度', !voice.ttsEnabled)}
          
          ${this.renderSlider('voice.ttsVolume', '音量', voice.ttsVolume, 0, 1.0, 0.1, '调整语音音量', !voice.ttsEnabled)}
        </div>
      </div>
      
      <div class="settings-panel__section">
        <button class="settings-panel__btn settings-panel__btn--secondary" id="btn-test-voice" ${!voice.ttsEnabled ? 'disabled' : ''}>
          🔊 测试语音
        </button>
      </div>
    `;
  }

  /**
   * 渲染快捷键设置
   */
  private renderShortcutsSettings(): string {
    const { shortcuts } = this.settings;
    
    return `
      <div class="settings-panel__section">
        <h3 class="settings-panel__section-title">快捷键设置</h3>
        <p class="settings-panel__section-desc">点击输入框后按下新的快捷键组合进行设置</p>
        
        <div class="settings-panel__group">
          ${this.renderShortcut('shortcuts.toggleChat', '打开/关闭对话', shortcuts.toggleChat)}
          ${this.renderShortcut('shortcuts.toggleVoice', '开始/停止语音', shortcuts.toggleVoice)}
          ${this.renderShortcut('shortcuts.hidePet', '显示/隐藏宠物', shortcuts.hidePet)}
          ${this.renderShortcut('shortcuts.openSettings', '打开设置', shortcuts.openSettings)}
          ${this.renderShortcut('shortcuts.quickCommand', '快速命令', shortcuts.quickCommand)}
        </div>
      </div>
      
      <div class="settings-panel__section">
        <button class="settings-panel__btn settings-panel__btn--secondary" id="btn-reset-shortcuts">
          重置所有快捷键
        </button>
      </div>
    `;
  }

  /**
   * 渲染关于页面
   */
  private renderAboutPage(): string {
    return `
      <div class="settings-panel__about">
        <div class="settings-panel__about-logo">🐾</div>
        <h3 class="settings-panel__about-title">桌面3D小宠物</h3>
        <p class="settings-panel__about-version">版本 1.0.0</p>
        
        <div class="settings-panel__about-info">
          <p>一个可爱的桌面3D宠物伴侣，支持AI对话、语音交互和丰富的个性化功能。</p>
        </div>
        
        <div class="settings-panel__about-links">
          <button class="settings-panel__link" id="link-website">
            🌐 官方网站
          </button>
          <button class="settings-panel__link" id="link-github">
            📦 GitHub
          </button>
          <button class="settings-panel__link" id="link-docs">
            📖 使用文档
          </button>
          <button class="settings-panel__link" id="link-feedback">
            💬 反馈建议
          </button>
        </div>
        
        <div class="settings-panel__about-actions">
          <button class="settings-panel__btn settings-panel__btn--secondary" id="btn-check-update">
            检查更新
          </button>
          <button class="settings-panel__btn settings-panel__btn--secondary" id="btn-export-logs">
            导出日志
          </button>
        </div>
        
        <div class="settings-panel__about-footer">
          <p>Made with ❤️ by Desktop Pet Team</p>
          <p class="settings-panel__copyright">© 2024 Desktop Pet. All rights reserved.</p>
        </div>
      </div>
    `;
  }

  /**
   * 渲染开关组件
   */
  private renderToggle(id: string, label: string, value: boolean, description?: string): string {
    return `
      <div class="settings-panel__item">
        <div class="settings-panel__item-info">
          <label class="settings-panel__label" for="${id}">${label}</label>
          ${description ? `<p class="settings-panel__desc">${description}</p>` : ''}
        </div>
        <label class="settings-panel__toggle">
          <input type="checkbox" id="${id}" data-setting="${id}" ${value ? 'checked' : ''} />
          <span class="settings-panel__toggle-slider"></span>
        </label>
      </div>
    `;
  }

  /**
   * 渲染选择框组件
   */
  private renderSelect(
    id: string, 
    label: string, 
    value: string, 
    options: Array<{ value: string; label: string }>,
    disabled = false
  ): string {
    return `
      <div class="settings-panel__item">
        <div class="settings-panel__item-info">
          <label class="settings-panel__label" for="${id}">${label}</label>
        </div>
        <select class="settings-panel__select" id="${id}" data-setting="${id}" ${disabled ? 'disabled' : ''}>
          ${options.map(opt => `
            <option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>${opt.label}</option>
          `).join('')}
        </select>
      </div>
    `;
  }

  /**
   * 渲染密码输入组件
   */
  private renderPassword(id: string, label: string, value: string, placeholder?: string): string {
    return `
      <div class="settings-panel__item settings-panel__item--column">
        <div class="settings-panel__item-info">
          <label class="settings-panel__label" for="${id}">${label}</label>
        </div>
        <div class="settings-panel__password-wrapper">
          <input 
            type="password" 
            class="settings-panel__input" 
            id="${id}" 
            data-setting="${id}"
            value="${value}"
            placeholder="${placeholder || ''}"
          />
          <button class="settings-panel__password-toggle" data-target="${id}" type="button">
            👁️
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 渲染滑块组件
   */
  private renderSlider(
    id: string,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    description?: string,
    disabled = false
  ): string {
    const percentage = ((value - min) / (max - min)) * 100;
    
    return `
      <div class="settings-panel__item settings-panel__item--column">
        <div class="settings-panel__item-header">
          <label class="settings-panel__label" for="${id}">${label}</label>
          <span class="settings-panel__value">${value}</span>
        </div>
        ${description ? `<p class="settings-panel__desc">${description}</p>` : ''}
        <input 
          type="range" 
          class="settings-panel__slider" 
          id="${id}" 
          data-setting="${id}"
          min="${min}"
          max="${max}"
          step="${step}"
          value="${value}"
          style="--value: ${percentage}%"
          ${disabled ? 'disabled' : ''}
        />
      </div>
    `;
  }

  /**
   * 渲染文本域组件
   */
  private renderTextarea(id: string, label: string, value: string, description?: string): string {
    return `
      <div class="settings-panel__item settings-panel__item--column">
        <div class="settings-panel__item-info">
          <label class="settings-panel__label" for="${id}">${label}</label>
          ${description ? `<p class="settings-panel__desc">${description}</p>` : ''}
        </div>
        <textarea 
          class="settings-panel__textarea" 
          id="${id}" 
          data-setting="${id}"
          rows="4"
        >${value}</textarea>
      </div>
    `;
  }

  /**
   * 渲染快捷键输入组件
   */
  private renderShortcut(id: string, label: string, value: string): string {
    return `
      <div class="settings-panel__item">
        <div class="settings-panel__item-info">
          <label class="settings-panel__label" for="${id}">${label}</label>
        </div>
        <input 
          type="text" 
          class="settings-panel__shortcut" 
          id="${id}" 
          data-setting="${id}"
          value="${value}"
          readonly
          placeholder="点击录制快捷键"
        />
      </div>
    `;
  }

  /**
   * 获取提供商对应的模型列表
   */
  private getModelsForProvider(provider: string): Array<{ value: string; label: string }> {
    switch (provider) {
      case 'openai':
        return [
          { value: 'gpt-4', label: 'GPT-4' },
          { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
          { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
        ];
      case 'claude':
        return [
          { value: 'claude-3-opus', label: 'Claude 3 Opus' },
          { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
          { value: 'claude-3-haiku', label: 'Claude 3 Haiku' },
        ];
      case 'ollama':
        return [
          { value: 'llama2', label: 'Llama 2' },
          { value: 'mistral', label: 'Mistral' },
          { value: 'codellama', label: 'Code Llama' },
        ];
      default:
        return [];
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 关闭按钮
    this.container.addEventListener('click', this.handleClick.bind(this));
    
    // 设置值变更
    this.container.addEventListener('change', this.handleChange.bind(this));
    this.container.addEventListener('input', this.handleInput.bind(this));
    
    // 快捷键录制
    this.container.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  /**
   * 处理点击事件
   */
  private handleClick(event: Event): void {
    const target = event.target as HTMLElement;
    
    // 关闭按钮
    if (target.closest('.settings-panel__close')) {
      this.close();
      return;
    }

    // 遮罩层点击
    if (target.classList.contains('settings-panel__overlay')) {
      this.close();
      return;
    }

    // 导航项
    const navItem = target.closest('.settings-panel__nav-item') as HTMLElement;
    if (navItem) {
      const category = navItem.dataset.category as SettingsCategory;
      if (category) {
        this.currentCategory = category;
        this.render();
        this.setupEventListeners();
      }
      return;
    }

    // 密码显示切换
    const passwordToggle = target.closest('.settings-panel__password-toggle') as HTMLElement;
    if (passwordToggle) {
      const targetId = passwordToggle.dataset.target;
      if (targetId) {
        const input = this.container.querySelector(`#${targetId}`) as HTMLInputElement;
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
          passwordToggle.textContent = input.type === 'password' ? '👁️' : '🙈';
        }
      }
      return;
    }

    // 按钮处理
    if (target.closest('#btn-save')) {
      this.handleSave();
    } else if (target.closest('#btn-cancel')) {
      this.handleCancel();
    } else if (target.closest('#btn-reset')) {
      this.handleReset();
    } else if (target.closest('#btn-test-voice')) {
      this.handleTestVoice();
    } else if (target.closest('#btn-reset-shortcuts')) {
      this.handleResetShortcuts();
    } else if (target.closest('#btn-check-update')) {
      this.handleCheckUpdate();
    } else if (target.closest('#btn-export-logs')) {
      this.handleExportLogs();
    } else if (target.closest('#link-website')) {
      this.openLink('https://desktop-pet.app');
    } else if (target.closest('#link-github')) {
      this.openLink('https://github.com/desktop-pet/desktop-pet');
    } else if (target.closest('#link-docs')) {
      this.openLink('https://docs.desktop-pet.app');
    } else if (target.closest('#link-feedback')) {
      this.openLink('https://github.com/desktop-pet/desktop-pet/issues');
    }
  }

  /**
   * 处理值变更
   */
  private handleChange(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const settingId = target.dataset.setting;
    
    if (!settingId) return;
    
    let value: unknown;
    
    if (target instanceof HTMLInputElement) {
      if (target.type === 'checkbox') {
        value = target.checked;
      } else if (target.type === 'range') {
        value = parseFloat(target.value);
      } else {
        value = target.value;
      }
    } else {
      value = target.value;
    }
    
    this.updateSettingValue(settingId, value);
    this.isDirty = true;
    
    // 更新保存按钮状态
    const saveBtn = this.container.querySelector('#btn-save') as HTMLButtonElement;
    if (saveBtn) {
      saveBtn.disabled = false;
    }
    
    // 特殊处理：AI提供商变更时更新模型列表
    if (settingId === 'ai.provider') {
      this.render();
      this.setupEventListeners();
    }
  }

  /**
   * 处理输入事件（滑块实时更新）
   */
  private handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    
    if (target.type === 'range') {
      // 更新显示值
      const valueDisplay = target.closest('.settings-panel__item')?.querySelector('.settings-panel__value');
      if (valueDisplay) {
        valueDisplay.textContent = target.value;
      }
      
      // 更新滑块样式
      const min = parseFloat(target.min);
      const max = parseFloat(target.max);
      const value = parseFloat(target.value);
      const percentage = ((value - min) / (max - min)) * 100;
      target.style.setProperty('--value', `${percentage}%`);
    }
  }

  /**
   * 处理快捷键录制
   */
  private handleKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLInputElement;
    
    if (!target.classList.contains('settings-panel__shortcut')) return;
    
    event.preventDefault();
    
    const keys: string[] = [];
    if (event.ctrlKey) keys.push('Ctrl');
    if (event.altKey) keys.push('Alt');
    if (event.shiftKey) keys.push('Shift');
    if (event.metaKey) keys.push('Meta');
    
    // 添加主键
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
      keys.push(event.key.toUpperCase());
    }
    
    if (keys.length > 0) {
      const shortcut = keys.join('+');
      target.value = shortcut;
      
      const settingId = target.dataset.setting;
      if (settingId) {
        this.updateSettingValue(settingId, shortcut);
        this.isDirty = true;
        
        const saveBtn = this.container.querySelector('#btn-save') as HTMLButtonElement;
        if (saveBtn) {
          saveBtn.disabled = false;
        }
      }
    }
  }

  /**
   * 更新设置值
   */
  private updateSettingValue(path: string, value: unknown): void {
    const parts = path.split('.');
    if (parts.length !== 2) return;
    
    const [category, key] = parts as [keyof SettingsData, string];
    
    if (this.settings[category] && key in this.settings[category]) {
      (this.settings[category] as Record<string, unknown>)[key] = value;
    }
  }

  /**
   * 处理保存
   */
  private async handleSave(): Promise<void> {
    try {
      // 调用保存回调
      this.options.onSave?.(this.settings);
      
      // 通过 IPC 保存设置
      if (window.electronAPI) {
        await window.electronAPI.invoke('settings:save', this.settings);
      }
      
      this.originalSettings = JSON.parse(JSON.stringify(this.settings));
      this.isDirty = false;
      
      this.emit('save', this.settings);
      
      // 显示成功提示
      this.showToast('设置已保存');
      
      // 更新UI
      const saveBtn = this.container.querySelector('#btn-save') as HTMLButtonElement;
      if (saveBtn) {
        saveBtn.disabled = true;
      }
    } catch (error) {
      this.showToast('保存失败，请重试', 'error');
    }
  }

  /**
   * 处理取消
   */
  private handleCancel(): void {
    this.settings = JSON.parse(JSON.stringify(this.originalSettings));
    this.isDirty = false;
    this.options.onCancel?.();
    this.forceClose();
  }

  /**
   * 处理重置
   */
  private handleReset(): void {
    if (confirm('确定要恢复默认设置吗？此操作不可撤销。')) {
      this.settings = this.createDefaultSettings();
      this.isDirty = true;
      this.render();
      this.setupEventListeners();
      this.showToast('已恢复默认设置，请点击保存以应用');
    }
  }

  /**
   * 处理测试语音
   */
  private async handleTestVoice(): Promise<void> {
    try {
      if (window.electronAPI) {
        await window.electronAPI.invoke('voice:test-tts', {
          text: '你好！我是你的桌面宠物助手。',
          ...this.settings.voice,
        });
      } else {
        // 使用浏览器内置 TTS
        const utterance = new SpeechSynthesisUtterance('你好！我是你的桌面宠物助手。');
        utterance.rate = this.settings.voice.ttsSpeed;
        utterance.volume = this.settings.voice.ttsVolume;
        speechSynthesis.speak(utterance);
      }
    } catch (error) {
      this.showToast('语音测试失败', 'error');
    }
  }

  /**
   * 处理重置快捷键
   */
  private handleResetShortcuts(): void {
    if (confirm('确定要重置所有快捷键吗？')) {
      const defaults = this.createDefaultSettings();
      this.settings.shortcuts = defaults.shortcuts;
      this.isDirty = true;
      this.render();
      this.setupEventListeners();
    }
  }

  /**
   * 处理检查更新
   */
  private async handleCheckUpdate(): Promise<void> {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.invoke('app:check-update');
        if (result && (result as { hasUpdate: boolean }).hasUpdate) {
          this.showToast('发现新版本，正在下载...');
        } else {
          this.showToast('当前已是最新版本');
        }
      } else {
        this.showToast('当前已是最新版本');
      }
    } catch (error) {
      this.showToast('检查更新失败', 'error');
    }
  }

  /**
   * 处理导出日志
   */
  private async handleExportLogs(): Promise<void> {
    try {
      if (window.electronAPI) {
        const path = await window.electronAPI.invoke('app:export-logs');
        this.showToast(`日志已导出到: ${path}`);
      }
    } catch (error) {
      this.showToast('导出日志失败', 'error');
    }
  }

  /**
   * 打开外部链接
   */
  private openLink(url: string): void {
    if (window.electronAPI) {
      window.electronAPI.invoke('app:open-external', url);
    } else {
      window.open(url, '_blank');
    }
  }

  /**
   * 显示未保存更改对话框
   */
  private showUnsavedChangesDialog(): void {
    if (confirm('有未保存的更改，确定要离开吗？')) {
      this.settings = JSON.parse(JSON.stringify(this.originalSettings));
      this.isDirty = false;
      this.forceClose();
    }
  }

  /**
   * 显示提示
   */
  private showToast(message: string, type: 'success' | 'error' = 'success'): void {
    const toast = document.createElement('div');
    toast.className = `settings-panel__toast settings-panel__toast--${type}`;
    toast.textContent = message;
    
    this.container.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('settings-panel__toast--visible');
    }, 10);
    
    setTimeout(() => {
      toast.classList.remove('settings-panel__toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * 获取样式
   */
  private getStyles(): string {
    return `
      .settings-panel {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .settings-panel__overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
      }

      .settings-panel__dialog {
        position: relative;
        width: 90%;
        max-width: 800px;
        height: 80vh;
        max-height: 600px;
        background: #1a1a2e;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .settings-panel--light .settings-panel__dialog {
        background: #ffffff;
        color: #333;
      }

      .settings-panel__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .settings-panel__title {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #fff;
      }

      .settings-panel--light .settings-panel__title {
        color: #333;
      }

      .settings-panel__close {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        padding: 4px;
        border-radius: 8px;
        transition: all 0.2s;
      }

      .settings-panel__close:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
      }

      .settings-panel__body {
        flex: 1;
        display: flex;
        overflow: hidden;
      }

      .settings-panel__nav {
        width: 200px;
        padding: 16px;
        border-right: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .settings-panel__nav-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: none;
        border: none;
        border-radius: 8px;
        color: #888;
        cursor: pointer;
        transition: all 0.2s;
        text-align: left;
        font-size: 14px;
      }

      .settings-panel__nav-item:hover {
        background: rgba(255, 255, 255, 0.05);
        color: #fff;
      }

      .settings-panel__nav-item--active {
        background: rgba(99, 102, 241, 0.2);
        color: #6366f1;
      }

      .settings-panel__nav-icon {
        font-size: 18px;
      }

      .settings-panel__content {
        flex: 1;
        padding: 24px;
        overflow-y: auto;
      }

      .settings-panel__section {
        margin-bottom: 32px;
      }

      .settings-panel__section:last-child {
        margin-bottom: 0;
      }

      .settings-panel__section-title {
        margin: 0 0 16px 0;
        font-size: 16px;
        font-weight: 600;
        color: #fff;
      }

      .settings-panel--light .settings-panel__section-title {
        color: #333;
      }

      .settings-panel__section-desc {
        margin: 0 0 16px 0;
        font-size: 13px;
        color: #888;
      }

      .settings-panel__group {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .settings-panel__item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .settings-panel__item--column {
        flex-direction: column;
        align-items: stretch;
      }

      .settings-panel__item-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .settings-panel__item-info {
        flex: 1;
      }

      .settings-panel__label {
        font-size: 14px;
        color: #fff;
      }

      .settings-panel--light .settings-panel__label {
        color: #333;
      }

      .settings-panel__desc {
        margin: 4px 0 0 0;
        font-size: 12px;
        color: #666;
      }

      .settings-panel__value {
        font-size: 14px;
        color: #6366f1;
        font-weight: 500;
      }

      /* Toggle Switch */
      .settings-panel__toggle {
        position: relative;
        width: 48px;
        height: 24px;
      }

      .settings-panel__toggle input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .settings-panel__toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 24px;
        transition: 0.3s;
      }

      .settings-panel__toggle-slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background: #fff;
        border-radius: 50%;
        transition: 0.3s;
      }

      .settings-panel__toggle input:checked + .settings-panel__toggle-slider {
        background: #6366f1;
      }

      .settings-panel__toggle input:checked + .settings-panel__toggle-slider:before {
        transform: translateX(24px);
      }

      /* Select */
      .settings-panel__select {
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #fff;
        font-size: 14px;
        min-width: 160px;
        cursor: pointer;
      }

      .settings-panel__select:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Input */
      .settings-panel__input,
      .settings-panel__shortcut {
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #fff;
        font-size: 14px;
        width: 100%;
      }

      .settings-panel__input:focus,
      .settings-panel__shortcut:focus {
        outline: none;
        border-color: #6366f1;
      }

      .settings-panel__password-wrapper {
        position: relative;
        display: flex;
        align-items: center;
      }

      .settings-panel__password-wrapper .settings-panel__input {
        padding-right: 40px;
      }

      .settings-panel__password-toggle {
        position: absolute;
        right: 8px;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 16px;
        padding: 4px;
      }

      /* Slider */
      .settings-panel__slider {
        width: 100%;
        height: 6px;
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.1);
        appearance: none;
        outline: none;
        cursor: pointer;
      }

      .settings-panel__slider::-webkit-slider-thumb {
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #6366f1;
        cursor: pointer;
      }

      .settings-panel__slider:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Textarea */
      .settings-panel__textarea {
        padding: 12px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #fff;
        font-size: 14px;
        resize: vertical;
        font-family: inherit;
      }

      .settings-panel__textarea:focus {
        outline: none;
        border-color: #6366f1;
      }

      /* Footer */
      .settings-panel__footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .settings-panel__footer-right {
        display: flex;
        gap: 12px;
      }

      .settings-panel__btn {
        padding: 10px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
      }

      .settings-panel__btn--primary {
        background: #6366f1;
        color: #fff;
      }

      .settings-panel__btn--primary:hover:not(:disabled) {
        background: #5558e3;
      }

      .settings-panel__btn--secondary {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }

      .settings-panel__btn--secondary:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.2);
      }

      .settings-panel__btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* About Page */
      .settings-panel__about {
        text-align: center;
        padding: 20px;
      }

      .settings-panel__about-logo {
        font-size: 64px;
        margin-bottom: 16px;
      }

      .settings-panel__about-title {
        margin: 0 0 8px 0;
        font-size: 24px;
        color: #fff;
      }

      .settings-panel__about-version {
        margin: 0 0 24px 0;
        color: #888;
        font-size: 14px;
      }

      .settings-panel__about-info {
        margin-bottom: 24px;
        color: #aaa;
        font-size: 14px;
        line-height: 1.6;
      }

      .settings-panel__about-links {
        display: flex;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 24px;
      }

      .settings-panel__link {
        padding: 8px 16px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #fff;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .settings-panel__link:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .settings-panel__about-actions {
        display: flex;
        justify-content: center;
        gap: 12px;
        margin-bottom: 32px;
      }

      .settings-panel__about-footer {
        color: #666;
        font-size: 12px;
      }

      .settings-panel__about-footer p {
        margin: 4px 0;
      }

      .settings-panel__copyright {
        margin-top: 8px !important;
      }

      /* Toast */
      .settings-panel__toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        padding: 12px 24px;
        background: #333;
        color: #fff;
        border-radius: 8px;
        font-size: 14px;
        opacity: 0;
        transition: all 0.3s;
        z-index: 10001;
      }

      .settings-panel__toast--visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      .settings-panel__toast--success {
        background: #22c55e;
      }

      .settings-panel__toast--error {
        background: #ef4444;
      }
    `;
  }
}

// 扩展 Window 接口
declare global {
  interface Window {
    electronAPI?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, callback: (...args: unknown[]) => void) => void;
      off: (channel: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}

// 导出工厂函数
export function createSettingsPanel(options: SettingsPanelOptions): SettingsPanel {
  return new SettingsPanel(options);
}