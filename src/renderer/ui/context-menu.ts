/**
 * 右键上下文菜单组件
 * 实现宠物右键菜单功能：设置、对话、关于、退出等
 * 
 * Task: T042 [US2] 实现右键上下文菜单
 */

// ============================================================
// 类型定义
// ============================================================

/**
 * 菜单项类型
 */
export type MenuItemType = 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';

/**
 * 菜单项配置
 */
export interface MenuItem {
  /** 菜单项ID */
  id: string;
  /** 显示标签 */
  label?: string;
  /** 菜单项类型 */
  type: MenuItemType;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否选中 (checkbox/radio) */
  checked?: boolean;
  /** 图标 (CSS class 或 emoji) */
  icon?: string;
  /** 快捷键提示 */
  accelerator?: string;
  /** 子菜单 */
  submenu?: MenuItem[];
  /** 点击回调 */
  click?: (item: MenuItem) => void;
  /** 分组名 (radio) */
  group?: string;
}

/**
 * 菜单配置
 */
export interface MenuConfig {
  /** 菜单项列表 */
  items: MenuItem[];
  /** 菜单样式主题 */
  theme?: 'light' | 'dark' | 'system';
  /** 菜单最小宽度 (像素) */
  minWidth?: number;
  /** 是否显示图标 */
  showIcons?: boolean;
  /** 动画持续时间 (毫秒) */
  animationDuration?: number;
  /** 菜单层级 (z-index) */
  zIndex?: number;
}

/**
 * 菜单位置
 */
export interface MenuPosition {
  x: number;
  y: number;
}

/**
 * 菜单事件回调
 */
export interface MenuCallbacks {
  /** 菜单打开时 */
  onOpen?: (position: MenuPosition) => void;
  /** 菜单关闭时 */
  onClose?: () => void;
  /** 菜单项点击时 */
  onItemClick?: (item: MenuItem) => void;
  /** 菜单项悬停时 */
  onItemHover?: (item: MenuItem | null) => void;
}

/**
 * 上下文菜单接口
 */
export interface IContextMenu {
  readonly isOpen: boolean;
  readonly config: MenuConfig;
  
  // 生命周期
  initialize(container?: HTMLElement): void;
  dispose(): void;
  
  // 配置
  setConfig(config: Partial<MenuConfig>): void;
  setCallbacks(callbacks: MenuCallbacks): void;
  setItems(items: MenuItem[]): void;
  
  // 操作
  show(x: number, y: number): void;
  hide(): void;
  toggle(x: number, y: number): void;
  
  // 状态更新
  updateItem(id: string, updates: Partial<MenuItem>): void;
  enableItem(id: string): void;
  disableItem(id: string): void;
  checkItem(id: string, checked: boolean): void;
}

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_CONFIG: MenuConfig = {
  items: [],
  theme: 'system',
  minWidth: 180,
  showIcons: true,
  animationDuration: 150,
  zIndex: 10000,
};

// ============================================================
// 样式定义
// ============================================================

const MENU_STYLES = `
.pet-context-menu {
  position: fixed;
  min-width: var(--menu-min-width, 180px);
  background: var(--menu-bg, #ffffff);
  border: 1px solid var(--menu-border, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 6px 0;
  z-index: var(--menu-z-index, 10000);
  opacity: 0;
  transform: scale(0.95);
  transform-origin: top left;
  transition: opacity var(--menu-animation-duration, 150ms) ease,
              transform var(--menu-animation-duration, 150ms) ease;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  font-size: 13px;
  user-select: none;
}

.pet-context-menu.open {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}

.pet-context-menu.theme-dark {
  --menu-bg: #2d2d2d;
  --menu-border: #404040;
  --menu-item-hover: #3d3d3d;
  --menu-text: #e0e0e0;
  --menu-text-disabled: #707070;
  --menu-separator: #404040;
  --menu-accelerator: #808080;
}

.pet-context-menu.theme-light {
  --menu-bg: #ffffff;
  --menu-border: #e0e0e0;
  --menu-item-hover: #f5f5f5;
  --menu-text: #333333;
  --menu-text-disabled: #999999;
  --menu-separator: #e8e8e8;
  --menu-accelerator: #999999;
}

.pet-context-menu-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  color: var(--menu-text, #333333);
  cursor: pointer;
  transition: background-color 100ms ease;
  gap: 10px;
}

.pet-context-menu-item:hover:not(.disabled):not(.separator) {
  background-color: var(--menu-item-hover, #f5f5f5);
}

.pet-context-menu-item.disabled {
  color: var(--menu-text-disabled, #999999);
  cursor: not-allowed;
}

.pet-context-menu-item.separator {
  height: 1px;
  padding: 0;
  margin: 6px 12px;
  background-color: var(--menu-separator, #e8e8e8);
  cursor: default;
}

.pet-context-menu-item-icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.pet-context-menu-item-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pet-context-menu-item-accelerator {
  color: var(--menu-accelerator, #999999);
  font-size: 12px;
  margin-left: 20px;
  flex-shrink: 0;
}

.pet-context-menu-item-checkbox {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.pet-context-menu-item-arrow {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}

.pet-context-menu-submenu {
  position: absolute;
  left: 100%;
  top: -6px;
  min-width: var(--menu-min-width, 180px);
  background: var(--menu-bg, #ffffff);
  border: 1px solid var(--menu-border, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 6px 0;
  opacity: 0;
  transform: translateX(-10px);
  transition: opacity 150ms ease, transform 150ms ease;
  pointer-events: none;
}

.pet-context-menu-item.has-submenu:hover .pet-context-menu-submenu {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}
`;

