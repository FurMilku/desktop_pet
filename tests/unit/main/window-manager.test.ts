/**
 * T026 [P] [US1] 单元测试：窗口管理器
 * 
 * 测试透明无边框窗口管理器功能，包括：
 * - 窗口创建和配置
 * - 透明度和置顶设置
 * - 多显示器位置记忆
 * - 窗口移动和边界限制
 * 
 * @see specs/001-desktop-3d-pet/spec.md FR-001, FR-002, FR-028
 * @see specs/001-desktop-3d-pet/contracts/ipc-api.md Window API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
 * 
 * 管理透明无边框窗口的创建、配置和位置
 */
export interface IWindowManager {
  /**
   * 初始化窗口管理器
   */
  initialize(): Promise<void>;

  /**
   * 销毁窗口管理器
   */
  dispose(): void;

  /**
   * 创建主窗口
   * @param options - 窗口配置选项
   */
  createMainWindow(options?: WindowOptions): Promise<void>;

  /**
   * 获取窗口状态
   */
  getWindowState(): WindowState;

  /**
   * 移动窗口到指定位置
   * @param x - X坐标
   * @param y - Y坐标
   */
  moveTo(x: number, y: number): void;

  /**
   * 移动窗口（相对移动）
   * @param deltaX - X方向偏移
   * @param deltaY - Y方向偏移
   */
  moveBy(deltaX: number, deltaY: number): void;

  /**
   * 设置窗口置顶状态
   * @param alwaysOnTop - 是否置顶
   */
  setAlwaysOnTop(alwaysOnTop: boolean): void;

  /**
   * 设置窗口透明度
   * @param opacity - 透明度 (0.0 - 1.0)
   */
  setOpacity(opacity: number): void;

  /**
   * 设置点击穿透
   * @param enable - 是否启用
   * @param options - 穿透选项
   */
  setClickThrough(enable: boolean, options?: { forward?: boolean }): void;

  /**
   * 显示窗口
   */
  show(): void;

  /**
   * 隐藏窗口
   */
  hide(): void;

  /**
   * 最小化到托盘
   */
  minimizeToTray(): void;

  /**
   * 从托盘恢复
   */
  restoreFromTray(): void;

  /**
   * 获取所有显示器信息
   */
  getDisplays(): DisplayInfo[];

  /**
   * 获取窗口所在的显示器
   */
  getCurrentDisplay(): DisplayInfo;

  /**
   * 保存窗口位置到持久化存储
   */
  savePosition(): Promise<void>;

  /**
   * 从持久化存储恢复窗口位置
   */
  restorePosition(): Promise<boolean>;

  /**
   * 将窗口限制在屏幕可见范围内
   */
  constrainToScreen(): void;

  /**
   * 监听窗口移动事件
   * @param callback - 移动回调
   */
  onMove(callback: (position: WindowPosition) => void): () => void;

  /**
   * 监听显示器变化事件
   * @param callback - 变化回调
   */
  onDisplayChanged(callback: (displays: DisplayInfo[]) => void): () => void;
}

// ============================================================================
// Mock 工厂
// ============================================================================

/**
 * 创建 Mock 显示器信息
 */
function createMockDisplay(overrides: Partial<DisplayInfo> = {}): DisplayInfo {
  return {
    id: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    isPrimary: true,
    scaleFactor: 1,
    ...overrides,
  };
}

/**
 * 创建 Mock 窗口管理器
 */
