import { app, BrowserWindow } from 'electron';
import * as path from 'path';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let settingsWindow: BrowserWindow | null = null;

function getPreloadPath(): string {
  return path.join(__dirname, '../preload/index.js');
}

function getSettingsHtmlPath(): string {
  if (isDev) {
    const base = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';
    return `${base.replace(/\/$/, '')}/settings.html`;
  }
  return path.join(__dirname, '../renderer/settings.html');
}

export function openPetSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 920,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    title: '\u5ba0\u7269\u8bbe\u7f6e',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  const entry = getSettingsHtmlPath();
  if (isDev) {
    void settingsWindow.loadURL(entry);
  } else {
    void settingsWindow.loadFile(entry);
  }
}

export function closePetSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
}
