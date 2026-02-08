/**
 * Electron 主进程入口
 * T018: 创建 Electron 主进程入口
 * 
 * 功能：
 * - 初始化 Electron 应用
 * - 管理应用生命周期
 * - 初始化核心服务（数据库、事件总线、日志等）
 * - 设置 IPC 通信
 * - 创建窗口
 */

import { app, BrowserWindow, dialog, protocol } from 'electron';
import * as path from 'path';

// 数据库和服务
import { getGlobalDatabaseService, DatabaseService } from '../shared/services/database';
import { runMigrations, getCurrentSchemaVersion } from '../shared/services/migrations';
import { getGlobalEventBus, EventBus } from '../shared/services/event-bus';
import { getGlobalCapabilityRegistry } from '../shared/services/capability-registry';

// 类型导入
import { EventTypes, AppReadyPayload } from '../shared/types/events';

// ============================================================================
// 常量定义
// ============================================================================

/** 是否为开发模式 */
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/** 渲染进程入口路径 */
const RENDERER_ENTRY = isDev
  ? process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
  : path.join(__dirname, '../renderer/index.html');

/** 预加载脚本路径 */
const PRELOAD_SCRIPT = path.join(__dirname, '../preload/index.js');

// ============================================================================
// 全局状态
// ============================================================================

/** 主窗口实例 */
let mainWindow: BrowserWindow | null = null;

/** 数据库服务实例 */
let databaseService: DatabaseService | null = null;

/** 事件总线实例 */
let eventBus: EventBus | null = null;

/** 应用是否已准备就绪 */
let isAppReady = false;

/** 应用是否正在退出 */
let isQuitting = false;

// ============================================================================
// 日志工具（临时实现，T020 会替换为 electron-log）
// ============================================================================

/**
 * 临时日志工具
 * TODO: T020 实现后替换为 electron-log
 */
