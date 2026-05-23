/**
 * Window API IPC 处理器
 * T028 [US1] 实现 Window API IPC 处理器
 *
 * 处理渲染进程与主进程之间的窗口控制 IPC 通信
 *
 * @see specs/001-desktop-3d-pet/contracts/ipc-api.md Window API
 */

import { BrowserWindow, ipcMain, IpcMainEvent, IpcMainInvokeEvent, screen } from 'electron';
import { getWindowManager, DisplayInfo, WindowPosition } from '../window-manager';
import { getLogger } from '../logger';
import type { PetHitRegion, PetHitState } from '../../shared/config/pet-window';

const logger = getLogger('window-handler');

// ============================================================================
// IPC Channel 定义
// ============================================================================

/**
 * Window IPC Channels
 */
export const WindowChannels = {
  MOVE: 'window:move',
  RESIZE: 'window:resize',
  GET_POSITION: 'window:get-position',
  SET_ALWAYS_ON_TOP: 'window:set-always-on-top',
  MINIMIZE: 'window:minimize',
  GET_DISPLAYS: 'window:get-displays',
  SET_OPACITY: 'window:set-opacity',
  SET_CLICK_THROUGH: 'window:set-click-through',
  SHOW: 'window:show',
  HIDE: 'window:hide',
  RESTORE: 'window:restore',
  SAVE_POSITION: 'window:save-position',
  GET_STATE: 'window:get-state',
  SET_RESIZE_FRAME: 'window:set-resize-frame',
  GET_RESIZE_FRAME: 'window:get-resize-frame',
  GET_DISPLAY_SCALE: 'window:get-display-scale',
  GET_CURSOR_IN_CONTENT: 'window:get-cursor-in-content',
  UPDATE_PET_HIT_REGION: 'window:update-pet-hit-region',
  SET_CLICK_THROUGH_LOCK: 'window:set-click-through-lock',
} as const;

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 窗口位置响应
 */
export interface WindowPositionResponse {
  x: number;
  y: number;
  monitor: number;
}

/**
 * 显示器信息响应
 */
export interface DisplayInfoResponse {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
  scaleFactor: number;
}

/**
 * 窗口状态响应
 */
export interface WindowStateResponse {
  isVisible: boolean;
  isMinimized: boolean;
  isAlwaysOnTop: boolean;
  position: WindowPositionResponse;
  size: { width: number; height: number };
  resizeFrameEnabled: boolean;
}

// ============================================================================
// IPC 处理器注册
// ============================================================================

/**
 * 注册所有 Window IPC 处理器
 */
export function registerWindowHandlers(): void {
  logger.info('Registering Window IPC handlers');

  // 移动窗口
  ipcMain.handle(WindowChannels.MOVE, handleMove);

  // 调整窗口尺寸
  ipcMain.handle(WindowChannels.RESIZE, handleResize);

  // 获取窗口位置
  ipcMain.handle(WindowChannels.GET_POSITION, handleGetPosition);

  // 设置置顶状态
  ipcMain.handle(WindowChannels.SET_ALWAYS_ON_TOP, handleSetAlwaysOnTop);

  // 最小化到托盘
  ipcMain.handle(WindowChannels.MINIMIZE, handleMinimize);

  // 获取显示器列表
  ipcMain.handle(WindowChannels.GET_DISPLAYS, handleGetDisplays);

  // 设置透明度
  ipcMain.handle(WindowChannels.SET_OPACITY, handleSetOpacity);

  // 设置点击穿透
  ipcMain.handle(WindowChannels.SET_CLICK_THROUGH, handleSetClickThrough);

  // 显示窗口
  ipcMain.handle(WindowChannels.SHOW, handleShow);

  // 隐藏窗口
  ipcMain.handle(WindowChannels.HIDE, handleHide);

  // 从托盘恢复
  ipcMain.handle(WindowChannels.RESTORE, handleRestore);

  // 保存窗口位置
  ipcMain.handle(WindowChannels.SAVE_POSITION, handleSavePosition);

  // 获取窗口状态
  ipcMain.handle(WindowChannels.GET_STATE, handleGetState);

  ipcMain.handle(WindowChannels.SET_RESIZE_FRAME, handleSetResizeFrame);

  ipcMain.handle(WindowChannels.GET_RESIZE_FRAME, handleGetResizeFrame);

  ipcMain.handle(WindowChannels.GET_DISPLAY_SCALE, handleGetDisplayScale);

  ipcMain.on(WindowChannels.GET_CURSOR_IN_CONTENT, handleGetCursorInContent);
  ipcMain.on(WindowChannels.UPDATE_PET_HIT_REGION, handleUpdatePetHitRegion);
  ipcMain.on(WindowChannels.SET_CLICK_THROUGH_LOCK, handleSetClickThroughLock);

  logger.info('Window IPC handlers registered');
}

