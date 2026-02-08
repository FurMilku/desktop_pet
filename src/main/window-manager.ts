/**
 * 透明无边框窗口管理器
 * T027 [US1] 实现透明无边框窗口管理器（含多显示器位置记忆）
 *
 * @see specs/001-desktop-3d-pet/spec.md FR-001, FR-002, FR-028
 * @see specs/001-desktop-3d-pet/contracts/ipc-api.md Window API
 */

import { BrowserWindow, screen, Display, app } from 'electron';
import * as path from 'path';
import { DatabaseService, getGlobalDatabaseService } from '../shared/services/database';
import { getLogger } from './logger';

const logger = getLogger('window-manager');

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 显示器信息接口
 */
export interface DisplayInfo {
  /** 显示器唯一标识 */
  id: number;
  /** 显示器边界 */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 工作区域（排除任务栏等） */
  workArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 是否为主显示器 */
  isPrimary: boolean;
  /** 缩放因子 */
  scaleFactor: number;
}

/**
 * 窗口位置接口
 */
export interface WindowPosition {
  x: number;
  y: number;
  /** 所在显示器ID */
  monitorId: number;
}

/**
 * 窗口配置选项
 */
export interface WindowOptions {
  /** 窗口宽度 */
  width?: number;
  /** 窗口高度 */
  height?: number;
  /** 是否透明 */
  transparent?: boolean;
  /** 是否无边框 */
  frameless?: boolean;
  /** 是否置顶 */
  alwaysOnTop?: boolean;
  /** 是否可点击穿透 */
  clickThrough?: boolean;
  /** 初始位置 */
  position?: WindowPosition;
}

/**
 * 窗口状态
 */
export interface WindowState {
  /** 是否可见 */
  isVisible: boolean;
  /** 是否最小化 */
  isMinimized: boolean;
  /** 是否置顶 */
  isAlwaysOnTop: boolean;
  /** 当前位置 */
  position: WindowPosition;
  /** 窗口尺寸 */
  size: { width: number; height: number };
}

/**
 * 窗口管理器接口
 */
export interface IWindowManager {
  initialize(): Promise<void>;
  dispose(): void;
  createMainWindow(options?: WindowOptions): Promise<void>;
  getWindowState(): WindowState;
  moveTo(x: number, y: number): void;
  moveBy(deltaX: number, deltaY: number): void;
  setAlwaysOnTop(alwaysOnTop: boolean): void;
  setOpacity(opacity: number): void;
  setClickThrough(enable: boolean, options?: { forward?: boolean }): void;
  show(): void;
  hide(): void;
  minimizeToTray(): void;
  restoreFromTray(): void;
  getDisplays(): DisplayInfo[];
  getCurrentDisplay(): DisplayInfo;
  savePosition(): Promise<void>;
  restorePosition(): Promise<boolean>;
  constrainToScreen(): void;
  onMove(callback: (position: WindowPosition) => void): () => void;
  onDisplayChanged(callback: (displays: DisplayInfo[]) => void): () => void;
  getWindow(): BrowserWindow | null;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_WINDOW_OPTIONS: Required<Omit<WindowOptions, 'position'>> & { position: WindowPosition | null } = {
  width: 300,
  height: 400,
  transparent: true,
  frameless: true,
  alwaysOnTop: true,
  clickThrough: false,
  position: null,
};

const POSITION_STORAGE_KEY = 'pet_window_position';

// ============================================================================
// 窗口管理器实现
// ============================================================================

/**
 * 透明无边框窗口管理器实现
 */
export class WindowManager implements IWindowManager {
  private window: BrowserWindow | null = null;
  private db: DatabaseService | null = null;
  private isInitialized = false;
  private moveCallbacks: Set<(position: WindowPosition) => void> = new Set();
  private displayCallbacks: Set<(displays: DisplayInfo[]) => void> = new Set();
  private currentState: WindowState;
  private displayChangeHandler: (() => void) | null = null;

  constructor() {
    // 初始化默认状态
    this.currentState = {
      isVisible: false,
      isMinimized: false,
      isAlwaysOnTop: true,
      position: { x: 100, y: 100, monitorId: 0 },
      size: { width: DEFAULT_WINDOW_OPTIONS.width, height: DEFAULT_WINDOW_OPTIONS.height },
    };
  }

