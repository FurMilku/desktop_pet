/**
 * 渲染进程入口文件
 * 负责初始化 Three.js 渲染器和宠物显示
 */

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
  getPosition(): Promise<{ x: number; y: number; monitor: number }>;
  setAlwaysOnTop(alwaysOnTop: boolean): Promise<void>;
  minimize(): Promise<void>;
  getDisplays(): Promise<DisplayInfo[]>;
}

// Pet API
interface PetAPI {
  getState(): Promise<PetState>;
  setAnimation(animation: AnimationState, options?: AnimationOptions): Promise<void>;
  savePosition(position: PetPosition): Promise<void>;
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
// 工具函数
// ============================================================

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
// Three.js 初始化 (占位实现)
// ============================================================

/**
 * 初始化 Three.js 场景
 * TODO: T031-T033 将实现完整的渲染器
 */
async function initThreeJS(): Promise<void> {
  console.log('[Renderer] Initializing Three.js scene...');
  
  // 检查 WebGL 支持
  if (!checkWebGLSupport()) {
    throw new Error('您的浏览器不支持 WebGL，无法显示 3D 宠物');
  }
  
  // TODO: Phase 3 (US1) 将实现以下功能:
  // - T031: 实现 IPetRenderer 接口
  // - T032: 实现 GLTF 模型加载器
  // - T033: 配置透明背景场景
  // - T034-T036: 实现动画系统
  // - T037-T038: 实现宠物状态管理
  
  console.log('[Renderer] Three.js placeholder initialized');
}

/**
 * 加载宠物模型
 * TODO: T032 将实现完整的模型加载
 */
async function loadPetModel(): Promise<void> {
  console.log('[Renderer] Loading pet model...');
  
  // TODO: 实际实现将:
  // 1. 通过 IPC 获取用户选择的皮肤
  // 2. 加载对应的 GLTF/GLB 模型
  // 3. 设置默认动画
  
  // 模拟加载延迟
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log('[Renderer] Pet model placeholder loaded');
}

/**
 * 启动渲染循环
 * TODO: T041 将实现完整的渲染集成
 */
function startRenderLoop(): void {
  console.log('[Renderer] Starting render loop...');
  
  // TODO: 实际实现将:
  // 1. 使用 requestAnimationFrame 循环
  // 2. 更新动画混合器
  // 3. 渲染场景
  // 4. 空闲时降低帧率以节省资源 (T145)
  
  console.log('[Renderer] Render loop placeholder started');
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
 * TODO: T031-T032 将实现完整的动画切换
 */
function handlePetStateChange(state: PetState): void {
  // 将在 T031-T032 中实现:
  // 1. 切换动画状态
  // 2. 更新表情/情绪显示
  // 3. 触发过渡动画
  console.log('[Renderer] Handling pet state change:', state.animation);
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
    
    // 2. 加载宠物模型
    await loadPetModel();
    
    // 3. 初始化 IPC 通信
    initIPCListeners();
    
    // 4. 加载初始宠物状态
    await loadInitialPetState();
    
    // 5. 启动渲染循环
    startRenderLoop();
    
    // 6. 隐藏加载状态
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