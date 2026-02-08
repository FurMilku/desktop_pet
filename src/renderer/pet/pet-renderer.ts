/**
 * Three.js 3D 宠物渲染器
 * 负责 3D 场景初始化、模型加载和渲染循环
 * 
 * Task: T031 [US1] 实现 Three.js 3D渲染器
 */

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ============================================================
// 类型定义
// ============================================================

/**
 * 动画状态类型
 */
export type AnimationState =
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

/**
 * 动画配置
 */
export interface AnimationConfig {
  /** 动画名称 */
  name: AnimationState;
  /** 动画剪辑 */
  clip?: THREE.AnimationClip;
  /** 是否循环 */
  loop: boolean;
  /** 循环次数 (仅当 loop=false 时有效) */
  loopCount?: number;
  /** 动画速度 */
  timeScale: number;
  /** 过渡时长 (秒) */
  transitionDuration: number;
  /** 动画结束后的下一个状态 (仅当 loop=false 时有效) */
  nextState?: AnimationState;
}

/**
 * 渲染器配置
 */
export interface PetRendererConfig {
  /** 渲染容器 DOM 元素 */
  container: HTMLElement;
  /** 初始宽度 */
  width?: number;
  /** 初始高度 */
  height?: number;
  /** 目标帧率 */
  targetFPS?: number;
  /** 是否启用抗锯齿 */
  antialias?: boolean;
  /** 像素比率 */
  pixelRatio?: number;
  /** 是否启用阴影 */
  enableShadows?: boolean;
}

/**
 * 模型加载选项
 */
export interface ModelLoadOptions {
  /** 模型文件路径 */
  modelPath: string;
  /** 动画文件路径映射 */
  animationPaths?: Record<AnimationState, string>;
  /** 模型缩放 */
  scale?: number;
  /** 模型位置偏移 */
  positionOffset?: { x: number; y: number; z: number };
}

/**
 * 动画切换选项
 */
export interface AnimationOptions {
  /** 过渡时长 (秒) */
  transitionDuration?: number;
  /** 是否循环 */
  loop?: boolean;
  /** 循环次数 */
  loopCount?: number;
  /** 动画结束后的下一个状态 */
  nextState?: AnimationState;
  /** 动画速度 */
  timeScale?: number;
}

/**
 * 渲染器事件
 */
export interface PetRendererEvents {
  /** 模型加载完成 */
  onModelLoaded?: (model: THREE.Group) => void;
  /** 动画切换 */
  onAnimationChanged?: (from: AnimationState | null, to: AnimationState) => void;
  /** 动画结束 (仅非循环动画) */
  onAnimationFinished?: (animation: AnimationState) => void;
  /** 渲染帧 */
  onFrame?: (deltaTime: number, fps: number) => void;
  /** 错误 */
  onError?: (error: Error) => void;
}

/**
 * 宠物渲染器接口
 */
export interface IPetRenderer {
  /** 初始化渲染器 */
  init(): Promise<void>;
  /** 加载宠物模型 */
  loadModel(options: ModelLoadOptions): Promise<void>;
  /** 设置动画状态 */
  setAnimation(state: AnimationState, options?: AnimationOptions): void;
  /** 获取当前动画状态 */
  getCurrentAnimation(): AnimationState | null;
  /** 暂停渲染 */
  pause(): void;
  /** 恢复渲染 */
  resume(): void;
  /** 调整大小 */
  resize(width: number, height: number): void;
  /** 销毁渲染器 */
  dispose(): void;
  /** 是否已初始化 */
  isInitialized(): boolean;
  /** 是否正在渲染 */
  isRendering(): boolean;
  /** 获取当前 FPS */
  getFPS(): number;
}

// ============================================================
// 默认动画配置
// ============================================================

