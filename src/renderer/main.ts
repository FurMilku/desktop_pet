/**
 * 渲染进程入口文件
 * 负责初始化 Three.js 渲染器和宠物显示
 */

import { createPetRenderer, IPetRenderer, AnimationState as PetAnimationState } from './pet/pet-renderer';

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
// Three.js 渲染器实例
// ============================================================

/** 全局渲染器实例 */
let petRenderer: IPetRenderer | null = null;

/** 是否使用占位宠物（模型加载失败时使用） */
let usePlaceholderPet = false;

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
  
  // 创建渲染器实例
  petRenderer = createPetRenderer(
    {
      container: petContainer,
      width: petContainer.clientWidth || 300,
      height: petContainer.clientHeight || 400,
      targetFPS: 30,
      antialias: true,
      enableShadows: false, // 透明窗口不需要阴影
    },
    {
      onModelLoaded: (model) => {
        console.log('[Renderer] Model loaded:', model);
      },
      onAnimationChanged: (from, to) => {
        console.log(`[Renderer] Animation changed: ${from || 'none'} -> ${to}`);
      },
      onAnimationFinished: (animation) => {
        console.log('[Renderer] Animation finished:', animation);
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
async function loadPetModel(): Promise<void> {
  console.log('[Renderer] Loading pet model...');
  
  if (!petRenderer) {
    throw new Error('渲染器未初始化');
  }
  
  // 预设使用占位宠物标志（因为 onError 回调可能在 catch 之前触发）
  // 如果模型加载成功，会重置此标志
  usePlaceholderPet = true;
  
  // 定义模型路径候选列表
  const modelPaths = [
    './assets/models/pet-default.glb',
    './assets/models/default-pet.glb',
    './assets/models/pet.glb',
  ];
  
  // 尝试加载模型，如果失败则创建占位对象
  let modelLoaded = false;
  
  for (const modelPath of modelPaths) {
    try {
      console.log(`[Renderer] Trying to load model: ${modelPath}`);
      await petRenderer.loadModel({
        modelPath,
        scale: 1.0,
        positionOffset: { x: 0, y: -0.5, z: 0 },
      });
      // 模型加载成功
      modelLoaded = true;
      usePlaceholderPet = false;
      console.log(`[Renderer] Pet model loaded successfully from: ${modelPath}`);
      break;
    } catch {
      // 此模型路径加载失败，继续尝试下一个
      console.log(`[Renderer] Model not found at: ${modelPath}`);
    }
  }
  
  // 如果所有模型都加载失败，创建占位宠物
  if (!modelLoaded) {
    console.log('[Renderer] No model files found, creating placeholder pet...');
    console.log('[Renderer] 提示：如需使用自定义3D模型，请将 .glb 文件放置到 assets/models/ 目录');
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
  
  // 动态导入 Three.js（因为 PetRenderer 内部使用）
  const THREE = await import('three');
  
  // 获取渲染器内部的场景（需要通过反射访问）
  // 由于 PetRenderer 封装了内部实现，我们需要直接在容器中创建一个简单的场景
  
  // 创建一个简单的 Three.js 场景
  const scene = new THREE.Scene();
  
  // 创建相机
  const camera = new THREE.PerspectiveCamera(
    45,
    (petContainer.clientWidth || 300) / (petContainer.clientHeight || 400),
    0.1,
    1000
  );
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  
  // 创建渲染器
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(petContainer.clientWidth || 300, petContainer.clientHeight || 400);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  
  // 清空容器并添加画布
  petContainer.innerHTML = '';
  petContainer.appendChild(renderer.domElement);
  renderer.domElement.style.background = 'transparent';
  
  // 创建可爱的占位宠物 - 一个带有眼睛的球体
  const petGroup = new THREE.Group();
  
  // 身体 - 粉色球体
  const bodyGeometry = new THREE.SphereGeometry(1, 32, 32);
  const bodyMaterial = new THREE.MeshPhongMaterial({
    color: 0xff9eb5, // 粉色
    shininess: 100,
    specular: 0xffffff,
  });
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
  petGroup.add(leftEyeWhite);
  
  // 右眼 - 白色球体
  const rightEyeWhite = new THREE.Mesh(eyeGeometry, eyeWhiteMaterial);
  rightEyeWhite.position.set(0.35, 0.3, 0.8);
  petGroup.add(rightEyeWhite);
  
  // 左瞳孔 - 黑色球体
  const pupilGeometry = new THREE.SphereGeometry(0.12, 16, 16);
  const pupilMaterial = new THREE.MeshPhongMaterial({
    color: 0x000000,
  });
  const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
  leftPupil.position.set(-0.35, 0.3, 0.95);
  petGroup.add(leftPupil);
  
  // 右瞳孔 - 黑色球体
  const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
  rightPupil.position.set(0.35, 0.3, 0.95);
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
  
  // 动画变量
  let time = 0;
  
  // 渲染循环
  function animate(): void {
    requestAnimationFrame(animate);
    
    time += 0.016;
    
    // 呼吸效果 - 轻微缩放
    const breathScale = 1 + Math.sin(time * 2) * 0.03;
    petGroup.scale.set(breathScale, breathScale, breathScale);
    
    // 轻微摇摆
    petGroup.rotation.z = Math.sin(time * 1.5) * 0.05;
    petGroup.rotation.y = Math.sin(time * 0.8) * 0.1;
    
    // 眼睛跟随效果（模拟看向某处）
    const eyeOffset = Math.sin(time * 0.5) * 0.05;
    leftPupil.position.x = -0.35 + eyeOffset;
    rightPupil.position.x = 0.35 + eyeOffset;
    
    renderer.render(scene, camera);
  }
  
  // 启动动画
  animate();
  
  console.log('[Renderer] Placeholder pet created successfully');
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
  
  // 如果渲染器可用，切换动画
  if (petRenderer && petRenderer.isInitialized()) {
    try {
      petRenderer.setAnimation(state.animation as PetAnimationState);
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