const logger = {
  info: (message: string, ...args: unknown[]) => {
    console.log(`[Main][INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[Main][WARN] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`[Main][ERROR] ${message}`, ...args);
  },
  debug: (message: string, ...args: unknown[]) => {
    if (isDev) {
      console.debug(`[Main][DEBUG] ${message}`, ...args);
    }
  },
};

// ============================================================================
// 初始化函数
// ============================================================================

/**
 * 初始化数据库服务
 */
async function initializeDatabase(): Promise<void> {
  logger.info('Initializing database...');
  
  try {
    databaseService = getGlobalDatabaseService({
      filename: 'desktop-pet.db',
      walMode: true,
      foreignKeys: true,
      backupOnOpen: !isDev, // 生产环境启动时备份
    });
    
    databaseService.open();
    
    // 运行数据库迁移
    const currentVersion = getCurrentSchemaVersion(databaseService);
    logger.info(`Current database schema version: ${currentVersion}`);
    
    runMigrations(databaseService);
    
    const newVersion = getCurrentSchemaVersion(databaseService);
    if (newVersion > currentVersion) {
      logger.info(`Database migrated to version: ${newVersion}`);
    }
    
    // 验证数据库完整性
    if (!isDev) {
      const isIntact = databaseService.integrityCheck();
      if (!isIntact) {
        logger.warn('Database integrity check failed, attempting to recover...');
        // TODO: 实现数据库恢复逻辑
      }
    }
    
    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * 初始化事件总线
 */
function initializeEventBus(): void {
  logger.info('Initializing event bus...');
  
  eventBus = getGlobalEventBus({
    debug: isDev,
    enableHistory: isDev,
    maxListeners: 100,
    wildcardSupport: true,
  });
  
  // 订阅应用级事件进行日志记录
  if (isDev) {
    eventBus.on(EventTypes.APP.READY, (event) => {
      logger.debug('App ready event received:', event.payload);
    });
    
    eventBus.on(EventTypes.APP.QUIT, () => {
      logger.debug('App quit event received');
    });
  }
  
  logger.info('Event bus initialized');
}

/**
 * 初始化能力注册表
 */
function initializeCapabilityRegistry(): void {
  logger.info('Initializing capability registry...');
  
  const registry = getGlobalCapabilityRegistry();
  
  // 在此注册基础能力
  // TODO: 在 AI 服务初始化时注册 AI 能力
  
  logger.info('Capability registry initialized');
}

/**
 * 初始化 IPC 处理器
 */
function initializeIpcHandlers(): void {
  logger.info('Initializing IPC handlers...');
  
  // TODO: T022 实现后在此引入 IPC 处理器
  // import { registerIpcHandlers } from './ipc-handlers';
  // registerIpcHandlers();
  
  logger.info('IPC handlers initialized (placeholder)');
}

/**
 * 初始化错误追踪
 */
function initializeErrorTracking(): void {
  // TODO: T021 实现后在此引入 Sentry
  // import { initSentry } from './sentry';
  // initSentry();
  
  // 设置全局未捕获异常处理
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    // TODO: 发送到 Sentry
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    // TODO: 发送到 Sentry
  });
  
  logger.info('Error tracking initialized (placeholder)');
}

// ============================================================================
// 窗口管理
// ============================================================================

/**
 * 创建主窗口
 * 注意：T027 将实现完整的 WindowManager，此处为基础实现
 */
async function createMainWindow(): Promise<void> {
  logger.info('Creating main window...');
  
  // 窗口配置 - 透明无边框窗口
  mainWindow = new BrowserWindow({
    width: 300,
    height: 400,
    x: 100,
    y: 100,
    transparent: true,        // 透明背景
    frame: false,             // 无边框
    resizable: false,         // 不可调整大小
    alwaysOnTop: true,        // 始终置顶
    skipTaskbar: true,        // 不显示在任务栏
    hasShadow: false,         // 无阴影
    webPreferences: {
      preload: PRELOAD_SCRIPT,
      contextIsolation: true,           // 启用上下文隔离
      nodeIntegration: false,           // 禁用 Node 集成
      sandbox: true,                    // 启用沙盒
      webSecurity: true,                // 启用 Web 安全
      allowRunningInsecureContent: false,
    },
    show: false, // 先隐藏，等待内容加载完成
  });
  
  // 设置窗口可穿透点击（透明区域）
  mainWindow.setIgnoreMouseEvents(false);
  
  // 加载渲染进程
  if (isDev) {
    await mainWindow.loadURL(RENDERER_ENTRY);
    // 开发模式下打开开发者工具
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(RENDERER_ENTRY);
  }
  
  // 内容加载完成后显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    logger.info('Main window displayed');
  });
  
  // 窗口关闭处理
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      // 阻止关闭，隐藏到托盘
      event.preventDefault();
      mainWindow?.hide();
      logger.info('Main window hidden to tray');
    }
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
    logger.info('Main window closed');
  });
  
  // 处理渲染进程崩溃
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    logger.error('Render process gone:', details);
    // TODO: 根据原因决定是否重启渲染进程
    if (details.reason === 'crashed' || details.reason === 'killed') {
      // 尝试重新加载
      mainWindow?.reload();
    }
  });
  
  // 阻止导航到外部链接
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== new URL(RENDERER_ENTRY).origin) {
      event.preventDefault();
      logger.warn('Blocked navigation to:', url);
    }
  });
  
  logger.info('Main window created');
}

/**
 * 显示主窗口
 */
function showMainWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }
}

// ============================================================================
// 应用生命周期处理
// ============================================================================

/**
 * 应用启动前的初始化
 */
async function beforeReady(): Promise<void> {
  logger.info('Application starting...');
  logger.info(`Environment: ${isDev ? 'development' : 'production'}`);
  logger.info(`Platform: ${process.platform}`);
  logger.info(`Electron: ${process.versions.electron}`);
  logger.info(`Chrome: ${process.versions.chrome}`);
  logger.info(`Node: ${process.versions.node}`);
  
  // 初始化错误追踪
  initializeErrorTracking();
  
  // 设置应用协议（用于深度链接）
  if (!app.isDefaultProtocolClient('desktop-pet')) {
    app.setAsDefaultProtocolClient('desktop-pet');
  }
  
  // macOS: 设置 Dock 图标（如果需要）
  if (process.platform === 'darwin') {
    app.dock?.hide(); // 隐藏 Dock 图标，宠物应用通常不需要
  }
}

/**
 * 应用准备就绪
 */
async function onAppReady(): Promise<void> {
  logger.info('Electron app ready');
  
  try {
    // 初始化核心服务
    await initializeDatabase();
    initializeEventBus();
    initializeCapabilityRegistry();
    initializeIpcHandlers();
    
    // 创建主窗口
    await createMainWindow();
    
    // 标记应用就绪
    isAppReady = true;
    
    // 发布应用就绪事件
    if (eventBus) {
      const payload: AppReadyPayload = {
        version: app.getVersion(),
        platform: process.platform,
      };
      
      eventBus.emit({
        type: EventTypes.APP.READY,
        payload,
        source: 'main',
      });
    }
    
    logger.info('Application ready');
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    
    // 显示错误对话框
    dialog.showErrorBox(
      'Application Error',
      `Failed to start Desktop Pet: ${error instanceof Error ? error.message : String(error)}\n\nThe application will now exit.`
    );
    
    app.quit();
  }
}

/**
 * 应用激活（macOS）
 */
function onAppActivate(): void {
  // macOS: 点击 Dock 图标时重新显示窗口
  if (mainWindow === null) {
    createMainWindow().catch((error) => {
      logger.error('Failed to create window on activate:', error);
    });
  } else {
    showMainWindow();
  }
}

/**
 * 所有窗口关闭
 */
function onAllWindowsClosed(): void {
  // Windows/Linux: 所有窗口关闭时退出应用
  // macOS: 保持应用运行，等待从 Dock 重新激活
  if (process.platform !== 'darwin') {
    app.quit();
  }
}

/**
 * 应用退出前
 */
function onBeforeQuit(): void {
  isQuitting = true;
  logger.info('Application quitting...');
  
  // 发布退出事件
  if (eventBus) {
    eventBus.emit({
      type: EventTypes.APP.QUIT,
      payload: { exitCode: 0 },
      source: 'main',
    });
  }
}

/**
 * 应用即将退出
 */
function onWillQuit(event: Electron.Event): void {
  logger.info('Application will quit');
  
  // 清理资源
  try {
    // 关闭数据库连接
    if (databaseService) {
      databaseService.close();
      logger.info('Database connection closed');
    }
    
    // 销毁事件总线
    if (eventBus) {
      eventBus.destroy();
      logger.info('Event bus destroyed');
    }
  } catch (error) {
    logger.error('Error during cleanup:', error);
  }
}

/**
 * 第二个实例启动
 */
function onSecondInstance(
  event: Electron.Event,
  commandLine: string[],
  workingDirectory: string
): void {
  logger.info('Second instance launched, focusing main window');
  
  // 显示主窗口
  showMainWindow();
  
  // 处理协议链接（如果有）
  const protocolUrl = commandLine.find((arg) => arg.startsWith('desktop-pet://'));
  if (protocolUrl) {
    handleProtocolUrl(protocolUrl);
  }
}

/**
 * 处理协议链接
 */
function handleProtocolUrl(url: string): void {
  logger.info('Protocol URL received:', url);
  
  try {
    const parsedUrl = new URL(url);
    const action = parsedUrl.hostname;
    const params = Object.fromEntries(parsedUrl.searchParams);
    
    // 发布协议链接事件（使用快捷键触发事件作为替代）
    if (eventBus) {
      eventBus.emit({
        type: EventTypes.SYSTEM.SHORTCUT_TRIGGERED,
        payload: { 
          accelerator: `desktop-pet://${action}`,
          action: action,
        },
        source: 'main',
      });
    }
    
    logger.debug('Protocol URL parsed:', { action, params });
  } catch (error) {
    logger.error('Failed to parse protocol URL:', error);
  }
}