const DEFAULT_ANIMATION_CONFIGS: Record<AnimationState, Omit<AnimationConfig, 'clip'>> = {
  idle: {
    name: 'idle',
    loop: true,
    timeScale: 1.0,
    transitionDuration: 0.3,
  },
  thinking: {
    name: 'thinking',
    loop: true,
    timeScale: 0.8,
    transitionDuration: 0.2,
  },
  happy: {
    name: 'happy',
    loop: false,
    loopCount: 3,
    timeScale: 1.2,
    transitionDuration: 0.2,
    nextState: 'idle',
  },
  sad: {
    name: 'sad',
    loop: true,
    timeScale: 0.6,
    transitionDuration: 0.4,
  },
  confused: {
    name: 'confused',
    loop: false,
    loopCount: 2,
    timeScale: 1.0,
    transitionDuration: 0.3,
    nextState: 'idle',
  },
  drag: {
    name: 'drag',
    loop: true,
    timeScale: 1.0,
    transitionDuration: 0.1, // 快速响应拖拽
  },
  listening: {
    name: 'listening',
    loop: true,
    timeScale: 0.9,
    transitionDuration: 0.2,
  },
  celebrating: {
    name: 'celebrating',
    loop: false,
    loopCount: 2,
    timeScale: 1.3,
    transitionDuration: 0.2,
    nextState: 'happy',
  },
  sleepy: {
    name: 'sleepy',
    loop: true,
    timeScale: 0.5,
    transitionDuration: 0.5,
  },
  curious: {
    name: 'curious',
    loop: false,
    loopCount: 1,
    timeScale: 1.1,
    transitionDuration: 0.25,
    nextState: 'idle',
  },
};

// ============================================================
// PetRenderer 实现
// ============================================================

/**
 * Three.js 3D 宠物渲染器
 */
export class PetRenderer implements IPetRenderer {
  // 配置
  private config: Required<PetRendererConfig>;
  private events: PetRendererEvents;

  // Three.js 核心对象
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private clock: THREE.Clock | null = null;

  // 模型和动画
  private model: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private animations: Map<AnimationState, THREE.AnimationClip> = new Map();
  private animationConfigs: Map<AnimationState, AnimationConfig> = new Map();
  private currentAction: THREE.AnimationAction | null = null;
  private currentAnimation: AnimationState | null = null;

  // 加载器
  private gltfLoader: GLTFLoader | null = null;

  // 状态
  private initialized = false;
  private rendering = false;
  private animationFrameId: number | null = null;

  // 性能监控
  private frameCount = 0;
  private lastFPSUpdate = 0;
  private currentFPS = 0;
  private targetFrameInterval: number;

  /**
   * 构造函数
   */
  constructor(config: PetRendererConfig, events: PetRendererEvents = {}) {
    this.config = {
      container: config.container,
      width: config.width ?? (config.container.clientWidth || 400),
      height: config.height ?? (config.container.clientHeight || 400),
      targetFPS: config.targetFPS ?? 30,
      antialias: config.antialias ?? true,
      pixelRatio: config.pixelRatio ?? Math.min(window.devicePixelRatio, 2),
      enableShadows: config.enableShadows ?? false,
    };
    this.events = events;
    this.targetFrameInterval = 1000 / this.config.targetFPS;

    // 初始化默认动画配置
    for (const [state, config] of Object.entries(DEFAULT_ANIMATION_CONFIGS)) {
      this.animationConfigs.set(state as AnimationState, config as AnimationConfig);
    }
  }

  /**
   * 初始化渲染器
   */
  async init(): Promise<void> {
    if (this.initialized) {
      console.warn('[PetRenderer] Already initialized');
      return;
    }

    console.log('[PetRenderer] Initializing...');

    try {
      // 检查 WebGL 支持
      if (!this.checkWebGLSupport()) {
        throw new Error('WebGL is not supported in this browser');
      }

      // 创建场景
      this.scene = new THREE.Scene();
      // 透明背景 - 不设置背景色

      // 创建相机 (透视相机)
      const aspect = this.config.width / this.config.height;
      this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
      this.camera.position.set(0, 1, 3);
      this.camera.lookAt(0, 0.5, 0);

      // 创建渲染器 (透明背景配置)
      this.renderer = new THREE.WebGLRenderer({
        alpha: true,           // 启用透明背景
        antialias: this.config.antialias,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      });
      this.renderer.setClearColor(0x000000, 0); // 完全透明
      this.renderer.setSize(this.config.width, this.config.height);
      this.renderer.setPixelRatio(this.config.pixelRatio);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;

      // 阴影设置
      if (this.config.enableShadows) {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }

      // 添加到容器
      this.config.container.appendChild(this.renderer.domElement);

      // 设置画布样式 (确保透明)
      this.renderer.domElement.style.background = 'transparent';

      // 添加灯光
      this.setupLights();

      // 创建时钟
      this.clock = new THREE.Clock();

      // 创建 GLTF 加载器
      this.gltfLoader = new GLTFLoader();

      this.initialized = true;
      console.log('[PetRenderer] Initialized successfully');

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[PetRenderer] Initialization failed:', err);
      this.events.onError?.(err);
      throw err;
    }
  }

