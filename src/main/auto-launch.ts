/**
 * Auto Launch Service
 * 开机自启动功能，使用 auto-launch 库实现跨平台支持
 */

import { app } from 'electron';
import AutoLaunch from 'auto-launch';
import { logger } from './logger';

/**
 * 自动启动配置
 */
interface AutoLaunchConfig {
  /** 是否启用开机自启动 */
  enabled: boolean;
  /** 是否隐藏窗口启动 */
  hidden: boolean;
  /** 自定义启动参数 */
  args?: string[];
}

/**
 * 自动启动状态
 */
interface AutoLaunchStatus {
  /** 当前是否启用 */
  isEnabled: boolean;
  /** 应用路径 */
  appPath: string;
  /** 平台 */
  platform: NodeJS.Platform;
  /** 是否支持隐藏启动 */
  supportsHidden: boolean;
}

/**
 * 自动启动服务类
 */
class AutoLaunchService {
  private autoLauncher: AutoLaunch | null = null;
  private isInitialized: boolean = false;
  private config: AutoLaunchConfig = {
    enabled: false,
    hidden: true,
    args: []
  };

  /**
   * 初始化自动启动服务
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('[AutoLaunch] Already initialized');
      return;
    }

    try {
      const appName = app.getName();
      const appPath = app.getPath('exe');

      // 构建启动参数
      const launchArgs: string[] = [];
      
      // 添加隐藏启动参数
      if (this.config.hidden) {
        launchArgs.push('--hidden');
      }

      // 添加自定义参数
      if (this.config.args && this.config.args.length > 0) {
        launchArgs.push(...this.config.args);
      }

      // 创建 AutoLaunch 实例
      const options: AutoLaunch.AutoLaunchOptions = {
        name: appName,
        path: appPath,
        isHidden: this.config.hidden
      };

      // macOS 特定配置
      if (process.platform === 'darwin') {
        options.mac = {
          useLaunchAgent: true
        };
      }

      this.autoLauncher = new AutoLaunch(options);
      this.isInitialized = true;

      logger.info('[AutoLaunch] Service initialized', {
        appName,
        appPath,
        platform: process.platform,
        hidden: this.config.hidden
      });

      // 检查当前状态
      const isEnabled = await this.isEnabled();
      logger.info(`[AutoLaunch] Current status: ${isEnabled ? 'enabled' : 'disabled'}`);

    } catch (error) {
      logger.error('[AutoLaunch] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * 启用开机自启动
   */
  async enable(): Promise<boolean> {
    if (!this.autoLauncher) {
      logger.error('[AutoLaunch] Service not initialized');
      return false;
    }

    try {
      const isCurrentlyEnabled = await this.isEnabled();
      
      if (isCurrentlyEnabled) {
        logger.info('[AutoLaunch] Already enabled');
        return true;
      }

      await this.autoLauncher.enable();
      this.config.enabled = true;

      logger.info('[AutoLaunch] Auto-launch enabled');
      return true;

    } catch (error) {
      logger.error('[AutoLaunch] Failed to enable:', error);
      return false;
    }
  }

  /**
   * 禁用开机自启动
   */
  async disable(): Promise<boolean> {
    if (!this.autoLauncher) {
      logger.error('[AutoLaunch] Service not initialized');
      return false;
    }

    try {
      const isCurrentlyEnabled = await this.isEnabled();
      
      if (!isCurrentlyEnabled) {
        logger.info('[AutoLaunch] Already disabled');
        return true;
      }

      await this.autoLauncher.disable();
      this.config.enabled = false;

      logger.info('[AutoLaunch] Auto-launch disabled');
      return true;

    } catch (error) {
      logger.error('[AutoLaunch] Failed to disable:', error);
      return false;
    }
  }

  /**
   * 检查是否启用
   */
  async isEnabled(): Promise<boolean> {
    if (!this.autoLauncher) {
      logger.warn('[AutoLaunch] Service not initialized');
      return false;
    }

    try {
      return await this.autoLauncher.isEnabled();
    } catch (error) {
      logger.error('[AutoLaunch] Failed to check status:', error);
      return false;
    }
  }

