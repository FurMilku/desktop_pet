/**
 * 渲染进程入口文件
 * 负责初始化 Three.js 渲染器和宠物显示
 */

import { createPetRenderer, IPetRenderer, AnimationState as PetAnimationState } from './pet/pet-renderer';
import {
  PET_WINDOW_WIDTH,
  PET_WINDOW_HEIGHT,
  SETTING_SHOW_WINDOW_FRAME,
} from '../shared/config/pet-window';
import {
  createContextMenu,
  createDefaultPetMenu,
  type IContextMenu,
} from './ui/context-menu';
import {
  normalizeClickAnimationSettings,
  normalizePetDesktopConfig,
  type PetDesktopConfig,
} from '../shared/config/pet-desktop-settings';

// ============================================================
// 类型定义 (基于 contracts/ipc-api.md)
// ============================================================

// 动画状态类型
type AnimationState =
  | 'idle'
  | 'thinking'
  | 'happy'
  | 'sad'
  | 'confused'
  | 'drag'
  | 'listening'
  | 'celebrating'
  | 'sleepy'
  | 'curious';

// 宠物位置
interface PetPosition {
  x: number;
  y: number;
  monitor: number;
}

// 宠物状态
interface PetState {
  animation: AnimationState;
  position: PetPosition;
  skinId: string;
  emotionalValue: number;
}

// 动画选项
interface AnimationOptions {
  transitionDuration?: number;
  loop?: boolean;
  nextState?: AnimationState;
}

// 显示器信息
interface DisplayInfo {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
}

// Window API
interface WindowAPI {
  move(x: number, y: number): Promise<void>;
  resize(width: number, height: number, options?: { anchor?: 'center' | 'top-left' }): Promise<void>;
  getPosition(): Promise<{ x: number; y: number; monitor: number }>;
  setAlwaysOnTop(alwaysOnTop: boolean): Promise<void>;
  minimize(): Promise<void>;
  getDisplays(): Promise<DisplayInfo[]>;
  setClickThrough(enable: boolean, options?: { forward?: boolean }): Promise<void>;
  setResizeFrameEnabled(enabled: boolean): Promise<void>;
  getResizeFrameEnabled(): Promise<boolean>;
  saveLayout(): Promise<void>;
}

// Pet API
interface PetAPI {
  getModelUrl?: () => Promise<string | null>;
  getState(): Promise<PetState>;
  setAnimation(animation: AnimationState, options?: AnimationOptions): Promise<void>;
  savePosition(position: PetPosition): Promise<void>;
  getDesktopConfig(): Promise<PetDesktopConfig>;
  setDesktopConfig(config: PetDesktopConfig): Promise<PetDesktopConfig>;
  previewDesktopConfig?(config: PetDesktopConfig): Promise<{
    windowWidth: number;
    windowHeight: number;
    modelScale: number;
    modelBrightness: number;
    position: { x: number; y: number; monitor: number };
  }>;
  openSettings(): Promise<void>;
  reportAnimationClips(clipNames: string[]): Promise<void>;
  getAnimationClips(): Promise<string[]>;
  onDesktopConfigChanged(callback: (config: PetDesktopConfig) => void): () => void;
  onDesktopConfigPreview?(callback: (config: PetDesktopConfig) => void): () => void;
  onStateChanged(callback: (state: PetState) => void): () => void;
}

// Settings API (部分定义)
interface SettingsAPI {
  get<T>(key: string): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
  reset(key?: string): Promise<void>;
  onChanged(callback: (key: string, value: unknown) => void): () => void;
}

// System API (部分定义)
interface SystemAPI {
  getInfo(): Promise<{
    platform: 'win32' | 'darwin' | 'linux';
    version: string;
    appVersion: string;
    dataPath: string;
    locale: string;
  }>;
  openExternal(target: string): Promise<void>;
  quit(): Promise<void>;
}

// Electron API 接口 (暴露给渲染进程)
interface ElectronAPI {
  window: WindowAPI;
  pet: PetAPI;
  settings: SettingsAPI;
  system: SystemAPI;
  // 以下 API 将在后续用户故事中实现
  // ai: AIAPI;
  // reminder: ReminderAPI;
  // voice: VoiceAPI;
  // skin: SkinAPI;
}

// 扩展 Window 接口
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

// ============================================================
// DOM 元素引用
// ============================================================

const petContainer = document.getElementById('pet-container') as HTMLDivElement;
const loadingElement = document.getElementById('loading') as HTMLDivElement;
const errorElement = document.getElementById('error') as HTMLDivElement;
const errorMessage = document.getElementById('error-message') as HTMLParagraphElement;

// ============================================================
// 鼠标拖拽状态
// ============================================================

/** 是否正在拖拽 */
let isDragging = false;

/** 拖拽开始时鼠标的屏幕坐标 */
let dragStartMouseX = 0;
let dragStartMouseY = 0;

/** 拖拽开始时窗口的位置 */
let dragStartWindowX = 0;
let dragStartWindowY = 0;

/** 拖拽阈值（像素），避免误触 */
const DRAG_THRESHOLD = 2;

/** 是否已超过拖拽阈值 */
let hasDragThresholdMet = false;

/** 待应用的窗口位置（rAF 合并移动请求，提升跟手度） */
let pendingWindowPos: { x: number; y: number } | null = null;
let windowMoveRafId: number | null = null;

/** 飞行拖拽：平滑跟随鼠标的目标与当前插值位置 */
let flyFollowTargetX = 0;
let flyFollowTargetY = 0;
let flyFollowPosX = 0;
let flyFollowPosY = 0;
let dragFlyFollowRafId: number | null = null;
let flyFollowLastTickMs = 0;

/** 行走拖拽：独立的跟随状态（不与飞行共用） */
let walkFollowTargetX = 0;
let walkFollowTargetY = 0;
let walkFollowPosX = 0;
let walkFollowPosY = 0;
let walkDragFollowRafId: number | null = null;
let walkFollowLastTickMs = 0;
let walkChaseTargetLocked = false;

/** 追鼠标时的基础速度（像素/秒，距离近时） */
const DRAG_FLY_MOVE_SPEED_MIN = 280;

/** 距离较远时的最高速度（像素/秒） */
const DRAG_FLY_MOVE_SPEED_MAX = 920;

/** 达到最高速度参考距离（像素） */
const DRAG_FLY_SPEED_DIST_REF = 450;

/** 与目标距离小于此值视为「追上鼠标」（屏幕像素） */
const DRAG_FLY_ARRIVE_DIST = 18;

/** 接近目标时减速半径（越大越不易飞过头） */
const DRAG_FLY_EASE_RADIUS = 220;

/** 模型中心在窗口内的瞄准点（比例，与 pet-renderer 转向一致） */
const DRAG_FLY_AIM_X_RATIO = 0.5;
const DRAG_FLY_AIM_Y_RATIO = 0.52;

/** 鼠标静止多久后切换为悬停动画（毫秒） */
const FLY_MOUSE_IDLE_MS = 220;

/** 判定鼠标在移动的屏幕像素阈值 */
const FLY_MOUSE_MOVE_THRESHOLD = 2;

/** 连续几帧同一方向才切换滑翔/悬停，减轻抖动 */
const FLY_MODE_SWITCH_FRAMES = 3;

/** 进入滑翔循环后，窗口追鼠标速度的渐入时长（毫秒） */
const FLY_LOOP_CHASE_RAMP_MS = 680;

/** 行走拖拽：追鼠标速度超过此值切 run（像素/秒） */
const WALK_DRAG_RUN_SPEED = 500;

/** 行走拖拽：追上鼠标后静止多久切待机（毫秒） */
const WALK_DRAG_MOUSE_IDLE_MS = 220;

/** 行走拖拽追鼠标速度渐入（毫秒） */
const WALK_LOOP_CHASE_RAMP_MS = 280;

let flyMouseIdleTimer: ReturnType<typeof setTimeout> | null = null;
let walkMouseIdleTimer: ReturnType<typeof setTimeout> | null = null;
let walkLoopChaseStartMs = 0;

/** 松手后继续滑向松手位置，到达后再结束行走拖拽 */
let walkCoastToRelease = false;
let lastFlyInputMouseX = 0;
let lastFlyInputMouseY = 0;
let flyVerticalMoveFrames = 0;
let flyHorizontalMoveFrames = 0;
let lastSubmittedWindowX = Number.NaN;
let lastSubmittedWindowY = Number.NaN;
let lastFlyMouseMoveMs = 0;

/** 松手后继续飞向松手位置，到达后再落地 */
let flyCoastToRelease = false;

/** 循环阶段开始追鼠标的时间戳（用于速度渐入） */
let flyLoopChaseStartMs = 0;

/** 锁定追目标点（松手后不再跟随鼠标移动） */
let flyChaseTargetLocked = false;

/** 最近一次鼠标屏幕坐标（进入悬停时飞向该点） */
let lastMouseScreenX = 0;
let lastMouseScreenY = 0;

/** 飞行开始前记录的窗口尺寸（落地后恢复） */
let savedFlyWindowSize: { width: number; height: number } | null = null;

let pendingViewportSize: { width: number; height: number } | null = null;
let viewportResizeRafId: number | null = null;

let petContextMenu: IContextMenu | null = null;
let contextMenuOpen = false;
let lastPointerClientX = 0;
let lastPointerClientY = 0;
let showWindowFrameEnabled = false;
/** 当前已加载的模型文件名（与配置 modelFileName 对比以触发重载） */
let loadedModelFileName: string | null = null;

// ============================================================
// 工具函数
// ============================================================

/**
 * 通过 rAF 合并窗口移动请求，避免 await IPC 阻塞导致拖动滞后
 */