  // --------------------------------------------------------------------------
  // 生命周期方法
  // --------------------------------------------------------------------------

  /**
   * 初始化窗口管理器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('WindowManager already initialized');
      return;
    }

    try {
      // 获取数据库服务
      this.db = getGlobalDatabaseService();
      if (this.db.state !== 'open') {
        this.db.open();
      }

      // 确保设置表存在
      this.ensureSettingsTable();

      // 监听显示器变化
      this.setupDisplayChangeListener();

      this.isInitialized = true;
      logger.info('WindowManager initialized');
    } catch (error) {
      logger.error('Failed to initialize WindowManager', error);
      throw error;
    }
  }

  /**
   * 销毁窗口管理器
   */
  dispose(): void {
    // 移除显示器变化监听
    if (this.displayChangeHandler) {
      screen.removeListener('display-added', this.displayChangeHandler);
      screen.removeListener('display-removed', this.displayChangeHandler);
      screen.removeListener('display-metrics-changed', this.displayChangeHandler);
      this.displayChangeHandler = null;
    }

    // 清理回调
    this.moveCallbacks.clear();
    this.displayCallbacks.clear();

    // 关闭窗口
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
      this.window = null;
    }

    this.isInitialized = false;
    logger.info('WindowManager disposed');
  }

  // --------------------------------------------------------------------------
  // 窗口创建
  // --------------------------------------------------------------------------