// ============================================================================
// 单实例锁定
// ============================================================================

// 确保只有一个应用实例运行
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logger.warn('Another instance is already running, quitting...');
  app.quit();
} else {
  // 注册事件监听器
  app.on('second-instance', onSecondInstance);
  
  // 在应用准备就绪前执行初始化
  beforeReady()
    .then(() => {
      // 等待应用准备就绪
      app.whenReady().then(onAppReady);
    })
    .catch((error) => {
      logger.error('Pre-ready initialization failed:', error);
      app.quit();
    });
  
  // 注册生命周期事件
  app.on('activate', onAppActivate);
  app.on('window-all-closed', onAllWindowsClosed);
  app.on('before-quit', onBeforeQuit);
  app.on('will-quit', onWillQuit);
  
  // 处理协议链接（macOS）
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
  });
}

// ============================================================================
// 安全设置
// ============================================================================

// 禁用 GPU 加速以提高透明窗口兼容性（可选）
// app.disableHardwareAcceleration();

// 设置 Content Security Policy
app.on('web-contents-created', (event, contents) => {
  // 阻止新窗口创建
  contents.setWindowOpenHandler(({ url }) => {
    logger.warn('Blocked window.open:', url);
    return { action: 'deny' };
  });
  
  // 阻止导航
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // 只允许导航到本地页面
    if (isDev) {
      if (!navigationUrl.startsWith('http://localhost')) {
        event.preventDefault();
        logger.warn('Blocked navigation:', navigationUrl);
      }
    } else {
      if (parsedUrl.protocol !== 'file:') {
        event.preventDefault();
        logger.warn('Blocked navigation:', navigationUrl);
      }
    }
  });
});

// ============================================================================
// 导出（用于测试）
// ============================================================================

export {
  mainWindow,
  databaseService,
  eventBus,
  isAppReady,
  createMainWindow,
  showMainWindow,
};