function scheduleWindowMove(x: number, y: number): void {
  const api = getElectronAPI();
  if (!api?.window?.move) {
    return;
  }

  const rx = Math.round(x);
  const ry = Math.round(y);
  if (rx === lastSubmittedWindowX && ry === lastSubmittedWindowY) {
    return;
  }

  pendingWindowPos = { x: rx, y: ry };

  if (windowMoveRafId !== null) {
    return;
  }

  windowMoveRafId = requestAnimationFrame(() => {
    windowMoveRafId = null;
    const pos = pendingWindowPos;
    pendingWindowPos = null;
    if (!pos) {
      return;
    }
    lastSubmittedWindowX = pos.x;
    lastSubmittedWindowY = pos.y;
    void api.window!.move(pos.x, pos.y);
  });
}

function cancelScheduledWindowMove(): void {
  pendingWindowPos = null;
  if (windowMoveRafId !== null) {
    cancelAnimationFrame(windowMoveRafId);
    windowMoveRafId = null;
  }
}

function stopFlyDragFollowLoop(): void {
  if (dragFlyFollowRafId !== null) {
    cancelAnimationFrame(dragFlyFollowRafId);
    dragFlyFollowRafId = null;
  }
}

function stopWalkDragFollowLoop(): void {
  if (walkDragFollowRafId !== null) {
    cancelAnimationFrame(walkDragFollowRafId);
    walkDragFollowRafId = null;
  }
}

function stopAllDragFollowLoops(): void {
  stopFlyDragFollowLoop();
  stopWalkDragFollowLoop();
}

function clearFlyMouseIdleTimer(): void {
  if (flyMouseIdleTimer !== null) {
    clearTimeout(flyMouseIdleTimer);
    flyMouseIdleTimer = null;
  }
}

function clearWalkMouseIdleTimer(): void {
  if (walkMouseIdleTimer !== null) {
    clearTimeout(walkMouseIdleTimer);
    walkMouseIdleTimer = null;
  }
}

function scheduleWalkMouseIdle(): void {
  clearWalkMouseIdleTimer();
  walkMouseIdleTimer = setTimeout(() => {
    walkMouseIdleTimer = null;
    if (
      !petRenderer?.isWalkDragActive() ||
      petRenderer.isDragFlyActive() ||
      walkCoastToRelease ||
      !isDragging
    ) {
      return;
    }
    if (!isWalkChaseComplete()) {
      return;
    }
    petRenderer.setWalkDragLocomotion('idle');
    petRenderer.resetWalkDragOrientation();
  }, WALK_DRAG_MOUSE_IDLE_MS);
}

function walkChaseDistance(): number {
  const dx = walkFollowTargetX - walkFollowPosX;
  const dy = walkFollowTargetY - walkFollowPosY;
  return Math.hypot(dx, dy);
}

function isWalkChaseComplete(): boolean {
  return walkChaseDistance() <= DRAG_FLY_ARRIVE_DIST;
}

function updateWalkDragFollowTargetFromMouse(screenX: number, screenY: number): void {
  if (walkChaseTargetLocked) {
    return;
  }
  const target = windowTargetFromMouse(screenX, screenY);
  walkFollowTargetX = target.x;
  walkFollowTargetY = target.y;
}

function lockWalkChaseTargetAtMouse(screenX: number, screenY: number): void {
  const target = windowTargetFromMouse(screenX, screenY);
  walkFollowTargetX = target.x;
  walkFollowTargetY = target.y;
  lastMouseScreenX = screenX;
  lastMouseScreenY = screenY;
  walkChaseTargetLocked = true;
}

function walkLoopChaseRampFactor(now = performance.now()): number {
  if (walkLoopChaseStartMs <= 0) {
    return 1;
  }
  const t = Math.min(1, (now - walkLoopChaseStartMs) / WALK_LOOP_CHASE_RAMP_MS);
  return t * t;
}

function beginWalkCoastToRelease(screenX: number, screenY: number): void {
  clearWalkMouseIdleTimer();
  lockWalkChaseTargetAtMouse(screenX, screenY);
  walkCoastToRelease = true;
  if (petRenderer?.isWalkDragActive() && walkDragFollowRafId === null) {
    void beginWalkDragFollowFromWindow();
  }
}

function clearWalkCoastState(): void {
  walkCoastToRelease = false;
  walkChaseTargetLocked = false;
}

/** 松手滑行途中再次按下：取消滑行并继续追鼠标 */
function cancelWalkCoastAndResumeDrag(screenX: number, screenY: number): void {
  clearWalkCoastState();
  clearWalkMouseIdleTimer();
  updateWalkDragFollowTargetFromMouse(screenX, screenY);
  walkLoopChaseStartMs = performance.now();
  petRenderer?.resumeWalkDragChase();
  if (petRenderer?.isWalkDragActive() && walkDragFollowRafId === null) {
    void beginWalkDragFollowFromWindow();
  }
}

function updateWalkDragLocomotionFromChaseSpeed(chaseSpeedPxPerSec: number): void {
  if (!petRenderer?.isWalkDragActive() || petRenderer.isDragFlyActive()) {
    return;
  }
  if (
    chaseSpeedPxPerSec >= WALK_DRAG_RUN_SPEED &&
    petRenderer.hasWalkDragRunClip()
  ) {
    petRenderer.setWalkDragLocomotion('run');
  } else {
    petRenderer.setWalkDragLocomotion('walk');
  }
}

/**
 * 无飞行剪辑模型：平滑追鼠标（与飞行循环同款插值）
 */
async function beginWalkDragFollowFromWindow(): Promise<void> {
  const api = getElectronAPI();
  if (api?.window?.getPosition) {
    try {
      const position = await api.window.getPosition();
      walkFollowPosX = position.x;
      walkFollowPosY = position.y;
    } catch {
      walkFollowPosX = dragStartWindowX;
      walkFollowPosY = dragStartWindowY;
    }
  } else {
    walkFollowPosX = dragStartWindowX;
    walkFollowPosY = dragStartWindowY;
  }

  if (walkDragFollowRafId !== null) {
    return;
  }

  if (walkLoopChaseStartMs <= 0) {
    walkLoopChaseStartMs = performance.now();
  }
  walkFollowLastTickMs = performance.now();

  const tick = (now: number): void => {
    if (!petRenderer?.isWalkDragActive() || petRenderer.isDragFlyActive()) {
      walkDragFollowRafId = null;
      walkLoopChaseStartMs = 0;
      return;
    }

    const dt = Math.min((now - walkFollowLastTickMs) / 1000, 0.05);
    walkFollowLastTickMs = now;

    const dx = walkFollowTargetX - walkFollowPosX;
    const dy = walkFollowTargetY - walkFollowPosY;
    const dist = Math.hypot(dx, dy);

    let chaseSpeed = 0;
    if (dist < 1) {
      walkFollowPosX = walkFollowTargetX;
      walkFollowPosY = walkFollowTargetY;
    } else {
      const ease = Math.max(0.15, Math.min(1, dist / DRAG_FLY_EASE_RADIUS));
      const chaseRamp = Math.max(0.14, walkLoopChaseRampFactor(now));
      const speed = flyMoveSpeedForDistance(dist) * chaseRamp;
      const step = speed * dt * ease;
      const move = Math.min(step, dist);
      chaseSpeed = move / Math.max(dt, 0.001);
      walkFollowPosX += (dx / dist) * move;
      walkFollowPosY += (dy / dist) * move;
    }

    scheduleWindowMove(walkFollowPosX, walkFollowPosY);

    const chaseComplete = isWalkChaseComplete();
    petRenderer.updateWalkDragLoopInput(
      0,
      0,
      lastMouseScreenX,
      lastMouseScreenY,
      walkFollowPosX,
      walkFollowPosY,
      window.innerWidth,
      window.innerHeight,
      chaseComplete
    );

    if (chaseComplete && walkCoastToRelease) {
      if (isDragging) {
        clearWalkCoastState();
      } else {
        clearWalkCoastState();
        walkLoopChaseStartMs = 0;
        stopWalkDragFollowLoop();
        petRenderer.endDragAnimation();
      }
      return;
    }

    if (chaseComplete) {
      if (performance.now() - lastFlyMouseMoveMs >= WALK_DRAG_MOUSE_IDLE_MS) {
        clearWalkMouseIdleTimer();
        petRenderer.setWalkDragLocomotion('idle');
      } else {
        scheduleWalkMouseIdle();
        petRenderer.setWalkDragLocomotion('walk');
      }
    } else {
      clearWalkMouseIdleTimer();
      updateWalkDragLocomotionFromChaseSpeed(chaseSpeed);
    }

    walkDragFollowRafId = requestAnimationFrame(tick);
  };

  walkDragFollowRafId = requestAnimationFrame(tick);
}

function flyChaseDistance(): number {
  const dx = flyFollowTargetX - flyFollowPosX;
  const dy = flyFollowTargetY - flyFollowPosY;
  return Math.hypot(dx, dy);
}

function isFlyChaseComplete(): boolean {
  return flyChaseDistance() <= DRAG_FLY_ARRIVE_DIST;
}

/** 距离越远飞得越快（平方根曲线，远端加速更明显） */
function flyMoveSpeedForDistance(dist: number): number {
  const t = Math.min(1, dist / DRAG_FLY_SPEED_DIST_REF);
  return DRAG_FLY_MOVE_SPEED_MIN + (DRAG_FLY_MOVE_SPEED_MAX - DRAG_FLY_MOVE_SPEED_MIN) * Math.sqrt(t);
}

/** 起飞切入循环后，移动速度从低到满（ease-in） */
function flyLoopChaseRampFactor(now = performance.now()): number {
  if (flyLoopChaseStartMs <= 0) {
    return 1;
  }
  const t = Math.min(1, (now - flyLoopChaseStartMs) / FLY_LOOP_CHASE_RAMP_MS);
  return t * t;
}

function lockFlyChaseTargetAtMouse(screenX: number, screenY: number): void {
  const target = windowTargetFromMouse(screenX, screenY);
  flyFollowTargetX = target.x;
  flyFollowTargetY = target.y;
  lastMouseScreenX = screenX;
  lastMouseScreenY = screenY;
  flyChaseTargetLocked = true;
}

