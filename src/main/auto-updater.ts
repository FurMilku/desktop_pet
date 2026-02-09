/**
 * 自动更新服务
 * T104 实现自动更新服务（含HTTPS签名验证）
 * 
 * 功能：
 * - 检查更新
 * - 下载更新
 * - 验证签名
 * - 安装更新
 * - 更新进度通知
 */

import { EventEmitter } from 'events';
import { app, BrowserWindow, dialog, shell } from 'electron';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from './logger';

// 更新配置
export interface UpdateConfig {
  /** 更新服务器地址 */
  updateServerUrl: string;
  /** 是否自动检查更新 */
  autoCheck: boolean;
  /** 自动检查间隔（毫秒） */
  checkInterval: number;
  /** 是否自动下载更新 */
  autoDownload: boolean;
  /** 是否自动安装更新 */
  autoInstall: boolean;
  /** 公钥用于签名验证 */
  publicKey?: string;
  /** 允许预发布版本 */
  allowPrerelease: boolean;
  /** 允许降级 */
  allowDowngrade: boolean;
}

// 更新信息
export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  downloadUrl: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  signature?: string;
  minimumVersion?: string;
  isPrerelease: boolean;
  isMandatory: boolean;
}

// 下载进度
export interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

// 更新状态
export type UpdateStatus = 
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

// 更新事件
export interface AutoUpdaterEvents {
  'checking-for-update': () => void;
  'update-available': (info: UpdateInfo) => void;
  'update-not-available': (info: { currentVersion: string }) => void;
  'download-progress': (progress: DownloadProgress) => void;
  'update-downloaded': (info: UpdateInfo) => void;
  'update-error': (error: Error) => void;
  'before-quit-for-update': () => void;
}

/**
 * 自动更新服务
 */
export class AutoUpdater extends EventEmitter {
  private config: UpdateConfig;
  private status: UpdateStatus = 'idle';
  private updateInfo: UpdateInfo | null = null;
  private downloadedFilePath: string | null = null;
  private checkTimer: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;

  constructor(config: Partial<UpdateConfig> = {}) {
    super();
    
    this.config = {
      updateServerUrl: 'https://update.desktop-pet.app',
      autoCheck: true,
      checkInterval: 4 * 60 * 60 * 1000, // 4小时
      autoDownload: false,
      autoInstall: false,
      allowPrerelease: false,
      allowDowngrade: false,
      ...config,
    };

    logger.info('[AutoUpdater] Initialized', {
      serverUrl: this.config.updateServerUrl,
      autoCheck: this.config.autoCheck,
    });
  }

  /**
   * 设置主窗口（用于通知）
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * 获取当前状态
   */
  getStatus(): UpdateStatus {
    return this.status;
  }

  /**
   * 获取更新信息
   */
  getUpdateInfo(): UpdateInfo | null {
    return this.updateInfo;
  }

  /**
   * 启动自动检查
   */
  startAutoCheck(): void {
    if (!this.config.autoCheck) return;
    
    // 立即检查一次
    this.checkForUpdates();
    
    // 设置定期检查
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }
    
    this.checkTimer = setInterval(() => {
      this.checkForUpdates();
    }, this.config.checkInterval);

