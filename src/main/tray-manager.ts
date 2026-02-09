/**
 * 系统托盘管理器
 *
 * 管理系统托盘图标、菜单和交互：
 * - 创建和管理托盘图标
 * - 右键上下文菜单
 * - 托盘点击事件处理
 * - 托盘提示信息
 *
 * @task T072 [US4] 实现系统托盘管理器
 */

import {
  Tray,
  Menu,
  MenuItemConstructorOptions,
  nativeImage,
  BrowserWindow,
  app,
} from 'electron';
import * as path from 'path';
import { ipcLogger } from './logger';
import { EventBus, getGlobalEventBus } from '../shared/services/event-bus';
import { EventTypes } from '../shared/types/events';
import { dialog } from 'electron';

// ============================================================================
// Types
// ============================================================================

/**
 * 托盘菜单项配置
 */
export interface TrayMenuItem {
  id: string;
  label: string;
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';
  enabled?: boolean;
  visible?: boolean;
  checked?: boolean;
  accelerator?: string;
  icon?: string;
  click?: () => void;
  submenu?: TrayMenuItem[];
}

/**
 * 托盘管理器配置
 */
export interface TrayManagerConfig {
  /** 托盘图标路径 */
  iconPath?: string;
  /** 托盘提示文本 */
  tooltip?: string;
  /** 是否在点击时显示窗口 */
  showOnClick?: boolean;
  /** 是否在双击时显示窗口 */
  showOnDoubleClick?: boolean;
}

/**
 * 托盘状态
 */
export interface TrayState {
  /** 是否已创建 */
  created: boolean;
  /** 当前提示文本 */
  tooltip: string;
  /** 是否有通知标记 */
  hasNotificationBadge: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * 默认托盘图标路径
 */
const DEFAULT_ICON_PATH = path.join(__dirname, '../../assets/icons/tray-icon.png');

/**
 * 默认托盘提示
 */
const DEFAULT_TOOLTIP = '桌面3D小宠物';

/**
 * 托盘菜单项ID
 */
export const TrayMenuIds = {
  SHOW_PET: 'show-pet',
  HIDE_PET: 'hide-pet',
  OPEN_CHAT: 'open-chat',
  SETTINGS: 'settings',
  REMINDERS: 'reminders',
  ALWAYS_ON_TOP: 'always-on-top',
  CHECK_UPDATE: 'check-update',
  ABOUT: 'about',
  SEPARATOR: 'separator',
  QUIT: 'quit',
} as const;

// ============================================================================
// Tray Manager
// ============================================================================

/**
 * 系统托盘管理器
 * 单例模式管理系统托盘
 */
export class TrayManager {
  private static instance: TrayManager | null = null;
  private tray: Tray | null = null;
  private config: Required<TrayManagerConfig>;
  private state: TrayState;
  private eventBus: EventBus;
  private isAlwaysOnTop = true;

  private constructor(config: TrayManagerConfig = {}) {
    this.config = {
      iconPath: config.iconPath ?? DEFAULT_ICON_PATH,
      tooltip: config.tooltip ?? DEFAULT_TOOLTIP,
      showOnClick: config.showOnClick ?? true,
      showOnDoubleClick: config.showOnDoubleClick ?? false,
    };

    this.state = {
      created: false,
      tooltip: this.config.tooltip,
      hasNotificationBadge: false,
    };

    this.eventBus = getGlobalEventBus();
  }

  /**
   * 获取托盘管理器实例
   */
  static getInstance(config?: TrayManagerConfig): TrayManager {
    if (!TrayManager.instance) {
      TrayManager.instance = new TrayManager(config);
    }
    return TrayManager.instance;
  }

  /**
   * 重置实例（用于测试）
   */
  static resetInstance(): void {
    if (TrayManager.instance) {
      TrayManager.instance.destroy();
      TrayManager.instance = null;
    }
  }