function beginFlyCoastToRelease(screenX: number, screenY: number): void {
  lockFlyChaseTargetAtMouse(screenX, screenY);
  flyCoastToRelease = true;
  clearFlyMouseIdleTimer();
  petRenderer?.setFlyLoopHoverMode(false);
  if (petRenderer?.isFlyDragFollowingMouse() && dragFlyFollowRafId === null) {
    void beginDragFollowFromWindow();
  }
}

function clearFlyCoastState(): void {
  flyCoastToRelease = false;
  flyChaseTargetLocked = false;
}

function tryEnterFlyHoverMode(): void {
  if (!petRenderer?.isFlyDragFollowingMouse() || !isFlyChaseComplete()) {
    return;
  }
  petRenderer.setFlyLoopHoverMode(true);
  petRenderer.resetFlyLoopOrientation();
}

function scheduleFlyMouseIdle(): void {
  clearFlyMouseIdleTimer();
  flyMouseIdleTimer = setTimeout(() => {
    flyMouseIdleTimer = null;
    tryEnterFlyHoverMode();
  }, FLY_MOUSE_IDLE_MS);
}

/**
 * 同步跟随起点为当前窗口位置，并启动 rAF 平滑插值
 */
async function beginDragFollowFromWindow(): Promise<void> {
  const api = getElectronAPI();
  if (api?.window?.getPosition) {
    try {
      const position = await api.window.getPosition();
      flyFollowPosX = position.x;
      flyFollowPosY = position.y;
    } catch {
      flyFollowPosX = dragStartWindowX;
      flyFollowPosY = dragStartWindowY;
    }
  } else {
    flyFollowPosX = dragStartWindowX;
    flyFollowPosY = dragStartWindowY;
  }

  if (dragFlyFollowRafId !== null) {
    return;
  }

  flyFollowLastTickMs = performance.now();

  const tick = (now: number): void => {
    if (!petRenderer?.isDragFlyActive()) {
      dragFlyFollowRafId = null;
      clearFlyCoastState();
      return;
    }

    if (!petRenderer.isFlyDragFollowingMouse()) {
      if (flyCoastToRelease) {
        dragFlyFollowRafId = requestAnimationFrame(tick);
        return;
      }
      dragFlyFollowRafId = null;
      return;
    }

    const dt = Math.min((now - flyFollowLastTickMs) / 1000, 0.05);
    flyFollowLastTickMs = now;

    const dx = flyFollowTargetX - flyFollowPosX;
    const dy = flyFollowTargetY - flyFollowPosY;
    const dist = Math.hypot(dx, dy);

    if (dist < 1) {
      flyFollowPosX = flyFollowTargetX;
      flyFollowPosY = flyFollowTargetY;
    } else {
      const ease = Math.max(0.15, Math.min(1, dist / DRAG_FLY_EASE_RADIUS));
      const chaseRamp = Math.max(0.14, flyLoopChaseRampFactor(now));
      const speed = flyMoveSpeedForDistance(dist) * chaseRamp;
      const step = speed * dt * ease;
      const move = Math.min(step, dist);
      flyFollowPosX += (dx / dist) * move;
      flyFollowPosY += (dy / dist) * move;
    }

    scheduleWindowMove(flyFollowPosX, flyFollowPosY);

    const chaseComplete = isFlyChaseComplete();
    petRenderer.updateDragFlyLoopInput(
      0,
      0,
      lastMouseScreenX,
      lastMouseScreenY,
      flyFollowPosX,
      flyFollowPosY,
      window.innerWidth,
      window.innerHeight,
      chaseComplete
    );

    if (chaseComplete && flyCoastToRelease) {
      flyCoastToRelease = false;
      flyChaseTargetLocked = false;
      stopFlyDragFollowLoop();
      petRenderer.endDragAnimation();
      return;
    }

    if (chaseComplete && performance.now() - lastFlyMouseMoveMs >= FLY_MOUSE_IDLE_MS) {
      tryEnterFlyHoverMode();
    }

    dragFlyFollowRafId = requestAnimationFrame(tick);
  };

  dragFlyFollowRafId = requestAnimationFrame(tick);
}

/**
 * 根据鼠标屏幕坐标计算窗口左上角目标（使鼠标落在模型/窗口中心）
 */
function windowTargetFromMouse(screenX: number, screenY: number): { x: number; y: number } {
  const aimX = window.innerWidth * DRAG_FLY_AIM_X_RATIO;
  const aimY = window.innerHeight * DRAG_FLY_AIM_Y_RATIO;
  return {
    x: screenX - aimX,
    y: screenY - aimY,
  };
}

/**
 * 更新飞行循环阶段的目标位置（飞向鼠标）
 */
function updateDragFollowTargetFromMouse(screenX: number, screenY: number): void {
  if (flyChaseTargetLocked) {
    return;
  }
  const target = windowTargetFromMouse(screenX, screenY);
  flyFollowTargetX = target.x;
  flyFollowTargetY = target.y;
}

/**
 * 合并窗口尺寸调整请求（居中锚点，保持宠物在屏幕中央）
 */
function scheduleViewportResize(width: number, height: number): void {
  pendingViewportSize = { width, height };

  if (viewportResizeRafId !== null) {
    return;
  }

  viewportResizeRafId = requestAnimationFrame(() => {
    viewportResizeRafId = null;
    const size = pendingViewportSize;
    pendingViewportSize = null;
    if (!size) {
      return;
    }

    const api = getElectronAPI();
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (Math.abs(size.width - w) < 2 && Math.abs(size.height - h) < 2) {
      return;
    }

    if (api?.window?.resize) {
      void api.window.resize(size.width, size.height, { anchor: 'center' });
    }
    petRenderer?.resize(size.width, size.height);
  });
}

function restoreWindowSizeAfterFly(): void {
  if (!savedFlyWindowSize || showWindowFrameEnabled) {
    savedFlyWindowSize = null;
    return;
  }
  scheduleViewportResize(savedFlyWindowSize.width, savedFlyWindowSize.height);
  savedFlyWindowSize = null;
}

async function setContextMenuInteractionLock(locked: boolean): Promise<void> {
  contextMenuOpen = locked;
  const api = getElectronAPI();
  if (!api?.window?.setClickThrough) {
    return;
  }
  if (locked) {
    isClickThroughEnabled = false;
    try {
      await api.window.setClickThrough(false);
    } catch (error) {
      console.error('[Renderer] Failed to disable click-through for menu:', error);
    }
    return;
  }
  if (!showWindowFrameEnabled) {
    await updateClickThrough(lastPointerClientX, lastPointerClientY);
  }
}

async function showPetContextMenu(clientX: number, clientY: number): Promise<void> {
  if (!petContextMenu) {
    return;
  }
  lastPointerClientX = clientX;
  lastPointerClientY = clientY;
  await setContextMenuInteractionLock(true);
  petContextMenu.checkItem('showWindowFrame', showWindowFrameEnabled);
  petContextMenu.show(clientX, clientY);
}

async function applyWindowFrameMode(showFrame: boolean, persist = true): Promise<void> {
  const api = getElectronAPI();
  showWindowFrameEnabled = showFrame;
  document.body.classList.toggle('pet-window-frame-visible', showFrame);

  if (api?.window?.setResizeFrameEnabled) {
    try {
      await api.window.setResizeFrameEnabled(showFrame);
    } catch (error) {
      console.error('[Renderer] Failed to set resize frame:', error);
    }
  }

  if (showFrame) {
    isClickThroughEnabled = false;
    if (api?.window?.setClickThrough) {
      await api.window.setClickThrough(false);
    }
    petRenderer?.resize(window.innerWidth, window.innerHeight);
  }

  petContextMenu?.checkItem('showWindowFrame', showFrame);

  if (persist && api?.settings?.set) {
    try {
      await api.settings.set(SETTING_SHOW_WINDOW_FRAME, showFrame);
    } catch (error) {
      console.error('[Renderer] Failed to save window frame setting:', error);
    }
  }

  if (api?.window?.saveLayout) {
    try {
      await api.window.saveLayout();
    } catch (error) {
      console.error('[Renderer] Failed to save window layout:', error);
    }
  }
}

async function loadWindowFrameSetting(): Promise<void> {
  const api = getElectronAPI();
  let show = false;
  if (api?.settings?.get) {
    try {
      show = (await api.settings.get<boolean>(SETTING_SHOW_WINDOW_FRAME)) ?? false;
    } catch {
      show = false;
    }
  }
  if (api?.window?.getResizeFrameEnabled) {
    try {
      show = (await api.window.getResizeFrameEnabled()) || show;
    } catch {
      // ignore
    }
  }
  await applyWindowFrameMode(show, false);
}

function applyModelPlaybackSettings(
  config: PetDesktopConfig,
  options?: { force?: boolean }
): void {
  if (!petRenderer || usePlaceholderPet) {
    return;
  }
  const normalized = normalizePetDesktopConfig(config);
  petRenderer.setSourceAnimationFps(normalized.sourceAnimationFps, options);
  petRenderer.setPlaybackSpeed(normalized.playbackSpeed, options);
}

async function reloadPetModelFromConfig(config?: PetDesktopConfig): Promise<void> {
  if (!petRenderer || usePlaceholderPet) {
    return;
  }

  console.log('[Renderer] Reloading pet model after config change...');
  await loadPetModel(config);
}