  /**
   * 创建主窗口
   */
  async createMainWindow(options?: WindowOptions): Promise<void> {
    if (this.window && !this.window.isDestroyed()) {
      logger.warn('Main window already exists');
      return;
    }

    const mergedOptions = {
      ...DEFAULT_WINDOW_OPTIONS,
      ...options,
    };

    // 获取初始位置
    let initialPosition = mergedOptions.position;
    if (!initialPosition) {
      // 尝试从存储恢复位置
      const restored = await this.loadSavedPosition();
      if (restored) {
        initialPosition = restored;
      } else {
        // 使用默认位置（主显示器中央偏右下）
        const primaryDisplay = screen.getPrimaryDisplay();
        initialPosition = {
          x: primaryDisplay.workArea.x + primaryDisplay.workArea.width - mergedOptions.width - 100,
          y: primaryDisplay.workArea.y + primaryDisplay.workArea.height - mergedOptions.height - 100,
          monitorId: primaryDisplay.id,
        };
      }
    }

    // 创建 BrowserWindow
    this.window = new BrowserWindow({
      width: mergedOptions.width,
      height: mergedOptions.height,
      x: initialPosition.x,
      y: initialPosition.y,
      transparent: mergedOptions.transparent,
      frame: !mergedOptions.frameless,
      alwaysOnTop: mergedOptions.alwaysOnTop,
      skipTaskbar: true, // 不在任务栏显示
      resizable: false,
      hasShadow: false,
      webPreferences: {
        preload: this.getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    // 设置窗口级别（确保在其他窗口之上）
    if (mergedOptions.alwaysOnTop) {
      this.window.setAlwaysOnTop(true, 'floating');
    }

    // 设置点击穿透
    if (mergedOptions.clickThrough) {
      this.window.setIgnoreMouseEvents(true, { forward: true });
    }

    // 更新状态
    this.currentState = {
      isVisible: false,
      isMinimized: false,
      isAlwaysOnTop: mergedOptions.alwaysOnTop,
      position: initialPosition,
      size: { width: mergedOptions.width, height: mergedOptions.height },
    };

    // 监听窗口事件
    this.setupWindowEventListeners();

    logger.info('Main window created', {
      position: initialPosition,
      size: { width: mergedOptions.width, height: mergedOptions.height },
    });
  }

  // --------------------------------------------------------------------------
  // 窗口状态
  // --------------------------------------------------------------------------

  /**
   * 获取窗口状态
   */
  getWindowState(): WindowState {
    if (this.window && !this.window.isDestroyed()) {
      const bounds = this.window.getBounds();
      const currentDisplay = this.getCurrentDisplay();

      this.currentState = {
        isVisible: this.window.isVisible(),
        isMinimized: this.window.isMinimized(),
        isAlwaysOnTop: this.window.isAlwaysOnTop(),
        position: {
          x: bounds.x,
          y: bounds.y,
          monitorId: currentDisplay.id,
        },
        size: {
          width: bounds.width,
          height: bounds.height,
        },
      };
    }

    return { ...this.currentState };
  }

  /**
   * 获取 BrowserWindow 实例
   */
  getWindow(): BrowserWindow | null {
    return this.window;
  }

  // --------------------------------------------------------------------------
  // 窗口移动
  // --------------------------------------------------------------------------

  /**
   * 移动窗口到指定位置
   */
  moveTo(x: number, y: number): void {
    if (!this.window || this.window.isDestroyed()) {
      logger.warn('Cannot move: window not available');
      return;
    }

    this.window.setPosition(Math.round(x), Math.round(y));

    // 更新状态并通知
    const currentDisplay = this.getCurrentDisplay();
    const newPosition: WindowPosition = {
      x: Math.round(x),
      y: Math.round(y),
      monitorId: currentDisplay.id,
    };

    this.currentState.position = newPosition;
    this.notifyMoveCallbacks(newPosition);

    logger.debug('Window moved to', newPosition);
  }

  /**
   * 相对移动窗口
   */
  moveBy(deltaX: number, deltaY: number): void {
    if (!this.window || this.window.isDestroyed()) {
      logger.warn('Cannot move: window not available');
      return;
    }

    const currentPosition = this.window.getPosition();
    this.moveTo(currentPosition[0] + deltaX, currentPosition[1] + deltaY);
  }

  // --------------------------------------------------------------------------
  // 窗口属性
  // --------------------------------------------------------------------------

  /**
   * 设置窗口置顶状态
   */
  setAlwaysOnTop(alwaysOnTop: boolean): void {
    if (!this.window || this.window.isDestroyed()) {
      logger.warn('Cannot set always on top: window not available');
      return;
    }

    this.window.setAlwaysOnTop(alwaysOnTop, alwaysOnTop ? 'floating' : 'normal');
    this.currentState.isAlwaysOnTop = alwaysOnTop;

    logger.debug('Always on top set to', alwaysOnTop);
  }

  /**
   * 设置窗口透明度
   */
  setOpacity(opacity: number): void {
    if (!this.window || this.window.isDestroyed()) {
      logger.warn('Cannot set opacity: window not available');
      return;
    }

    // 限制透明度范围
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    this.window.setOpacity(clampedOpacity);

    logger.debug('Opacity set to', clampedOpacity);
  }

  /**
   * 设置点击穿透
   */
  setClickThrough(enable: boolean, options?: { forward?: boolean }): void {
    if (!this.window || this.window.isDestroyed()) {
      logger.warn('Cannot set click through: window not available');
      return;
    }

    if (enable) {
      this.window.setIgnoreMouseEvents(true, { forward: options?.forward ?? true });
    } else {
      this.window.setIgnoreMouseEvents(false);
    }

    logger.debug('Click through set to', enable, options);
  }

  // --------------------------------------------------------------------------
  // 窗口可见性
  // --------------------------------------------------------------------------

  /**
   * 显示窗口
   */
  show(): void {
    if (!this.window || this.window.isDestroyed()) {
      logger.warn('Cannot show: window not available');
      return;
    }

    this.window.show();
    this.currentState.isVisible = true;
    this.currentState.isMinimized = false;

    logger.debug('Window shown');
  }

  /**
   * 隐藏窗口
   */
  hide(): void {
    if (!this.window || this.window.isDestroyed()) {
      logger.warn('Cannot hide: window not available');
      return;
    }

    this.window.hide();
    this.currentState.isVisible = false;

    logger.debug('Window hidden');
  }

  /**
   * 最小化到托盘
   */
  minimizeToTray(): void {
    if (!this.window || this.window.isDestroyed()) {
      logger.warn('Cannot minimize: window not available');
      return;
    }

    this.window.hide();
    this.currentState.isMinimized = true;
    this.currentState.isVisible = false;

    logger.debug('Window minimized to tray');
  }

  /**
   * 从托盘恢复
   */
  restoreFromTray(): void {
    if (!this.window || this.window.isDestroyed()) {
      logger.warn('Cannot restore: window not available');
      return;
    }

    this.window.show();
    this.window.focus();
    this.currentState.isMinimized = false;
    this.currentState.isVisible = true;

    logger.debug('Window restored from tray');
  }

  // --------------------------------------------------------------------------
  // 多显示器支持
  // --------------------------------------------------------------------------

  /**
   * 获取所有显示器信息
   */
  getDisplays(): DisplayInfo[] {
    const displays = screen.getAllDisplays();
    return displays.map(this.convertDisplay);
  }

  /**
   * 获取窗口所在的显示器
   */
  getCurrentDisplay(): DisplayInfo {
    if (this.window && !this.window.isDestroyed()) {
      const bounds = this.window.getBounds();
      const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
      return this.convertDisplay(display);
    }

    // 返回主显示器
    return this.convertDisplay(screen.getPrimaryDisplay());
  }

  // --------------------------------------------------------------------------
  // 位置持久化
  // --------------------------------------------------------------------------

  /**
   * 保存窗口位置
   */
  async savePosition(): Promise<void> {
    if (!this.db) {
      logger.warn('Cannot save position: database not available');
      return;
    }

    try {
      const state = this.getWindowState();
      const positionData = JSON.stringify({
        x: state.position.x,
        y: state.position.y,
        monitorId: state.position.monitorId,
        width: state.size.width,
        height: state.size.height,
      });

      // 使用 upsert 方式保存
      this.db.run(
        `INSERT INTO settings (id, key, value, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = ?`,
        this.generateId(),
        POSITION_STORAGE_KEY,
        positionData,
        Date.now(),
        Date.now(),
        positionData,
        Date.now()
      );

      logger.debug('Window position saved', state.position);
    } catch (error) {
      logger.error('Failed to save window position', error);
    }
  }

  /**
   * 从持久化存储恢复窗口位置
   */
  async restorePosition(): Promise<boolean> {
    const savedPosition = await this.loadSavedPosition();

    if (!savedPosition) {
      logger.debug('No saved position found');
      return false;
    }

    // 验证位置是否在可用显示器范围内
    const displays = this.getDisplays();
    const targetDisplay = displays.find(d => d.id === savedPosition.monitorId);

    if (!targetDisplay) {
      // 如果原显示器不存在，使用主显示器
      const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
      if (primaryDisplay) {
        savedPosition.x = primaryDisplay.workArea.x + 100;
        savedPosition.y = primaryDisplay.workArea.y + 100;
        savedPosition.monitorId = primaryDisplay.id;
      }
    }

    // 移动到保存的位置
    this.moveTo(savedPosition.x, savedPosition.y);
    this.currentState.position = savedPosition;

    logger.debug('Window position restored', savedPosition);
    return true;
  }

  /**
   * 将窗口限制在屏幕可见范围内
   */
  constrainToScreen(): void {
    if (!this.window || this.window.isDestroyed()) {
      logger.warn('Cannot constrain: window not available');
      return;
    }

    const bounds = this.window.getBounds();
    const currentDisplay = this.getCurrentDisplay();
    const workArea = currentDisplay.workArea;

    let newX = bounds.x;
    let newY = bounds.y;
    let needsMove = false;

    // 确保窗口至少有一部分在屏幕内
    const minVisibleSize = 50; // 至少50像素可见

    // 检查左边界
    if (bounds.x + bounds.width < workArea.x + minVisibleSize) {
      newX = workArea.x;
      needsMove = true;
    }

    // 检查右边界
    if (bounds.x > workArea.x + workArea.width - minVisibleSize) {
      newX = workArea.x + workArea.width - bounds.width;
      needsMove = true;
    }

    // 检查上边界
    if (bounds.y + bounds.height < workArea.y + minVisibleSize) {
      newY = workArea.y;
      needsMove = true;
    }

    // 检查下边界
    if (bounds.y > workArea.y + workArea.height - minVisibleSize) {
      newY = workArea.y + workArea.height - bounds.height;
      needsMove = true;
    }

    if (needsMove) {
      this.moveTo(newX, newY);
      logger.debug('Window constrained to screen', { newX, newY });
    }
  }

  // --------------------------------------------------------------------------
  // 事件监听
  // --------------------------------------------------------------------------

  /**
   * 监听窗口移动事件
   */
  onMove(callback: (position: WindowPosition) => void): () => void {
    this.moveCallbacks.add(callback);

    return () => {
      this.moveCallbacks.delete(callback);
    };
  }

  /**
   * 监听显示器变化事件
   */
  onDisplayChanged(callback: (displays: DisplayInfo[]) => void): () => void {
    this.displayCallbacks.add(callback);

    return () => {
      this.displayCallbacks.delete(callback);
    };
  }

  // --------------------------------------------------------------------------
  // 私有方法
  // --------------------------------------------------------------------------

  /**
   * 设置窗口事件监听器
   */
  private setupWindowEventListeners(): void {
    if (!this.window) return;

    // 监听移动事件
    this.window.on('move', () => {
      if (this.window && !this.window.isDestroyed()) {
        const bounds = this.window.getBounds();
        const currentDisplay = this.getCurrentDisplay();
        const newPosition: WindowPosition = {
          x: bounds.x,
          y: bounds.y,
          monitorId: currentDisplay.id,
        };

        this.currentState.position = newPosition;
        this.notifyMoveCallbacks(newPosition);
      }
    });

    // 监听关闭事件
    this.window.on('closed', () => {
      this.window = null;
      this.currentState.isVisible = false;
      this.currentState.isMinimized = true;
    });

    // 监听显示/隐藏事件
    this.window.on('show', () => {
      this.currentState.isVisible = true;
    });

    this.window.on('hide', () => {
      this.currentState.isVisible = false;
    });
  }

  /**
   * 设置显示器变化监听
   */
  private setupDisplayChangeListener(): void {
    this.displayChangeHandler = () => {
      const displays = this.getDisplays();
      this.notifyDisplayCallbacks(displays);

      // 确保窗口仍在可见范围内
      this.constrainToScreen();
    };

    screen.on('display-added', this.displayChangeHandler);
    screen.on('display-removed', this.displayChangeHandler);
    screen.on('display-metrics-changed', this.displayChangeHandler);
  }

  /**
   * 转换 Electron Display 到 DisplayInfo
   */
  private convertDisplay(display: Display): DisplayInfo {
    return {
      id: display.id,
      bounds: { ...display.bounds },
      workArea: { ...display.workArea },
      isPrimary: display.id === screen.getPrimaryDisplay().id,
      scaleFactor: display.scaleFactor,
    };
  }

  /**
   * 通知移动回调
   */
  private notifyMoveCallbacks(position: WindowPosition): void {
    this.moveCallbacks.forEach(callback => {
      try {
        callback(position);
      } catch (error) {
        logger.error('Move callback error', error);
      }
    });
  }

  /**
   * 通知显示器变化回调
   */
  private notifyDisplayCallbacks(displays: DisplayInfo[]): void {
    this.displayCallbacks.forEach(callback => {
      try {
        callback(displays);
      } catch (error) {
        logger.error('Display callback error', error);
      }
    });
  }

  /**
   * 加载保存的位置
   */
  private async loadSavedPosition(): Promise<WindowPosition | null> {
    if (!this.db) {
      return null;
    }

    try {
      const result = this.db.get<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        POSITION_STORAGE_KEY
      );

      if (result?.value) {
        const parsed = JSON.parse(result.value);
        return {
          x: parsed.x,
          y: parsed.y,
          monitorId: parsed.monitorId,
        };
      }
    } catch (error) {
      logger.error('Failed to load saved position', error);
    }

    return null;
  }

  /**
   * 确保设置表存在
   */
  private ensureSettingsTable(): void {
    if (!this.db) return;

    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          id TEXT PRIMARY KEY,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          description TEXT,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        )
      `);
    } catch (error) {
      logger.error('Failed to create settings table', error);
    }
  }

  /**
   * 获取 preload 脚本路径
   */
  private getPreloadPath(): string {
    // 在生产环境和开发环境使用不同的路径
    if (app.isPackaged) {
      return path.join(__dirname, '..', 'preload', 'index.js');
    }
    return path.join(__dirname, '..', '..', 'dist', 'preload', 'index.js');
  }

  /**
   * 生成 UUID
   */
  private generateId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

// ============================================================================
// 单例
// ============================================================================

let windowManagerInstance: WindowManager | null = null;

/**
 * 获取窗口管理器单例
 */
export function getWindowManager(): WindowManager {
  if (!windowManagerInstance) {
    windowManagerInstance = new WindowManager();
  }
  return windowManagerInstance;
}

/**
 * 重置窗口管理器（用于测试）
 */
export function resetWindowManager(): void {
  if (windowManagerInstance) {
    windowManagerInstance.dispose();
    windowManagerInstance = null;
  }
}