/**
 * 注销所有 Window IPC 处理器
 */
export function unregisterWindowHandlers(): void {
  logger.info('Unregistering Window IPC handlers');

  ipcMain.removeHandler(WindowChannels.MOVE);
  ipcMain.removeHandler(WindowChannels.RESIZE);
  ipcMain.removeHandler(WindowChannels.GET_POSITION);
  ipcMain.removeHandler(WindowChannels.SET_ALWAYS_ON_TOP);
  ipcMain.removeHandler(WindowChannels.MINIMIZE);
  ipcMain.removeHandler(WindowChannels.GET_DISPLAYS);
  ipcMain.removeHandler(WindowChannels.SET_OPACITY);
  ipcMain.removeHandler(WindowChannels.SET_CLICK_THROUGH);
  ipcMain.removeHandler(WindowChannels.SHOW);
  ipcMain.removeHandler(WindowChannels.HIDE);
  ipcMain.removeHandler(WindowChannels.RESTORE);
  ipcMain.removeHandler(WindowChannels.SAVE_POSITION);
  ipcMain.removeHandler(WindowChannels.GET_STATE);
  ipcMain.removeHandler(WindowChannels.SET_RESIZE_FRAME);
  ipcMain.removeHandler(WindowChannels.GET_RESIZE_FRAME);
  ipcMain.removeHandler(WindowChannels.GET_DISPLAY_SCALE);

  ipcMain.removeAllListeners(WindowChannels.GET_CURSOR_IN_CONTENT);
  ipcMain.removeAllListeners(WindowChannels.UPDATE_PET_HIT_REGION);
  ipcMain.removeAllListeners(WindowChannels.SET_CLICK_THROUGH_LOCK);

  logger.info('Window IPC handlers unregistered');
}

// ============================================================================
// IPC 处理器实现
// ============================================================================

/**
 * 处理窗口移动请求
 */
async function handleMove(
  _event: IpcMainInvokeEvent,
  x: number,
  y: number
): Promise<void> {
  try {
    logger.debug('Handle move', { x, y });

    // 验证参数
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new Error('Invalid position parameters');
    }

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error('Position must be finite numbers');
    }

    const windowManager = getWindowManager();
    windowManager.moveTo(x, y);
  } catch (error) {
    logger.error('Failed to move window', error);
    throw createIPCError('ERR_INTERNAL', `Failed to move window: ${error}`);
  }
}

/**
 * 处理窗口尺寸调整请求
 */
async function handleResize(
  _event: IpcMainInvokeEvent,
  width: number,
  height: number,
  options?: { anchor?: 'center' | 'top-left' }
): Promise<void> {
  try {
    if (typeof width !== 'number' || typeof height !== 'number') {
      throw new Error('Invalid size parameters');
    }
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error('Size must be finite numbers');
    }

    const windowManager = getWindowManager();
    windowManager.resizeTo(width, height, options);
  } catch (error) {
    logger.error('Failed to resize window', error);
    throw createIPCError('ERR_INTERNAL', `Failed to resize window: ${error}`);
  }
}

/**
 * 处理获取窗口位置请求
 */
async function handleGetPosition(
  _event: IpcMainInvokeEvent
): Promise<WindowPositionResponse> {
  try {
    logger.debug('Handle get position');

    const windowManager = getWindowManager();
    const state = windowManager.getWindowState();

    return {
      x: state.position.x,
      y: state.position.y,
      monitor: state.position.monitorId,
    };
  } catch (error) {
    logger.error('Failed to get window position', error);
    throw createIPCError('ERR_INTERNAL', `Failed to get window position: ${error}`);
  }
}

/**
 * 处理设置置顶状态请求
 */
async function handleSetAlwaysOnTop(
  _event: IpcMainInvokeEvent,
  alwaysOnTop: boolean
): Promise<void> {
  try {
    logger.debug('Handle set always on top', { alwaysOnTop });

    // 验证参数
    if (typeof alwaysOnTop !== 'boolean') {
      throw new Error('alwaysOnTop must be a boolean');
    }

    const windowManager = getWindowManager();
    windowManager.setAlwaysOnTop(alwaysOnTop);
  } catch (error) {
    logger.error('Failed to set always on top', error);
    throw createIPCError('ERR_INTERNAL', `Failed to set always on top: ${error}`);
  }
}

/**
 * 处理最小化到托盘请求
 */
