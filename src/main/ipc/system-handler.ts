/**
 * System API IPC 处理器
 *
 * 实现系统功能相关的 IPC 通道处理：
 * - system:get-info - 获取系统信息
 * - system:open-external - 打开外部链接或应用
 * - system:show-notification - 显示系统通知
 * - system:get-auto-start - 获取自启动状态
 * - system:set-auto-start - 设置自启动
 * - system:check-update - 检查更新
 * - system:quit - 退出应用
 *
 * @see contracts/ipc-api.md - Section 8: System API
 * @task T071 [US4] 实现 System API IPC 处理器
 */

import { app, shell, Notification, BrowserWindow } from 'electron';
import { quitApplication } from '../app-quit';
import {
  createModuleHandlers,
  IPCException,
  IPCErrorCodes,
  validators,
} from '../ipc-handlers';
import { ipcLogger } from '../logger';
import * as os from 'os';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

/**
 * 系统信息
 * @see contracts/ipc-api.md - SystemInfo
 */
export interface SystemInfo {
  platform: 'win32' | 'darwin' | 'linux';
  version: string;
  appVersion: string;
  dataPath: string;
  locale: string;
}

/**
 * 系统通知选项
 * @see contracts/ipc-api.md - NotificationOptions
 */
export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  /** 点击通知时的动作 */
  onClick?: 'focus' | 'open-chat' | 'show-reminder';
  /** 通知关联的数据ID */
  actionData?: string;
}

/**
 * 更新信息
 * @see contracts/ipc-api.md - UpdateInfo
 */
export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  downloadUrl: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * 允许打开的协议列表（安全考虑）
 */
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:', 'file:'];

/**
 * 默认通知图标路径
 */
const DEFAULT_NOTIFICATION_ICON = path.join(__dirname, '../../assets/icons/app-icon.png');

// ============================================================================
// Validators
// ============================================================================

/**
 * 验证外部链接目标
 */
function validateExternalTarget(target: unknown): true | string {
  if (typeof target !== 'string') {
    return 'target must be a string';
  }

  if (target.trim().length === 0) {
    return 'target cannot be empty';
  }

  // 检查是否是允许的协议
  try {
    const url = new URL(target);
    if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
      return `Protocol ${url.protocol} is not allowed. Allowed protocols: ${ALLOWED_PROTOCOLS.join(', ')}`;
    }
  } catch {
    // 如果不是有效的 URL，可能是本地路径
    // 允许绝对路径
    if (!path.isAbsolute(target)) {
      return 'target must be an absolute path or a valid URL';
    }
  }

  return true;
}

/**
 * 验证通知选项
 */
function validateNotificationOptions(options: unknown): true | string {
  if (!options || typeof options !== 'object') {
    return 'Notification options are required';
  }

  const opts = options as NotificationOptions;

  if (!opts.title || typeof opts.title !== 'string') {
    return 'title is required and must be a string';
  }

  if (opts.title.trim().length === 0) {
    return 'title cannot be empty';
  }

  if (opts.title.length > 100) {
    return 'title must be less than 100 characters';
  }

  if (!opts.body || typeof opts.body !== 'string') {
    return 'body is required and must be a string';
  }

  if (opts.body.length > 500) {
    return 'body must be less than 500 characters';
  }

  if (opts.icon !== undefined && typeof opts.icon !== 'string') {
    return 'icon must be a string';
  }

  if (opts.onClick !== undefined) {
    const validActions = ['focus', 'open-chat', 'show-reminder'];
    if (!validActions.includes(opts.onClick)) {
      return `onClick must be one of: ${validActions.join(', ')}`;
    }
  }

  if (opts.actionData !== undefined && typeof opts.actionData !== 'string') {
    return 'actionData must be a string';
  }

  return true;
}

/**
 * 验证布尔值
 */
function validateBoolean(name: string) {
  return (value: unknown): true | string => {
    if (typeof value !== 'boolean') {
      return `${name} must be a boolean`;
    }
    return true;
  };
}

// ============================================================================
// System Service
// ============================================================================

/**
 * 系统服务
 * 提供系统级操作和信息获取功能
 */
class SystemService {
  private autoLauncher: AutoLauncher | null = null;

  /**
   * 获取系统信息
   */
  getInfo(): SystemInfo {
    return {
      platform: process.platform as 'win32' | 'darwin' | 'linux',
      version: os.release(),
      appVersion: app.getVersion(),
      dataPath: app.getPath('userData'),
      locale: app.getLocale(),
    };
  }

  /**
   * 打开外部链接或应用
   */
  async openExternal(target: string): Promise<void> {
    ipcLogger.debug(`Opening external: ${target}`, {
      action: 'openExternal',
      target,
    });

    try {
      await shell.openExternal(target);
    } catch (error) {
      ipcLogger.error(`Failed to open external: ${target}`, {
        action: 'openExternal',
        error: error instanceof Error ? error.message : String(error),
      });
      throw new IPCException(
        IPCErrorCodes.ERR_INTERNAL,
        `Failed to open: ${target}`
      );
    }
  }

  /**
   * 打开文件或文件夹
   */
  async openPath(targetPath: string): Promise<void> {
    ipcLogger.debug(`Opening path: ${targetPath}`, {
      action: 'openPath',
      path: targetPath,
    });

    try {
      const result = await shell.openPath(targetPath);
      if (result) {
        // shell.openPath 返回错误消息字符串，空字符串表示成功
        throw new Error(result);
      }
    } catch (error) {
      ipcLogger.error(`Failed to open path: ${targetPath}`, {
        action: 'openPath',
        error: error instanceof Error ? error.message : String(error),
      });
      throw new IPCException(
        IPCErrorCodes.ERR_INTERNAL,
        `Failed to open: ${targetPath}`
      );
    }
  }