  /**
   * 设置场景灯光
   */
  private setupLights(): void {
    if (!this.scene) return;

    // 环境光 - 提供基础照明
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // 主方向光 - 模拟太阳光
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(5, 10, 7);
    if (this.config.enableShadows) {
      mainLight.castShadow = true;
      mainLight.shadow.mapSize.width = 1024;
      mainLight.shadow.mapSize.height = 1024;
      mainLight.shadow.camera.near = 0.5;
      mainLight.shadow.camera.far = 50;
    }
    this.scene.add(mainLight);

    // 补光 - 减少阴影过暗
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-5, 5, -5);
    this.scene.add(fillLight);

    // 底部补光 - 防止底部过暗
    const bottomLight = new THREE.DirectionalLight(0xffffff, 0.2);
    bottomLight.position.set(0, -5, 0);
    this.scene.add(bottomLight);
  }

  /**
   * 检查 WebGL 支持
   */
  private checkWebGLSupport(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      return gl !== null;
    } catch {
      return false;
    }
  }

  /**
   * 加载宠物模型
   */
  async loadModel(options: ModelLoadOptions): Promise<void> {
    if (!this.initialized) {
      throw new Error('Renderer not initialized. Call init() first.');
    }

    if (!this.gltfLoader || !this.scene) {
      throw new Error('Renderer components not ready');
    }

    console.log('[PetRenderer] Loading model:', options.modelPath);

    try {
      // 清除现有模型
      if (this.model) {
        this.disposeModel();
      }

      // 加载主模型
      const gltf = await this.loadGLTF(options.modelPath);
      this.model = gltf.scene;

      // 应用缩放
      const scale = options.scale ?? 1;
      this.model.scale.set(scale, scale, scale);

      // 应用位置偏移
      if (options.positionOffset) {
        this.model.position.set(
          options.positionOffset.x,
          options.positionOffset.y,
          options.positionOffset.z
        );
      }

      // 启用阴影
      if (this.config.enableShadows) {
        this.model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
      }

      // 添加到场景
      this.scene.add(this.model);

      // 创建动画混合器
      this.mixer = new THREE.AnimationMixer(this.model);

      // 监听动画完成事件
      this.mixer.addEventListener('finished', this.handleAnimationFinished.bind(this));

      // 加载模型自带的动画
      if (gltf.animations.length > 0) {
        console.log('[PetRenderer] Found embedded animations:', gltf.animations.map(a => a.name));
        this.processAnimations(gltf.animations);
      }

      // 加载额外的动画文件
      if (options.animationPaths) {
        await this.loadExternalAnimations(options.animationPaths);
      }

      // 触发事件
      this.events.onModelLoaded?.(this.model);

      console.log('[PetRenderer] Model loaded successfully');

      // 默认播放 idle 动画
      if (this.animations.has('idle')) {
        this.setAnimation('idle');
      }

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[PetRenderer] Failed to load model:', err);
      this.events.onError?.(err);
      throw err;
    }
  }

  /**
   * 加载 GLTF/GLB 文件
   */
  private loadGLTF(path: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      if (!this.gltfLoader) {
        reject(new Error('GLTF loader not initialized'));
        return;
      }

      this.gltfLoader.load(
        path,
        (gltf) => resolve(gltf),
        (progress) => {
          const percent = (progress.loaded / progress.total) * 100;
          console.log(`[PetRenderer] Loading: ${percent.toFixed(1)}%`);
        },
        (error) => reject(error)
      );
    });
  }

  /**
   * 处理动画剪辑
   */
  private processAnimations(clips: THREE.AnimationClip[]): void {
    for (const clip of clips) {
      // 尝试匹配动画名称到状态
      const state = this.matchAnimationState(clip.name);
      if (state) {
        this.animations.set(state, clip);
        // 更新配置中的 clip
        const config = this.animationConfigs.get(state);
        if (config) {
          config.clip = clip;
        }
        console.log(`[PetRenderer] Mapped animation "${clip.name}" to state "${state}"`);
      } else {
        console.log(`[PetRenderer] Unknown animation: "${clip.name}"`);
      }
    }
  }

  /**
   * 匹配动画名称到状态
   */
  private matchAnimationState(name: string): AnimationState | null {
    const lowerName = name.toLowerCase();
    const states: AnimationState[] = [
      'idle', 'thinking', 'happy', 'sad', 'confused',
      'drag', 'listening', 'celebrating', 'sleepy', 'curious'
    ];

    for (const state of states) {
      if (lowerName.includes(state)) {
        return state;
      }
    }

    // 特殊映射
    if (lowerName.includes('stand') || lowerName.includes('default') || lowerName.includes('wait')) {
      return 'idle';
    }
    if (lowerName.includes('joy') || lowerName.includes('excited')) {
      return 'happy';
    }
    if (lowerName.includes('cry') || lowerName.includes('unhappy')) {
      return 'sad';
    }
    if (lowerName.includes('wonder') || lowerName.includes('question')) {
      return 'confused';
    }
    if (lowerName.includes('move') || lowerName.includes('grab')) {
      return 'drag';
    }
    if (lowerName.includes('hear') || lowerName.includes('attention')) {
      return 'listening';
    }
    if (lowerName.includes('win') || lowerName.includes('cheer')) {
      return 'celebrating';
    }
    if (lowerName.includes('tired') || lowerName.includes('yawn') || lowerName.includes('sleep')) {
      return 'sleepy';
    }
    if (lowerName.includes('look') || lowerName.includes('interest')) {
      return 'curious';
    }

    return null;
  }

  /**
   * 加载外部动画文件
   */
  private async loadExternalAnimations(animationPaths: Record<AnimationState, string>): Promise<void> {
    for (const [state, path] of Object.entries(animationPaths)) {
      try {
        const gltf = await this.loadGLTF(path);
        if (gltf.animations.length > 0) {
          const clip = gltf.animations[0];
          clip.name = state; // 确保名称正确
          this.animations.set(state as AnimationState, clip);

          // 更新配置中的 clip
          const config = this.animationConfigs.get(state as AnimationState);
          if (config) {
            config.clip = clip;
          }

          console.log(`[PetRenderer] Loaded external animation for "${state}"`);
        }
      } catch (error) {
        console.warn(`[PetRenderer] Failed to load animation for "${state}":`, error);
      }
    }
  }

  /**
   * 设置动画状态
   */
  setAnimation(state: AnimationState, options?: AnimationOptions): void {
    if (!this.mixer || !this.model) {
      console.warn('[PetRenderer] Cannot set animation: mixer or model not ready');
      return;
    }

    const clip = this.animations.get(state);
    if (!clip) {
      console.warn(`[PetRenderer] Animation not found: ${state}`);
      return;
    }

    const config = this.animationConfigs.get(state);
    if (!config) {
      console.warn(`[PetRenderer] Animation config not found: ${state}`);
      return;
    }

    // 合并选项
    const transitionDuration = options?.transitionDuration ?? config.transitionDuration;
    const loop = options?.loop ?? config.loop;
    const loopCount = options?.loopCount ?? config.loopCount;
    const timeScale = options?.timeScale ?? config.timeScale;
    const nextState = options?.nextState ?? config.nextState;

    // 记录上一个状态
    const previousAnimation = this.currentAnimation;

    // 创建新的动画动作
    const newAction = this.mixer.clipAction(clip);
    newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loopCount ?? 1);
    newAction.clampWhenFinished = !loop;
    newAction.timeScale = timeScale;

    // 存储下一个状态信息 (用于动画结束回调)
    (newAction as any).__nextState = nextState;

    // 平滑过渡
    if (this.currentAction) {
      newAction.reset();
      newAction.play();
      this.currentAction.crossFadeTo(newAction, transitionDuration, true);
    } else {
      newAction.reset();
      newAction.play();
    }

    this.currentAction = newAction;
    this.currentAnimation = state;

    // 触发事件
    this.events.onAnimationChanged?.(previousAnimation, state);

    console.log(`[PetRenderer] Animation changed: ${previousAnimation || 'none'} -> ${state}`);
  }

  /**
   * 处理动画完成事件
   */
  private handleAnimationFinished(event: THREE.Event): void {
    const action = event.action as THREE.AnimationAction;
    const nextState = (action as any).__nextState as AnimationState | undefined;

    // 触发动画完成事件
    if (this.currentAnimation) {
      this.events.onAnimationFinished?.(this.currentAnimation);
    }

    // 如果有下一个状态，自动切换
    if (nextState && this.animations.has(nextState)) {
      console.log(`[PetRenderer] Auto-transitioning to: ${nextState}`);
      this.setAnimation(nextState);
    }
  }

  /**
   * 获取当前动画状态
   */
  getCurrentAnimation(): AnimationState | null {
    return this.currentAnimation;
  }

  /**
   * 开始渲染循环
   */
  resume(): void {
    if (!this.initialized) {
      console.warn('[PetRenderer] Cannot start rendering: not initialized');
      return;
    }

    if (this.rendering) {
      console.warn('[PetRenderer] Already rendering');
      return;
    }

    this.rendering = true;
    this.clock?.start();
    this.lastFPSUpdate = performance.now();
    this.frameCount = 0;

    console.log('[PetRenderer] Rendering started');
    this.render();
  }

  /**
   * 暂停渲染
   */
  pause(): void {
    if (!this.rendering) {
      return;
    }

    this.rendering = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.clock?.stop();

    console.log('[PetRenderer] Rendering paused');
  }

  /**
   * 渲染循环
   */
  private render(): void {
    if (!this.rendering) {
      return;
    }

    this.animationFrameId = requestAnimationFrame(() => this.render());

    if (!this.renderer || !this.scene || !this.camera || !this.clock) {
      return;
    }

    const deltaTime = this.clock.getDelta();

    // 更新动画
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }

    // 渲染场景
    this.renderer.render(this.scene, this.camera);

    // 更新 FPS 计数
    this.updateFPS();

    // 触发帧事件
    this.events.onFrame?.(deltaTime, this.currentFPS);
  }

  /**
   * 更新 FPS 计数
   */
  private updateFPS(): void {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastFPSUpdate;

    if (elapsed >= 1000) {
      this.currentFPS = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFPSUpdate = now;
    }
  }

  /**
   * 获取当前 FPS
   */
  getFPS(): number {
    return this.currentFPS;
  }

  /**
   * 调整渲染器大小
   */
  resize(width: number, height: number): void {
    if (!this.renderer || !this.camera) {
      return;
    }

    this.config.width = width;
    this.config.height = height;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);

    console.log(`[PetRenderer] Resized to ${width}x${height}`);
  }

  /**
   * 是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 是否正在渲染
   */
  isRendering(): boolean {
    return this.rendering;
  }

  /**
   * 清理模型资源
   */
  private disposeModel(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.model!);
    }

    if (this.model && this.scene) {
      this.scene.remove(this.model);

      // 递归清理几何体和材质
      this.model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) {
            child.geometry.dispose();
          }
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(material => material.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    }

    this.model = null;
    this.mixer = null;
    this.animations.clear();
    this.currentAction = null;
    this.currentAnimation = null;
  }

  /**
   * 销毁渲染器
   */
  dispose(): void {
    console.log('[PetRenderer] Disposing...');

    // 停止渲染
    this.pause();

    // 清理模型
    this.disposeModel();

    // 清理场景中的灯光
    if (this.scene) {
      while (this.scene.children.length > 0) {
        const child = this.scene.children[0];
        this.scene.remove(child);
      }
    }

    // 清理渲染器
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      
      // 从 DOM 中移除
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }

    // 清理引用
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = null;
    this.gltfLoader = null;
    this.animationConfigs.clear();

    this.initialized = false;

    console.log('[PetRenderer] Disposed');
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建宠物渲染器实例
 */
export function createPetRenderer(
  config: PetRendererConfig,
  events?: PetRendererEvents
): IPetRenderer {
  return new PetRenderer(config, events);
}

// ============================================================
// 导出
// ============================================================

export default PetRenderer;