  /**
   * 初始化托盘
   */
  initialize(): void {
    if (this.tray) {
      ipcLogger.warn('Tray already initialized', { action: 'initialize' });
      return;
    }

    try {
      // 创建托盘图标
      const icon = this.createTrayIcon();
      this.tray = new Tray(icon);

      // 设置提示
      this.tray.setToolTip(this.config.tooltip);

      // 设置上下文菜单
      this.updateContextMenu();

      // 绑定事件
      this.bindEvents();

      this.state.created = true;

      ipcLogger.info('Tray initialized', {
        action: 'initialize',
        iconPath: this.config.iconPath,
      });
    } catch (error) {
      ipcLogger.error('Failed to initialize tray', {
        action: 'initialize',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 销毁托盘
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
      this.state.created = false;

      ipcLogger.info('Tray destroyed', { action: 'destroy' });
    }
  }

  /**
   * 创建托盘图标
   */
  private createTrayIcon(): Electron.NativeImage {
    let icon: Electron.NativeImage;

    try {
      icon = nativeImage.createFromPath(this.config.iconPath);

      // 检查图标是否有效
      if (icon.isEmpty()) {
        ipcLogger.warn('Tray icon is empty, using default', {
          action: 'createTrayIcon',
          path: this.config.iconPath,
        });
        icon = this.createDefaultIcon();
      }

      // 根据平台调整图标大小
      if (process.platform === 'darwin') {
        // macOS 托盘图标推荐 16x16 或 22x22
        icon = icon.resize({ width: 16, height: 16 });
      } else if (process.platform === 'win32') {
        // Windows 托盘图标推荐 16x16 或 32x32
        icon = icon.resize({ width: 16, height: 16 });
      }
    } catch (error) {
      ipcLogger.warn('Failed to load tray icon, using default', {
        action: 'createTrayIcon',
        error: error instanceof Error ? error.message : String(error),
      });
      icon = this.createDefaultIcon();
    }

    return icon;
  }

  /**
   * 创建默认图标（当图标文件不存在时）
   */
  private createDefaultIcon(): Electron.NativeImage {
    // 创建一个简单的彩色图标
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4);

    // 填充为蓝色圆形
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const centerX = size / 2;
        const centerY = size / 2;
        const radius = size / 2 - 1;
        const distance = Math.sqrt(
          Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
        );

        if (distance <= radius) {
          // 蓝色 (#4A90D9)
          canvas[idx] = 74; // R
          canvas[idx + 1] = 144; // G
          canvas[idx + 2] = 217; // B
          canvas[idx + 3] = 255; // A
        } else {
          // 透明
          canvas[idx] = 0;
          canvas[idx + 1] = 0;
          canvas[idx + 2] = 0;
          canvas[idx + 3] = 0;
        }
      }
    }

    return nativeImage.createFromBuffer(canvas, {
      width: size,
      height: size,
    });
  }

  /**
   * 绑定托盘事件
   */
  private bindEvents(): void {
    if (!this.tray) {return;}

    // 单击事件
    this.tray.on('click', (_event, bounds) => {
      ipcLogger.debug('Tray clicked', { action: 'click', bounds });

      if (this.config.showOnClick) {
        this.showMainWindow();
      }

      this.eventBus.emit({
        type: EventTypes.SYSTEM.TRAY_CLICK,
        payload: { 
          position: { x: bounds.x, y: bounds.y },
          bounds: bounds,
        },
        timestamp: Date.now(),
      });
    });

    // 双击事件
    this.tray.on('double-click', (_event, bounds) => {
      ipcLogger.debug('Tray double-clicked', { action: 'double-click', bounds });

      if (this.config.showOnDoubleClick) {
        this.showMainWindow();
      }
    });

    // 右键事件（某些平台需要）
    this.tray.on('right-click', (_event, bounds) => {
      ipcLogger.debug('Tray right-clicked', { action: 'right-click', bounds });
      // 上下文菜单会自动显示
    });

    // 气球消息点击（Windows）
    if (process.platform === 'win32') {
      this.tray.on('balloon-click', () => {
        ipcLogger.debug('Tray balloon clicked', { action: 'balloon-click' });
        this.showMainWindow();
      });
    }
  }

  /**
   * 更新上下文菜单
   */
  updateContextMenu(customItems?: TrayMenuItem[]): void {
    if (!this.tray) {return;}

    const menuItems = customItems ?? this.getDefaultMenuItems();
    const template = this.convertToElectronMenuItems(menuItems);
    const contextMenu = Menu.buildFromTemplate(template);

    this.tray.setContextMenu(contextMenu);

    ipcLogger.debug('Context menu updated', {
      action: 'updateContextMenu',
      itemCount: menuItems.length,
    });
  }