// ============================================================
// ContextMenu 实现
// ============================================================

/**
 * 上下文菜单组件
 */
export class ContextMenu implements IContextMenu {
  // 配置
  private _config: MenuConfig;
  private _callbacks: MenuCallbacks = {};
  
  // 状态
  private _isOpen = false;
  private _isInitialized = false;
  
  // DOM 元素
  private _container: HTMLElement | null = null;
  private _menuElement: HTMLElement | null = null;
  private _styleElement: HTMLStyleElement | null = null;
  
  // 事件处理函数引用
  private _boundHandlers: {
    clickOutside?: (e: MouseEvent) => void;
    keydown?: (e: KeyboardEvent) => void;
    resize?: () => void;
  } = {};

  /**
   * 构造函数
   */
  constructor(config?: Partial<MenuConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================
  // 属性访问器
  // ============================================================

  get isOpen(): boolean {
    return this._isOpen;
  }

  get config(): MenuConfig {
    return {
      ...this._config,
      items: [...this._config.items],
    };
  }

  // ============================================================
  // 生命周期
  // ============================================================

  /**
   * 初始化菜单
   */
  initialize(container?: HTMLElement): void {
    if (this._isInitialized) {
      throw new Error('Already initialized');
    }

    this._container = container || document.body;
    
    // 注入样式
    this._injectStyles();
    
    // 创建菜单元素
    this._createMenuElement();
    
    // 设置事件监听
    this._setupEventListeners();

    this._isInitialized = true;
    console.log('[ContextMenu] Initialized');
  }

  /**
   * 销毁菜单
   */
  dispose(): void {
    // 移除事件监听
    this._removeEventListeners();
    
    // 移除菜单元素
    if (this._menuElement && this._menuElement.parentNode) {
      this._menuElement.parentNode.removeChild(this._menuElement);
    }
    
    // 移除样式
    if (this._styleElement && this._styleElement.parentNode) {
      this._styleElement.parentNode.removeChild(this._styleElement);
    }

    // 清理状态
    this._container = null;
    this._menuElement = null;
    this._styleElement = null;
    this._isOpen = false;
    this._isInitialized = false;
    this._callbacks = {};
    this._boundHandlers = {};

    console.log('[ContextMenu] Disposed');
  }

  // ============================================================
  // 配置
  // ============================================================

  /**
   * 更新配置
   */
  setConfig(config: Partial<MenuConfig>): void {
    this._config = { ...this._config, ...config };
    this._applyConfig();
  }

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: MenuCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  /**
   * 设置菜单项
   */
  setItems(items: MenuItem[]): void {
    this._config.items = items;
    this._renderMenuItems();
  }

  // ============================================================
  // 操作
  // ============================================================

  /**
   * 显示菜单
   */
  show(x: number, y: number): void {
    if (!this._isInitialized || !this._menuElement) {
      console.warn('[ContextMenu] Not initialized');
      return;
    }

    // 先渲染以获取尺寸
    this._renderMenuItems();

    // 计算位置 (确保不超出视口)
    const position = this._calculatePosition(x, y);
    
    // 设置位置
    this._menuElement.style.left = `${position.x}px`;
    this._menuElement.style.top = `${position.y}px`;

    // 显示菜单
    this._menuElement.classList.add('open');
    this._isOpen = true;

    // 触发回调
    this._callbacks.onOpen?.(position);

    console.log('[ContextMenu] Opened at', position);
  }

  /**
   * 隐藏菜单
   */
  hide(): void {
    if (!this._isOpen || !this._menuElement) {
      return;
    }

    this._menuElement.classList.remove('open');
    this._isOpen = false;

    // 触发回调
    this._callbacks.onClose?.();

    console.log('[ContextMenu] Closed');
  }

  /**
   * 切换菜单显示状态
   */
  toggle(x: number, y: number): void {
    if (this._isOpen) {
      this.hide();
    } else {
      this.show(x, y);
    }
  }

  // ============================================================
  // 状态更新
  // ============================================================

  /**
   * 更新菜单项
   */
  updateItem(id: string, updates: Partial<MenuItem>): void {
    const item = this._findItem(id);
    if (item) {
      Object.assign(item, updates);
      if (this._isOpen) {
        this._renderMenuItems();
      }
    }
  }

  /**
   * 启用菜单项
   */
  enableItem(id: string): void {
    this.updateItem(id, { disabled: false });
  }

  /**
   * 禁用菜单项
   */
  disableItem(id: string): void {
    this.updateItem(id, { disabled: true });
  }

  /**
   * 设置菜单项选中状态
   */
  checkItem(id: string, checked: boolean): void {
    this.updateItem(id, { checked });
  }

  // ============================================================
  // 私有方法：DOM 操作
  // ============================================================

  /**
   * 注入样式
   */
  private _injectStyles(): void {
    // 检查是否已存在样式
    if (document.getElementById('pet-context-menu-styles')) {
      return;
    }

    this._styleElement = document.createElement('style');
    this._styleElement.id = 'pet-context-menu-styles';
    this._styleElement.textContent = MENU_STYLES;
    document.head.appendChild(this._styleElement);
  }

  /**
   * 创建菜单元素
   */
  private _createMenuElement(): void {
    this._menuElement = document.createElement('div');
    this._menuElement.className = 'pet-context-menu';
    this._applyConfig();
    this._container?.appendChild(this._menuElement);
  }

  /**
   * 应用配置
   */
  private _applyConfig(): void {
    if (!this._menuElement) return;

    // 设置 CSS 变量
    this._menuElement.style.setProperty('--menu-min-width', `${this._config.minWidth}px`);
    this._menuElement.style.setProperty('--menu-z-index', `${this._config.zIndex}`);
    this._menuElement.style.setProperty('--menu-animation-duration', `${this._config.animationDuration}ms`);

    // 设置主题
    this._menuElement.classList.remove('theme-light', 'theme-dark');
    const theme = this._getEffectiveTheme();
    this._menuElement.classList.add(`theme-${theme}`);
  }

  /**
   * 获取有效主题
   */
  private _getEffectiveTheme(): 'light' | 'dark' {
    if (this._config.theme === 'system') {
      // 检测系统主题
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'light';
    }
    return this._config.theme || 'light';
  }

  /**
   * 渲染菜单项
   */
  private _renderMenuItems(): void {
    if (!this._menuElement) return;

    this._menuElement.innerHTML = '';

    for (const item of this._config.items) {
      const element = this._createMenuItemElement(item);
      this._menuElement.appendChild(element);
    }
  }

  /**
   * 创建菜单项元素
   */
  private _createMenuItemElement(item: MenuItem): HTMLElement {
    const element = document.createElement('div');
    element.className = 'pet-context-menu-item';
    element.dataset.id = item.id;

    // 分隔线
    if (item.type === 'separator') {
      element.classList.add('separator');
      return element;
    }

    // 禁用状态
    if (item.disabled) {
      element.classList.add('disabled');
    }

    // 子菜单标记
    if (item.type === 'submenu' && item.submenu) {
      element.classList.add('has-submenu');
    }

    // 图标
    if (this._config.showIcons) {
      const iconEl = document.createElement('span');
      iconEl.className = 'pet-context-menu-item-icon';
      if (item.icon) {
        iconEl.textContent = item.icon;
      }
      element.appendChild(iconEl);
    }

    // 复选框/单选框
    if (item.type === 'checkbox' || item.type === 'radio') {
      const checkEl = document.createElement('span');
      checkEl.className = 'pet-context-menu-item-checkbox';
      checkEl.textContent = item.checked ? '✓' : '';
      element.appendChild(checkEl);
    }

    // 标签
    const labelEl = document.createElement('span');
    labelEl.className = 'pet-context-menu-item-label';
    labelEl.textContent = item.label || '';
    element.appendChild(labelEl);

    // 快捷键
    if (item.accelerator) {
      const accelEl = document.createElement('span');
      accelEl.className = 'pet-context-menu-item-accelerator';
      accelEl.textContent = item.accelerator;
      element.appendChild(accelEl);
    }

    // 子菜单箭头
    if (item.type === 'submenu') {
      const arrowEl = document.createElement('span');
      arrowEl.className = 'pet-context-menu-item-arrow';
      arrowEl.textContent = '▶';
      element.appendChild(arrowEl);

      // 子菜单
      if (item.submenu) {
        const submenuEl = document.createElement('div');
        submenuEl.className = 'pet-context-menu-submenu';
        for (const subItem of item.submenu) {
          submenuEl.appendChild(this._createMenuItemElement(subItem));
        }
        element.appendChild(submenuEl);
      }
    }

    // 点击事件
    if (!item.disabled && item.type !== 'separator') {
      element.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleItemClick(item);
      });

      // 悬停事件
      element.addEventListener('mouseenter', () => {
        this._callbacks.onItemHover?.(item);
      });

      element.addEventListener('mouseleave', () => {
        this._callbacks.onItemHover?.(null);
      });
    }

