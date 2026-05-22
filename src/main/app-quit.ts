import { app } from 'electron';
import { getWindowManager } from './window-manager';

/** 应用是否正在退出（允许窗口真正关闭，而非隐藏到托盘） */
let applicationQuitting = false;

export function markApplicationQuitting(): void {
  applicationQuitting = true;
}

export function isApplicationQuitting(): boolean {
  return applicationQuitting;
}

export function resetApplicationQuittingState(): void {
  applicationQuitting = false;
}

/**
 * 持久化窗口布局并退出应用
 */
export async function quitApplication(): Promise<void> {
  markApplicationQuitting();
  try {
    await getWindowManager().savePosition();
  } catch (error) {
    console.error('[AppQuit] Failed to save window layout:', error);
  }
  app.quit();
}