async function applyDesktopConfig(
  config: PetDesktopConfig,
  options: { persist?: boolean } = { persist: true }
): Promise<void> {
  if (!document.getElementById('pet-container')) {
    return;
  }

  const api = getElectronAPI();
  const normalized = normalizePetDesktopConfig(config);
  let clickAnimation = normalizeClickAnimationSettings(config.clickAnimation);
  if (
    api?.pet?.getDesktopConfig &&
    options.persist !== false &&
    !config.clickAnimation?.sequenceStepsById
  ) {
    try {
      const fresh = normalizePetDesktopConfig(await api.pet.getDesktopConfig());
      clickAnimation = fresh.clickAnimation;
    } catch {
      // 使用传入配置
    }
  }

  const modelChanged = normalized.modelFileName !== loadedModelFileName;
  const fpsChanged =
    petRenderer &&
    !usePlaceholderPet &&
    petRenderer.getSourceAnimationFps() !== normalized.sourceAnimationFps;
  const playbackSpeedChanged =
    petRenderer &&
    !usePlaceholderPet &&
    petRenderer.getPlaybackSpeed() !== normalized.playbackSpeed;

  if (modelChanged && options.persist) {
    await reloadPetModelFromConfig(normalized);
  } else if (petRenderer && !usePlaceholderPet && (fpsChanged || playbackSpeedChanged)) {
    applyModelPlaybackSettings(normalized);
    petRenderer.beginPresentationAfterModelLoad();
  }

  if (petRenderer && !usePlaceholderPet) {
    petRenderer.setModelScaleFactor(normalized.modelScale);
    petRenderer.setModelBrightness(normalized.modelBrightness);
    // 模型重载时已在 loadPetModel 内应用；此处再 force 会 rebuild 并 stopAllAction，打断入场/待机
    if (!modelChanged) {
      applyModelPlaybackSettings(normalized);
    }
    petRenderer.setClickAnimationSettings(clickAnimation);
  }

  if (petRenderer && !usePlaceholderPet && modelChanged && options.persist) {
    petRenderer.beginPresentationAfterModelLoad();
  }

  if (api?.window?.resize) {
    await api.window.resize(normalized.windowWidth, normalized.windowHeight, {
      anchor: 'center',
    });
    petRenderer?.resize(normalized.windowWidth, normalized.windowHeight);
  }

  if (api?.window?.move) {
    await api.window.move(normalized.position.x, normalized.position.y);
  }

  if (options.persist) {
    if (api?.pet?.savePosition) {
      await api.pet.savePosition({
        x: normalized.position.x,
        y: normalized.position.y,
        monitor: normalized.position.monitor,
      });
    }

    if (api?.window?.saveLayout) {
      await api.window.saveLayout();
    }
  }
}

async function loadAndApplyDesktopConfig(): Promise<void> {
  const api = getElectronAPI();
  if (!api?.pet?.getDesktopConfig) {
    return;
  }
  try {
    const config = await api.pet.getDesktopConfig();
    await applyDesktopConfig(config);
  } catch (error) {
    console.warn('[Renderer] Failed to load desktop config:', error);
  }
}

function reportAnimationClipsToMain(): void {
  if (!petRenderer || usePlaceholderPet) {
    return;
  }
  const names = petRenderer.getAllAnimationClipNames();
  void getElectronAPI()?.pet?.reportAnimationClips?.(names);
}

function buildPetContextMenuItems() {
  const menuAnimations =
    petRenderer?.isInitialized() && !usePlaceholderPet
      ? petRenderer.getMenuAnimations().map((a) => ({ id: a.id, label: a.label }))
      : [];

  return createDefaultPetMenu({
    onShowWindowFrame: (showFrame) => {
      void applyWindowFrameMode(showFrame);
    },
    onPlayAnimation: (menuId) => {
      if (!usePlaceholderPet) {
        petRenderer?.playMenuAnimation(menuId);
      }
    },
    menuAnimations,
    onSettings: () => {
      void getElectronAPI()?.pet?.openSettings?.();
    },
    onQuit: () => {
      const api = getElectronAPI();
      if (!api?.system?.quit) {
        console.error('[Renderer] system.quit is not available');
        return;
      }
      void api.system.quit().catch((error: unknown) => {
        console.error('[Renderer] Quit failed:', error);
      });
    },
  });
}

function refreshPetContextMenu(): void {
  petContextMenu?.setItems(buildPetContextMenuItems());
}

function initPetContextMenu(): void {
  petContextMenu = createContextMenu({ theme: 'dark', minWidth: 200, zIndex: 20000 });
  petContextMenu.initialize();
  petContextMenu.setCallbacks({
    onClose: () => {
      void setContextMenuInteractionLock(false);
    },
  });
  refreshPetContextMenu();

  window.addEventListener('resize', () => {
    if (showWindowFrameEnabled && petRenderer?.isInitialized()) {
      petRenderer.resize(window.innerWidth, window.innerHeight);
    }
  });
}

/**
 * 显示加载状态
 */
function showLoading(): void {
  loadingElement.classList.add('visible');
  errorElement.classList.remove('visible');
}

/**
 * 隐藏加载状态
 */
function hideLoading(): void {
  loadingElement.classList.remove('visible');
}

/**
 * 显示错误信息
 */
function showError(message: string): void {
  hideLoading();
  errorMessage.textContent = message;
  errorElement.classList.add('visible');
}

/**
 * 检查 WebGL 支持
 */
function checkWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return gl !== null;
  } catch {
    return false;
  }
}

// ============================================================
// Three.js 渲染器实例
// ============================================================

/** 全局渲染器实例 */
let petRenderer: IPetRenderer | null = null;

/** 是否使用占位宠物（模型加载失败时使用） */
let usePlaceholderPet = false;

// ============================================================
// 占位宠物动画控制变量（模块级）
// ============================================================

/** Three.js 模块引用（动态导入后缓存） */
let THREE: typeof import('three') | null = null;

/** 占位宠物组 */
let placeholderPetGroup: import('three').Group | null = null;

/** 占位宠物身体材质 */
let placeholderBodyMaterial: import('three').MeshPhongMaterial | null = null;

/** 占位宠物左瞳孔 */
let placeholderLeftPupil: import('three').Mesh | null = null;

/** 占位宠物右瞳孔 */
let placeholderRightPupil: import('three').Mesh | null = null;

/** 占位宠物左眼白 */
let placeholderLeftEyeWhite: import('three').Mesh | null = null;

/** 占位宠物右眼白 */
let placeholderRightEyeWhite: import('three').Mesh | null = null;

/** 占位宠物微笑 */
let placeholderSmile: import('three').Mesh | null = null;

/** 占位宠物场景 */
let placeholderScene: import('three').Scene | null = null;

/** 占位宠物相机 */
let placeholderCamera: import('three').PerspectiveCamera | null = null;

// ============================================================
// 点击穿透状态
// ============================================================

/** 当前是否启用点击穿透 */
let isClickThroughEnabled = true;

/** 上次更新穿透状态的时间（用于节流） */
let lastClickThroughUpdateTime = 0;

/** 穿透状态更新的节流间隔（毫秒） */
const CLICK_THROUGH_THROTTLE_MS = 50;

/** 射线检测器 */
let raycaster: import('three').Raycaster | null = null;

/** 当前占位宠物动画状态 */
let currentPlaceholderAnimation: AnimationState = 'idle';

/** 占位宠物动画时间 */
let placeholderAnimationTime = 0;

/** 占位宠物状态过渡进度 (0-1) */
let placeholderTransitionProgress = 1;

/** 占位宠物目标颜色 */
let placeholderTargetColor = 0xff9eb5; // 默认粉色

/** 占位宠物当前颜色 */
let placeholderCurrentColor = 0xff9eb5;

// ============================================================
// Three.js 初始化
// ============================================================

/**
 * 初始化 Three.js 场景
 */
async function initThreeJS(): Promise<void> {
  console.log('[Renderer] Initializing Three.js scene...');
  
  // 检查 WebGL 支持
  if (!checkWebGLSupport()) {
    throw new Error('您的浏览器不支持 WebGL，无法显示 3D 宠物');
  }
  
  // 获取实际容器尺寸（使用 window.innerWidth/innerHeight 作为更可靠的后备）
  // 窗口大小统一使用公共配置
  const containerWidth = petContainer.clientWidth || window.innerWidth || PET_WINDOW_WIDTH;
  const containerHeight = petContainer.clientHeight || window.innerHeight || PET_WINDOW_HEIGHT;
  
  console.log(`[Renderer] PetRenderer container size: ${containerWidth}x${containerHeight}`);
  
  // 创建渲染器实例
  petRenderer = createPetRenderer(
    {
      container: petContainer,
      width: containerWidth,
      height: containerHeight,
      targetFPS: 60,
      antialias: true,
      enableShadows: false, // 透明窗口不需要阴影
    },
    {
      onModelLoaded: (model) => {
        console.log('[Renderer] Model loaded:', model.name, 'children:', model.children.length);
      },
      onAnimationChanged: (from, to) => {
        console.log(`[Renderer] Animation changed: ${from || 'none'} -> ${to}`);
      },
      onAnimationFinished: (animation) => {
        console.log('[Renderer] Animation finished:', animation);
      },
      onDragFlyStart: () => {
        // 起飞阶段只播动画、窗口不动；追鼠标在 onDragFlyLoopStart（滑翔）再启动
        lastFlyInputMouseX = lastMouseScreenX;
        lastFlyInputMouseY = lastMouseScreenY;
        clearFlyMouseIdleTimer();
        if (!flyChaseTargetLocked) {
          updateDragFollowTargetFromMouse(lastMouseScreenX, lastMouseScreenY);
        }
      },
      onDragFlyLoopStart: () => {
        console.log('[Renderer] Fly drag loop — gliding toward cursor');
        flyLoopChaseStartMs = performance.now();
        lastFlyInputMouseX = lastMouseScreenX;
        lastFlyInputMouseY = lastMouseScreenY;
        lastFlyMouseMoveMs = performance.now();
        flyVerticalMoveFrames = 0;
        flyHorizontalMoveFrames = 0;
        lastSubmittedWindowX = Number.NaN;
        lastSubmittedWindowY = Number.NaN;
        clearFlyMouseIdleTimer();
        petRenderer?.setFlyLoopHoverMode(false);
        if (!flyChaseTargetLocked) {
          updateDragFollowTargetFromMouse(lastMouseScreenX, lastMouseScreenY);
        }
        if (dragFlyFollowRafId === null) {
          void beginDragFollowFromWindow();
        }
      },
      onDragFlyEnd: () => {
        flyLoopChaseStartMs = 0;
        clearFlyCoastState();
        stopFlyDragFollowLoop();
      },
      onViewportResizeRequest: (size) => {
        scheduleViewportResize(size.width, size.height);
      },
      onError: (error) => {
        console.error('[Renderer] Renderer error:', error);
        // 如果使用占位宠物，不显示模型加载错误（占位宠物已成功显示）
        if (!usePlaceholderPet) {
          showError(error.message);
        }
      },
    }
  );
  
  // 初始化渲染器
  await petRenderer.init();
  
  console.log('[Renderer] Three.js initialized successfully');
}