  /**
   * 切换开机自启动状态
   */
  async toggle(): Promise<boolean> {
    const isCurrentlyEnabled = await this.isEnabled();
    
    if (isCurrentlyEnabled) {
      return await this.disable();
    } else {
      return await this.enable();
    }
  }

  /**
   * 获取自动启动状态
   */
  async getStatus(): Promise<AutoLaunchStatus> {
    const isEnabled = await this.isEnabled();
    
    return {
      isEnabled,
      appPath: app.getPath('exe'),
      platform: process.platform,
      supportsHidden: this.supportsHiddenLaunch()
    };
  }

  /**
   * 检查当前平台是否支持隐藏启动
   */
  supportsHiddenLaunch(): boolean {
    // Windows 和 macOS 都支持隐藏启动
    // Linux 取决于桌面环境
    return process.platform === 'win32' || process.platform === 'darwin';
  }

  /**
   * 设置隐藏启动选项
   */
  async setHiddenLaunch(hidden: boolean): Promise<boolean> {
    this.config.hidden = hidden;

    // 如果已启用，需要重新配置
    const isCurrentlyEnabled = await this.isEnabled();
    
    if (isCurrentlyEnabled) {
      // 先禁用再重新启用以应用新配置
      await this.disable();
      
      // 重新初始化
      this.isInitialized = false;
      this.autoLauncher = null;
      await this.initialize();
      
      return await this.enable();
    }

    return true;
  }

  /**
   * 获取当前配置
   */
  getConfig(): AutoLaunchConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  async updateConfig(newConfig: Partial<AutoLaunchConfig>): Promise<boolean> {
    try {
      const oldConfig = { ...this.config };
      this.config = { ...this.config, ...newConfig };

      // 如果启用状态改变
      if (newConfig.enabled !== undefined && newConfig.enabled !== oldConfig.enabled) {
        if (newConfig.enabled) {
          await this.enable();
        } else {
          await this.disable();
        }
      }

      // 如果隐藏启动状态改变
      if (newConfig.hidden !== undefined && newConfig.hidden !== oldConfig.hidden) {
        await this.setHiddenLaunch(newConfig.hidden);
      }

      logger.info('[AutoLaunch] Config updated', this.config);
      return true;

    } catch (error) {
      logger.error('[AutoLaunch] Failed to update config:', error);
      return false;
    }
  }

  /**
   * 检查应用是否以自动启动方式启动
   */
  isAutoLaunched(): boolean {
    // 检查启动参数中是否包含 --hidden 或 --autostart
    const args = process.argv;
    return args.includes('--hidden') || args.includes('--autostart');
  }

  /**
   * 获取平台特定的自动启动路径
   */
  getAutoLaunchPath(): string | null {
    switch (process.platform) {
      case 'win32':
        // Windows: 注册表或启动文件夹
        return 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
      
      case 'darwin':
        // macOS: Launch Agents
        return `~/Library/LaunchAgents/${app.getName()}.plist`;
      
      case 'linux':
        // Linux: XDG autostart
        return `~/.config/autostart/${app.getName()}.desktop`;
      
      default:
        return null;
    }
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.autoLauncher = null;
    this.isInitialized = false;
    logger.info('[AutoLaunch] Service destroyed');
  }
}

// 导出单例实例
export const autoLaunchService = new AutoLaunchService();

// 导出类型
export type { AutoLaunchConfig, AutoLaunchStatus };

// 导出便捷函数
export async function initializeAutoLaunch(): Promise<void> {
  return autoLaunchService.initialize();
}

export async function enableAutoLaunch(): Promise<boolean> {
  return autoLaunchService.enable();
}

export async function disableAutoLaunch(): Promise<boolean> {
  return autoLaunchService.disable();
}

export async function isAutoLaunchEnabled(): Promise<boolean> {
  return autoLaunchService.isEnabled();
}

export async function toggleAutoLaunch(): Promise<boolean> {
  return autoLaunchService.toggle();
}

export async function getAutoLaunchStatus(): Promise<AutoLaunchStatus> {
  return autoLaunchService.getStatus();
}