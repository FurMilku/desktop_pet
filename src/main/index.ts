/**
 * Electron 主进程入口
 * 桌面3D小宠物应用
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';

// 主窗口引用
let mainWindow: BrowserWindow | null = null;

/**
 * 创建主窗口
 */
async function createMainWindow(): Promise<void> {
  // TODO: 实现透明无边框窗口创建 (T022)
  mainWindow = new BrowserWindow({
    width: 400,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 加载渲染进程页面
  if (process.env.NODE_ENV === 'development') {
    await mainWindow.loadURL('http://localhost:5173');
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 应用就绪时初始化
 */
app.whenReady().then(async () => {
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

/**
 * 所有窗口关闭时退出应用 (macOS除外)
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

export { mainWindow };