/**
 * 加载宠物模型
 * 如果没有模型文件，创建占位3D对象
 */
async function loadPetModel(configOverride?: PetDesktopConfig): Promise<void> {
  console.log('[Renderer] Loading pet model...');
  
  if (!petRenderer) {
    throw new Error('渲染器未初始化');
  }

  // 预设使用占位宠物标志（因为 onError 回调可能在 catch 之前触发）
  // 如果模型加载成功，会重置此标志
  usePlaceholderPet = true;
  
  // 由主进程解析模型路径（支持任意 .glb 文件名）
  const modelPaths: string[] = [];
  const electronAPI = getElectronAPI();
  if (electronAPI?.pet?.getModelUrl) {
    const resolvedUrl = await electronAPI.pet.getModelUrl();
    if (resolvedUrl) {
      modelPaths.push(resolvedUrl);
    }
  }

  // 兼容旧路径（Vite publicDir=assets → /models/xxx.glb）
  modelPaths.push(
    '/models/default-pet.glb',
    '/models/pet-default.glb',
    '/models/pet.glb',
  );

  let modelLoaded = false;

  for (const modelPath of modelPaths) {
    try {
      console.log(`[Renderer] Trying to load model: ${modelPath}`);
      await petRenderer.loadModel({
        modelPath,
        autoFit: true,
      });
      modelLoaded = true;
      usePlaceholderPet = false;
      const resolvedConfig = normalizePetDesktopConfig(
        configOverride ??
          (await getElectronAPI()?.pet?.getDesktopConfig?.()) ??
          {}
      );
      loadedModelFileName = resolvedConfig.modelFileName;
      applyModelPlaybackSettings(resolvedConfig, { force: true });
      console.log(
        `[Renderer] Pet model loaded from: ${modelPath}, animation: ${petRenderer.getCurrentAnimation() ?? 'none'}`
      );
      refreshPetContextMenu();
      reportAnimationClipsToMain();
      await applyDesktopConfig(resolvedConfig, { persist: false });
      await enablePetInteraction();
      break;
    } catch (error) {
      console.error(`[Renderer] Model load failed: ${modelPath}`, error);
    }
  }
  
  // 如果所有模型都加载失败，创建占位宠物
  if (!modelLoaded) {
    console.log('[Renderer] No model files found, creating placeholder pet...');
    console.log('[Renderer] 提示：将 .glb 模型放入 assets/models/ 后重启应用（推荐命名为 default-pet.glb）');
    // usePlaceholderPet 已经是 true，保持不变
    await createPlaceholderPet();
    console.log('[Renderer] Placeholder pet created and displayed successfully');
  }
}

/**
 * 创建占位宠物（当没有GLB模型时使用）
 * 创建一个简单的可爱球体作为临时宠物
 */
async function createPlaceholderPet(): Promise<void> {
  console.log('[Renderer] Creating placeholder pet...');
  
  // 动态导入 Three.js 并缓存到模块级变量
  THREE = await import('three');
  
  // 获取实际容器尺寸（使用 window.innerWidth/innerHeight 作为更可靠的后备）
  // 窗口大小统一使用公共配置
  const containerWidth = petContainer.clientWidth || window.innerWidth || PET_WINDOW_WIDTH;
  const containerHeight = petContainer.clientHeight || window.innerHeight || PET_WINDOW_HEIGHT;
  
  console.log(`[Renderer] Placeholder pet container size: ${containerWidth}x${containerHeight}`);
  
  // 获取渲染器内部的场景（需要通过反射访问）
  // 由于 PetRenderer 封装了内部实现，我们需要直接在容器中创建一个简单的场景
  
  // 创建一个简单的 Three.js 场景
  const scene = new THREE.Scene();
  placeholderScene = scene;
  
  // 创建相机 - 使用实际容器尺寸计算宽高比
  const camera = new THREE.PerspectiveCamera(
    45,
    containerWidth / containerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  
  // 保存相机引用到模块级变量（用于射线检测）
  placeholderCamera = camera;
  
  // 初始化射线检测器
  raycaster = new THREE.Raycaster();
  
  // 创建渲染器 - 使用实际容器尺寸
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(containerWidth, containerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  
  // 清空容器并添加画布
  petContainer.innerHTML = '';
  petContainer.appendChild(renderer.domElement);
  renderer.domElement.style.background = 'transparent';
  
  // 创建可爱的占位宠物 - 一个带有眼睛的球体
  const petGroup = new THREE.Group();
  placeholderPetGroup = petGroup;
  
  // 身体 - 粉色球体
  const bodyGeometry = new THREE.SphereGeometry(1, 32, 32);
  const bodyMaterial = new THREE.MeshPhongMaterial({
    color: 0xff9eb5, // 粉色
    shininess: 100,
    specular: 0xffffff,
  });
  placeholderBodyMaterial = bodyMaterial;
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  petGroup.add(body);
  
  // 左眼 - 白色球体
  const eyeGeometry = new THREE.SphereGeometry(0.25, 16, 16);
  const eyeWhiteMaterial = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    shininess: 100,
  });
  const leftEyeWhite = new THREE.Mesh(eyeGeometry, eyeWhiteMaterial);
  leftEyeWhite.position.set(-0.35, 0.3, 0.8);
  placeholderLeftEyeWhite = leftEyeWhite;
  petGroup.add(leftEyeWhite);
  
  // 右眼 - 白色球体
  const rightEyeWhite = new THREE.Mesh(eyeGeometry, eyeWhiteMaterial);
  rightEyeWhite.position.set(0.35, 0.3, 0.8);
  placeholderRightEyeWhite = rightEyeWhite;
  petGroup.add(rightEyeWhite);
  
  // 左瞳孔 - 黑色球体
  const pupilGeometry = new THREE.SphereGeometry(0.12, 16, 16);
  const pupilMaterial = new THREE.MeshPhongMaterial({
    color: 0x000000,
  });
  const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
  leftPupil.position.set(-0.35, 0.3, 0.95);
  placeholderLeftPupil = leftPupil;
  petGroup.add(leftPupil);
  
  // 右瞳孔 - 黑色球体
  const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
  rightPupil.position.set(0.35, 0.3, 0.95);
  placeholderRightPupil = rightPupil;
  petGroup.add(rightPupil);
  
  // 腮红 - 红色椭圆
  const blushGeometry = new THREE.SphereGeometry(0.15, 16, 16);
  blushGeometry.scale(1.5, 1, 0.3);
  const blushMaterial = new THREE.MeshPhongMaterial({
    color: 0xff6b8a,
    transparent: true,
    opacity: 0.6,
  });
  const leftBlush = new THREE.Mesh(blushGeometry, blushMaterial);
  leftBlush.position.set(-0.6, -0.1, 0.85);
  petGroup.add(leftBlush);
  
  const rightBlush = new THREE.Mesh(blushGeometry, blushMaterial);
  rightBlush.position.set(0.6, -0.1, 0.85);
  petGroup.add(rightBlush);
  
  // 微笑 - 使用曲线
  const smileCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.3, -0.2, 0.95),
    new THREE.Vector3(0, -0.4, 0.95),
    new THREE.Vector3(0.3, -0.2, 0.95)
  );
  const smileGeometry = new THREE.TubeGeometry(smileCurve, 20, 0.03, 8, false);
  const smileMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
  const smile = new THREE.Mesh(smileGeometry, smileMaterial);
  placeholderSmile = smile;
  petGroup.add(smile);
  
  // 将宠物组添加到场景
  scene.add(petGroup);
  
  // 添加灯光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 7);
  scene.add(directionalLight);
  
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
  fillLight.position.set(-5, 5, -5);
  scene.add(fillLight);
  
  // 渲染循环
  function animate(): void {
    requestAnimationFrame(animate);
    
    placeholderAnimationTime += 0.016;
    const time = placeholderAnimationTime;
    
    // 根据当前动画状态应用不同效果
    applyPlaceholderAnimationEffects(time);
    
    renderer.render(scene, camera);
  }
  
  // 启动动画
  animate();
  
  console.log('[Renderer] Placeholder pet created successfully');
}

/**
 * 应用占位宠物的动画效果
 * 根据当前动画状态调整视觉表现
 */