  /**
   * 显示系统通知
   */
  async showNotification(options: NotificationOptions): Promise<void> {
    // 检查系统是否支持通知
    if (!Notification.isSupported()) {
      ipcLogger.warn('Notifications are not supported on this system', {
        action: 'showNotification',
      });
      throw new IPCException(
        IPCErrorCodes.ERR_INTERNAL,
        'Notifications are not supported on this system'
      );
    }

    const notification = new Notification({
      title: options.title,
      body: options.body,
      icon: options.icon || DEFAULT_NOTIFICATION_ICON,
      silent: false,
    });

    // 处理点击事件
    notification.on('click', () => {
      this.handleNotificationClick(options);
    });

    notification.show();

    ipcLogger.debug('Notification shown', {
      action: 'showNotification',
      title: options.title,
    });
  }

  /**
   * 处理通知点击
   */
  private handleNotificationClick(options: NotificationOptions): void {
    const mainWindow = BrowserWindow.getAllWindows()[0];

    if (!mainWindow) {
      return;
    }

    switch (options.onClick) {
      case 'focus':
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
        break;

      case 'open-chat':
        mainWindow.webContents.send('notification:action', {
          action: 'open-chat',
          data: options.actionData,
        });
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
        break;

      case 'show-reminder':
        mainWindow.webContents.send('notification:action', {
          action: 'show-reminder',
          data: options.actionData,
        });
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
        break;

      default:
        // 默认行为：聚焦窗口
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
    }
  }

  /**
   * 获取自启动状态
   */
  async getAutoStart(): Promise<boolean> {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  }

  /**
   * 设置自启动
   */
  async setAutoStart(enabled: boolean): Promise<void> {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: true, // 启动时隐藏窗口
      });

      ipcLogger.info(`Auto-start ${enabled ? 'enabled' : 'disabled'}`, {
        action: 'setAutoStart',
        enabled,
      });
    } catch (error) {
      ipcLogger.error('Failed to set auto-start', {
        action: 'setAutoStart',
        error: error instanceof Error ? error.message : String(error),
      });
      throw new IPCException(
        IPCErrorCodes.ERR_INTERNAL,
        'Failed to set auto-start'
      );
    }
  }

  /**
   * 检查更新
   * 注意：实际的更新检查逻辑会在 auto-updater.ts 中实现
   */
  async checkUpdate(): Promise<UpdateInfo | null> {
    // TODO: 集成 electron-updater
    // 这里返回 null 表示没有可用更新
    // 实际实现会在 T104 中完成
    ipcLogger.debug('Checking for updates', { action: 'checkUpdate' });

    // 模拟检查更新
    // 在生产环境中，这会调用 electron-updater 的 checkForUpdates 方法
    return null;
  }

  /**
   * 退出应用
   */
  async quit(): Promise<void> {
    ipcLogger.info('Application quit requested', { action: 'quit' });
    await quitApplication();
  }
}

// ============================================================================
// Auto Launcher (辅助类)
// ============================================================================

/**
 * 自启动管理器接口
 * 注意：Electron 内置的 app.setLoginItemSettings 已经足够
 * 如果需要更复杂的功能，可以使用 auto-launch 包
 */
interface AutoLauncher {
  enable(): Promise<void>;
  disable(): Promise<void>;
  isEnabled(): Promise<boolean>;
}

// ============================================================================
// IPC Handlers
// ============================================================================

let systemService: SystemService | null = null;

/**
 * 获取系统服务实例
 */
function getSystemService(): SystemService {
  if (!systemService) {
    systemService = new SystemService();
  }
  return systemService;
}

/**
 * 注册 System API IPC 处理器
 */
export function registerSystemHandlers(): void {
  const handlers = createModuleHandlers('System');

  // system:get-info - 获取系统信息
  handlers.register('system:get-info', async () => {
    const service = getSystemService();
    return service.getInfo();
  });

  // system:open-external - 打开外部链接或应用
  handlers.register(
    'system:open-external',
    async (_ctx, target: string) => {
      const service = getSystemService();

      // 判断是 URL 还是路径
      try {
        new URL(target);
        // 是有效的 URL
        await service.openExternal(target);
      } catch {
        // 不是 URL，尝试作为路径打开
        await service.openPath(target);
      }
    },
    {
      validate: validateExternalTarget,
    }
  );

  // system:show-notification - 显示系统通知
  handlers.register(
    'system:show-notification',
    async (_ctx, options: NotificationOptions) => {
      const service = getSystemService();
      await service.showNotification(options);
    },
    {
      validate: validateNotificationOptions,
    }
  );

  // system:get-auto-start - 获取自启动状态
  handlers.register('system:get-auto-start', async () => {
    const service = getSystemService();
    return service.getAutoStart();
  });

  // system:set-auto-start - 设置自启动
  handlers.register(
    'system:set-auto-start',
    async (_ctx, enabled: boolean) => {
      const service = getSystemService();
      await service.setAutoStart(enabled);
    },
    {
      validate: validateBoolean('enabled'),
    }
  );

  // system:check-update - 检查更新
  handlers.register('system:check-update', async () => {
    const service = getSystemService();
    return service.checkUpdate();
  });

  // system:quit - 退出应用
  handlers.register('system:quit', async () => {
    const service = getSystemService();
    await service.quit();
  });

  ipcLogger.info('System API handlers registered', {
    action: 'register',
    module: 'System',
    channels: handlers.getChannels(),
  });
}

/**
 * 重置系统服务（用于测试）
 */
export function resetSystemService(): void {
  systemService = null;
}

// ============================================================================
// Exports
// ============================================================================

export { SystemService };