  /**
   * 获取默认菜单项
   */
  private getDefaultMenuItems(): TrayMenuItem[] {
    return [
      {
        id: TrayMenuIds.SHOW_PET,
        label: '显示宠物',
        click: () => this.handleMenuClick(TrayMenuIds.SHOW_PET),
      },
      {
        id: TrayMenuIds.OPEN_CHAT,
        label: '打开对话',
        click: () => this.handleMenuClick(TrayMenuIds.OPEN_CHAT),
      },
      {
        id: TrayMenuIds.SEPARATOR,
        label: '',
        type: 'separator',
      },
      {
        id: TrayMenuIds.REMINDERS,
        label: '提醒事项',
        click: () => this.handleMenuClick(TrayMenuIds.REMINDERS),
      },
      {
        id: TrayMenuIds.SETTINGS,
        label: '设置',
        click: () => this.handleMenuClick(TrayMenuIds.SETTINGS),
      },
      {
        id: TrayMenuIds.SEPARATOR,
        label: '',
        type: 'separator',
      },
      {
        id: TrayMenuIds.ALWAYS_ON_TOP,
        label: '窗口置顶',
        type: 'checkbox',
        checked: this.isAlwaysOnTop,
        click: () => this.handleMenuClick(TrayMenuIds.ALWAYS_ON_TOP),
      },
      {
        id: TrayMenuIds.CHECK_UPDATE,
        label: '检查更新',
        click: () => this.handleMenuClick(TrayMenuIds.CHECK_UPDATE),
      },
      {
        id: TrayMenuIds.ABOUT,
        label: '关于',
        click: () => this.handleMenuClick(TrayMenuIds.ABOUT),
      },
      {
        id: TrayMenuIds.SEPARATOR,
        label: '',
        type: 'separator',
      },
      {
        id: TrayMenuIds.QUIT,
        label: '退出',
        click: () => this.handleMenuClick(TrayMenuIds.QUIT),
      },
    ];
  }

  /**
   * 转换为 Electron 菜单项格式
   */
  private convertToElectronMenuItems(
    items: TrayMenuItem[]
  ): MenuItemConstructorOptions[] {
    return items.map((item) => {
      const electronItem: MenuItemConstructorOptions = {
        id: item.id,
        label: item.label,
        enabled: item.enabled ?? true,
        visible: item.visible ?? true,
      };

      // 只在 type 存在时添加，避免 undefined 赋值问题
      if (item.type) {
        electronItem.type = item.type;
      }

      // 只在 checked 存在时添加，避免 undefined 赋值给可选属性
      if (item.checked !== undefined) {
        electronItem.checked = item.checked;
      }

      // 只在 accelerator 存在时添加，避免 undefined 赋值给可选属性
      if (item.accelerator !== undefined) {
        electronItem.accelerator = item.accelerator;
      }

      // 只在 click 存在时添加，避免 undefined 赋值给可选属性
      if (item.click) {
        electronItem.click = item.click;
      }

      if (item.icon) {
        try {
          electronItem.icon = nativeImage.createFromPath(item.icon);
        } catch {
          // 忽略图标加载错误
        }
      }

      if (item.submenu) {
        electronItem.submenu = this.convertToElectronMenuItems(item.submenu);
      }

      return electronItem;
    });
  }

  /**
   * 处理菜单点击
   */
  private handleMenuClick(menuId: string): void {
    ipcLogger.debug('Menu item clicked', { action: 'menuClick', menuId });

    const mainWindow = this.getMainWindow();

    switch (menuId) {
      case TrayMenuIds.SHOW_PET:
        this.showMainWindow();
        break;

      case TrayMenuIds.HIDE_PET:
        if (mainWindow) {
          mainWindow.hide();
        }
        break;

      case TrayMenuIds.OPEN_CHAT:
        this.showMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send('tray:action', { action: 'open-chat' });
        }
        break;

      case TrayMenuIds.REMINDERS:
        this.showMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send('tray:action', { action: 'show-reminders' });
        }
        break;