function applyPlaceholderAnimationEffects(time: number): void {
  if (!placeholderPetGroup || !placeholderBodyMaterial || !THREE) return;
  
  // 基础呼吸效果 - 所有状态都有
  let breathScale = 1 + Math.sin(time * 2) * 0.03;
  let rotationZ = Math.sin(time * 1.5) * 0.05;
  let rotationY = Math.sin(time * 0.8) * 0.1;
  let eyeOffsetX = Math.sin(time * 0.5) * 0.05;
  let eyeOffsetY = 0;
  let targetColor = 0xff9eb5; // 默认粉色
  let bounceOffset = 0;
  
  // 根据动画状态调整效果
  switch (currentPlaceholderAnimation) {
    case 'happy':
      // 开心：更亮的颜色，更大的摇摆，眼睛变大
      targetColor = 0xffb6c8; // 更亮的粉色
      breathScale = 1 + Math.sin(time * 3) * 0.08; // 更快的呼吸
      rotationZ = Math.sin(time * 4) * 0.15; // 更大的摇摆
      rotationY = Math.sin(time * 2) * 0.2;
      // 眼睛放大效果
      if (placeholderLeftEyeWhite && placeholderRightEyeWhite) {
        const eyeScale = 1 + Math.sin(time * 5) * 0.1;
        placeholderLeftEyeWhite.scale.setScalar(eyeScale);
        placeholderRightEyeWhite.scale.setScalar(eyeScale);
      }
      break;
      
    case 'celebrating':
      // 庆祝：跳动效果，闪烁颜色
      targetColor = Math.sin(time * 8) > 0 ? 0xffb6c8 : 0xffd700; // 粉色和金色交替
      bounceOffset = Math.abs(Math.sin(time * 6)) * 0.3; // 跳动
      breathScale = 1 + Math.sin(time * 4) * 0.1;
      rotationZ = Math.sin(time * 8) * 0.2;
      rotationY = time * 2; // 旋转
      break;
      
    case 'confused':
      // 困惑：歪头，眼睛转动，变灰色
      targetColor = 0xd0a0b0; // 偏灰的粉色
      rotationZ = 0.3 + Math.sin(time * 2) * 0.1; // 歪头
      eyeOffsetX = Math.sin(time * 3) * 0.15; // 眼睛快速转动
      eyeOffsetY = Math.cos(time * 3) * 0.1;
      break;
      
    case 'sad':
      // 悲伤：低头，变暗，慢速呼吸
      targetColor = 0xc08090; // 暗粉色
      breathScale = 1 + Math.sin(time * 1) * 0.02; // 慢速小幅呼吸
      rotationZ = Math.sin(time * 0.5) * 0.02;
      // 眼睛朝下
      eyeOffsetY = -0.1;
      // 整体下垂
      if (placeholderPetGroup) {
        placeholderPetGroup.position.y = -0.1;
      }
      break;
      
    case 'thinking':
      // 思考：眼睛朝上，轻微歪头
      targetColor = 0xffa0b5;
      rotationZ = 0.15;
      eyeOffsetY = 0.1; // 眼睛朝上
      eyeOffsetX = Math.sin(time * 0.3) * 0.05;
      break;
      
    case 'sleepy':
      // 困倦：慢速呼吸，眼睛变小
      targetColor = 0xe8b0c0;
      breathScale = 1 + Math.sin(time * 0.8) * 0.04;
      rotationZ = Math.sin(time * 0.5) * 0.03;
      // 眼睛变小（眯眼效果）
      if (placeholderLeftEyeWhite && placeholderRightEyeWhite) {
        placeholderLeftEyeWhite.scale.set(1, 0.3, 1);
        placeholderRightEyeWhite.scale.set(1, 0.3, 1);
      }
      break;
      
    case 'curious':
      // 好奇：眼睛放大，前倾
      targetColor = 0xffb8c8;
      rotationY = Math.sin(time * 1.5) * 0.3;
      if (placeholderLeftEyeWhite && placeholderRightEyeWhite) {
        placeholderLeftEyeWhite.scale.setScalar(1.2);
        placeholderRightEyeWhite.scale.setScalar(1.2);
      }
      // 前倾
      if (placeholderPetGroup) {
        placeholderPetGroup.rotation.x = 0.1;
      }
      break;
      
    case 'listening':
      // 聆听：轻微倾斜，专注
      targetColor = 0xffc0d0;
      rotationZ = 0.1;
      breathScale = 1 + Math.sin(time * 1.5) * 0.02;
      break;
      
    case 'drag':
      // 拖拽：惊讶表情
      targetColor = 0xffd0e0;
      if (placeholderLeftEyeWhite && placeholderRightEyeWhite) {
        placeholderLeftEyeWhite.scale.setScalar(1.3);
        placeholderRightEyeWhite.scale.setScalar(1.3);
      }
      break;
      
    case 'idle':
    default:
      // 空闲：恢复正常
      targetColor = 0xff9eb5;
      if (placeholderLeftEyeWhite && placeholderRightEyeWhite) {
        placeholderLeftEyeWhite.scale.setScalar(1);
        placeholderRightEyeWhite.scale.setScalar(1);
      }
      if (placeholderPetGroup) {
        placeholderPetGroup.position.y = 0;
        placeholderPetGroup.rotation.x = 0;
      }
      break;
  }
  
  // 应用位置和旋转
  if (placeholderPetGroup) {
    placeholderPetGroup.scale.set(breathScale, breathScale, breathScale);
    placeholderPetGroup.rotation.z = rotationZ;
    // 只在非特殊状态时设置 rotation.y（celebrating 有特殊处理）
    if (currentPlaceholderAnimation !== 'celebrating') {
      placeholderPetGroup.rotation.y = rotationY;
    }
    // 跳动效果
    if (currentPlaceholderAnimation === 'celebrating') {
      placeholderPetGroup.position.y = bounceOffset;
    }
  }
  
  // 应用眼睛位置
  if (placeholderLeftPupil && placeholderRightPupil) {
    placeholderLeftPupil.position.x = -0.35 + eyeOffsetX;
    placeholderLeftPupil.position.y = 0.3 + eyeOffsetY;
    placeholderRightPupil.position.x = 0.35 + eyeOffsetX;
    placeholderRightPupil.position.y = 0.3 + eyeOffsetY;
  }
  
  // 平滑颜色过渡
  placeholderTargetColor = targetColor;
  if (placeholderCurrentColor !== placeholderTargetColor) {
    // 简单的颜色插值
    const currentR = (placeholderCurrentColor >> 16) & 0xff;
    const currentG = (placeholderCurrentColor >> 8) & 0xff;
    const currentB = placeholderCurrentColor & 0xff;
    const targetR = (placeholderTargetColor >> 16) & 0xff;
    const targetG = (placeholderTargetColor >> 8) & 0xff;
    const targetB = placeholderTargetColor & 0xff;
    
    const lerpFactor = 0.1;
    const newR = Math.round(currentR + (targetR - currentR) * lerpFactor);
    const newG = Math.round(currentG + (targetG - currentG) * lerpFactor);
    const newB = Math.round(currentB + (targetB - currentB) * lerpFactor);
    
    placeholderCurrentColor = (newR << 16) | (newG << 8) | newB;
    placeholderBodyMaterial.color.setHex(placeholderCurrentColor);
  }
}

// ============================================================
// 点击穿透检测函数
// ============================================================

/**
 * 检测鼠标是否在宠物3D模型上
 * 使用 Three.js Raycaster 进行射线检测
 * @param clientX 鼠标相对于视口的 X 坐标
 * @param clientY 鼠标相对于视口的 Y 坐标
 * @returns 鼠标是否在宠物上
 */
function checkMouseOnPet(clientX: number, clientY: number): boolean {
  // 真实 GLB 模型：使用 PetRenderer 射线检测
  if (!usePlaceholderPet && petRenderer?.isInitialized()) {
    return petRenderer.hitTest(clientX, clientY);
  }

  // 占位宠物
  if (usePlaceholderPet) {
    if (!placeholderCamera || !raycaster || !placeholderPetGroup || !THREE) {
      return false;
    }

    const rect = petContainer.getBoundingClientRect();
    const width = rect.width || PET_WINDOW_WIDTH;
    const height = rect.height || PET_WINDOW_HEIGHT;
    if (width <= 0 || height <= 0) {
      return false;
    }

    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / width) * 2 - 1,
      -((clientY - rect.top) / height) * 2 + 1
    );

    raycaster.setFromCamera(mouse, placeholderCamera);
    const intersects = raycaster.intersectObjects(placeholderPetGroup.children, true);
    return intersects.length > 0;
  }

  return false;
}

/**
 * 模型加载后启用宠物区域交互（关闭全窗口穿透）
 */
async function enablePetInteraction(): Promise<void> {
  const api = getElectronAPI();
  if (!api?.window?.setClickThrough) {
    return;
  }
  isClickThroughEnabled = false;
  try {
    await api.window.setClickThrough(false);
    console.log('[Renderer] Pet interaction enabled (click-through off)');
  } catch (error) {
    console.error('[Renderer] Failed to enable pet interaction:', error);
  }
}

/**
 * 更新点击穿透状态
 * 根据鼠标是否在宠物上动态切换穿透状态
 * @param clientX 鼠标相对于视口的 X 坐标
 * @param clientY 鼠标相对于视口的 Y 坐标
 */
async function updateClickThrough(clientX: number, clientY: number): Promise<void> {
  if (showWindowFrameEnabled || contextMenuOpen || petContextMenu?.isOpen) {
    return;
  }
  const api = getElectronAPI();
  if (!api?.window?.setClickThrough) return;
  
  // 节流控制：避免频繁调用 IPC
  const now = Date.now();
  if (now - lastClickThroughUpdateTime < CLICK_THROUGH_THROTTLE_MS) {
    return;
  }
  lastClickThroughUpdateTime = now;
  
  // 检测鼠标是否在宠物上
  const isOnPet = checkMouseOnPet(clientX, clientY);
  
  // 如果状态没有变化，不需要更新
  const shouldEnableClickThrough = !isOnPet;
  if (shouldEnableClickThrough === isClickThroughEnabled) {
    return;
  }
  
  // 更新穿透状态
  isClickThroughEnabled = shouldEnableClickThrough;
  
  try {
    if (isClickThroughEnabled) {
      // 鼠标不在宠物上，启用穿透（鼠标可以穿透到窗口后面）
      await api.window.setClickThrough(true, { forward: true });
    } else {
      // 鼠标在宠物上，禁用穿透（可以与宠物交互）
      await api.window.setClickThrough(false);
    }
  } catch (error) {
    console.error('[Renderer] Failed to update click-through state:', error);
  }
}

/**
 * 设置占位宠物的动画状态
 * @param animation 目标动画状态
 */
function setPlaceholderAnimation(animation: AnimationState): void {
  console.log(`[Renderer] Setting placeholder animation: ${currentPlaceholderAnimation} -> ${animation}`);
  
  // 重置一些状态
  if (placeholderLeftEyeWhite && placeholderRightEyeWhite) {
    placeholderLeftEyeWhite.scale.setScalar(1);
    placeholderRightEyeWhite.scale.setScalar(1);
  }
  if (placeholderPetGroup) {
    placeholderPetGroup.position.y = 0;
    placeholderPetGroup.rotation.x = 0;
  }
  
  currentPlaceholderAnimation = animation;
  placeholderTransitionProgress = 0;
}