async function handleMinimize(_event: IpcMainInvokeEvent): Promise<void> {
  try {
    logger.debug('Handle minimize');

    const windowManager = getWindowManager();
    windowManager.minimizeToTray();
  } catch (error) {
    logger.error('Failed to minimize window', error);
    throw createIPCError('ERR_INTERNAL', `Failed to minimize window: ${error}`);
  }
}

/**
 * 处理获取显示器列表请求
 */
async function handleGetDisplays(
  _event: IpcMainInvokeEvent
): Promise<DisplayInfoResponse[]> {
  try {
    logger.debug('Handle get displays');

    const windowManager = getWindowManager();
    const displays = windowManager.getDisplays();

    return displays.map(display => ({
      id: display.id,
      bounds: { ...display.bounds },
      isPrimary: display.isPrimary,
      scaleFactor: display.scaleFactor,
    }));
  } catch (error) {
    logger.error('Failed to get displays', error);
    throw createIPCError('ERR_INTERNAL', `Failed to get displays: ${error}`);
  }
}

/**
 * 处理设置透明度请求
 */
async function handleSetOpacity(
  _event: IpcMainInvokeEvent,
  opacity: number
): Promise<void> {
  try {
    logger.debug('Handle set opacity', { opacity });

    // 验证参数
    if (typeof opacity !== 'number') {
      throw new Error('opacity must be a number');
    }

    if (opacity < 0 || opacity > 1) {
      throw new Error('opacity must be between 0 and 1');
    }

    const windowManager = getWindowManager();
    windowManager.setOpacity(opacity);
  } catch (error) {
    logger.error('Failed to set opacity', error);
    throw createIPCError('ERR_INTERNAL', `Failed to set opacity: ${error}`);
  }
}

/**
 * 处理设置点击穿透请求
 */
async function handleSetClickThrough(
  _event: IpcMainInvokeEvent,
  enable: boolean,
  options?: { forward?: boolean }
): Promise<void> {
  try {
    logger.debug('Handle set click through', { enable, options });

    // 验证参数
    if (typeof enable !== 'boolean') {
      throw new Error('enable must be a boolean');
    }

    const windowManager = getWindowManager();
    windowManager.setClickThrough(enable, options);
  } catch (error) {
    logger.error('Failed to set click through', error);
    throw createIPCError('ERR_INTERNAL', `Failed to set click through: ${error}`);
  }
}

/**
 * 处理显示窗口请求
 */
async function handleShow(_event: IpcMainInvokeEvent): Promise<void> {
  try {
    logger.debug('Handle show');

    const windowManager = getWindowManager();
    windowManager.show();
  } catch (error) {
    logger.error('Failed to show window', error);
    throw createIPCError('ERR_INTERNAL', `Failed to show window: ${error}`);
  }
}

/**
 * 处理隐藏窗口请求
 */
async function handleHide(_event: IpcMainInvokeEvent): Promise<void> {
  try {
    logger.debug('Handle hide');

    const windowManager = getWindowManager();
    windowManager.hide();
  } catch (error) {
    logger.error('Failed to hide window', error);
    throw createIPCError('ERR_INTERNAL', `Failed to hide window: ${error}`);
  }
}

/**
 * 处理从托盘恢复请求
 */
async function handleRestore(_event: IpcMainInvokeEvent): Promise<void> {
  try {
    logger.debug('Handle restore');

    const windowManager = getWindowManager();
    windowManager.restoreFromTray();
  } catch (error) {
    logger.error('Failed to restore window', error);
    throw createIPCError('ERR_INTERNAL', `Failed to restore window: ${error}`);
  }
}

/**
 * 处理保存窗口位置请求
 */
async function handleSavePosition(_event: IpcMainInvokeEvent): Promise<void> {
  try {
    logger.debug('Handle save position');

    const windowManager = getWindowManager();
    await windowManager.savePosition();
  } catch (error) {
    logger.error('Failed to save window position', error);
    throw createIPCError('ERR_INTERNAL', `Failed to save window position: ${error}`);
  }
}

/**
 * 处理获取窗口状态请求
 */
async function handleGetState(
  _event: IpcMainInvokeEvent
): Promise<WindowStateResponse> {
  try {
    logger.debug('Handle get state');

    const windowManager = getWindowManager();
    const state = windowManager.getWindowState();

    return {
      isVisible: state.isVisible,
      isMinimized: state.isMinimized,
      isAlwaysOnTop: state.isAlwaysOnTop,
      position: {
        x: state.position.x,
        y: state.position.y,
        monitor: state.position.monitorId,
      },
      size: { ...state.size },
      resizeFrameEnabled: state.resizeFrameEnabled,
    };
  } catch (error) {
    logger.error('Failed to get window state', error);
    throw createIPCError('ERR_INTERNAL', `Failed to get window state: ${error}`);
  }
}