    return element;
  }

  // ============================================================
  // 私有方法：事件处理
  // ============================================================

  /**
   * 设置事件监听
   */
  private _setupEventListeners(): void {
    // 点击外部关闭
    this._boundHandlers.clickOutside = (e: MouseEvent) => {
      if (this._isOpen && this._menuElement && !this._menuElement.contains(e.target as Node)) {
        this.hide();
      }
    };
    document.addEventListener('mousedown', this._boundHandlers.clickOutside);

    // ESC 键关闭
    this._boundHandlers.keydown = (e: KeyboardEvent) => {
      if (this._isOpen && e.key === 'Escape') {
        this.hide();
      }
    };
    document.addEventListener('keydown', this._boundHandlers.keydown);

    // 窗口大小改变时关闭
    this._boundHandlers.resize = () => {
      if (this._isOpen) {
        this.hide();
      }
    };
    window.addEventListener('resize', this._boundHandlers.resize);
  }

  /**
   * 移除事件监听
   */
  private _removeEventListeners(): void {
    if (this._boundHandlers.clickOutside) {
      document.removeEventListener('mousedown', this._boundHandlers.clickOutside);
    }
    if (this._boundHandlers.keydown) {
      document.removeEventListener('keydown', this._boundHandlers.keydown);
    }
    if (this._boundHandlers.resize) {
      window.removeEventListener('resize', this._boundHandlers.resize);
    }
    this._boundHandlers = {};
  }

  /**
   * 处理菜单项点击
   */
  private _handleItemClick(item: MenuItem): void {
    // checkbox 切换
    if (item.type === 'checkbox') {
      item.checked = !item.checked;
      this._renderMenuItems();
    }

    // radio 选择
    if (item.type === 'radio' && item.group) {
      this._selectRadioItem(item);
    }

    // 子菜单不关闭
    if (item.type === 'submenu') {
      return;
    }

    // 调用项目回调
    item.click?.(item);

    // 调用通用回调
    this._callbacks.onItemClick?.(item);

    // 关闭菜单
    this.hide();
  }

  /**
   * 选择 radio 项
   */
  private _selectRadioItem(selectedItem: MenuItem): void {
    for (const item of this._config.items) {
      if (item.type === 'radio' && item.group === selectedItem.group) {
        item.checked = item.id === selectedItem.id;
      }
    }
    this._renderMenuItems();
  }

  // ============================================================
  // 私有方法：辅助
  // ============================================================

  /**
   * 计算菜单位置 (确保不超出视口)
   */
  private _calculatePosition(x: number, y: number): MenuPosition {
    if (!this._menuElement) {
      return { x, y };
    }

    const rect = this._menuElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let posX = x;
    let posY = y;

    // 右边界检测
    if (x + rect.width > viewportWidth) {
      posX = viewportWidth - rect.width - 10;
    }

    // 下边界检测
    if (y + rect.height > viewportHeight) {
      posY = viewportHeight - rect.height - 10;
    }

    // 确保不小于 0
    posX = Math.max(10, posX);
    posY = Math.max(10, posY);

    return { x: posX, y: posY };
  }

  /**
   * 查找菜单项
   */
  private _findItem(id: string, items: MenuItem[] = this._config.items): MenuItem | null {
    for (const item of items) {
      if (item.id === id) {
        return item;
      }
      if (item.submenu) {
        const found = this._findItem(id, item.submenu);
        if (found) return found;
      }
    }
    return null;
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建上下文菜单实例
 */
export function createContextMenu(config?: Partial<MenuConfig>): IContextMenu {
  return new ContextMenu(config);
}

// ============================================================
// 预定义菜单项工厂
// ============================================================

/**
 * 创建分隔线
 */
export function createSeparator(): MenuItem {
  return {
    id: `separator-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'separator',
  };
}

/**
 * 创建普通菜单项
 */
export function createMenuItem(
  id: string,
  label: string,
  options?: Partial<Omit<MenuItem, 'id' | 'label' | 'type'>>
): MenuItem {
  return {
    id,
    label,
    type: 'normal',
    ...options,
  };
}

/**
 * 创建复选框菜单项
 */
export function createCheckboxItem(
  id: string,
  label: string,
  checked: boolean = false,
  options?: Partial<Omit<MenuItem, 'id' | 'label' | 'type' | 'checked'>>
): MenuItem {
  return {
    id,
    label,
    type: 'checkbox',
    checked,
    ...options,
  };
}

/**
 * 创建子菜单
 */
export function createSubmenu(
  id: string,
  label: string,
  submenu: MenuItem[],
  options?: Partial<Omit<MenuItem, 'id' | 'label' | 'type' | 'submenu'>>
): MenuItem {
  return {
    id,
    label,
    type: 'submenu',
    submenu,
    ...options,
  };
}

// ============================================================
// 默认宠物菜单配置
// ============================================================

/**
 * 创建默认宠物右键菜单
 */
export function createDefaultPetMenu(callbacks: {
  onSettings?: () => void;
  onChat?: () => void;
  onAbout?: () => void;
  onMute?: (muted: boolean) => void;
  onAlwaysOnTop?: (alwaysOnTop: boolean) => void;
  onQuit?: () => void;
}): MenuItem[] {
  return [
    createMenuItem('chat', '💬 对话', {
      icon: '💬',
      accelerator: 'Ctrl+Enter',
      click: () => callbacks.onChat?.(),
    }),
    createSeparator(),
    createCheckboxItem('alwaysOnTop', '📌 置顶显示', true, {
      icon: '📌',
      click: (item) => callbacks.onAlwaysOnTop?.(item.checked ?? false),
    }),
    createCheckboxItem('mute', '🔇 静音', false, {
      icon: '🔇',
      click: (item) => callbacks.onMute?.(item.checked ?? false),
    }),
    createSeparator(),
    createSubmenu('animations', '🎭 动画', [
      createMenuItem('anim-idle', '😊 待机', { icon: '😊' }),
      createMenuItem('anim-happy', '😄 开心', { icon: '😄' }),
      createMenuItem('anim-thinking', '🤔 思考', { icon: '🤔' }),
      createMenuItem('anim-sleepy', '😴 瞌睡', { icon: '😴' }),
    ], { icon: '🎭' }),
    createSeparator(),
    createMenuItem('settings', '⚙️ 设置', {
      icon: '⚙️',
      accelerator: 'Ctrl+,',
      click: () => callbacks.onSettings?.(),
    }),
    createMenuItem('about', 'ℹ️ 关于', {
      icon: 'ℹ️',
      click: () => callbacks.onAbout?.(),
    }),
    createSeparator(),
    createMenuItem('quit', '❌ 退出', {
      icon: '❌',
      accelerator: 'Ctrl+Q',
      click: () => callbacks.onQuit?.(),
    }),
  ];
}

// ============================================================
// 辅助函数：集成到 PetInteraction
// ============================================================

/**
 * 设置宠物交互的右键菜单
 * 
 * @example
 * ```typescript
 * import { createPetInteraction } from './pet-interaction';
 * import { setupPetContextMenu } from './context-menu';
 * 
 * const interaction = createPetInteraction();
 * interaction.initialize(container);
 * 
 * const { menu, cleanup } = setupPetContextMenu(interaction, {
 *   onSettings: () => openSettingsPanel(),
 *   onChat: () => openChatWindow(),
 *   onQuit: () => app.quit(),
 * });
 * 
 * // 清理
 * cleanup();
 * ```
 */
export function setupPetContextMenu(
  interaction: { setCallbacks: (callbacks: { onRightClick?: (event: { position: { x: number; y: number } }) => void }) => void },
  callbacks: Parameters<typeof createDefaultPetMenu>[0],
  config?: Partial<MenuConfig>
): { menu: IContextMenu; cleanup: () => void } {
  const menu = createContextMenu(config);
  menu.initialize();
  menu.setItems(createDefaultPetMenu(callbacks));

  // 设置交互回调
  interaction.setCallbacks({
    onRightClick: (event) => {
      menu.show(event.position.x, event.position.y);
    },
  });

  return {
    menu,
    cleanup: () => menu.dispose(),
  };
}

// ============================================================
// 导出
// ============================================================

export default ContextMenu;