      case TrayMenuIds.SETTINGS:
        this.showMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send('tray:action', { action: 'open-settings' });
        }
        break;

      case TrayMenuIds.ALWAYS_ON_TOP:
        this.isAlwaysOnTop = !this.isAlwaysOnTop;
        if (mainWindow) {
          mainWindow.setAlwaysOnTop(this.isAlwaysOnTop);
          mainWindow.webContents.send('tray:action', {
            action: 'always-on-top-changed',
            data: this.isAlwaysOnTop,
          });
        }
        // 更新菜单以反映新状态
        this.updateContextMenu();
        break;

      case TrayMenuIds.CHECK_UPDATE:
        if (mainWindow) {
          mainWindow.webContents.send('tray:action', { action: 'check-update' });
        }
        break;

      case TrayMenuIds.ABOUT:
        this.showAboutDialog();
        break;

      case TrayMenuIds.QUIT:
        app.quit();
        break;

      default:
        ipcLogger.warn('Unknown menu item clicked', {
          action: 'menuClick',
          menuId,
        });
    }
  }

  /**
   * 显示主窗口
   */
  private showMainWindow(): void {
    const mainWindow = this.getMainWindow();

    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  }

  /**
   * 获取主窗口
   */
  private getMainWindow(): BrowserWindow | null {
    const windows = BrowserWindow.getAllWindows();
    return windows[0] ?? null;
  }

  /**
   * 显示关于对话框
   */
  private showAboutDialog(): void {
    void dialog.showMessageBox({
      type: 'info',
      title: '关于 桌面3D小宠物',
      message: '桌面3D小宠物',
      detail: `版本: ${app.getVersion()}\n\n一个可爱的桌面伴侣，支持AI对话、提醒功能等。`,
      buttons: ['确定'],
    });
  }

  /**
   * 设置托盘提示
   */
  setTooltip(tooltip: string): void {
    if (this.tray) {
      this.tray.setToolTip(tooltip);
      this.state.tooltip = tooltip;

      ipcLogger.debug('Tooltip updated', { action: 'setTooltip', tooltip });
    }
  }

  /**
   * 设置托盘图标
   */
  setIcon(iconPath: string): void {
    if (this.tray) {
      try {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) {
          this.tray.setImage(icon);
          ipcLogger.debug('Tray icon updated', { action: 'setIcon', iconPath });
        }
      } catch (error) {
        ipcLogger.error('Failed to set tray icon', {
          action: 'setIcon',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * 显示通知标记（Windows）
   */
  setNotificationBadge(show: boolean): void {
    this.state.hasNotificationBadge = show;

    if (process.platform === 'win32' && this.tray) {
      // Windows 可以通过改变图标来显示通知标记
      // 这里简单地更新提示文本
      const tooltip = show
        ? `${this.config.tooltip} (有新通知)`
        : this.config.tooltip;
      this.tray.setToolTip(tooltip);
    }

    ipcLogger.debug('Notification badge updated', {
      action: 'setNotificationBadge',
      show,
    });
  }

  /**
   * 显示气球消息（Windows）
   */
  showBalloon(title: string, content: string): void {
    if (process.platform === 'win32' && this.tray) {
      this.tray.displayBalloon({
        title,
        content,
        iconType: 'info',
      });

      ipcLogger.debug('Balloon shown', {
        action: 'showBalloon',
        title,
        content,
      });
    }
  }

  /**
   * 获取托盘状态
   */
  getState(): TrayState {
    return { ...this.state };
  }

  /**
   * 设置窗口置顶状态
   */
  setAlwaysOnTop(value: boolean): void {
    this.isAlwaysOnTop = value;
    this.updateContextMenu();
  }

  /**
   * 检查托盘是否已初始化
   */
  isInitialized(): boolean {
    return this.tray !== null;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

let trayManagerInstance: TrayManager | null = null;

/**
 * 获取托盘管理器实例
 */
export function getTrayManager(config?: TrayManagerConfig): TrayManager {
  if (!trayManagerInstance) {
    trayManagerInstance = TrayManager.getInstance(config);
  }
  return trayManagerInstance;
}

/**
 * 初始化托盘
 */
export function initializeTray(config?: TrayManagerConfig): void {
  const manager = getTrayManager(config);
  manager.initialize();
}

/**
 * 销毁托盘
 */
export function destroyTray(): void {
  if (trayManagerInstance) {
    trayManagerInstance.destroy();
    TrayManager.resetInstance();
    trayManagerInstance = null;
  }
}

// ============================================================================
// Exports
// ============================================================================

export default TrayManager;