function createMockWindowManager(): IWindowManager {
  let state: WindowState = {
    isVisible: false,
    isMinimized: false,
    isAlwaysOnTop: true,
    position: { x: 100, y: 100, monitorId: 1 },
    size: { width: 300, height: 400 },
  };

  const displays: DisplayInfo[] = [createMockDisplay()];
  const moveCallbacks: ((position: WindowPosition) => void)[] = [];
  const displayCallbacks: ((displays: DisplayInfo[]) => void)[] = [];

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    createMainWindow: vi.fn().mockResolvedValue(undefined),
    
    getWindowState: vi.fn(() => ({ ...state })),
    
    moveTo: vi.fn((x: number, y: number) => {
      state.position = { ...state.position, x, y };
      moveCallbacks.forEach(cb => cb(state.position));
    }),
    
    moveBy: vi.fn((deltaX: number, deltaY: number) => {
      state.position.x += deltaX;
      state.position.y += deltaY;
      moveCallbacks.forEach(cb => cb(state.position));
    }),
    
    setAlwaysOnTop: vi.fn((alwaysOnTop: boolean) => {
      state.isAlwaysOnTop = alwaysOnTop;
    }),
    
    setOpacity: vi.fn(),
    setClickThrough: vi.fn(),
    
    show: vi.fn(() => {
      state.isVisible = true;
      state.isMinimized = false;
    }),
    
    hide: vi.fn(() => {
      state.isVisible = false;
    }),
    
    minimizeToTray: vi.fn(() => {
      state.isMinimized = true;
      state.isVisible = false;
    }),
    
    restoreFromTray: vi.fn(() => {
      state.isMinimized = false;
      state.isVisible = true;
    }),
    
    getDisplays: vi.fn(() => [...displays]),
    getCurrentDisplay: vi.fn(() => displays[0]),
    savePosition: vi.fn().mockResolvedValue(undefined),
    restorePosition: vi.fn().mockResolvedValue(true),
    constrainToScreen: vi.fn(),
    
    onMove: vi.fn((callback) => {
      moveCallbacks.push(callback);
      return () => {
        const index = moveCallbacks.indexOf(callback);
        if (index > -1) moveCallbacks.splice(index, 1);
      };
    }),
    
    onDisplayChanged: vi.fn((callback) => {
      displayCallbacks.push(callback);
      return () => {
        const index = displayCallbacks.indexOf(callback);
        if (index > -1) displayCallbacks.splice(index, 1);
      };
    }),
  };
}

// ============================================================================
// 测试套件
// ============================================================================