/**
 * 启动渲染循环
 */
function startRenderLoop(): void {
  console.log('[Renderer] Starting render loop...');
  
  // 如果使用占位宠物，渲染循环已在 createPlaceholderPet 中启动
  if (usePlaceholderPet) {
    console.log('[Renderer] Render loop started (placeholder mode - animation already running)');
    return;
  }
  
  // 使用 PetRenderer 的渲染循环
  if (petRenderer && petRenderer.isInitialized()) {
    petRenderer.resume();
    console.log('[Renderer] Render loop started via PetRenderer');
  } else {
    console.warn('[Renderer] No renderer available for render loop');
  }
}

// ============================================================
// IPC 通信
// ============================================================

/**
 * 获取预加载脚本暴露的 API
 * @returns ElectronAPI 或 undefined (浏览器环境)
 */
function getElectronAPI(): ElectronAPI | undefined {
  return window.electronAPI;
}

/**
 * 当前宠物状态 (本地缓存)
 */
let currentPetState: PetState | null = null;

/**
 * 状态变化监听器清理函数
 */
let stateChangedUnsubscribe: (() => void) | null = null;
let settingsChangedUnsubscribe: (() => void) | null = null;

/**
 * 初始化 IPC 监听器
 */
function initIPCListeners(): void {
  const api = getElectronAPI();
  
  if (!api) {
    console.warn('[Renderer] electronAPI not available (running in browser mode)');
    return;
  }
  
  console.log('[Renderer] Initializing IPC listeners...');
  
  // 监听宠物状态变化
  if (api.pet?.onStateChanged) {
    stateChangedUnsubscribe = api.pet.onStateChanged((state: PetState) => {
      console.log('[Renderer] Pet state changed:', state.animation);
      currentPetState = state;
      handlePetStateChange(state);
    });
  }
  
  // 监听设置变化
  if (api.settings?.onChanged) {
    settingsChangedUnsubscribe = api.settings.onChanged((key: string, value: unknown) => {
      console.log('[Renderer] Settings changed:', key, value);
      handleSettingsChange(key, value);
    });
  }

  if (api.pet?.onDesktopConfigChanged) {
    api.pet.onDesktopConfigChanged((config) => {
      void applyDesktopConfig(config, { persist: true });
    });
  }

  if (api.pet?.onDesktopConfigPreview) {
    api.pet.onDesktopConfigPreview((config) => {
      void applyDesktopConfig(config as PetDesktopConfig, { persist: false });
    });
  }
  
  console.log('[Renderer] IPC listeners initialized');
}

/**
 * 清理 IPC 监听器
 */
function cleanupIPCListeners(): void {
  if (stateChangedUnsubscribe) {
    stateChangedUnsubscribe();
    stateChangedUnsubscribe = null;
  }
  if (settingsChangedUnsubscribe) {
    settingsChangedUnsubscribe();
    settingsChangedUnsubscribe = null;
  }
  console.log('[Renderer] IPC listeners cleaned up');
}

/**
 * 处理宠物状态变化
 */
function handlePetStateChange(state: PetState): void {
  console.log('[Renderer] Handling pet state change:', state.animation);

  // 若渲染器已在播放该动画，跳过（避免互动时重复 crossFade 导致定格）
  if (
    petRenderer?.isInitialized() &&
    petRenderer.getCurrentAnimation() === state.animation
  ) {
    return;
  }

  // 如果使用占位宠物，调用占位宠物的动画切换
  if (usePlaceholderPet) {
    console.log('[Renderer] Using placeholder pet, setting placeholder animation');
    setPlaceholderAnimation(state.animation);
    return;
  }
  
  // 如果渲染器可用，切换动画
  if (petRenderer && petRenderer.isInitialized()) {
    try {
      const anim = state.animation as PetAnimationState;
      petRenderer.setAnimation(anim, {
        transitionDuration: 0.25,
      });
    } catch (error) {
      console.warn('[Renderer] Failed to set animation:', error);
    }
  }
}

/**
 * 处理设置变化
 */
function handleSettingsChange(key: string, value: unknown): void {
  // 处理影响渲染的设置变化
  switch (key) {
    case 'window.opacity':
      // 更新窗口透明度
      console.log('[Renderer] Window opacity changed:', value);
      break;
    case 'pet.animationSpeed':
      // 更新动画速度
      console.log('[Renderer] Animation speed changed:', value);
      break;
    default:
      // 其他设置变化
      break;
  }
}

/**
 * 获取初始宠物状态
 */
async function loadInitialPetState(): Promise<void> {
  const api = getElectronAPI();
  
  if (!api?.pet?.getState) {
    console.warn('[Renderer] Pet API not available');
    return;
  }
  
  try {
    currentPetState = await api.pet.getState();
    console.log('[Renderer] Initial pet state loaded:', currentPetState?.animation);
  } catch (error) {
    console.error('[Renderer] Failed to load initial pet state:', error);
  }
}

// ============================================================
// 鼠标事件处理
// ============================================================

/**
 * 初始化鼠标事件监听器
 * 实现窗口拖拽、点击响应等交互功能
 */
