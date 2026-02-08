/**
 * 渲染进程入口文件
 * 负责初始化 Three.js 渲染器和宠物显示
 */

// ============================================================
// 类型定义 (后续将移至 shared/types)
// ============================================================

interface PetState {
  id: string;
  name: string;
  position: { x: number; y: number };
  currentAnimation: string;
  mood: string;
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
// IPC 通信 (占位实现)
// ============================================================

/**
 * 获取预加载脚本暴露的 API
 * TODO: T020-T021 将实现完整的 IPC 通信
 */
function getElectronAPI(): unknown {
  // @ts-expect-error - electronAPI 由 preload 脚本注入
  return window.electronAPI;
}

/**
 * 初始化 IPC 监听器
 */
function initIPCListeners(): void {
  const api = getElectronAPI();
  
  if (!api) {
    console.warn('[Renderer] electronAPI not available (running in browser?)');
    return;
  }
  
  console.log('[Renderer] IPC listeners initialized');
  
  // TODO: 监听以下事件:
  // - pet:state-changed - 宠物状态变化
  // - reminder:triggered - 提醒触发
  // - settings:changed - 设置变化
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
    
    // 4. 启动渲染循环
    startRenderLoop();
    
    // 5. 隐藏加载状态
    hideLoading();
    
    console.log('[Renderer] Initialization complete');
    
  } catch (error) {
    console.error('[Renderer] Initialization failed:', error);
    showError(error instanceof Error ? error.message : '初始化失败');
  }
}

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