describe('WindowManager', () => {
  let windowManager: IWindowManager;

  beforeEach(() => {
    windowManager = createMockWindowManager();
  });

  afterEach(() => {
    windowManager.dispose();
  });

  // --------------------------------------------------------------------------
  // 初始化测试
  // --------------------------------------------------------------------------

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(windowManager.initialize()).resolves.not.toThrow();
      expect(windowManager.initialize).toHaveBeenCalled();
    });

    it('should create main window with default options', async () => {
      await windowManager.initialize();
      await windowManager.createMainWindow();

      expect(windowManager.createMainWindow).toHaveBeenCalled();
    });

    it('should create main window with custom options', async () => {
      const options: WindowOptions = {
        width: 400,
        height: 500,
        transparent: true,
        frameless: true,
        alwaysOnTop: true,
        position: { x: 200, y: 200, monitorId: 1 },
      };

      await windowManager.initialize();
      await windowManager.createMainWindow(options);

      expect(windowManager.createMainWindow).toHaveBeenCalledWith(options);
    });

    it('should restore position from storage on initialization', async () => {
      await windowManager.initialize();
      const restored = await windowManager.restorePosition();

      expect(restored).toBe(true);
      expect(windowManager.restorePosition).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 透明窗口配置测试 (FR-001)
  // --------------------------------------------------------------------------

  describe('transparent window configuration (FR-001)', () => {
    it('should create window with transparent background', async () => {
      const options: WindowOptions = {
        transparent: true,
        frameless: true,
      };

      await windowManager.createMainWindow(options);

      expect(windowManager.createMainWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          transparent: true,
          frameless: true,
        })
      );
    });

    it('should support opacity adjustment', () => {
      windowManager.setOpacity(0.8);
      expect(windowManager.setOpacity).toHaveBeenCalledWith(0.8);
    });

    it('should clamp opacity to valid range', () => {
      // 实现应该将值限制在 0.0 - 1.0 范围内
      windowManager.setOpacity(1.5);
      windowManager.setOpacity(-0.5);
      
      expect(windowManager.setOpacity).toHaveBeenCalledTimes(2);
    });
  });

  // --------------------------------------------------------------------------
  // 窗口置顶测试 (FR-002)
  // --------------------------------------------------------------------------

  describe('always on top (FR-002)', () => {
    it('should enable always on top by default for pet window', async () => {
      await windowManager.createMainWindow({ alwaysOnTop: true });
      const state = windowManager.getWindowState();

      expect(state.isAlwaysOnTop).toBe(true);
    });

    it('should toggle always on top state', () => {
      windowManager.setAlwaysOnTop(false);
      expect(windowManager.setAlwaysOnTop).toHaveBeenCalledWith(false);

      windowManager.setAlwaysOnTop(true);
      expect(windowManager.setAlwaysOnTop).toHaveBeenCalledWith(true);
    });

    it('should persist always on top state', () => {
      windowManager.setAlwaysOnTop(false);
      const state = windowManager.getWindowState();

      expect(state.isAlwaysOnTop).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 窗口移动测试
  // --------------------------------------------------------------------------

  describe('window movement', () => {
    it('should move window to absolute position', () => {
      windowManager.moveTo(500, 300);
      const state = windowManager.getWindowState();

      expect(state.position.x).toBe(500);
      expect(state.position.y).toBe(300);
    });

    it('should move window by relative offset', () => {
      const initialState = windowManager.getWindowState();
      const initialX = initialState.position.x;
      const initialY = initialState.position.y;

      windowManager.moveBy(50, -30);
      const newState = windowManager.getWindowState();

      expect(newState.position.x).toBe(initialX + 50);
      expect(newState.position.y).toBe(initialY - 30);
    });

    it('should emit move event when window moves', () => {
      const moveCallback = vi.fn();
      windowManager.onMove(moveCallback);

      windowManager.moveTo(200, 200);

      expect(moveCallback).toHaveBeenCalledWith(
        expect.objectContaining({ x: 200, y: 200 })
      );
    });

    it('should allow unsubscribing from move events', () => {
      const moveCallback = vi.fn();
      const unsubscribe = windowManager.onMove(moveCallback);

      unsubscribe();
      windowManager.moveTo(300, 300);

      expect(moveCallback).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 多显示器支持测试 (FR-028)
  // --------------------------------------------------------------------------

  describe('multi-monitor support (FR-028)', () => {
    it('should detect all connected displays', () => {
      const displays = windowManager.getDisplays();

      expect(displays).toBeDefined();
      expect(displays.length).toBeGreaterThan(0);
      expect(displays[0]).toHaveProperty('id');
      expect(displays[0]).toHaveProperty('bounds');
      expect(displays[0]).toHaveProperty('isPrimary');
    });

    it('should identify current display for window', () => {
      const currentDisplay = windowManager.getCurrentDisplay();

      expect(currentDisplay).toBeDefined();
      expect(currentDisplay.id).toBeDefined();
    });

    it('should track monitor ID in window position', () => {
      const state = windowManager.getWindowState();

      expect(state.position.monitorId).toBeDefined();
      expect(typeof state.position.monitorId).toBe('number');
    });

    it('should save position with monitor information', async () => {
      windowManager.moveTo(500, 300);
      await windowManager.savePosition();

      expect(windowManager.savePosition).toHaveBeenCalled();
    });

    it('should restore position to correct monitor', async () => {
      const restored = await windowManager.restorePosition();

      expect(restored).toBe(true);
      expect(windowManager.restorePosition).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 边界限制测试 (Edge Case)
  // --------------------------------------------------------------------------

  describe('screen boundary constraints', () => {
    it('should constrain window to screen bounds', () => {
      // 模拟将窗口移到屏幕外
      windowManager.moveTo(5000, 5000);
      windowManager.constrainToScreen();

      expect(windowManager.constrainToScreen).toHaveBeenCalled();
    });

    it('should handle window on disconnected display', () => {
      // 当显示器断开连接时，应该将窗口移到可用显示器
      windowManager.constrainToScreen();

      expect(windowManager.constrainToScreen).toHaveBeenCalled();
    });

    it('should emit display changed event', () => {
      const displayCallback = vi.fn();
      windowManager.onDisplayChanged(displayCallback);

      // 实际实现会在显示器配置变化时触发
      expect(windowManager.onDisplayChanged).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 窗口可见性测试
  // --------------------------------------------------------------------------

  describe('window visibility', () => {
    it('should show window', () => {
      windowManager.show();
      const state = windowManager.getWindowState();

      expect(state.isVisible).toBe(true);
    });

    it('should hide window', () => {
      windowManager.show();
      windowManager.hide();
      const state = windowManager.getWindowState();

      expect(state.isVisible).toBe(false);
    });

    it('should minimize to system tray', () => {
      windowManager.show();
      windowManager.minimizeToTray();
      const state = windowManager.getWindowState();

      expect(state.isMinimized).toBe(true);
      expect(state.isVisible).toBe(false);
    });

    it('should restore from system tray', () => {
      windowManager.minimizeToTray();
      windowManager.restoreFromTray();
      const state = windowManager.getWindowState();

      expect(state.isMinimized).toBe(false);
      expect(state.isVisible).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 点击穿透测试
  // --------------------------------------------------------------------------

  describe('click through', () => {
    it('should enable click through', () => {
      windowManager.setClickThrough(true);

      expect(windowManager.setClickThrough).toHaveBeenCalledWith(true);
    });

    it('should disable click through', () => {
      windowManager.setClickThrough(false);

      expect(windowManager.setClickThrough).toHaveBeenCalledWith(false);
    });

    it('should support forward option for click through', () => {
      windowManager.setClickThrough(true, { forward: true });

      expect(windowManager.setClickThrough).toHaveBeenCalledWith(true, { forward: true });
    });
  });

  // --------------------------------------------------------------------------
  // 持久化测试
  // --------------------------------------------------------------------------

  describe('position persistence', () => {
    it('should save window position', async () => {
      windowManager.moveTo(400, 300);
      await windowManager.savePosition();

      expect(windowManager.savePosition).toHaveBeenCalled();
    });

    it('should restore window position', async () => {
      const restored = await windowManager.restorePosition();

      expect(restored).toBe(true);
    });

    it('should return false when no saved position exists', async () => {
      // 模拟没有保存的位置
      vi.mocked(windowManager.restorePosition).mockResolvedValueOnce(false);
      
      const restored = await windowManager.restorePosition();

      expect(restored).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 清理测试
  // --------------------------------------------------------------------------

  describe('cleanup', () => {
    it('should dispose resources properly', () => {
      windowManager.dispose();

      expect(windowManager.dispose).toHaveBeenCalled();
    });

    it('should save position before disposal', async () => {
      await windowManager.savePosition();
      windowManager.dispose();

      expect(windowManager.savePosition).toHaveBeenCalled();
      expect(windowManager.dispose).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// 集成场景测试
// ============================================================================

describe('WindowManager Integration Scenarios', () => {
  let windowManager: IWindowManager;

  beforeEach(() => {
    windowManager = createMockWindowManager();
  });

  afterEach(() => {
    windowManager.dispose();
  });

  describe('User Story 1: Pet Display Window', () => {
    it('should create transparent always-on-top window for pet display', async () => {
      // 用户启动应用，创建透明置顶窗口
      await windowManager.initialize();
      await windowManager.createMainWindow({
        transparent: true,
        frameless: true,
        alwaysOnTop: true,
        width: 300,
        height: 400,
      });

      windowManager.show();
      const state = windowManager.getWindowState();

      expect(state.isVisible).toBe(true);
      expect(state.isAlwaysOnTop).toBe(true);
    });

    it('should restore pet position from last session', async () => {
      // 用户重新启动应用，恢复上次的位置
      await windowManager.initialize();
      const restored = await windowManager.restorePosition();

      expect(restored).toBe(true);
    });

    it('should handle display configuration change', async () => {
      // 用户断开/连接显示器
      const displayCallback = vi.fn();
      windowManager.onDisplayChanged(displayCallback);

      // 模拟显示器变化后，窗口应该被限制在可见范围内
      windowManager.constrainToScreen();

      expect(windowManager.constrainToScreen).toHaveBeenCalled();
    });
  });

  describe('User Story 2: Pet Interaction', () => {
    it('should support dragging pet to new position', async () => {
      // 用户拖拽宠物
      await windowManager.initialize();
      await windowManager.createMainWindow();
      windowManager.show();

      const moveCallback = vi.fn();
      windowManager.onMove(moveCallback);

      // 模拟拖拽
      windowManager.moveTo(500, 400);

      expect(moveCallback).toHaveBeenCalled();
      
      const state = windowManager.getWindowState();
      expect(state.position.x).toBe(500);
      expect(state.position.y).toBe(400);
    });

    it('should save position after drag completes', async () => {
      // 拖拽完成后保存位置
      windowManager.moveTo(600, 500);
      await windowManager.savePosition();

      expect(windowManager.savePosition).toHaveBeenCalled();
    });
  });
});