function initMouseEvents(): void {
  const api = getElectronAPI();
  
  console.log('[Renderer] Initializing mouse events...');
  
  // 使用 document 监听事件，确保捕获所有鼠标操作
  const targetElement = document;
  
  // --------------------------------------------------------
  // 鼠标按下 - 开始拖拽准备
  // --------------------------------------------------------
  targetElement.addEventListener('mousedown', async (event: MouseEvent) => {
    // 只响应左键
    if (event.button !== 0) return;

    if (!checkMouseOnPet(event.clientX, event.clientY)) {
      return;
    }

    // 确保可接收鼠标事件（穿透开启时 mousedown 可能无法触发）
    if (isClickThroughEnabled) {
      await enablePetInteraction();
    }

    console.log('[Renderer] Mouse down at:', event.screenX, event.screenY);

    isDragging = true;
    hasDragThresholdMet = false;
    dragStartMouseX = event.screenX;
    dragStartMouseY = event.screenY;
    lastMouseScreenX = event.screenX;
    lastMouseScreenY = event.screenY;
    lastFlyInputMouseX = event.screenX;
    lastFlyInputMouseY = event.screenY;

    if (
      petRenderer?.isInitialized() &&
      petRenderer.isWalkDragActive() &&
      !petRenderer.isDragFlyActive() &&
      walkCoastToRelease
    ) {
      cancelWalkCoastAndResumeDrag(event.screenX, event.screenY);
    } else if (!walkCoastToRelease) {
      // 上次松手滑行结束后须解锁，否则第二次拖动无法更新追鼠目标
      walkChaseTargetLocked = false;
    }

    // 获取当前窗口位置
    if (api?.window?.getPosition) {
      try {
        const position = await api.window.getPosition();
        dragStartWindowX = position.x;
        dragStartWindowY = position.y;
        console.log('[Renderer] Window position:', dragStartWindowX, dragStartWindowY);
      } catch (error) {
        console.error('[Renderer] Failed to get window position:', error);
        isDragging = false;
      }
    } else {
      console.warn('[Renderer] Window API not available for dragging');
      isDragging = false;
    }
  });
  
  // --------------------------------------------------------
  // 鼠标移动 - 拖拽窗口
  // --------------------------------------------------------
  targetElement.addEventListener('mousemove', async (event: MouseEvent) => {
    if (!isDragging) return;

    // 计算鼠标移动距离
    const deltaX = event.screenX - dragStartMouseX;
    const deltaY = event.screenY - dragStartMouseY;
    lastMouseScreenX = event.screenX;
    lastMouseScreenY = event.screenY;
    lastFlyMouseMoveMs = performance.now();
    
    // 检查是否超过拖拽阈值
    if (!hasDragThresholdMet) {
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (distance < DRAG_THRESHOLD) {
        return; // 未超过阈值，不视为拖拽
      }
      hasDragThresholdMet = true;
      if (petRenderer?.isInitialized()) {
        if (petRenderer.isWalkDragActive() && !petRenderer.isDragFlyActive()) {
          updateWalkDragFollowTargetFromMouse(event.screenX, event.screenY);
          cancelWalkCoastAndResumeDrag(event.screenX, event.screenY);
        } else {
          updateDragFollowTargetFromMouse(event.screenX, event.screenY);
          petRenderer.startDragAnimation();
        }
      } else {
        updateDragFollowTargetFromMouse(event.screenX, event.screenY);
      }
      return;
    }

    // 无飞行剪辑：平滑追鼠标 + walk/run/idle
    if (
      petRenderer?.isInitialized() &&
      petRenderer.isWalkDragActive() &&
      !petRenderer.isDragFlyActive()
    ) {
      if (walkCoastToRelease) {
        clearWalkCoastState();
      }
      updateWalkDragFollowTargetFromMouse(event.screenX, event.screenY);

      const incX = event.screenX - lastFlyInputMouseX;
      const incY = event.screenY - lastFlyInputMouseY;
      lastFlyInputMouseX = event.screenX;
      lastFlyInputMouseY = event.screenY;

      const moveDist = Math.hypot(incX, incY);
      const chaseComplete = isWalkChaseComplete();

      if (moveDist > FLY_MOUSE_MOVE_THRESHOLD) {
        lastFlyMouseMoveMs = performance.now();
        clearWalkMouseIdleTimer();
        if (!chaseComplete) {
          const dist = walkChaseDistance();
          const ease = Math.max(0.15, Math.min(1, dist / DRAG_FLY_EASE_RADIUS));
          const speed =
            flyMoveSpeedForDistance(dist) *
            Math.max(0.14, walkLoopChaseRampFactor()) *
            ease;
          updateWalkDragLocomotionFromChaseSpeed(speed);
        } else {
          petRenderer.setWalkDragLocomotion('walk');
        }
      } else if (chaseComplete) {
        scheduleWalkMouseIdle();
      }

      petRenderer.updateWalkDragLoopInput(
        incX,
        incY,
        event.screenX,
        event.screenY,
        walkFollowPosX,
        walkFollowPosY,
        window.innerWidth,
        window.innerHeight,
        chaseComplete
      );

      if (walkDragFollowRafId === null) {
        void beginWalkDragFollowFromWindow();
      }
      return;
    }

    // 起飞/落地阶段窗口保持不动；进入滑翔循环后才追鼠标
    if (petRenderer?.isInitialized() && !petRenderer.isFlyDragFollowingMouse()) {
      return;
    }

    updateDragFollowTargetFromMouse(event.screenX, event.screenY);

    if (petRenderer?.isInitialized() && petRenderer.isDragFlyActive()) {
      const incX = event.screenX - lastFlyInputMouseX;
      const incY = event.screenY - lastFlyInputMouseY;
      lastFlyInputMouseX = event.screenX;
      lastFlyInputMouseY = event.screenY;

      const moveDist = Math.hypot(incX, incY);
      const chaseComplete = isFlyChaseComplete();

      if (moveDist > FLY_MOUSE_MOVE_THRESHOLD) {
        lastFlyMouseMoveMs = performance.now();
        const isVerticalMove = Math.abs(incY) >= Math.abs(incX) * 1.15;
        if (isVerticalMove) {
          flyVerticalMoveFrames += 1;
          flyHorizontalMoveFrames = 0;
        } else {
          flyHorizontalMoveFrames += 1;
          flyVerticalMoveFrames = 0;
        }

        if (flyVerticalMoveFrames >= FLY_MODE_SWITCH_FRAMES) {
          clearFlyMouseIdleTimer();
          if (chaseComplete) {
            tryEnterFlyHoverMode();
          } else {
            petRenderer.setFlyLoopHoverMode(false);
          }
        } else if (flyHorizontalMoveFrames >= FLY_MODE_SWITCH_FRAMES) {
          petRenderer.setFlyLoopHoverMode(false);
          scheduleFlyMouseIdle();
        }
      } else if (chaseComplete) {
        scheduleFlyMouseIdle();
      } else {
        clearFlyMouseIdleTimer();
        petRenderer.setFlyLoopHoverMode(false);
      }

      petRenderer.updateDragFlyLoopInput(
        incX,
        incY,
        event.screenX,
        event.screenY,
        flyFollowPosX,
        flyFollowPosY,
        window.innerWidth,
        window.innerHeight,
        chaseComplete
      );

      if (dragFlyFollowRafId === null) {
        void beginDragFollowFromWindow();
      }
    }
  });
  
  // --------------------------------------------------------
  // 鼠标松开 - 结束拖拽
  // --------------------------------------------------------
  targetElement.addEventListener('mouseup', async (event: MouseEvent) => {
    // 只响应左键
    if (event.button !== 0) return;
    
    const wasDragging = isDragging && hasDragThresholdMet;
    isDragging = false;

    cancelScheduledWindowMove();
    clearFlyMouseIdleTimer();
    clearWalkMouseIdleTimer();

    if (
      wasDragging &&
      petRenderer?.isInitialized() &&
      petRenderer.isDragFlyActive()
    ) {
      if (petRenderer.isFlyDragFollowingMouse()) {
        beginFlyCoastToRelease(event.screenX, event.screenY);
      } else {
        stopFlyDragFollowLoop();
        clearFlyCoastState();
        petRenderer.endDragAnimation();
      }
    } else if (
      wasDragging &&
      petRenderer?.isInitialized() &&
      petRenderer.isWalkDragActive()
    ) {
      beginWalkCoastToRelease(event.screenX, event.screenY);
    } else {
      stopAllDragFollowLoops();
      clearFlyCoastState();
      clearWalkCoastState();
      walkLoopChaseStartMs = 0;
      if (wasDragging && petRenderer?.isInitialized()) {
        petRenderer.endDragAnimation();
      }
    }

    if (wasDragging) {
      // 窗口尺寸在 onDragFlyEnd（落地结束）后恢复

      // 保存最终位置
      if (api?.window?.getPosition && api?.pet?.savePosition) {
        try {
          const finalPosition = await api.window.getPosition();
          await api.pet.savePosition({
            x: finalPosition.x,
            y: finalPosition.y,
            monitor: finalPosition.monitor,
          });
          console.log('[Renderer] Position saved:', finalPosition);
        } catch (error) {
          console.error('[Renderer] Failed to save position:', error);
        }
      }
      
      // 拖动结束后，立即重新检测并更新点击穿透状态
      // 这确保了如果鼠标已经移出宠物区域，穿透状态能正确恢复
      await updateClickThrough(event.clientX, event.clientY);
    }
  });
  
  // --------------------------------------------------------
  // 单击事件 - 宠物互动
  // --------------------------------------------------------
  targetElement.addEventListener('click', (event: MouseEvent) => {
    // 如果刚完成拖拽，忽略此次点击
    if (hasDragThresholdMet) {
      hasDragThresholdMet = false;
      return;
    }
    
    if (!petRenderer?.isInitialized() || !petRenderer.hitTest(event.clientX, event.clientY)) {
      return;
    }

    console.log('[Renderer] Click on pet at:', event.clientX, event.clientY);
    petRenderer.playInteractionReaction();
  });
  
  // --------------------------------------------------------
  // 双击事件 - 特殊互动
  // --------------------------------------------------------
  targetElement.addEventListener('dblclick', (event: MouseEvent) => {
    console.log('[Renderer] Double click detected at:', event.clientX, event.clientY);
    
    if (petRenderer?.isInitialized() && petRenderer.hitTest(event.clientX, event.clientY)) {
      petRenderer.playInteractionReaction();
    }
  });
  
  // --------------------------------------------------------
  // 右键菜单（仅右键，在宠物上）
  // --------------------------------------------------------
  document.addEventListener('contextmenu', (event: MouseEvent) => {
    if (!checkMouseOnPet(event.clientX, event.clientY)) {
      return;
    }
    event.preventDefault();
    isDragging = false;
    hasDragThresholdMet = false;
    stopAllDragFollowLoops();
    clearFlyCoastState();
    clearWalkCoastState();
    clearFlyMouseIdleTimer();
    clearWalkMouseIdleTimer();
    cancelScheduledWindowMove();
    if (petRenderer?.isDragFlyActive() || petRenderer?.isWalkDragActive()) {
      petRenderer.endDragAnimation();
    }
    void showPetContextMenu(event.clientX, event.clientY);
  });

  // --------------------------------------------------------
  // 鼠标离开窗口 - 取消拖拽
  // --------------------------------------------------------

  document.addEventListener('mouseleave', () => {
    if (!isDragging) {
      return;
    }

    const wasActiveFly =
      hasDragThresholdMet && petRenderer?.isInitialized() && petRenderer.isDragFlyActive();
    const wasActiveWalk =
      hasDragThresholdMet &&
      petRenderer?.isInitialized() &&
      petRenderer.isWalkDragActive() &&
      !petRenderer.isDragFlyActive();

    isDragging = false;
    cancelScheduledWindowMove();
    clearFlyMouseIdleTimer();
    clearWalkMouseIdleTimer();

    if (wasActiveFly && lastMouseScreenX > 0) {
      beginFlyCoastToRelease(lastMouseScreenX, lastMouseScreenY);
    } else if (wasActiveWalk && lastMouseScreenX > 0) {
      beginWalkCoastToRelease(lastMouseScreenX, lastMouseScreenY);
    } else {
      stopAllDragFollowLoops();
      clearFlyCoastState();
      clearWalkCoastState();
      walkLoopChaseStartMs = 0;
      if (hasDragThresholdMet && petRenderer?.isInitialized()) {
        petRenderer.endDragAnimation();
      }
    }
    hasDragThresholdMet = false;
  });
  
  // --------------------------------------------------------
  // 全局鼠标移动 - 动态切换点击穿透状态
  // --------------------------------------------------------
  document.addEventListener('mousemove', (event: MouseEvent) => {
    lastPointerClientX = event.clientX;
    lastPointerClientY = event.clientY;

    // 拖拽时保持可交互
    if (isDragging) {
      if (isClickThroughEnabled) {
        void enablePetInteraction();
      }
      return;
    }

    updateClickThrough(event.clientX, event.clientY);
  });
  
  console.log('[Renderer] Mouse events initialized');
}

// ============================================================
// 应用初始化
// ============================================================

/**
 * 主初始化函数
 */
async function init(): Promise<void> {
  console.log('[Renderer] Desktop 3D Pet initializing...');
  
  try {
    showLoading();
    
    // 1. 初始化 Three.js 场景
    await initThreeJS();
    
    // 2. 初始化 IPC（须在加载模型前，确保设置窗预览能收到配置）
    initIPCListeners();

    // 3. 加载宠物模型
    await loadPetModel();
    
    // 4. 加载初始宠物状态
    await loadInitialPetState();
    
    // 5. 初始化宠物右键菜单
    initPetContextMenu();
    await loadWindowFrameSetting();

    // 6. 初始化鼠标事件
    initMouseEvents();
    
    // 7. 启动渲染循环（须在播放入场动画之前，mixer 依赖 render 更新）
    startRenderLoop();

    // 8. 播放入场 callout → 待机（与切换模型后逻辑一致）
    if (petRenderer && !usePlaceholderPet) {
      petRenderer.beginPresentationAfterModelLoad();
    }
    
    // 9. 隐藏加载状态
    hideLoading();
    
    console.log('[Renderer] Initialization complete');
    
  } catch (error) {
    console.error('[Renderer] Initialization failed:', error);
    showError(error instanceof Error ? error.message : '初始化失败');
  }
}

/**
 * 窗口卸载时清理资源
 */
window.addEventListener('beforeunload', () => {
  cleanupIPCListeners();
  
  // 清理渲染器
  if (petRenderer) {
    petRenderer.dispose();
    petRenderer = null;
  }
  
  console.log('[Renderer] Resources cleaned up');
});

// ============================================================
// 启动应用
// ============================================================

// 等待 DOM 加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 导出供测试使用
export { init, checkWebGLSupport, showLoading, hideLoading, showError };