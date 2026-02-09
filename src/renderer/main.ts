/**
 * 渲染进程入口文件
 * 负责初始化 Three.js 渲染器和宠物显示
 */

import { createPetRenderer, IPetRenderer, AnimationState as PetAnimationState } from './pet/pet-renderer';
import { PET_WINDOW_WIDTH, PET_WINDOW_HEIGHT } from '../shared/config/pet-window';

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
  setClickThrough(enable: boolean, options?: { forward?: boolean }): Promise<void>;
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
const DRAG_THRESHOLD = 3;

/** 是否已超过拖拽阈值 */
let hasDragThresholdMet = false;

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
  // 如果使用占位宠物，使用占位宠物的场景和相机
  if (usePlaceholderPet) {
    if (!placeholderScene || !placeholderCamera || !raycaster || !placeholderPetGroup || !THREE) {
      return false;
    }
    
    // 获取实际容器尺寸
    // 注意：使用 window.innerWidth/innerHeight 而非 clientWidth，因为容器可能尚未正确获取尺寸
    const containerWidth = petContainer.clientWidth || window.innerWidth || PET_WINDOW_WIDTH;
    const containerHeight = petContainer.clientHeight || window.innerHeight || PET_WINDOW_HEIGHT;
    
    // 调试日志：验证容器尺寸
    // console.log(`[Renderer] Container size: ${containerWidth}x${containerHeight}, Mouse: (${clientX}, ${clientY})`);
    
    // 将鼠标坐标归一化到 [-1, 1] 范围
    const mouse = new THREE.Vector2(
      (clientX / containerWidth) * 2 - 1,
      -(clientY / containerHeight) * 2 + 1
    );
    
    // 设置射线
    raycaster.setFromCamera(mouse, placeholderCamera);
    
    // 检测与宠物组中所有网格的交集
    const intersects = raycaster.intersectObjects(placeholderPetGroup.children, true);
    
    return intersects.length > 0;
  }
  
  // TODO: 如果使用真实模型，使用 PetRenderer 的射线检测
  // 目前暂时返回 false（需要 PetRenderer 支持射线检测）
  return false;
}

/**
 * 更新点击穿透状态
 * 根据鼠标是否在宠物上动态切换穿透状态
 * @param clientX 鼠标相对于视口的 X 坐标
 * @param clientY 鼠标相对于视口的 Y 坐标
 */
async function updateClickThrough(clientX: number, clientY: number): Promise<void> {
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
  
  // 如果使用占位宠物，调用占位宠物的动画切换
  if (usePlaceholderPet) {
    console.log('[Renderer] Using placeholder pet, setting placeholder animation');
    setPlaceholderAnimation(state.animation);
    return;
  }
  
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
    
    console.log('[Renderer] Mouse down at:', event.screenX, event.screenY);
    
    isDragging = true;
    hasDragThresholdMet = false;
    dragStartMouseX = event.screenX;
    dragStartMouseY = event.screenY;
    
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
    
    // 检查是否超过拖拽阈值
    if (!hasDragThresholdMet) {
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (distance < DRAG_THRESHOLD) {
        return; // 未超过阈值，不视为拖拽
      }
      hasDragThresholdMet = true;
      console.log('[Renderer] Drag threshold met, starting drag...');
    }
    
    // 计算新窗口位置
    const newX = dragStartWindowX + deltaX;
    const newY = dragStartWindowY + deltaY;
    
    // 移动窗口
    if (api?.window?.move) {
      try {
        await api.window.move(newX, newY);
      } catch (error) {
        console.error('[Renderer] Failed to move window:', error);
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
    
    if (wasDragging) {
      console.log('[Renderer] Drag ended');
      
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
    
    console.log('[Renderer] Click detected at:', event.clientX, event.clientY);
    
    // 触发开心动画
    if (api?.pet?.setAnimation) {
      api.pet.setAnimation('happy', {
        transitionDuration: 300,
        loop: false,
        nextState: 'idle',
      }).catch((error) => {
        console.error('[Renderer] Failed to set happy animation:', error);
      });
    }
  });
  
  // --------------------------------------------------------
  // 双击事件 - 特殊互动
  // --------------------------------------------------------
  targetElement.addEventListener('dblclick', (event: MouseEvent) => {
    console.log('[Renderer] Double click detected at:', event.clientX, event.clientY);
    
    // 触发庆祝动画
    if (api?.pet?.setAnimation) {
      api.pet.setAnimation('celebrating', {
        transitionDuration: 200,
        loop: false,
        nextState: 'idle',
      }).catch((error) => {
        console.error('[Renderer] Failed to set celebrating animation:', error);
      });
    }
  });
  
  // --------------------------------------------------------
  // 右键菜单 - 暂时阻止默认行为
  // --------------------------------------------------------
  targetElement.addEventListener('contextmenu', (event: MouseEvent) => {
    event.preventDefault();
    console.log('[Renderer] Right click detected at:', event.clientX, event.clientY);
    
    // 触发困惑动画
    if (api?.pet?.setAnimation) {
      api.pet.setAnimation('confused', {
        transitionDuration: 300,
        loop: false,
        nextState: 'idle',
      }).catch((error) => {
        console.error('[Renderer] Failed to set confused animation:', error);
      });
    }
  });
  
  // --------------------------------------------------------
  // 鼠标离开窗口 - 取消拖拽
  // --------------------------------------------------------
  document.addEventListener('mouseleave', () => {
    if (isDragging) {
      console.log('[Renderer] Mouse left window, canceling drag');
      isDragging = false;
      hasDragThresholdMet = false;
    }
  });
  
  // --------------------------------------------------------
  // 全局鼠标移动 - 动态切换点击穿透状态
  // --------------------------------------------------------
  document.addEventListener('mousemove', (event: MouseEvent) => {
    // 拖拽时不更新穿透状态（保持可交互）
    if (isDragging) return;
    
    // 更新点击穿透状态
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
    
    // 2. 加载宠物模型
    await loadPetModel();
    
    // 3. 初始化 IPC 通信
    initIPCListeners();
    
    // 4. 加载初始宠物状态
    await loadInitialPetState();
    
    // 5. 初始化鼠标事件
    initMouseEvents();
    
    // 6. 启动渲染循环
    startRenderLoop();
    
    // 7. 隐藏加载状态
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