/**
 * 处理显示窗口边缘 / 可调整大小模式
 */
async function handleSetResizeFrame(
  _event: IpcMainInvokeEvent,
  enabled: boolean
): Promise<void> {
  try {
    if (typeof enabled !== 'boolean') {
      throw new Error('enabled must be a boolean');
    }
    getWindowManager().setResizeFrameEnabled(enabled);
  } catch (error) {
    logger.error('Failed to set resize frame', error);
    throw createIPCError('ERR_INTERNAL', `Failed to set resize frame: ${error}`);
  }
}

/**
 * 获取是否处于可调整大小模式
 */
async function handleGetResizeFrame(_event: IpcMainInvokeEvent): Promise<boolean> {
  try {
    return getWindowManager().isResizeFrameEnabled();
  } catch (error) {
    logger.error('Failed to get resize frame state', error);
    throw createIPCError('ERR_INTERNAL', `Failed to get resize frame state: ${error}`);
  }
}

function handleGetCursorInContent(event: IpcMainEvent): void {
  try {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow && !senderWindow.isDestroyed()) {
      const cursor = screen.getCursorScreenPoint();
      const bounds = senderWindow.getContentBounds();
      const localX = cursor.x - bounds.x;
      const localY = cursor.y - bounds.y;
      event.returnValue = {
        localX,
        localY,
        inWindow:
          localX >= 0 &&
          localY >= 0 &&
          localX < bounds.width &&
          localY < bounds.height,
      };
      return;
    }

    event.returnValue = getWindowManager().getCursorInContent();
  } catch (error) {
    logger.error('Failed to get cursor in content', error);
    event.returnValue = { localX: 0, localY: 0, inWindow: false };
  }
}

function handleUpdatePetHitRegion(_event: IpcMainEvent, state: PetHitState | PetHitRegion | null): void {
  try {
    if (state === null) {
      getWindowManager().setPetHitState({
        region: null,
        pointerOnPet: false,
        pointerLocalX: 0,
        pointerLocalY: 0,
        hasPointer: false,
      });
      return;
    }

    if ('pointerOnPet' in state) {
      if (
        typeof state.pointerOnPet !== 'boolean' ||
        typeof state.pointerLocalX !== 'number' ||
        typeof state.pointerLocalY !== 'number' ||
        typeof state.hasPointer !== 'boolean'
      ) {
        throw new Error('Invalid pet hit state');
      }
      if (
        state.region !== null &&
        (typeof state.region.minX !== 'number' ||
          typeof state.region.maxX !== 'number' ||
          typeof state.region.minY !== 'number' ||
          typeof state.region.maxY !== 'number')
      ) {
        throw new Error('Invalid pet hit region');
      }
      getWindowManager().setPetHitState(state);
      return;
    }

    if (
      typeof state.minX !== 'number' ||
      typeof state.maxX !== 'number' ||
      typeof state.minY !== 'number' ||
      typeof state.maxY !== 'number'
    ) {
      throw new Error('Invalid pet hit region');
    }
    getWindowManager().setPetHitRegion(state);
  } catch (error) {
    logger.error('Failed to update pet hit region', error);
  }
}

function handleSetClickThroughLock(_event: IpcMainEvent, locked: unknown): void {
  try {
    if (typeof locked !== 'boolean') {
      throw new Error('locked must be a boolean');
    }
    getWindowManager().setClickThroughInteractionLock(locked);
  } catch (error) {
    logger.error('Failed to set click-through lock', error);
  }
}

async function handleGetDisplayScale(event: IpcMainInvokeEvent): Promise<number> {
  try {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow && !senderWindow.isDestroyed()) {
      const bounds = senderWindow.getBounds();
      const display = screen.getDisplayNearestPoint({
        x: bounds.x + Math.floor(bounds.width / 2),
        y: bounds.y + Math.floor(bounds.height / 2),
      });
      return display.scaleFactor;
    }

    return getWindowManager().getCurrentDisplay().scaleFactor;
  } catch (error) {
    logger.error('Failed to get display scale', error);
    throw createIPCError('ERR_INTERNAL', `Failed to get display scale: ${error}`);
  }
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * IPC 错误接口
 */
interface IPCError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * 创建 IPC 错误对象
 */
function createIPCError(code: string, message: string, details?: unknown): IPCError {
  return {
    code,
    message,
    details,
  };
}