    logger.info('[AutoUpdater] Auto-check started', {
      interval: this.config.checkInterval,
    });
  }

  /**
   * 停止自动检查
   */
  stopAutoCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    logger.info('[AutoUpdater] Auto-check stopped');
  }

  /**
   * 检查更新
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (this.status === 'checking' || this.status === 'downloading') {
      logger.warn('[AutoUpdater] Already checking or downloading');
      return null;
    }

    this.status = 'checking';
    this.emit('checking-for-update');

    logger.info('[AutoUpdater] Checking for updates...');

    try {
      const currentVersion = app.getVersion();
      const platform = process.platform;
      const arch = process.arch;

      // 构建检查URL
      const checkUrl = `${this.config.updateServerUrl}/api/v1/check?` +
        `version=${encodeURIComponent(currentVersion)}` +
        `&platform=${encodeURIComponent(platform)}` +
        `&arch=${encodeURIComponent(arch)}` +
        `&prerelease=${this.config.allowPrerelease}`;

      // 请求更新信息
      const response = await this.httpRequest(checkUrl);
      const updateData = JSON.parse(response) as {
        hasUpdate: boolean;
        updateInfo?: UpdateInfo;
      };

      if (!updateData.hasUpdate || !updateData.updateInfo) {
        this.status = 'not-available';
        this.emit('update-not-available', { currentVersion });
        logger.info('[AutoUpdater] No updates available', { currentVersion });
        return null;
      }

      const info = updateData.updateInfo;

      // 版本比较
      if (!this.config.allowDowngrade && this.compareVersions(info.version, currentVersion) <= 0) {
        this.status = 'not-available';
        this.emit('update-not-available', { currentVersion });
        logger.info('[AutoUpdater] No new version available');
        return null;
      }

      // 检查最小版本要求
      if (info.minimumVersion && this.compareVersions(currentVersion, info.minimumVersion) < 0) {
        logger.warn('[AutoUpdater] Current version below minimum requirement', {
          current: currentVersion,
          minimum: info.minimumVersion,
        });
      }

      this.updateInfo = info;
      this.status = 'available';
      this.emit('update-available', info);

      logger.info('[AutoUpdater] Update available', {
        version: info.version,
        isMandatory: info.isMandatory,
      });

      // 自动下载
      if (this.config.autoDownload) {
        await this.downloadUpdate();
      }

      return info;
    } catch (error) {
      this.status = 'error';
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('update-error', err);
      logger.error('[AutoUpdater] Check failed', { error: err.message });
      return null;
    }
  }

  /**
   * 下载更新
   */
  async downloadUpdate(): Promise<string | null> {
    if (!this.updateInfo) {
      logger.warn('[AutoUpdater] No update info available');
      return null;
    }

    if (this.status === 'downloading') {
      logger.warn('[AutoUpdater] Already downloading');
      return null;
    }

    this.status = 'downloading';

    logger.info('[AutoUpdater] Starting download', {
      url: this.updateInfo.downloadUrl,
      size: this.updateInfo.fileSize,
    });

    try {
      // 创建下载目录
      const downloadDir = path.join(app.getPath('temp'), 'desktop-pet-updates');
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      const filePath = path.join(downloadDir, this.updateInfo.fileName);

      // 下载文件
      await this.downloadFile(this.updateInfo.downloadUrl, filePath);

      // 验证文件完整性
      const isValid = await this.verifyDownload(filePath);
      if (!isValid) {
        fs.unlinkSync(filePath);
        throw new Error('Download verification failed');
      }

      this.downloadedFilePath = filePath;
      this.status = 'downloaded';
      this.emit('update-downloaded', this.updateInfo);

      logger.info('[AutoUpdater] Download completed', { filePath });

      // 自动安装
      if (this.config.autoInstall) {
        this.quitAndInstall();
      }

      return filePath;
    } catch (error) {
      this.status = 'error';
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('update-error', err);
      logger.error('[AutoUpdater] Download failed', { error: err.message });
      return null;
    }
  }

  /**
   * 退出并安装更新
   */
  quitAndInstall(isSilent = false, isForceRunAfter = true): void {
    if (!this.downloadedFilePath) {
      logger.warn('[AutoUpdater] No downloaded file to install');
      return;
    }

    logger.info('[AutoUpdater] Quitting and installing', {
      filePath: this.downloadedFilePath,
      isSilent,
      isForceRunAfter,
    });

    this.emit('before-quit-for-update');
    this.status = 'installing';

    // 启动安装程序
    const installerArgs: string[] = [];
    
    if (isSilent) {
      installerArgs.push('/S'); // NSIS 静默安装参数
    }
    
    if (isForceRunAfter) {
      installerArgs.push('--force-run');
    }

    try {
      // 根据平台执行安装
      if (process.platform === 'win32') {
        this.installOnWindows(this.downloadedFilePath, installerArgs);
      } else if (process.platform === 'darwin') {
        this.installOnMac(this.downloadedFilePath);
      } else {
        this.installOnLinux(this.downloadedFilePath);
      }
    } catch (error) {
      logger.error('[AutoUpdater] Install failed', { error });
      this.status = 'error';
    }
  }

  /**
   * Windows 安装
   */
  private installOnWindows(filePath: string, args: string[]): void {
    const { spawn } = require('child_process');
    
    // 启动安装程序并退出应用
    const installer = spawn(filePath, args, {
      detached: true,
      stdio: 'ignore',
    });
    
    installer.unref();
    app.quit();
  }

  /**
   * macOS 安装
   */
  private installOnMac(filePath: string): void {
    // 打开 DMG 文件
    shell.openPath(filePath);
    app.quit();
  }

  /**
   * Linux 安装
   */
  private installOnLinux(filePath: string): void {
    const { spawn } = require('child_process');
    
    // 根据文件类型执行安装
    if (filePath.endsWith('.deb')) {
      spawn('sudo', ['dpkg', '-i', filePath], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else if (filePath.endsWith('.rpm')) {
      spawn('sudo', ['rpm', '-U', filePath], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else if (filePath.endsWith('.AppImage')) {
      // AppImage 可以直接运行
      fs.chmodSync(filePath, '755');
      spawn(filePath, [], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    }
    
    app.quit();
  }

  /**
   * 显示更新对话框
   */
  async showUpdateDialog(): Promise<boolean> {
    if (!this.updateInfo) return false;

    const response = await dialog.showMessageBox(this.mainWindow || BrowserWindow.getFocusedWindow()!, {
      type: 'info',
      title: '发现新版本',
      message: `新版本 ${this.updateInfo.version} 已发布`,
      detail: `${this.updateInfo.releaseNotes}\n\n发布日期: ${this.updateInfo.releaseDate}`,
      buttons: ['立即更新', '稍后提醒', '跳过此版本'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response.response === 0) {
      // 立即更新
      if (this.status === 'downloaded') {
        this.quitAndInstall();
      } else {
        await this.downloadUpdate();
      }
      return true;
    } else if (response.response === 2) {
      // 跳过此版本
      this.skipVersion(this.updateInfo.version);
    }

    return false;
  }

  /**
   * 跳过版本
   */
  private skipVersion(version: string): void {
    // 存储跳过的版本
    const skippedPath = path.join(app.getPath('userData'), 'skipped-version.json');
    fs.writeFileSync(skippedPath, JSON.stringify({ version, skippedAt: Date.now() }));
    
    logger.info('[AutoUpdater] Version skipped', { version });
  }

  /**
   * HTTP 请求
   */
  private httpRequest(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      
      const request = protocol.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': `DesktopPet/${app.getVersion()}`,
        },
      }, (response) => {
        // 处理重定向
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.httpRequest(redirectUrl).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * 下载文件
   */
  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(destPath);
      
      let downloadedBytes = 0;
      let totalBytes = 0;
      let startTime = Date.now();

      const request = protocol.get(url, {
        timeout: 600000, // 10分钟超时
        headers: {
          'User-Agent': `DesktopPet/${app.getVersion()}`,
        },
      }, (response) => {
        // 处理重定向
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(destPath);
            this.downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10);

        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          
          const elapsed = (Date.now() - startTime) / 1000;
          const bytesPerSecond = elapsed > 0 ? downloadedBytes / elapsed : 0;
          const percent = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;

          const progress: DownloadProgress = {
            percent: Math.round(percent * 100) / 100,
            transferred: downloadedBytes,
            total: totalBytes,
            bytesPerSecond: Math.round(bytesPerSecond),
          };

          this.emit('download-progress', progress);

          // 通知主窗口
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('update-download-progress', progress);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });
      });

      request.on('error', (error) => {
        file.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        reject(error);
      });

      request.on('timeout', () => {
        request.destroy();
        file.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * 验证下载文件
   */
  private async verifyDownload(filePath: string): Promise<boolean> {
    if (!this.updateInfo) return false;

    logger.info('[AutoUpdater] Verifying download', { filePath });

    // 1. 验证文件大小
    const stats = fs.statSync(filePath);
    if (stats.size !== this.updateInfo.fileSize) {
      logger.error('[AutoUpdater] File size mismatch', {
        expected: this.updateInfo.fileSize,
        actual: stats.size,
      });
      return false;
    }

    // 2. 验证 SHA256 哈希
    const hash = await this.calculateFileHash(filePath, 'sha256');
    if (hash !== this.updateInfo.sha256) {
      logger.error('[AutoUpdater] SHA256 hash mismatch', {
        expected: this.updateInfo.sha256,
        actual: hash,
      });
      return false;
    }

    // 3. 验证签名（如果配置了公钥）
    if (this.config.publicKey && this.updateInfo.signature) {
      const isValidSignature = await this.verifySignature(
        filePath,
        this.updateInfo.signature,
        this.config.publicKey
      );
      
      if (!isValidSignature) {
        logger.error('[AutoUpdater] Signature verification failed');
        return false;
      }
    }

    logger.info('[AutoUpdater] Download verified successfully');
    return true;
  }

  /**
   * 计算文件哈希
   */
  private calculateFileHash(filePath: string, algorithm: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * 验证签名
   */
  private verifySignature(
    filePath: string,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const verify = crypto.createVerify('RSA-SHA256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => verify.update(data));
      stream.on('end', () => {
        try {
          const isValid = verify.verify(publicKey, signature, 'base64');
          resolve(isValid);
        } catch (error) {
          reject(error);
        }
      });
      stream.on('error', reject);
    });
  }

  /**
   * 比较版本号
   * @returns 负数表示 v1 < v2，0 表示相等，正数表示 v1 > v2
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.replace(/^v/, '').split('.').map(Number);
    const parts2 = v2.replace(/^v/, '').split('.').map(Number);
    
    const maxLen = Math.max(parts1.length, parts2.length);
    
    for (let i = 0; i < maxLen; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    
    return 0;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<UpdateConfig>): void {
    this.config = { ...this.config, ...config };
    
    // 如果自动检查设置变更，重新启动
    if ('autoCheck' in config || 'checkInterval' in config) {
      this.stopAutoCheck();
      if (this.config.autoCheck) {
        this.startAutoCheck();
      }
    }

    logger.info('[AutoUpdater] Config updated', config);
  }

  /**
   * 清理下载缓存
   */
  cleanCache(): void {
    const downloadDir = path.join(app.getPath('temp'), 'desktop-pet-updates');
    
    if (fs.existsSync(downloadDir)) {
      fs.rmSync(downloadDir, { recursive: true, force: true });
      logger.info('[AutoUpdater] Cache cleaned');
    }
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.stopAutoCheck();
    this.removeAllListeners();
    this.mainWindow = null;
    
    logger.info('[AutoUpdater] Destroyed');
  }
}

// 单例实例
let autoUpdaterInstance: AutoUpdater | null = null;

/**
 * 获取自动更新服务实例
 */
export function getAutoUpdater(config?: Partial<UpdateConfig>): AutoUpdater {
  if (!autoUpdaterInstance) {
    autoUpdaterInstance = new AutoUpdater(config);
  } else if (config) {
    autoUpdaterInstance.updateConfig(config);
  }
  return autoUpdaterInstance;
}

/**
 * 初始化自动更新服务
 */
export function initAutoUpdater(
  mainWindow: BrowserWindow,
  config?: Partial<UpdateConfig>
): AutoUpdater {
  const updater = getAutoUpdater(config);
  updater.setMainWindow(mainWindow);
  updater.startAutoCheck();
  return updater;
}

// 导出类型
export type { AutoUpdaterEvents };