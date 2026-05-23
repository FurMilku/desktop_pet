/**
 * Three.js 3D 宠物渲染器
 * 负责 3D 场景初始化、模型加载和渲染循环
 * 
 * Task: T031 [US1] 实现 Three.js 3D渲染器
 */

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeMikkTSpaceTangents } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as MikkTSpaceModule from 'three/examples/jsm/libs/mikktspace.module.js';

/** three 自带的 mikktspace 无类型声明 */
const MikkTSpace = MikkTSpaceModule as {
  ready: Promise<unknown>;
  isReady: boolean;
  generateTangents: (
    position: Float32Array,
    normal: Float32Array,
    texcoord: Float32Array
  ) => Float32Array;
};
import { computeAutoFitScaleMultiplier } from '../../shared/config/model-autofit';
import { normalizeAnimationClipTiming, SOURCE_ANIMATION_FPS } from './clip-timing';
import { isCombatLikeClipName } from './combat-clip-filter';
import { fixMeshGameUvLayout } from './game-model-uv-fix';
import {
  buildCurvesClipMap,
  findClipByKeywords,
  findCurvesCompanion,
  isCalloutClipName,
  isCurvesClipName,
  isRootMotionTrack,
} from './animation-clip-match';
import {
  pickCalloutClip,
  pickIdleKeywordClip,
  pickWalkDragClips,
  type WalkDragClipSet,
} from './clip-keywords';
import {
  clampPlaybackSpeed,
  DEFAULT_PLAYBACK_SPEED,
  DEFAULT_SOURCE_ANIMATION_FPS,
} from '../../shared/config/pet-model-settings';
import { FlyDragClipSet, isFlyDragClipName, pickFlyDragClips } from './fly-drag-clips';
import {
  applyWalkDragOrientationSmoothing,
  updateWalkDragSteerInput,
  type WalkDragSteerConstants,
  type WalkDragSteerState,
} from './walk-drag-steer';
import {
  menuIdForClip,
  parseMenuAnimationId,
  type PetMenuAnimation,
} from './menu-animations';
import { resolveClickAnimationSteps } from './click-animation';
import type { ClickAnimationSettings } from '../../shared/config/pet-desktop-settings';
import { DEFAULT_CLICK_ANIMATION } from '../../shared/config/pet-desktop-settings';
import {
  PET_FLY_VIEWPORT_PADDING,
  PET_WINDOW_HEIGHT,
  PET_WINDOW_MAX_HEIGHT,
  PET_WINDOW_MAX_WIDTH,
  PET_WINDOW_MIN_HEIGHT,
  PET_WINDOW_MIN_WIDTH,
  PET_WINDOW_WIDTH,
} from '../../shared/config/pet-window';

/** 拖拽飞行阶段 */
export type DragFlyPhase = 'idle' | 'takeoff' | 'loop' | 'landing';

// ============================================================
// 类型定义
// ============================================================

/**
 * 动画状态类型
 */
export type { PetMenuAnimation } from './menu-animations';

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
  /** 自动缩放并居中到视野内（推荐导入外部模型时开启） */
  autoFit?: boolean;
  /** autoFit 时的目标最大尺寸（世界单位） */
  autoFitSize?: number;
  /** 用户缩放倍率（相对 autoFit 后基准；加载时应在取景前应用） */
  modelScaleFactor?: number;
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

/** glTF 材质定义（用于恢复 Alpha 与贴图重绑） */
interface GltfMaterialDef {
  alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND';
  alphaCutoff?: number;
  pbrMetallicRoughness?: {
    baseColorTexture?: { index: number };
    metallicRoughnessTexture?: { index: number };
    baseColorFactor?: number[];
    metallicFactor?: number;
    roughnessFactor?: number;
  };
  normalTexture?: { index: number; scale?: number };
  emissiveTexture?: { index: number };
  occlusionTexture?: { index: number };
}

type GltfParserJson = {
  textures?: Array<{ source?: number }>;
  materials?: GltfMaterialDef[];
};

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
  /** 飞行拖拽开始（起飞） */
  onDragFlyStart?: () => void;
  /** 飞行拖拽进入循环阶段（窗口可跟随鼠标） */
  onDragFlyLoopStart?: () => void;
  /** 飞行拖拽完全结束（落地播完） */
  onDragFlyEnd?: () => void;
  /** 请求调整 Electron 窗口尺寸以容纳当前姿态 */
  onViewportResizeRequest?: (size: { width: number; height: number }) => void;
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
  /** 检测屏幕坐标是否命中宠物模型（严格射线，用于点击/拖拽） */
  hitTest(clientX: number, clientY: number): boolean;
  /** 光标捕获用命中（射线 + 极小 padding，供主进程穿透切换） */
  hitTestPointerCapture(clientX: number, clientY: number): boolean;
  /** 模型在容器内的投影包围盒（窗口局部像素，供主进程光标命中） */
  getHitRegionRect(): { minX: number; maxX: number; minY: number; maxY: number } | null;
  /** 播放随机互动动画（播完后回到待机） */
  playInteractionReaction(): void;
  /** 右键菜单可播放的动画列表 */
  getMenuAnimations(): PetMenuAnimation[];
  /** 模型内全部动画剪辑名（供设置窗序列编辑，含 Start/Loop/End 等） */
  getAllAnimationClipNames(): string[];
  /** 播放右键菜单选中的动画 */
  playMenuAnimation(menuId: string): void;
  /** 点击互动动画配置（权重随机 / 序列） */
  setClickAnimationSettings(settings: ClickAnimationSettings): void;
  /** 模型缩放倍率（相对 autoFit 后基准） */
  setModelScaleFactor(factor: number): void;
  /** 模型整体亮度倍率 */
  setModelBrightness(factor: number): void;
  /** 动画源帧率（手游导出常用 30/60/120） */
  setSourceAnimationFps(fps: number, options?: { force?: boolean }): void;
  setPlaybackSpeed(speed: number, options?: { force?: boolean }): void;
  getPlaybackSpeed(): number;
  /** 开始拖拽动画（飞行或行走） */
  startDragAnimation(): void;
  /** 结束拖拽动画 */
  endDragAnimation(): void;
  /** 是否处于可跟随鼠标的拖拽阶段 */
  isDragFollowingMouse(): boolean;
  /** 是否正在飞行拖拽流程中 */
  isDragFlyActive(): boolean;
  /** 是否正在行走拖拽 */
  isWalkDragActive(): boolean;
  /** 行走拖拽是否有 run 剪辑 */
  hasWalkDragRunClip(): boolean;
  /** 行走拖拽：idle / walk / run（仅无飞行能力的模型） */
  setWalkDragLocomotion(mode: 'idle' | 'walk' | 'run'): void;
  /** 松手滑行未完成时再次拖动：恢复追鼠标 */
  resumeWalkDragChase(): void;
  /** 当前模型是否支持飞行拖拽 */
  hasFlyDragCapability(): boolean;
  /** 模型加载完成后启动 callout → idle（切换模型时调用） */
  beginPresentationAfterModelLoad(): void;
  /** 从原始剪辑重新解析动画（改帧率后） */
  rebuildModelAnimationsFromRaw(): void;
  getSourceAnimationFps(): number;
  /** 悬停阶段：滑翔/悬停切换 */
  setFlyLoopHoverMode(hover: boolean): void;
  /** 飞行循环：根据窗口移动更新俯仰/偏航 */
  updateDragFlyLoopInput(moveDx: number, moveDy: number, chaseComplete: boolean): void;
  /** 行走拖拽：转向输入（与飞行循环独立） */
  updateWalkDragLoopInput(moveDx: number, moveDy: number, chaseComplete: boolean): void;
  /** 飞行悬停且已对齐时，俯仰/偏航/侧倾回到中性 */
  resetFlyLoopOrientation(): void;
  /** 行走拖拽：朝向回到中性 */
  resetWalkDragOrientation(): void;
  isFlyDragFollowingMouse(): boolean;
  isWalkDragFollowingMouse(): boolean;
}

// ============================================================
// 默认动画配置
// ============================================================

const DEFAULT_ANIMATION_CONFIGS: Record<AnimationState, Omit<AnimationConfig, 'clip'>> = {
  idle: {
    name: 'idle',
    loop: true,
    timeScale: 1.0,
    transitionDuration: 0.45,
  },
  thinking: {
    name: 'thinking',
    loop: true,
    timeScale: 1.0,
    transitionDuration: 0.35,
  },
  happy: {
    name: 'happy',
    loop: false,
    loopCount: 1,
    timeScale: 1.0,
    transitionDuration: 0.35,
    nextState: 'idle',
  },
  sad: {
    name: 'sad',
    loop: true,
    timeScale: 1.0,
    transitionDuration: 0.5,
  },
  confused: {
    name: 'confused',
    loop: false,
    loopCount: 2,
    timeScale: 1.0,
    transitionDuration: 0.4,
    nextState: 'idle',
  },
  drag: {
    name: 'drag',
    loop: true,
    timeScale: 1.0,
    transitionDuration: 0.22,
  },
  listening: {
    name: 'listening',
    loop: true,
    timeScale: 1.0,
    transitionDuration: 0.35,
  },
  celebrating: {
    name: 'celebrating',
    loop: false,
    loopCount: 1,
    timeScale: 1.0,
    transitionDuration: 0.35,
    nextState: 'idle',
  },
  sleepy: {
    name: 'sleepy',
    loop: true,
    timeScale: 1.0,
    transitionDuration: 0.55,
  },
  curious: {
    name: 'curious',
    loop: false,
    loopCount: 1,
    timeScale: 1.0,
    transitionDuration: 0.38,
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
  /** 点击时随机播放的互动剪辑（已剥离位移/缩放） */
  private interactionClips: THREE.AnimationClip[] = [];
  /** 右键菜单可播放的模型剪辑（非战斗，显示 GLB 原名） */
  private playableMenuClips: THREE.AnimationClip[] = [];
  /** autoFit 后的模型均匀缩放基准 */
  private baseModelScale = 1;
  private modelScaleFactor = 1;
  private modelBrightnessFactor = 1;
  /** 桌宠：柔和环境 + 正面主光，避免游戏场景式强对比 */
  private static readonly LIGHT_BASE_INTENSITY = {
    ambient: 0.72,
    hemisphere: 0.58,
    main: 0.48,
    fill: 0.36,
    rim: 0.24,
    bottom: 0.1,
  } as const;
  private static readonly LIGHT_COLORS = {
    ambient: 0xffffff,
    hemisphereSky: 0xe8f2ff,
    hemisphereGround: 0xfff3e8,
    main: 0xfff6ee,
    fill: 0xd4e6ff,
    rim: 0xeaf2ff,
    bottom: 0xffead8,
  } as const;
  private static readonly DEFAULT_CLIP_CROSSFADE = 0.35;
  private static readonly IDLE_RETURN_CROSSFADE = 0.42;
  private static readonly LOOP_CLIP_CROSSFADE = 0.28;
  private static readonly MATERIAL_BASE_ENV_KEY = 'petBaseEnvMapIntensity';
  private static readonly MATERIAL_BASE_COLOR_KEY = 'petBaseColor';
  private static readonly _scratchBrightnessColor = new THREE.Color();
  private ambientLight: THREE.AmbientLight | null = null;
  private hemisphereLight: THREE.HemisphereLight | null = null;
  private mainLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private bottomLight: THREE.DirectionalLight | null = null;
  private clickAnimationSettings: ClickAnimationSettings = {
    ...DEFAULT_CLICK_ANIMATION,
  };
  /** 飞行拖拽三阶段剪辑 */
  private flyDragClips: FlyDragClipSet = {
    takeoff: null,
    gliding: null,
    hover: null,
    landing: null,
  };
  /** GLB 原始动画克隆（未做时间轴换算，供改帧率后重算） */
  private pristineModelClips: THREE.AnimationClip[] = [];
  /** 与 pristine 相同引用，用于关键词匹配 */
  private rawModelClips: THREE.AnimationClip[] = [];
  /** 主体动画 key → 已消毒的 Curves 表情剪辑 */
  private curvesClipMap = new Map<string, THREE.AnimationClip>();
  private curvesActions: THREE.AnimationAction[] = [];
  private sourceAnimationFps = DEFAULT_SOURCE_ANIMATION_FPS;
  private playbackSpeed = DEFAULT_PLAYBACK_SPEED;
  /** 无飞行剪辑时用于拖拽的行走循环 */
  private walkDragClips: WalkDragClipSet = { walk: null, run: null, idle: null };
  private walkDragLocomotion: 'idle' | 'walk' | 'run' = 'walk';
  private dragWalkActive = false;
  private startupPresentationDone = false;
  private dragFlyPhase: DragFlyPhase = 'idle';
  /** 循环阶段是否为悬停（鼠标静止），否则为滑翔 */
  private flyLoopIsHovering = false;
  /** 承载飞行朝向（俯仰/偏航/侧倾），避免与骨骼动画抢根节点旋转 */
  private orientationPivot: THREE.Group | null = null;
  /** 加载后的模型基础 Y 轴旋转（朝相机/屏幕外） */
  /** 模型自身朝向（GLB 绑定），保持在 model.rotation.y */
  private modelBaseRotationY = 0;
  /** 枢轴上的额外偏航（相对模型正面） */
  private flyYawOffsetTarget = 0;
  private flyYawOffsetSmoothed = 0;
  private dragPitchTarget = 0;
  private dragRollTarget = 0;
  private smoothedFlyPitch = 0;
  private smoothedFlyRoll = 0;
  /** 飞行期间锁定的相机距离（避免每帧改相机导致闪烁） */
  private flyCameraDistance = 0;
  /** 上次请求的自适应窗口尺寸（用于节流） */
  private lastViewportRequestMs = 0;
  private lastViewportRequestWidth = 0;
  private lastViewportRequestHeight = 0;
  private static readonly FLY_VIEWPORT_RESIZE_INTERVAL_MS = 200;
  private static readonly IDLE_VIEWPORT_RESIZE_INTERVAL_MS = 400;
  /** 屏幕投影包围盒命中 padding（像素），仅用于 pointer capture 极小兜底 */
  private static readonly HIT_TEST_SCREEN_PADDING = 4;
  /** autoFit / 相机取景：剔除相对中位尺寸过大的辅助网格 */
  private static readonly AUTOFIT_BBOX_OUTLIER_RATIO = 8;
  /** 点击穿透 / 命中区域：更紧的包围盒，避免空白区误触 */
  private static readonly HIT_BBOX_OUTLIER_RATIO = 4;
  private static readonly VIEWPORT_SIZE_EPS = 10;
  private static readonly FLY_YAW_LERP = 0.14;
  private static readonly FLY_TILT_LERP = 0.1;
  private static readonly FLY_RESET_LERP = 0.18;
  private static readonly FLY_YAW_FROM_DX = 0.034;
  private static readonly FLY_BANK_FROM_YAW = 2.8;
  private static readonly FLY_MOVE_STEER_FULL_SPEED = 12;
  private static readonly FLY_MOVE_STEER_IDLE_THRESHOLD = 1.25;
  private static readonly FLY_MAX_PITCH = 0.38;
  private static readonly FLY_MAX_ROLL = 0.5;
  private static readonly FLY_MAX_YAW = 0.72;
  /** 行走拖拽：俯仰/偏航幅度大于飞行 */
  private static readonly WALK_MAX_PITCH = 0.56;
  private static readonly WALK_MAX_ROLL = 0.62;
  private static readonly WALK_MAX_YAW = 1.05;
  private static readonly FLY_HORIZ_TURN_THRESHOLD = 1.2;
  private static readonly FLY_AIM_MOUSE_MIN_DIST = 28;
  /** 起飞至少播放此时长（毫秒，墙上时钟）再允许切入滑翔，避免高倍速下被循环动画立刻打断 */
  private static readonly FLY_TAKEOFF_MIN_VISIBLE_MS = 750;
  /** 起飞进度达到此比例且已过最短可见时长后可切入滑翔 */
  private static readonly FLY_TAKEOFF_HANDOFF_PROGRESS = 0.38;
  /** 起飞阶段最长等待（毫秒），避免长起飞剪辑拖住窗口跟随 */
  private static readonly FLY_TAKEOFF_MAX_WAIT_MS = 2400;
  private takeoffPhaseStartedMs = 0;
  private takeoffHandoffTimer: ReturnType<typeof setTimeout> | null = null;
  /** 循环阶段转向强度渐入时长（毫秒） */
  private static readonly FLY_LOOP_STEER_RAMP_MS = 620;
  /** 滑翔 → 落地 交叉淡入时长（秒） */
  private static readonly FLY_LOOP_TO_LANDING_CROSSFADE = 0.32;
  /** 落地 → 待机 交叉淡入时长（秒） */
  private static readonly FLY_LANDING_TO_IDLE_CROSSFADE = 0.48;
  /** 落地进度达到此比例时提前交叉淡入待机 */
  private static readonly FLY_LANDING_HANDOFF_RATIO = 0.68;
  /** 落地交叉淡入期间相机距离回收速度 */
  private static readonly FLY_CAMERA_RELEASE_LERP = 0.1;
  private flyLoopSteerStartMs = 0;
  private walkLoopSteerStartMs = 0;
  /** 行走拖拽转向状态（须保持同一引用；勿用展开拷贝传给 walk-drag-steer） */
  private readonly walkDragSteer: WalkDragSteerState = {
    walkLoopSteerStartMs: 0,
    flyYawOffsetTarget: 0,
    flyYawOffsetSmoothed: 0,
    dragPitchTarget: 0,
    dragRollTarget: 0,
    smoothedFlyPitch: 0,
    smoothedFlyRoll: 0,
  };
  private landingToIdleHandoffDone = false;
  private flyLandingIdleBlendStarted = false;
  /** 落地后朝向/相机渐回待机 */
  private postFlyBlendActive = false;
  /** 点击/单次剪辑提前或结束后正在淡入 idle，避免 finished 二次切 idle 触发 stopAllAction */
  private idleBlendInProgress = false;
  private idleReturnTimer: ReturnType<typeof setTimeout> | null = null;
  private animationConfigs: Map<AnimationState, AnimationConfig> = new Map();
  private currentAction: THREE.AnimationAction | null = null;
  private currentAnimation: AnimationState | null = null;

  // 加载器
  private gltfLoader: GLTFLoader | null = null;

  // 射线检测（点击穿透）
  private hitRaycaster = new THREE.Raycaster();

  // 加载时锁定的相机基准（自适应取景在此基础上拉远，避免动作出框）
  private frozenLookAt: THREE.Vector3 | null = null;
  private frozenCameraPosition: THREE.Vector3 | null = null;
  private cameraLocked = false;
  /** 绑定姿势下的最小相机距离（动画再大也只拉远、不比初始更近） */
  private baselineCameraDistance = 0;
  /** 绑定姿势下包围盒最大轴向尺寸（相机自适应只补偿动画超出部分，不抵消用户缩放） */
  private bindPoseBoundsMaxDim = 0;
  /** 平滑后的注视点 */
  private readonly adaptiveLookAt = new THREE.Vector3();
  /** 平滑后的相机距离 */
  private smoothedCameraDistance = 0;
  private static readonly CAMERA_ADAPT_LERP = 0.14;
  private static readonly LOOK_AT_ADAPT_LERP = 0.1;
  private static readonly CAMERA_DISTANCE_PADDING = 1.45;

  /** 适配后的模型世界位置（防止动画根运动拖动整体） */
  private readonly modelBasePosition = new THREE.Vector3();

  /** 锁定根骨骼的位移/缩放（手游动画常含 Root/Bip001 的世界运动） */
  private readonly bindPoseLocks = new Map<
    string,
    { position: THREE.Vector3; scale: THREE.Vector3 }
  >();

  // 默认相机参数（加载模型后恢复，避免 frameCamera 导致画面异常）
  private static readonly DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 1, 3);
  private static readonly DEFAULT_CAMERA_LOOK_AT = new THREE.Vector3(0, 0.5, 0);

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
      targetFPS: config.targetFPS ?? 60,
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
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.premultipliedAlpha = false;
      this.renderer.sortObjects = true;

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

      // 创建 GLTF 加载器（记录贴图加载失败）
      const loadingManager = new THREE.LoadingManager();
      loadingManager.onError = (url) => {
        console.error('[PetRenderer] Asset load error:', url);
      };
      this.gltfLoader = new GLTFLoader(loadingManager);

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

    const colors = PetRenderer.LIGHT_COLORS;
    const base = PetRenderer.LIGHT_BASE_INTENSITY;

    this.ambientLight = new THREE.AmbientLight(colors.ambient, base.ambient);
    this.scene.add(this.ambientLight);

    this.hemisphereLight = new THREE.HemisphereLight(
      colors.hemisphereSky,
      colors.hemisphereGround,
      base.hemisphere
    );
    this.hemisphereLight.position.set(0, 12, 0);
    this.scene.add(this.hemisphereLight);

    this.mainLight = new THREE.DirectionalLight(colors.main, base.main);
    this.mainLight.position.set(2, 9, 6);
    if (this.config.enableShadows) {
      this.mainLight.castShadow = true;
      this.mainLight.shadow.mapSize.width = 1024;
      this.mainLight.shadow.mapSize.height = 1024;
      this.mainLight.shadow.camera.near = 0.5;
      this.mainLight.shadow.camera.far = 50;
    }
    this.scene.add(this.mainLight);

    this.fillLight = new THREE.DirectionalLight(colors.fill, base.fill);
    this.fillLight.position.set(-4, 4, 5);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.DirectionalLight(colors.rim, base.rim);
    this.rimLight.position.set(0, 2, 9);
    this.scene.add(this.rimLight);

    this.bottomLight = new THREE.DirectionalLight(colors.bottom, base.bottom);
    this.bottomLight.position.set(0, -4, 2);
    this.scene.add(this.bottomLight);

    this.applyModelBrightness();
  }

  /**
   * 平滑切换动画动作（优先 crossFade，避免 stopAllAction 硬切）
   */
  private fadeToAction(
    newAction: THREE.AnimationAction,
    transitionDuration: number,
    options: { warp?: boolean; fadeOutAction?: THREE.AnimationAction | null } = {}
  ): void {
    if (!this.mixer) {
      return;
    }

    const warp =
      options.warp ??
      (newAction.loop === THREE.LoopRepeat && transitionDuration >= 0.2);

    const outgoing = options.fadeOutAction ?? this.currentAction;
    // LoopOnce 播完后 action 会 paused，但姿态仍停在末帧；须 crossFade 而非 stopAllAction 硬切
    const outgoingStillContributes =
      !!outgoing &&
      (outgoing.isRunning() || outgoing.getEffectiveWeight() > 0.001);

    const canCrossFade =
      transitionDuration > 0 &&
      outgoing &&
      outgoing !== newAction &&
      outgoingStillContributes;

    if (canCrossFade) {
      if (outgoing.paused) {
        outgoing.paused = false;
      }
      newAction.reset();
      newAction.setEffectiveWeight(1);
      newAction.play();
      outgoing.crossFadeTo(newAction, transitionDuration, warp);
    } else {
      this.mixer.stopAllAction();
      newAction.reset();
      newAction.setEffectiveWeight(1);
      newAction.play();
    }

    this.currentAction = newAction;
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
   * 注意：此方法在加载失败时只抛出异常，不调用 onError 回调
   * 调用者应该捕获异常并决定如何处理（例如使用 fallback）
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

      // 手游 GLB 双 UV 集：纠正漫反射所用 UV 通道（须在贴图采样前）
      this.fixGameModelUvChannels(this.model);

      // 从内嵌 PNG 直接解码贴图（绕过 Electron/CSP 下 blob: URL 加载失败）
      await this.rebindEmbeddedTextures(gltf, options.modelPath);

      // 手游 GLB 常有 normalMap 但无 TANGENT，会导致法线贴图光照错乱
      await this.ensureMeshTangents(this.model);

      // 修复游戏模型：贴图/顶点色/绑定姿势（须在缩放与动画之前）
      this.prepareGameModel(this.model);
      this.applyModelBrightness();

      // 应用缩放
      const scale = options.scale ?? 1;
      this.model.scale.set(scale, scale, scale);

      // 在绑定姿势下适配大小（避免动画拉伸后再缩放）
      if (options.autoFit) {
        this.fitModelToView(this.model, options.autoFitSize ?? 1.25);
      }

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

      // 朝向枢轴：飞行俯仰/偏航/侧倾只改枢轴，不直接拧模型根节点
      this.orientationPivot = new THREE.Group();
      this.scene.add(this.orientationPivot);
      this.orientationPivot.add(this.model);

      this.modelBasePosition.copy(this.model.position);
      this.modelBaseRotationY = this.model.rotation.y;
      this.baseModelScale = this.model.scale.x;
      this.modelScaleFactor = 1;
      if (
        options.modelScaleFactor !== undefined &&
        Number.isFinite(options.modelScaleFactor) &&
        options.modelScaleFactor > 0
      ) {
        this.modelScaleFactor = options.modelScaleFactor;
      }
      this.applyModelScaleFactor();

      // 相机须在 autoFit + 用户缩放倍率之后再取景，否则重载后画面里模型偏大
      if (options.autoFit) {
        this.frameCameraToModel(this.model, true);
        this.refitCameraToAnimatedBounds(true);
      } else {
        this.resetCamera();
      }

      this.resetFlyOrientationState();
      this.captureBindPoseLocks();
      this.rebuildBindPoseBoundsReference();

      // 创建动画混合器
      this.mixer = new THREE.AnimationMixer(this.model);
      this.mixer.timeScale = this.playbackSpeed;
      this.mixer.addEventListener('finished', this.handleAnimationFinished.bind(this));

      this.pristineModelClips = gltf.animations.map((c) => c.clone());
      this.rawModelClips = this.pristineModelClips;
      this.startupPresentationDone = false;
      this.dragWalkActive = false;

      if (gltf.animations.length > 0) {
        console.log(
          `[PetRenderer] Found ${gltf.animations.length} embedded animations:`,
          gltf.animations.map((a) => a.name).join(', ')
        );
        this.rebuildModelAnimationsFromRaw();
      } else {
        console.warn('[PetRenderer] Model has NO embedded animations — will stay in bind pose');
      }

      if (options.animationPaths) {
        await this.loadExternalAnimations(options.animationPaths);
      }

      this.events.onModelLoaded?.(this.model);
      console.log('[PetRenderer] Model loaded successfully');

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // 只记录日志和抛出异常，不调用 onError 回调
      // 这允许调用者决定如何处理错误（如使用 fallback 模型）
      console.log('[PetRenderer] Model load failed:', options.modelPath, '-', err.message);
      throw err;
    }
  }

  /**
   * 检查纹理是否已成功解码
   */
  private isTextureReady(map?: THREE.Texture | null): boolean {
    if (!map?.image) {
      return false;
    }
    const img = map.image as { width?: number; height?: number };
    return (img.width ?? 0) > 0 && (img.height ?? 0) > 0;
  }

  /**
   * 从 GLB 二进制块提取内嵌 PNG，用 createImageBitmap 加载（不依赖 blob: URL）
   */
  private async loadGlbEmbeddedImages(modelPath: string): Promise<THREE.Texture[]> {
    const arrayBuffer = await fetch(modelPath).then((r) => {
      if (!r.ok) {
        throw new Error(`Failed to fetch model: ${r.status}`);
      }
      return r.arrayBuffer();
    });

    const view = new DataView(arrayBuffer);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(
      new TextDecoder().decode(arrayBuffer.slice(20, 20 + jsonLength))
    ) as {
      images?: Array<{ bufferView?: number; mimeType?: string; byteOffset?: number; byteLength?: number }>;
      bufferViews?: Array<{ byteOffset: number; byteLength: number }>;
    };

    const binStart = 20 + jsonLength + 8;
    const images = json.images ?? [];
    const textures: THREE.Texture[] = [];

    for (let i = 0; i < images.length; i++) {
      const imgDef = images[i];
      if (imgDef.bufferView === undefined) {
        textures[i] = new THREE.Texture();
        continue;
      }

      const bv = json.bufferViews![imgDef.bufferView];
      const offset = binStart + bv.byteOffset + (imgDef.byteOffset ?? 0);
      const length = imgDef.byteLength ?? bv.byteLength;
      const bytes = arrayBuffer.slice(offset, offset + length);
      const blob = new Blob([bytes], { type: imgDef.mimeType ?? 'image/png' });

      const bitmap = await createImageBitmap(blob);
      const tex = new THREE.Texture(bitmap);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.format = THREE.RGBAFormat;
      tex.flipY = false;
      tex.premultiplyAlpha = false;
      tex.needsUpdate = true;
      textures[i] = tex;
    }

    return textures;
  }

  private textureFromGltfIndex(
    texIndex: number | undefined,
    json: GltfParserJson,
    imageTextures: THREE.Texture[],
    colorSpace: THREE.ColorSpace
  ): THREE.Texture | null {
    if (texIndex === undefined || !json.textures?.[texIndex]) {
      return null;
    }
    const imageIdx = json.textures[texIndex].source;
    if (imageIdx === undefined) {
      return null;
    }
    const tex = imageTextures[imageIdx];
    if (!tex || !this.isTextureReady(tex)) {
      return null;
    }
    tex.colorSpace = colorSpace;
    tex.flipY = false;
    if (colorSpace === THREE.SRGBColorSpace) {
      tex.format = THREE.RGBAFormat;
    }
    tex.needsUpdate = true;
    return tex;
  }

  private gltfMaterialIndexFor(
    associations: Map<object, { materials?: number }> | undefined,
    mat: THREE.Material,
    fallbackIndex: number
  ): number {
    const idx = associations?.get(mat)?.materials;
    return typeof idx === 'number' ? idx : fallbackIndex;
  }

  private applyGltfTexturesToMaterial(
    mat: THREE.MeshStandardMaterial,
    matDef: GltfMaterialDef,
    json: GltfParserJson,
    imageTextures: THREE.Texture[]
  ): void {
    const pbr = matDef.pbrMetallicRoughness;

    const baseTex = this.textureFromGltfIndex(
      pbr?.baseColorTexture?.index,
      json,
      imageTextures,
      THREE.SRGBColorSpace
    );
    if (baseTex) {
      mat.map = baseTex;
    }

    const mrTex = this.textureFromGltfIndex(
      pbr?.metallicRoughnessTexture?.index,
      json,
      imageTextures,
      THREE.LinearSRGBColorSpace
    );
    if (mrTex) {
      mat.metalnessMap = mrTex;
      mat.roughnessMap = mrTex;
    } else {
      mat.metalnessMap = null;
      mat.roughnessMap = null;
    }

    const normalTex = this.textureFromGltfIndex(
      matDef.normalTexture?.index,
      json,
      imageTextures,
      THREE.LinearSRGBColorSpace
    );
    if (normalTex) {
      mat.normalMap = normalTex;
      if (matDef.normalTexture?.scale !== undefined) {
        mat.normalScale.set(matDef.normalTexture.scale, matDef.normalTexture.scale);
      }
    }

    if (pbr?.metallicFactor !== undefined) {
      mat.metalness = pbr.metallicFactor;
    }
    if (pbr?.roughnessFactor !== undefined) {
      mat.roughness = pbr.roughnessFactor;
    }
    if (pbr?.baseColorFactor) {
      mat.color.fromArray(pbr.baseColorFactor);
    }

    this.applyGltfMaterialAlpha(mat, matDef);
  }

  /**
   * 从 GLB 内嵌数据重新绑定材质贴图
   */
  private async rebindEmbeddedTextures(gltf: GLTF, modelPath: string): Promise<void> {
    try {
      console.log('[PetRenderer] Binding embedded textures from GLB...');
      const imageTextures = await this.loadGlbEmbeddedImages(modelPath);
      const parser = gltf as GLTF & {
        parser?: {
          json?: GltfParserJson;
          associations?: Map<object, { materials?: number }>;
        };
      };
      const json = parser.parser?.json;
      if (!json?.materials) {
        console.warn('[PetRenderer] Cannot repair textures: glTF parser json unavailable');
        return;
      }

      let fallbackMaterialIndex = 0;
      gltf.scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) {
          return;
        }
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (!(mat instanceof THREE.MeshStandardMaterial)) {
            fallbackMaterialIndex++;
            continue;
          }

          const matIdx = this.gltfMaterialIndexFor(
            parser.parser?.associations,
            mat,
            fallbackMaterialIndex
          );
          const matDef = json.materials![matIdx];
          if (!matDef) {
            fallbackMaterialIndex++;
            continue;
          }

          this.applyGltfTexturesToMaterial(mat, matDef, json, imageTextures);
          fallbackMaterialIndex++;
        }
      });

      let ready = 0;
      let total = 0;
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) {
            if (mat instanceof THREE.MeshStandardMaterial) {
              total++;
              if (this.isTextureReady(mat.map)) {
                ready++;
              }
            }
          }
        }
      });
      console.log(`[PetRenderer] Embedded textures bound: ${ready}/${total} materials`);
    } catch (error) {
      console.error('[PetRenderer] Texture binding failed:', error);
    }
  }

  /**
   * 处理缺少 TANGENT 的网格。
   * 仅对静态 Mesh 生成切线；SkinnedMesh 上 toNonIndexed+copy 会破坏蒙皮导致模型消失。
   */
  private async ensureMeshTangents(model: THREE.Object3D): Promise<void> {
    let computed = 0;
    let strippedNormalMaps = 0;

    const stripNormalMaps = (materials: THREE.Material[]): void => {
      for (const mat of materials) {
        if (mat instanceof THREE.MeshStandardMaterial && mat.normalMap) {
          mat.normalMap = null;
          strippedNormalMaps++;
        }
      }
    };

    const rigidMeshes: THREE.Mesh[] = [];

    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      const geometry = child.geometry;
      if (geometry.hasAttribute('tangent')) {
        return;
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const usesNormalMap = materials.some(
        (m) => m instanceof THREE.MeshStandardMaterial && m.normalMap
      );
      if (!usesNormalMap) {
        return;
      }

      if (child instanceof THREE.SkinnedMesh) {
        stripNormalMaps(materials);
        return;
      }

      const canCompute =
        geometry.hasAttribute('position') &&
        geometry.hasAttribute('normal') &&
        geometry.hasAttribute('uv');

      if (canCompute) {
        rigidMeshes.push(child);
        return;
      }

      stripNormalMaps(materials);
    });

    if (rigidMeshes.length > 0) {
      await MikkTSpace.ready;
      if (MikkTSpace.isReady) {
        for (const mesh of rigidMeshes) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          try {
            computeMikkTSpaceTangents(mesh.geometry, MikkTSpace);
            computed++;
          } catch (error) {
            console.warn('[PetRenderer] Tangent generation failed:', error);
            stripNormalMaps(materials);
          }
        }
      } else {
        for (const mesh of rigidMeshes) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          stripNormalMaps(materials);
        }
      }
    }

    if (computed > 0 || strippedNormalMaps > 0) {
      console.log(
        `[PetRenderer] Tangents: computed ${computed} rigid, dropped normal maps ${strippedNormalMaps} (skinned or fallback)`
      );
    }
  }

  /**
   * 按 primitive 修正 UV（避免多材质网格整片替换），并对 UV>1 图集启用 Repeat。
   */
  private fixGameModelUvChannels(model: THREE.Object3D): void {
    let swapped = 0;
    let repeatMats = 0;
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      const result = fixMeshGameUvLayout(child.geometry);
      if (result.swappedSegmentCount > 0) {
        swapped += result.swappedSegmentCount;
      }
      if (result.repeatMaterialIndices.length > 0) {
        child.userData.petRepeatUvMaterialIndices = result.repeatMaterialIndices;
        repeatMats += result.repeatMaterialIndices.length;
      }
    });
    if (swapped > 0) {
      console.log(
        `[PetRenderer] UV: ${swapped} primitive(s) use TEXCOORD_1 as diffuse UV`
      );
    }
    if (repeatMats > 0) {
      console.log(
        `[PetRenderer] UV: RepeatWrapping enabled for ${repeatMats} material slot(s) (atlas UV)`
      );
    }
  }

  private applyRepeatTextureWrap(mat: THREE.MeshStandardMaterial): void {
    for (const tex of [
      mat.map,
      mat.normalMap,
      mat.metalnessMap,
      mat.roughnessMap,
      mat.emissiveMap,
    ]) {
      if (!tex) {
        continue;
      }
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
    }
  }

  /**
   * 预处理游戏导出的 GLB（贴图、顶点色、绑定姿势）
   */
  private prepareGameModel(model: THREE.Object3D): void {
    let textured = 0;
    let total = 0;

    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      child.frustumCulled = false;

      const geometry = child.geometry;
      // 移除顶点色遮罩（手游模型会导致黑白分块）
      for (const attr of ['COLOR_0', 'COLOR_1', 'COLOR_2', 'color']) {
        if (geometry.hasAttribute(attr)) {
          geometry.deleteAttribute(attr);
        }
      }

      if (child instanceof THREE.SkinnedMesh && child.skeleton) {
        child.skeleton.pose();
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const isSkinned = child instanceof THREE.SkinnedMesh;
      const repeatIndices = child.userData.petRepeatUvMaterialIndices as number[] | undefined;
      for (let matIndex = 0; matIndex < materials.length; matIndex++) {
        const mat = materials[matIndex]!;
        if (!(mat instanceof THREE.Material)) {
          continue;
        }
        total++;
        mat.vertexColors = false;

        if (mat instanceof THREE.MeshStandardMaterial) {
          if (mat.metalnessMap && !this.isTextureReady(mat.metalnessMap)) {
            mat.metalnessMap = null;
            mat.roughnessMap = null;
          }
          // 手游蒙皮角色：ORM 常与漫反射不在同一 UV 集，去掉以免色块错位
          if (isSkinned && mat.metalnessMap) {
            mat.metalnessMap = null;
            mat.roughnessMap = null;
            mat.metalness = 0;
            mat.roughness = Math.max(mat.roughness, 0.75);
          }
          if (repeatIndices?.includes(matIndex)) {
            this.applyRepeatTextureWrap(mat);
          }
          this.applyStandardMaterialFixes(mat);
          if (this.isTextureReady(mat.map)) {
            textured++;
          } else {
            console.warn(
              `[PetRenderer] Material "${mat.name}" has no loaded texture map`,
              mat.map ? '(map exists but image missing - check CSP blob:)' : '(map is null)'
            );
          }
        }
      }
    });

    console.log(`[PetRenderer] Textures loaded: ${textured}/${total} materials`);
    model.updateMatrixWorld(true);
  }

  /**
   * 按 glTF 规范恢复材质 Alpha（BLEND / MASK）
   */
  private applyGltfMaterialAlpha(
    mat: THREE.MeshStandardMaterial,
    matDef: GltfMaterialDef
  ): void {
    const mode = matDef.alphaMode ?? 'OPAQUE';

    if (mode === 'BLEND') {
      mat.transparent = true;
      mat.depthWrite = false;
      mat.alphaTest = 0;
      mat.side = THREE.DoubleSide;
    } else if (mode === 'MASK') {
      mat.transparent = false;
      mat.alphaTest = matDef.alphaCutoff ?? 0.5;
      mat.depthWrite = true;
      mat.side = THREE.DoubleSide;
    } else {
      mat.transparent = false;
      mat.alphaTest = 0;
      mat.depthWrite = true;
    }
  }

  /**
   * 修正游戏 PBR 材质在 Three.js 中的显示（不破坏 Alpha 设置）
   */
  private applyStandardMaterialFixes(mat: THREE.MeshStandardMaterial): void {
    const configureTexture = (tex: THREE.Texture | null | undefined, isNormal = false): void => {
      if (!tex) {
        return;
      }
      tex.colorSpace = isNormal ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
      tex.flipY = false;
      if (!isNormal) {
        tex.format = THREE.RGBAFormat;
      }
      tex.needsUpdate = true;
    };

    configureTexture(mat.map);
    configureTexture(mat.emissiveMap);
    configureTexture(mat.normalMap, true);

    if (mat.metalnessMap) {
      mat.metalnessMap.colorSpace = THREE.LinearSRGBColorSpace;
      mat.metalnessMap.flipY = false;
      mat.metalnessMap.needsUpdate = true;
    }
    if (mat.roughnessMap && mat.roughnessMap !== mat.metalnessMap) {
      mat.roughnessMap.colorSpace = THREE.LinearSRGBColorSpace;
      mat.roughnessMap.flipY = false;
      mat.roughnessMap.needsUpdate = true;
    }

    if (mat.normalMap) {
      mat.normalMapType = THREE.TangentSpaceNormalMap;
    }

    if (!mat.metalnessMap) {
      mat.metalness = Math.min(mat.metalness, 0.12);
      mat.roughness = Math.max(mat.roughness, 0.62);
    }
    mat.envMapIntensity = 0.22;
    mat.userData[PetRenderer.MATERIAL_BASE_ENV_KEY] = mat.envMapIntensity;

    if (!mat.map) {
      mat.color.setHex(0xcccccc);
    }

    mat.userData[PetRenderer.MATERIAL_BASE_COLOR_KEY] = mat.color.clone();
    mat.emissive.setHex(0x000000);
    mat.needsUpdate = true;
  }

  /**
   * 仅根据可见网格计算包围盒（忽略骨骼/locator 等辅助节点）
   * @param maxOutlierRatio 相对中位对角线的倍数上限，越大越宽松
   */
  private getMeshBoundingBox(
    model: THREE.Object3D,
    maxOutlierRatio = PetRenderer.AUTOFIT_BBOX_OUTLIER_RATIO
  ): THREE.Box3 {
    const box = new THREE.Box3();
    const meshBoxes: THREE.Box3[] = [];
    const meshDiagonals: number[] = [];

    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.visible || !child.geometry) {
        return;
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const hasVisibleMaterial = materials.some(
        (mat) => mat instanceof THREE.Material && mat.visible
      );
      if (!hasVisibleMaterial) {
        return;
      }

      child.geometry.computeBoundingBox();
      if (!child.geometry.boundingBox) {
        return;
      }

      const meshBox = child.geometry.boundingBox.clone();
      meshBox.applyMatrix4(child.matrixWorld);
      meshBoxes.push(meshBox);
      meshDiagonals.push(meshBox.getSize(new THREE.Vector3()).length());
    });

    if (meshBoxes.length === 0) {
      box.setFromObject(model);
      return box;
    }

    // 手游 GLB（如裘卡）偶有超大辅助网格，会压低 autoFit 导致切模型后视觉尺寸跳变
    const sorted = [...meshDiagonals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? sorted[0]!;
    const outlierLimit = Math.max(median * maxOutlierRatio, median + 1e-6);

    for (let i = 0; i < meshBoxes.length; i++) {
      if (meshDiagonals[i]! <= outlierLimit) {
        box.union(meshBoxes[i]!);
      }
    }

    if (box.isEmpty()) {
      box.copy(meshBoxes[0]!);
    }
    return box;
  }

  /**
   * 桌面宠物用剪辑：去掉根骨骼位移/缩放，保留子骨骼 position+rotation（全删 rotation 会导致穿模变形）
   */
  private sanitizeClipForDesktopPet(clip: THREE.AnimationClip): THREE.AnimationClip {
    if (isCurvesClipName(clip.name)) {
      return this.sanitizeCurvesClip(clip);
    }
    const tracks = clip.tracks.filter((track) => this.shouldKeepDesktopBodyTrack(track));
    if (tracks.length === 0) {
      console.warn(`[PetRenderer] Clip "${clip.name}" has no usable tracks after sanitize`);
      return this.normalizeClipTiming(clip);
    }
    if (tracks.length === clip.tracks.length) {
      return this.normalizeClipTiming(clip);
    }
    return this.normalizeClipTiming(new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }

  private shouldKeepDesktopBodyTrack(track: THREE.KeyframeTrack): boolean {
    const name = track.name;
    if (name.endsWith('.quaternion')) {
      if (isRootMotionTrack(name) && track.times.length <= 2) {
        return false;
      }
      return true;
    }
    if (name.endsWith('.position')) {
      return !isRootMotionTrack(name);
    }
    if (name.endsWith('.scale')) {
      return !isRootMotionTrack(name);
    }
    return false;
  }

  /** Curves 表情轨：保留 morph / 面部 quaternion，仍做帧率换算 */
  private sanitizeCurvesClip(clip: THREE.AnimationClip): THREE.AnimationClip {
    const tracks = clip.tracks.filter((track) => {
      const n = track.name.toLowerCase();
      if (n.includes('morphtargetinfluences') || n.endsWith('.weight')) {
        return true;
      }
      if (n.endsWith('.quaternion')) {
        return true;
      }
      if (n.endsWith('.position') && !isRootMotionTrack(n)) {
        return true;
      }
      return false;
    });
    if (tracks.length === 0) {
      return this.normalizeClipTiming(clip);
    }
    return this.normalizeClipTiming(new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }

  /** 修正帧号时间轴并写入 clip.duration（见 clip-timing.ts） */
  private normalizeClipTiming(clip: THREE.AnimationClip): THREE.AnimationClip {
    return normalizeAnimationClipTiming(clip, this.sourceAnimationFps);
  }

  /** 秒 → 源帧率帧数 */
  private secondsToSourceFrames(seconds: number): number {
    return seconds * this.sourceAnimationFps;
  }

  /** 源帧率帧数 → 秒 */
  private sourceFramesToSeconds(frames: number): number {
    return frames / this.sourceAnimationFps;
  }

  /**
   * 记录根节点绑定姿势，每帧在 mixer 更新后恢复
   */
  private captureBindPoseLocks(): void {
    this.bindPoseLocks.clear();
    if (!this.model) {
      return;
    }

    const lockNames = new Set<string>(['SKM_Win_LiAo3_001_Skin', 'Root', 'Bip001']);
    for (const clip of this.pristineModelClips) {
      for (const track of clip.tracks) {
        if (!track.name.endsWith('.position')) {
          continue;
        }
        const nodeName = track.name.replace(/\.position$/i, '').split(/[/\\]/).pop();
        if (nodeName && /root|bip|skm_|hips|pelvis/i.test(nodeName)) {
          lockNames.add(nodeName);
        }
      }
    }

    for (const name of lockNames) {
      const obj = this.model.getObjectByName(name);
      if (obj) {
        this.bindPoseLocks.set(name, {
          position: obj.position.clone(),
          scale: obj.scale.clone(),
        });
      }
    }
  }

  /**
   * 抵消动画对根骨骼位移/缩放的修改
   */
  private enforceBindPoseLocks(): void {
    if (!this.model) {
      return;
    }

    this.model.position.copy(this.modelBasePosition);

    for (const [name, pose] of this.bindPoseLocks) {
      const obj = this.model.getObjectByName(name);
      if (obj) {
        obj.position.copy(pose.position);
        obj.scale.copy(pose.scale);
      }
    }
  }

  /** 记录当前绑定姿势下的包围盒基准，供相机/命中仅补偿动画溢出 */
  private rebuildBindPoseBoundsReference(): void {
    if (!this.model) {
      this.bindPoseBoundsMaxDim = 0;
      return;
    }
    this.model.updateMatrixWorld(true);
    const size = this.getMeshBoundingBox(this.model).getSize(new THREE.Vector3());
    this.bindPoseBoundsMaxDim = Math.max(size.x, size.y, size.z);
  }

  private isRaycastableMesh(object: THREE.Object3D): boolean {
    if (!(object instanceof THREE.Mesh) || !object.visible || !object.geometry) {
      return false;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    return materials.some((mat) => mat instanceof THREE.Material && mat.visible);
  }

  /**
   * 选择适合桌面待机的动画（游戏模型通常含大量战斗动画）
   */
  private pickIdleAnimationClip(clips: THREE.AnimationClip[]): THREE.AnimationClip | null {
    if (clips.length === 0) {
      return null;
    }

    const pool = clips.filter(
      (c) => !isCombatLikeClipName(c.name) && !isCurvesClipName(c.name)
    );

    const keywordIdle = pickIdleKeywordClip(pool);
    if (keywordIdle) {
      return this.sanitizeClipForDesktopPet(keywordIdle);
    }

    const found = findClipByKeywords(pool, {
      matchKeywords: ['idle', 'relax'],
      priorityKeywords: [
        'worldidle',
        'rideidle',
        'commonsleepstand',
        'commonrelax',
        'idle',
      ],
      excludeKeywords: [
        'fly',
        'glide',
        'walk',
        'run',
        'attack',
        'fight',
        'skill',
        'callout',
      ],
    });

    if (!found) {
      console.warn(
        '[PetRenderer] No idle clip matched (strict); available:',
        pool.map((c) => c.name).join(', ')
      );
      return null;
    }
    return this.sanitizeClipForDesktopPet(found);
  }

  rebuildModelAnimationsFromRaw(): void {
    if (this.pristineModelClips.length === 0) {
      return;
    }

    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    this.stopCurvesActions();

    this.animations.clear();
    this.interactionClips = [];
    this.playableMenuClips = [];
    this.flyDragClips = { takeoff: null, gliding: null, hover: null, landing: null };
    this.walkDragClips = { walk: null, run: null, idle: null };
    this.walkDragLocomotion = 'walk';
    this.currentAction = null;
    this.currentAnimation = null;

    const sources = this.pristineModelClips.map((c) => c.clone());
    this.rawModelClips = sources;

    this.processAnimations(sources);
    this.registerWalkDragClip(sources);
    this.registerFlyDragClips(sources);
    this.registerCurvesClips(sources);

    console.log(
      `[PetRenderer] Interaction pool: ${this.interactionClips.length} clips`,
      this.interactionClips.map((c) => c.name).join(', ')
    );
    const { takeoff, gliding, hover, landing } = this.flyDragClips;
    console.log(
      '[PetRenderer] Fly drag clips:',
      `takeoff=${takeoff?.name ?? 'none'}`,
      `gliding=${gliding?.name ?? 'none'}`,
      `hover=${hover?.name ?? 'none'}`,
      `landing=${landing?.name ?? 'none'}`
    );

    const idleClip = this.pickIdleAnimationClip(sources);
    if (idleClip) {
      this.animations.set('idle', idleClip);
      const idleConfig = this.animationConfigs.get('idle');
      if (idleConfig) {
        idleConfig.clip = idleClip;
      }
      console.log(`[PetRenderer] Idle clip ready: "${idleClip.name}"`);
    } else {
      console.warn('[PetRenderer] No idle clip after rebuild');
    }
  }

  getSourceAnimationFps(): number {
    return this.sourceAnimationFps;
  }

  getPlaybackSpeed(): number {
    return this.playbackSpeed;
  }

  /** 单条 action 的相对倍率（全局倍率在 mixer.timeScale） */
  private getRelativeActionTimeScale(multiplier = 1): number {
    return multiplier;
  }

  /** 实际播放倍率 = mixer.timeScale × action.timeScale */
  private getEffectiveActionTimeScale(action: THREE.AnimationAction): number {
    const mixerScale = this.mixer?.timeScale ?? 1;
    const actionScale = action.timeScale > 0 ? action.timeScale : 1;
    return mixerScale * actionScale;
  }

  private applyMixerPlaybackSpeed(): void {
    if (this.mixer) {
      this.mixer.timeScale = this.playbackSpeed;
    }
  }

  /** 起飞动画略快于基础倍率，便于与滑翔衔接（相对倍率，叠加 mixer） */
  private getFlyTakeoffTimeScale(): number {
    return this.getRelativeActionTimeScale(1.28);
  }

  setPlaybackSpeed(speed: number, options?: { force?: boolean }): void {
    const clamped = clampPlaybackSpeed(speed);
    if (this.playbackSpeed === clamped && !options?.force) {
      return;
    }
    this.playbackSpeed = clamped;
    console.log(`[PetRenderer] Playback speed set to ${clamped}x`);
    this.applyMixerPlaybackSpeed();
  }

  private registerCurvesClips(clips: THREE.AnimationClip[]): void {
    this.curvesClipMap.clear();
    const rawMap = buildCurvesClipMap(clips);
    for (const [key, raw] of rawMap) {
      const sanitized = this.sanitizeCurvesClip(raw);
      this.curvesClipMap.set(key, sanitized);
    }
    if (this.curvesClipMap.size > 0) {
      console.log(
        `[PetRenderer] Curves bindings: ${this.curvesClipMap.size}`,
        [...this.curvesClipMap.keys()].join(', ')
      );
    }
  }

  private stopCurvesActions(): void {
    if (!this.mixer) {
      this.curvesActions = [];
      return;
    }
    for (const action of this.curvesActions) {
      action.stop();
      action.setEffectiveWeight(0);
    }
    this.curvesActions = [];
  }

  private syncCurvesToBodyAction(bodyAction: THREE.AnimationAction, baseClipName: string): void {
    this.stopCurvesActions();
    if (!this.mixer) {
      return;
    }
    const curvesClip = findCurvesCompanion(baseClipName, this.curvesClipMap);
    if (!curvesClip) {
      return;
    }
    const curvesAction = this.mixer.clipAction(curvesClip);
    curvesAction.enabled = true;
    curvesAction.setLoop(bodyAction.loop, bodyAction.repetitions);
    curvesAction.clampWhenFinished = bodyAction.clampWhenFinished;
    curvesAction.timeScale = bodyAction.timeScale;
    curvesAction.reset();
    curvesAction.setEffectiveWeight(1);
    curvesAction.play();
    this.curvesActions.push(curvesAction);
  }

  /**
   * 将模型缩放并居中到场景原点
   */
  private fitModelToView(model: THREE.Object3D, targetSize: number): void {
    model.updateMatrixWorld(true);

    const box = this.getMeshBoundingBox(model);
    const size = box.getSize(new THREE.Vector3());
    const autoFitScale = computeAutoFitScaleMultiplier(size, targetSize);
    if (autoFitScale !== 1) {
      model.scale.multiplyScalar(autoFitScale);
    }

    model.updateMatrixWorld(true);

    const fitted = this.getMeshBoundingBox(model);
    const center = fitted.getCenter(new THREE.Vector3());
    model.position.sub(center);
  }

  /**
   * 根据包围盒尺寸计算相机沿 +Z 的距离
   */
  private computeCameraDistanceForSize(size: THREE.Vector3): number {
    if (!this.camera) {
      return 3;
    }

    const fovRad = (this.camera.fov * Math.PI) / 180;
    const halfTanV = Math.tan(fovRad / 2);
    const halfTanH = halfTanV * this.camera.aspect;

    const distY = size.y / 2 / halfTanV;
    const distX = size.x / 2 / halfTanH;
    const distZ = size.z / 2 / halfTanH;
    return Math.max(distY, distX, distZ) * PetRenderer.CAMERA_DISTANCE_PADDING;
  }

  /**
   * 根据模型包围盒设置相机；freeze=true 时记录基准距离，之后每帧自适应拉远
   */
  private frameCameraToModel(model: THREE.Object3D, freeze = false): void {
    if (!this.camera || (this.cameraLocked && !freeze)) {
      return;
    }

    model.updateMatrixWorld(true);
    const box = this.getMeshBoundingBox(model);
    if (box.isEmpty()) {
      this.resetCamera();
      return;
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const distance = this.computeCameraDistanceForSize(size);

    this.camera.position.set(center.x, center.y, center.z + distance);
    this.camera.lookAt(center);
    this.camera.near = Math.max(0.01, distance / 500);
    this.camera.far = Math.max(200, distance * 30);
    this.camera.updateProjectionMatrix();

    if (freeze) {
      this.frozenLookAt = center.clone();
      this.frozenCameraPosition = this.camera.position.clone();
      this.adaptiveLookAt.copy(center);
      this.baselineCameraDistance = distance;
      this.smoothedCameraDistance = distance;
      this.cameraLocked = true;
      console.log('[PetRenderer] Camera baseline distance:', distance.toFixed(2));
    }
  }

  /**
   * 将世界包围盒八点投影到屏幕像素坐标
   */
  /** 用于投影/命中的根节点（含飞行朝向枢轴） */
  private getOrientedRoot(): THREE.Object3D | null {
    return this.orientationPivot ?? this.model;
  }

  private resetFlyOrientationState(): void {
    this.flyYawOffsetTarget = 0;
    this.flyYawOffsetSmoothed = 0;
    this.dragPitchTarget = 0;
    this.dragRollTarget = 0;
    this.smoothedFlyPitch = 0;
    this.smoothedFlyRoll = 0;
    if (this.orientationPivot) {
      this.orientationPivot.rotation.set(0, 0, 0);
    }
  }

  private getProjectedScreenRect(): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null {
    const root = this.getOrientedRoot();
    if (!this.camera || !root) {
      return null;
    }

    root.updateMatrixWorld(true);
    const box = this.getMeshBoundingBox(root, PetRenderer.HIT_BBOX_OUTLIER_RATIO);
    if (box.isEmpty()) {
      return null;
    }

    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];

    const projected = new THREE.Vector3();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const bounds = this.config.container.getBoundingClientRect();
    const w = bounds.width > 0 ? bounds.width : this.config.width;
    const h = bounds.height > 0 ? bounds.height : this.config.height;

    for (const corner of corners) {
      projected.copy(corner);
      projected.project(this.camera);

      if (projected.z > 1) {
        continue;
      }

      const sx = (projected.x * 0.5 + 0.5) * w;
      const sy = (-projected.y * 0.5 + 0.5) * h;
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }

    if (!Number.isFinite(minX)) {
      return null;
    }

    return { minX, maxX, minY, maxY };
  }

  /**
   * 屏幕坐标是否落在模型投影包围盒内（含 padding）
   */
  private isPointInProjectedScreenRect(
    clientX: number,
    clientY: number,
    padding = PetRenderer.HIT_TEST_SCREEN_PADDING
  ): boolean {
    const screenRect = this.getProjectedScreenRect();
    if (!screenRect) {
      return false;
    }

    const bounds = this.config.container.getBoundingClientRect();
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;

    return (
      localX >= screenRect.minX - padding &&
      localX <= screenRect.maxX + padding &&
      localY >= screenRect.minY - padding &&
      localY <= screenRect.maxY + padding
    );
  }

  /**
   * 根据投影包围盒计算建议窗口尺寸（重点保证宽度容纳展翼）
   */
  private computeDesiredViewportSize(): { width: number; height: number } | null {
    const rect = this.getProjectedScreenRect();
    if (!rect) {
      return null;
    }

    const spanW = rect.maxX - rect.minX;
    const spanH = rect.maxY - rect.minY;
    const padding = PET_FLY_VIEWPORT_PADDING;

    let width = Math.ceil(spanW + padding * 2);
    let height = Math.ceil(spanH + padding * 2);

    const baselineW = PET_WINDOW_WIDTH;
    const baselineH = PET_WINDOW_HEIGHT;
    const baselineAspect = baselineW / baselineH;

    width = Math.max(width, baselineW);
    height = Math.max(height, Math.round(width / baselineAspect));

    width = THREE.MathUtils.clamp(width, PET_WINDOW_MIN_WIDTH, PET_WINDOW_MAX_WIDTH);
    height = THREE.MathUtils.clamp(height, PET_WINDOW_MIN_HEIGHT, PET_WINDOW_MAX_HEIGHT);

    return { width, height };
  }

  private resetViewportResizeThrottle(): void {
    this.lastViewportRequestMs = 0;
    this.lastViewportRequestWidth = 0;
    this.lastViewportRequestHeight = 0;
  }

  /**
   * 根据当前动画姿态请求调整窗口（已关闭自动调整，改用手动「显示窗口边缘」）
   */
  private requestViewportResize(force = false): void {
    if (!PetRenderer.AUTO_VIEWPORT_RESIZE || !this.events.onViewportResizeRequest) {
      return;
    }

    const desired = this.computeDesiredViewportSize();
    if (!desired) {
      return;
    }

    const now = performance.now();
    const interval =
      this.dragFlyPhase === 'idle'
        ? PetRenderer.IDLE_VIEWPORT_RESIZE_INTERVAL_MS
        : PetRenderer.FLY_VIEWPORT_RESIZE_INTERVAL_MS;
    const dw = Math.abs(desired.width - this.lastViewportRequestWidth);
    const dh = Math.abs(desired.height - this.lastViewportRequestHeight);
    const changed =
      dw >= PetRenderer.VIEWPORT_SIZE_EPS || dh >= PetRenderer.VIEWPORT_SIZE_EPS;

    if (!force) {
      if (!changed) {
        return;
      }
      if (
        this.lastViewportRequestMs > 0 &&
        now - this.lastViewportRequestMs < interval
      ) {
        return;
      }
    }

    this.lastViewportRequestMs = now;
    this.lastViewportRequestWidth = desired.width;
    this.lastViewportRequestHeight = desired.height;
    this.events.onViewportResizeRequest(desired);
  }

  /**
   * 进入飞行时锁定相机距离，飞行期间不再每帧重算
   */
  private lockFlyCameraDistance(): void {
    const root = this.getOrientedRoot();
    if (!this.camera || !root || !this.frozenLookAt) {
      return;
    }

    root.updateMatrixWorld(true);
    const box = this.getMeshBoundingBox(root);
    const size = box.getSize(new THREE.Vector3());
    const needed = this.computeCameraDistanceForSize(size);
    this.flyCameraDistance = Math.max(this.baselineCameraDistance, needed * 1.06);
    this.smoothedCameraDistance = this.flyCameraDistance;
    this.adaptiveLookAt.copy(this.frozenLookAt);
    this.applyFlyCameraLock();
  }

  private applyFlyCameraLock(): void {
    if (!this.camera || !this.frozenLookAt || this.flyCameraDistance <= 0) {
      return;
    }

    this.camera.position.set(
      this.adaptiveLookAt.x,
      this.adaptiveLookAt.y,
      this.adaptiveLookAt.z + this.flyCameraDistance
    );
    this.camera.lookAt(this.adaptiveLookAt);
    this.camera.near = Math.max(0.01, this.flyCameraDistance / 500);
    this.camera.far = Math.max(200, this.flyCameraDistance * 30);
    this.camera.updateProjectionMatrix();
  }

  /** 落地→待机时把飞行相机距离渐回待机距离，避免模型突然变大 */
  private lerpFlyCameraTowardIdle(): void {
    const root = this.getOrientedRoot();
    if (!root || this.flyCameraDistance <= 0) {
      return;
    }

    root.updateMatrixWorld(true);
    const box = this.getMeshBoundingBox(root);
    const size = box.getSize(new THREE.Vector3());
    const needed = this.computeCameraDistanceForSize(size);
    const target = Math.max(this.baselineCameraDistance, needed);
    this.flyCameraDistance = THREE.MathUtils.lerp(
      this.flyCameraDistance,
      target,
      PetRenderer.FLY_CAMERA_RELEASE_LERP
    );
  }

  /**
   * 飞行朝向：起飞/落地朝前；悬停时水平转向 + 上下俯仰 + 转向侧倾
   */
  private applyFlyOrientation(_deltaTime: number): void {
    if (!this.orientationPivot) {
      return;
    }
    if (this.dragFlyPhase === 'idle' && !this.postFlyBlendActive) {
      return;
    }

    if (
      this.dragFlyPhase === 'takeoff' ||
      this.dragFlyPhase === 'landing' ||
      this.postFlyBlendActive
    ) {
      this.flyYawOffsetTarget = 0;
      this.dragPitchTarget = 0;
      this.dragRollTarget = 0;
    }

    this.flyYawOffsetSmoothed = THREE.MathUtils.lerp(
      this.flyYawOffsetSmoothed,
      this.flyYawOffsetTarget,
      PetRenderer.FLY_YAW_LERP
    );
    this.smoothedFlyPitch = THREE.MathUtils.lerp(
      this.smoothedFlyPitch,
      this.dragPitchTarget,
      PetRenderer.FLY_TILT_LERP
    );
    this.smoothedFlyRoll = THREE.MathUtils.lerp(
      this.smoothedFlyRoll,
      this.dragRollTarget,
      PetRenderer.FLY_TILT_LERP
    );

    this.orientationPivot.rotation.set(
      this.smoothedFlyPitch,
      this.flyYawOffsetSmoothed,
      this.smoothedFlyRoll,
      'YXZ'
    );
  }

  /**
   * 循环阶段切换滑翔 / 悬停动画
   */
  setFlyLoopHoverMode(hover: boolean): void {
    if (this.dragFlyPhase !== 'loop' || this.flyLoopIsHovering === hover) {
      return;
    }

    const primary = hover ? this.flyDragClips.hover : this.flyDragClips.gliding;
    const fallback = hover ? this.flyDragClips.gliding : this.flyDragClips.hover;
    const clip = primary ?? fallback;
    if (!clip) {
      return;
    }

    this.flyLoopIsHovering = hover;
    this.playClipLoop(clip, { transitionDuration: PetRenderer.LOOP_CLIP_CROSSFADE });
    console.log(`[PetRenderer] Fly loop -> ${hover ? 'hover' : 'gliding'}: "${clip.name}"`);
  }

  /**
   * 循环阶段：左右增量绕 Y 轴转向；上下相对鼠标俯仰；转向侧倾
   */
  resetFlyLoopOrientation(): void {
    if (this.dragFlyPhase !== 'loop') {
      return;
    }
    this.flyYawOffsetTarget = 0;
    this.dragPitchTarget = 0;
    this.dragRollTarget = 0;
  }

  resetWalkDragOrientation(): void {
    if (!this.dragWalkActive) {
      return;
    }
    this.resetWalkDragSteerTargets();
  }

  private resetWalkDragSteerTargets(): void {
    this.walkDragSteer.flyYawOffsetTarget = 0;
    this.walkDragSteer.dragPitchTarget = 0;
    this.walkDragSteer.dragRollTarget = 0;
  }

  private resetWalkDragSteerState(): void {
    this.resetWalkDragSteerTargets();
    this.walkDragSteer.flyYawOffsetSmoothed = 0;
    this.walkDragSteer.smoothedFlyPitch = 0;
    this.walkDragSteer.smoothedFlyRoll = 0;
  }

  private getWalkDragSteerConstants(): WalkDragSteerConstants {
    return {
      flyYawLerp: PetRenderer.FLY_YAW_LERP,
      flyTiltLerp: PetRenderer.FLY_TILT_LERP,
      flyResetLerp: PetRenderer.FLY_RESET_LERP,
      flyBankFromYaw: PetRenderer.FLY_BANK_FROM_YAW,
      flyMaxPitch: PetRenderer.WALK_MAX_PITCH,
      flyMaxRoll: PetRenderer.WALK_MAX_ROLL,
      flyMaxYaw: PetRenderer.WALK_MAX_YAW,
      moveSteerFullSpeed: PetRenderer.FLY_MOVE_STEER_FULL_SPEED,
      moveSteerIdleThreshold: PetRenderer.FLY_MOVE_STEER_IDLE_THRESHOLD,
    };
  }

  private getFlyDragSteerConstants(): WalkDragSteerConstants {
    return {
      flyYawLerp: PetRenderer.FLY_YAW_LERP,
      flyTiltLerp: PetRenderer.FLY_TILT_LERP,
      flyResetLerp: PetRenderer.FLY_RESET_LERP,
      flyBankFromYaw: PetRenderer.FLY_BANK_FROM_YAW,
      flyMaxPitch: PetRenderer.FLY_MAX_PITCH,
      flyMaxRoll: PetRenderer.FLY_MAX_ROLL,
      flyMaxYaw: PetRenderer.FLY_MAX_YAW,
      moveSteerFullSpeed: PetRenderer.FLY_MOVE_STEER_FULL_SPEED,
      moveSteerIdleThreshold: PetRenderer.FLY_MOVE_STEER_IDLE_THRESHOLD,
    };
  }

  private getFlyDragSteerState(): WalkDragSteerState {
    return {
      walkLoopSteerStartMs: this.flyLoopSteerStartMs,
      flyYawOffsetTarget: this.flyYawOffsetTarget,
      flyYawOffsetSmoothed: this.flyYawOffsetSmoothed,
      dragPitchTarget: this.dragPitchTarget,
      dragRollTarget: this.dragRollTarget,
      smoothedFlyPitch: this.smoothedFlyPitch,
      smoothedFlyRoll: this.smoothedFlyRoll,
    };
  }

  private syncFlyDragSteerState(state: WalkDragSteerState): void {
    this.flyYawOffsetTarget = state.flyYawOffsetTarget;
    this.dragPitchTarget = state.dragPitchTarget;
    this.dragRollTarget = state.dragRollTarget;
  }

  private getWalkDragSteerState(): WalkDragSteerState {
    this.walkDragSteer.walkLoopSteerStartMs = this.walkLoopSteerStartMs;
    return this.walkDragSteer;
  }

  updateWalkDragLoopInput(moveDx: number, moveDy: number, chaseComplete: boolean): void {
    if (!this.dragWalkActive) {
      return;
    }
    updateWalkDragSteerInput(
      this.getWalkDragSteerState(),
      this.getWalkDragSteerConstants(),
      moveDx,
      moveDy,
      chaseComplete
    );
  }

  private applyWalkDragOrientation(_deltaTime: number): void {
    if (!this.orientationPivot || !this.dragWalkActive) {
      return;
    }
    applyWalkDragOrientationSmoothing(
      this.getWalkDragSteerState(),
      this.getWalkDragSteerConstants(),
      this.orientationPivot
    );
  }

  updateDragFlyLoopInput(moveDx: number, moveDy: number, chaseComplete: boolean): void {
    if (this.dragFlyPhase !== 'loop') {
      return;
    }

    const state = this.getFlyDragSteerState();
    updateWalkDragSteerInput(
      state,
      this.getFlyDragSteerConstants(),
      moveDx,
      moveDy,
      chaseComplete
    );
    this.syncFlyDragSteerState(state);
  }

  /**
   * 根据当前动画姿态平滑调整相机，避免翅膀/举手等动作穿出视口
   */
  private adaptCameraForWalkDrag(): void {
    if (!this.dragWalkActive) {
      return;
    }
    this.applyFlyCameraLock();
    this.requestViewportResize(false);
  }

  private adaptCameraForFlyDrag(immediate = false): void {
    if (this.dragFlyPhase === 'idle') {
      return;
    }
    if (this.postFlyBlendActive) {
      this.lerpFlyCameraTowardIdle();
    }
    this.applyFlyCameraLock();
    this.requestViewportResize(false);
  }

  /** 按当前模型世界包围盒重算相机（加载/重载后避免仍用绑定姿势的偏近基准） */
  private refitCameraToAnimatedBounds(immediate = false): void {
    if (!this.camera || !this.model || !this.cameraLocked || !this.frozenLookAt) {
      return;
    }
    this.adaptCameraToAnimatedBounds(immediate);
  }

  private adaptCameraToAnimatedBounds(immediate = false): void {
    if (this.dragWalkActive) {
      this.adaptCameraForWalkDrag();
      return;
    }
    if (this.dragFlyPhase !== 'idle') {
      this.adaptCameraForFlyDrag(immediate);
      return;
    }

    if (!this.camera || !this.model || !this.cameraLocked || !this.frozenLookAt) {
      return;
    }

    this.model.updateMatrixWorld(true);
    const box = this.getMeshBoundingBox(this.model);
    if (box.isEmpty()) {
      return;
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const currentMaxDim = Math.max(size.x, size.y, size.z);
    const overflowScale =
      this.bindPoseBoundsMaxDim > 1e-6
        ? Math.max(1, currentMaxDim / this.bindPoseBoundsMaxDim)
        : 1;
    const targetDistance = this.baselineCameraDistance * overflowScale;

    if (immediate) {
      this.adaptiveLookAt.copy(center);
      this.smoothedCameraDistance = targetDistance;
    } else {
      this.adaptiveLookAt.lerp(center, PetRenderer.LOOK_AT_ADAPT_LERP);
      this.smoothedCameraDistance = THREE.MathUtils.lerp(
        this.smoothedCameraDistance,
        targetDistance,
        PetRenderer.CAMERA_ADAPT_LERP
      );
    }

    this.camera.position.set(
      this.adaptiveLookAt.x,
      this.adaptiveLookAt.y,
      this.adaptiveLookAt.z + this.smoothedCameraDistance
    );
    this.camera.lookAt(this.adaptiveLookAt);
    this.camera.near = Math.max(0.01, this.smoothedCameraDistance / 500);
    this.camera.far = Math.max(200, this.smoothedCameraDistance * 30);
    this.camera.updateProjectionMatrix();

    this.frozenCameraPosition = this.camera.position.clone();
    this.requestViewportResize(false);
  }

  /**
   * 恢复默认相机（避免多次加载后相机漂移）
   */
  private resetCamera(): void {
    if (!this.camera) {
      return;
    }
    this.camera.position.copy(PetRenderer.DEFAULT_CAMERA_POSITION);
    this.camera.lookAt(PetRenderer.DEFAULT_CAMERA_LOOK_AT);
    this.camera.near = 0.1;
    this.camera.far = 1000;
    this.camera.updateProjectionMatrix();
  }

  /**
   * 模型投影包围盒（容器局部像素）
   */
  getHitRegionRect(): { minX: number; maxX: number; minY: number; maxY: number } | null {
    return this.getProjectedScreenRect();
  }

  /**
   * 屏幕坐标命中检测（严格射线，用于点击/拖拽）
   */
  hitTest(clientX: number, clientY: number): boolean {
    return this.raycastHit(clientX, clientY);
  }

  /**
   * 光标捕获命中：射线优先，动画间隙用极小 padding 包围盒兜底
   */
  hitTestPointerCapture(clientX: number, clientY: number): boolean {
    if (this.raycastHit(clientX, clientY)) {
      return true;
    }
    return this.isPointInProjectedScreenRect(clientX, clientY, PetRenderer.HIT_TEST_SCREEN_PADDING);
  }

  private raycastHit(clientX: number, clientY: number): boolean {
    if (!this.camera || !this.model) {
      return false;
    }

    const rect = this.config.container.getBoundingClientRect();
    const width = rect.width || this.config.width;
    const height = rect.height || this.config.height;
    if (width <= 0 || height <= 0) {
      return false;
    }

    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / width) * 2 - 1,
      -((clientY - rect.top) / height) * 2 + 1
    );

    this.hitRaycaster.setFromCamera(mouse, this.camera);
    const root = this.getOrientedRoot();
    if (!root) {
      return false;
    }
    const hits = this.hitRaycaster.intersectObject(root, true);
    return hits.some((hit) => this.isRaycastableMesh(hit.object));
  }

  /**
   * 加载 GLTF/GLB 文件
   */
  private resolveModelUrl(modelPath: string): string {
    if (/^(https?:|file:|blob:)/i.test(modelPath)) {
      return modelPath;
    }
    try {
      return new URL(modelPath, window.location.href).href;
    } catch {
      return modelPath;
    }
  }

  private loadGLTF(path: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      if (!this.gltfLoader) {
        reject(new Error('GLTF loader not initialized'));
        return;
      }

      const url = this.resolveModelUrl(path);
      console.log('[PetRenderer] GLTF load URL:', url);

      this.gltfLoader.load(
        url,
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
    for (const rawClip of clips) {
      if (isCombatLikeClipName(rawClip.name) || isCurvesClipName(rawClip.name)) {
        continue;
      }

      const clip = this.sanitizeClipForDesktopPet(rawClip);
      this.registerPlayableMenuClip(clip);
      this.registerInteractionClip(rawClip.name, clip);

      // 尝试匹配动画名称到状态
      const state = this.matchAnimationState(rawClip.name);
      if (state) {
        // 骑乘/飞行类 idle 不适合桌面待机，且会覆盖 Common_Relax
        if (
          state === 'idle' &&
          /ride_|fly_|gliding|landing|hover|walk|run|sprint/i.test(rawClip.name)
        ) {
          continue;
        }
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
   * 是否适合作为点击互动动画（排除待机/战斗/位移类）
   */
  private isInteractionClip(name: string): boolean {
    if (isCombatLikeClipName(name)) {
      return false;
    }
    if (isFlyDragClipName(name) || /fly_|gliding|takeoff/i.test(name)) {
      return false;
    }
    if (/ride_|walk|run|sprint|landing|hover|move_|pos_look/i.test(name)) {
      return false;
    }
    if (/^dle$/i.test(name) || /common_relax|common_sleep|ride_idle/i.test(name)) {
      return false;
    }
    return true;
  }

  /**
   * 登记飞行拖拽剪辑（起飞 / 滑翔循环 / 落地）
   */
  private registerFlyDragClips(clips: THREE.AnimationClip[]): void {
    const sanitized = clips
      .filter((c) => isFlyDragClipName(c.name))
      .map((c) => this.sanitizeClipForDesktopPet(c));
    this.flyDragClips = pickFlyDragClips(sanitized);
  }

  private registerWalkDragClip(clips: THREE.AnimationClip[]): void {
    const candidates = clips.filter(
      (c) =>
        !isFlyDragClipName(c.name) &&
        !isCombatLikeClipName(c.name) &&
        !isCurvesClipName(c.name)
    );
    const picked = pickWalkDragClips(candidates);
    this.walkDragClips = {
      walk: picked.walk ? this.sanitizeClipForDesktopPet(picked.walk) : null,
      run: picked.run ? this.sanitizeClipForDesktopPet(picked.run) : null,
      idle: picked.idle ? this.sanitizeClipForDesktopPet(picked.idle) : null,
    };
    const names = [
      this.walkDragClips.walk?.name,
      this.walkDragClips.run?.name,
      this.walkDragClips.idle?.name,
    ].filter(Boolean);
    if (names.length > 0) {
      console.log(`[PetRenderer] Walk drag clips: ${names.join(', ')}`);
    }
  }

  private pickCalloutClipForStartup(): THREE.AnimationClip | null {
    const raw = pickCalloutClip(this.rawModelClips);
    return raw ? this.sanitizeClipForDesktopPet(raw) : null;
  }

  hasFlyDragCapability(): boolean {
    return !!(this.flyDragClips.gliding || this.flyDragClips.hover);
  }

  isWalkDragActive(): boolean {
    return this.dragWalkActive;
  }

  hasWalkDragRunClip(): boolean {
    return !!this.walkDragClips.run;
  }

  setWalkDragLocomotion(mode: 'idle' | 'walk' | 'run'): void {
    if (!this.dragWalkActive || !this.mixer) {
      return;
    }
    if (this.walkDragLocomotion === mode) {
      return;
    }

    if (mode === 'idle') {
      this.walkDragLocomotion = 'idle';
      const idleClip = this.walkDragClips.idle;
      if (idleClip) {
        this.playClipLoop(idleClip, {
          transitionDuration: PetRenderer.LOOP_CLIP_CROSSFADE,
          animState: 'drag',
        });
        return;
      }
      if (this.animations.has('idle')) {
        this.setAnimation('idle', {
          loop: true,
          transitionDuration: PetRenderer.LOOP_CLIP_CROSSFADE,
        });
        return;
      }
      this.ensureIdlePlaying();
      return;
    }

    const clip =
      mode === 'run'
        ? (this.walkDragClips.run ?? this.walkDragClips.walk)
        : this.walkDragClips.walk;
    if (!clip) {
      return;
    }

    this.walkDragLocomotion = mode;
    this.playClipLoop(clip, {
      transitionDuration: PetRenderer.LOOP_CLIP_CROSSFADE,
      animState: 'drag',
    });
  }

  private registerPlayableMenuClip(clip: THREE.AnimationClip): void {
    if (this.playableMenuClips.some((c) => c.name === clip.name)) {
      return;
    }
    this.playableMenuClips.push(clip);
  }

  private registerInteractionClip(name: string, clip: THREE.AnimationClip): void {
    if (!this.isInteractionClip(name)) {
      return;
    }
    if (this.interactionClips.some((c) => c.name === clip.name)) {
      return;
    }
    this.interactionClips.push(clip);
  }

  /**
   * 匹配动画名称到状态
   */
  private matchAnimationState(name: string): AnimationState | null {
    if (isCombatLikeClipName(name) || isCurvesClipName(name)) {
      return null;
    }

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
    if (lowerName === 'dle' || lowerName.includes('relax')) {
      return 'idle';
    }
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
          const clip = this.sanitizeClipForDesktopPet(gltf.animations[0]);
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

    let clip = this.animations.get(state);
    if (!clip || isCombatLikeClipName(clip.name)) {
      console.warn(`[PetRenderer] Animation not found: ${state}, keeping current animation`);
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
    const timeScale = options?.timeScale ?? this.getRelativeActionTimeScale();
    const nextState = options?.nextState ?? config.nextState;

    // 记录上一个状态
    const previousAnimation = this.currentAnimation;

    const newAction = this.mixer.clipAction(clip);
    newAction.enabled = true;
    // LoopRepeat 的 repetitions 为 1 时只播一轮就停，循环必须传 Infinity
    const repetitions = loop ? Infinity : (loopCount ?? 1);
    newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, repetitions);
    newAction.clampWhenFinished = !loop;
    newAction.timeScale = timeScale;

    (newAction as any).__nextState = loop ? undefined : nextState;

    this.fadeToAction(newAction, transitionDuration, {
      warp: loop && transitionDuration >= 0.2,
    });

    this.currentAnimation = state;
    this.syncCurvesToBodyAction(newAction, clip.name);

    // 触发事件
    this.events.onAnimationChanged?.(previousAnimation, state);

    console.log(`[PetRenderer] Animation changed: ${previousAnimation || 'none'} -> ${state}`);
  }

  /**
   * 处理动画完成事件
   */
  private handleAnimationFinished(event: THREE.Event): void {
    const action = event.action as THREE.AnimationAction;
    const dragFlyComplete = (action as unknown as { __dragFlyComplete?: () => void })
      .__dragFlyComplete;

    if (dragFlyComplete) {
      dragFlyComplete();
      return;
    }

    const interactionComplete = (action as unknown as { __interactionComplete?: () => void })
      .__interactionComplete;
    if (interactionComplete) {
      interactionComplete();
      return;
    }

    const nextState = (action as unknown as { __nextState?: AnimationState }).__nextState;

    // 循环动画不应触发 finished；无 nextState 则忽略
    if (!nextState || action.loop === THREE.LoopRepeat) {
      return;
    }

    // 触发动画完成事件
    if (this.currentAnimation) {
      this.events.onAnimationFinished?.(this.currentAnimation);
    }

    // 如果有下一个状态，自动切换
    if (nextState && this.animations.has(nextState)) {
      console.log(`[PetRenderer] Auto-transitioning to: ${nextState}`);
      if (nextState === 'idle') {
        this.crossfadeToIdle(action);
      } else {
        this.setAnimation(nextState, {
          loop: nextState === 'idle',
          transitionDuration: PetRenderer.IDLE_RETURN_CROSSFADE,
        });
      }
    }
  }

  private clearIdleReturnSchedule(): void {
    if (this.idleReturnTimer !== null) {
      clearTimeout(this.idleReturnTimer);
      this.idleReturnTimer = null;
    }
  }

  /**
   * 单次剪辑在结束前提前 crossFade 回 idle（此时 action 仍在跑，不会硬切）
   */
  private scheduleIdleReturnAfterClip(
    clip: THREE.AnimationClip,
    bodyAction: THREE.AnimationAction
  ): void {
    this.clearIdleReturnSchedule();
    if (!this.mixer) {
      return;
    }

    const mixerScale = this.mixer.timeScale > 0 ? this.mixer.timeScale : 1;
    const actionScale = bodyAction.timeScale > 0 ? bodyAction.timeScale : 1;
    const durationSec = clip.duration / (mixerScale * actionScale);
    const lead = Math.min(
      PetRenderer.IDLE_RETURN_CROSSFADE,
      Math.max(0.1, durationSec * 0.42)
    );

    if (durationSec <= lead + 0.05) {
      return;
    }

    const delayMs = (durationSec - lead) * 1000;
    this.idleReturnTimer = window.setTimeout(() => {
      this.idleReturnTimer = null;
      this.crossfadeToIdle(bodyAction);
    }, delayMs);
  }

  /**
   * 从单次互动/点击剪辑平滑回到 idle（禁用 warp，避免末帧与待机首帧相位拉伸导致跳变）
   */
  private crossfadeToIdle(
    fadeOutAction?: THREE.AnimationAction | null,
    options?: { transitionDuration?: number }
  ): void {
    if (!this.mixer || !this.model) {
      return;
    }

    if (this.idleBlendInProgress) {
      return;
    }

    const duration = options?.transitionDuration ?? PetRenderer.IDLE_RETURN_CROSSFADE;
    const outgoing = fadeOutAction ?? this.currentAction;

    let clip = this.animations.get('idle') ?? null;
    if (!clip) {
      clip = this.pickIdleAnimationClip(this.rawModelClips);
      if (clip) {
        this.animations.set('idle', clip);
        const idleConfig = this.animationConfigs.get('idle');
        if (idleConfig) {
          idleConfig.clip = clip;
        }
      }
    }

    if (!clip) {
      console.warn('[PetRenderer] crossfadeToIdle: no idle clip');
      return;
    }

    const idleAction = this.mixer.clipAction(clip);
    if (
      outgoing === idleAction &&
      this.currentAnimation === 'idle' &&
      idleAction.isRunning()
    ) {
      return;
    }

    this.clearIdleReturnSchedule();
    this.idleBlendInProgress = true;

    for (const curvesAction of this.curvesActions) {
      if (curvesAction.getEffectiveWeight() > 0.001) {
        curvesAction.fadeOut(duration);
      }
    }
    this.curvesActions = [];

    idleAction.enabled = true;
    idleAction.setLoop(THREE.LoopRepeat, Infinity);
    idleAction.clampWhenFinished = false;
    idleAction.timeScale = this.getRelativeActionTimeScale();

    this.fadeToAction(idleAction, duration, { warp: false, fadeOutAction: outgoing });
    this.currentAnimation = 'idle';
    this.syncCurvesToBodyAction(idleAction, clip.name);

    window.setTimeout(() => {
      this.idleBlendInProgress = false;
    }, duration * 1000 + 80);

    console.log(
      `[PetRenderer] Crossfade to idle: "${clip.name}" (${duration.toFixed(2)}s)`
    );
  }

  /**
   * 模型加载或切换后启动展示（渲染循环已运行时也生效）
   */
  beginPresentationAfterModelLoad(): void {
    this.startupPresentationDone = false;
    if (!this.mixer || !this.model) {
      return;
    }

    if (!this.animations.has('idle')) {
      const idleClip = this.pickIdleAnimationClip(this.rawModelClips);
      if (idleClip) {
        this.animations.set('idle', idleClip);
        const idleConfig = this.animationConfigs.get('idle');
        if (idleConfig) {
          idleConfig.clip = idleClip;
        }
      }
    }

    if (!this.animations.has('idle')) {
      console.warn('[PetRenderer] beginPresentationAfterModelLoad: idle not ready');
      return;
    }

    this.playStartupPresentation();
    this.refitCameraToAnimatedBounds(true);
  }

  /**
   * 模型加载后：callout 播一次 → idle 循环；无 callout 则直接 idle
   */
  private playStartupPresentation(): void {
    if (!this.mixer || !this.model) {
      return;
    }

    if (this.startupPresentationDone) {
      this.ensureIdlePlaying();
      return;
    }
    this.startupPresentationDone = true;

    const callout = this.pickCalloutClipForStartup();
    if (callout) {
      console.log(`[PetRenderer] Startup callout: "${callout.name}"`);
      const played = this.playClipOnce(callout, {
        transitionDuration: PetRenderer.DEFAULT_CLIP_CROSSFADE,
        allowCallout: true,
        nextState: 'idle',
      });
      if (played) {
        return;
      }
      console.warn('[PetRenderer] Callout could not play, falling back to idle');
    }

    this.ensureIdlePlaying();
  }

  /**
   * 强制进入待机循环（不依赖 AnimationState 映射）
   */
  ensureIdlePlaying(): void {
    if (!this.mixer || !this.model) {
      console.warn('[PetRenderer] ensureIdlePlaying: mixer/model not ready');
      return;
    }

    let clip = this.animations.get('idle') ?? null;
    if (!clip) {
      clip = this.pickIdleAnimationClip(this.rawModelClips);
      if (clip) {
        this.animations.set('idle', clip);
        const idleConfig = this.animationConfigs.get('idle');
        if (idleConfig) {
          idleConfig.clip = clip;
        }
      }
    }

    if (!clip) {
      console.warn('[PetRenderer] ensureIdlePlaying: no idle clip');
      return;
    }

    this.stopCurvesActions();

    const action = this.mixer.clipAction(clip);
    action.enabled = true;
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.timeScale = this.getRelativeActionTimeScale();

    if (
      this.currentAction === action &&
      this.currentAction.isRunning() &&
      this.currentAnimation === 'idle'
    ) {
      return;
    }

    this.fadeToAction(action, PetRenderer.IDLE_RETURN_CROSSFADE, { warp: true });

    this.currentAnimation = 'idle';
    this.syncCurvesToBodyAction(action, clip.name);

    const sourceFrames = this.secondsToSourceFrames(clip.duration);
    console.log(
      `[PetRenderer] Idle playing: "${clip.name}" ` +
        `(${sourceFrames.toFixed(0)}f@${this.sourceAnimationFps}fps, ` +
        `${clip.duration.toFixed(2)}s/loop, ${this.playbackSpeed}x)`
    );
  }

  private startIdleAnimation(): void {
    this.ensureIdlePlaying();
  }

  /**
   * 播放循环剪辑（拖拽用）
   */
  private playClipLoop(
    clip: THREE.AnimationClip,
    options: {
      transitionDuration?: number;
      timeScale?: number;
      animState?: AnimationState;
    } = {}
  ): void {
    if (!this.mixer || !this.model || isCombatLikeClipName(clip.name)) {
      return;
    }

    const transitionDuration =
      options.transitionDuration ?? PetRenderer.LOOP_CLIP_CROSSFADE;
    const timeScale = options.timeScale ?? this.getRelativeActionTimeScale();

    const newAction = this.mixer.clipAction(clip);
    newAction.enabled = true;
    newAction.setLoop(THREE.LoopRepeat, Infinity);
    newAction.clampWhenFinished = false;
    newAction.timeScale = timeScale;
    (newAction as any).__nextState = undefined;

    this.fadeToAction(newAction, transitionDuration, { warp: true });

    this.currentAnimation = options.animState ?? 'drag';
    this.syncCurvesToBodyAction(newAction, clip.name);
    console.log(
      `[PetRenderer] Drag loop: "${clip.name}" (${clip.duration.toFixed(2)}s, ${this.playbackSpeed}x)`
    );
  }

  /**
   * 播放单次剪辑，结束后回到待机
   */
  setClickAnimationSettings(settings: ClickAnimationSettings): void {
    this.clickAnimationSettings = {
      pool: [...settings.pool],
      activeSequenceId: settings.activeSequenceId,
      sequenceSteps: settings.sequenceSteps ? [...settings.sequenceSteps] : undefined,
      sequenceStepsById: settings.sequenceStepsById
        ? Object.fromEntries(
            Object.entries(settings.sequenceStepsById).map(([id, steps]) => [
              id,
              steps.map((s) => ({ ...s })),
            ])
          )
        : undefined,
    };
  }

  setModelScaleFactor(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) {
      return;
    }
    this.modelScaleFactor = factor;
    this.applyModelScaleFactor();
    // 用户缩放应改变画面大小；勿按全包围盒重算相机距离（会抵消缩放）
    this.rebuildBindPoseBoundsReference();
  }

  setModelBrightness(factor: number): void {
    this.modelBrightnessFactor = Math.min(2, Math.max(0.25, factor));
    this.applyModelBrightness();
  }

  setSourceAnimationFps(fps: number, options?: { force?: boolean }): void {
    const clamped = Math.min(240, Math.max(24, Math.round(fps)));
    if (this.sourceAnimationFps === clamped && !options?.force) {
      return;
    }
    this.sourceAnimationFps = clamped;
    console.log(`[PetRenderer] Source animation FPS set to ${clamped}`);
    if (this.pristineModelClips.length > 0) {
      this.rebuildModelAnimationsFromRaw();
    }
  }

  private applyBrightnessToMaterial(mat: THREE.MeshStandardMaterial, brightness: number): void {
    const baseColor = mat.userData[PetRenderer.MATERIAL_BASE_COLOR_KEY] as THREE.Color | undefined;
    if (baseColor) {
      const tinted = PetRenderer._scratchBrightnessColor.copy(baseColor).multiplyScalar(brightness);
      mat.color.r = Math.min(1, tinted.r);
      mat.color.g = Math.min(1, tinted.g);
      mat.color.b = Math.min(1, tinted.b);
    }

    const envBase =
      (mat.userData[PetRenderer.MATERIAL_BASE_ENV_KEY] as number | undefined) ?? 0.3;
    mat.envMapIntensity = envBase * brightness;

    const emissiveBoost = Math.max(0, brightness - 1) * 0.45;
    if (emissiveBoost > 0 && baseColor) {
      mat.emissive.copy(baseColor).multiplyScalar(emissiveBoost);
    } else {
      mat.emissive.setHex(0x000000);
    }

    mat.needsUpdate = true;
  }

  private applyModelBrightness(): void {
    const b = this.modelBrightnessFactor;
    const base = PetRenderer.LIGHT_BASE_INTENSITY;

    if (this.ambientLight) {
      this.ambientLight.intensity = base.ambient * b;
    }
    if (this.hemisphereLight) {
      this.hemisphereLight.intensity = base.hemisphere * b;
    }
    if (this.mainLight) {
      this.mainLight.intensity = base.main * b;
    }
    if (this.fillLight) {
      this.fillLight.intensity = base.fill * b;
    }
    if (this.rimLight) {
      this.rimLight.intensity = base.rim * b;
    }
    if (this.bottomLight) {
      this.bottomLight.intensity = base.bottom * b;
    }

    const root = this.model;
    if (!root) {
      return;
    }

    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          this.applyBrightnessToMaterial(mat, b);
        }
      }
    });
  }

  private applyModelScaleFactor(): void {
    if (!this.model) {
      return;
    }
    const s = this.baseModelScale * this.modelScaleFactor;
    this.model.scale.set(s, s, s);
  }

  private getInteractionFallbackClipNames(): string[] {
    if (this.interactionClips.length > 0) {
      return this.interactionClips.map((c) => c.name);
    }
    return this.playableMenuClips
      .filter((c) => this.isInteractionClip(c.name))
      .map((c) => c.name);
  }

  private playClipOnce(
    clip: THREE.AnimationClip,
    options: {
      transitionDuration?: number;
      timeScale?: number;
      nextState?: AnimationState;
      onComplete?: () => void;
      /** 为 false 时播完后不先回 idle（用于多步点击序列的中间步） */
      returnToIdleOnComplete?: boolean;
      /** Fight_CallOut 等含 fight_ 的 callout 仍须播放 */
      allowCallout?: boolean;
      /** 设置里显式配置的点击动画（含 Alert、Fight_Skill 等） */
      allowCombatLike?: boolean;
    } = {}
  ): boolean {
    const blocked =
      isCombatLikeClipName(clip.name) &&
      !(options.allowCombatLike || (options.allowCallout && isCalloutClipName(clip.name)));
    if (!this.mixer || !this.model || blocked) {
      return false;
    }

    const transitionDuration =
      options.transitionDuration ?? PetRenderer.DEFAULT_CLIP_CROSSFADE;
    const timeScale = options.timeScale ?? this.getRelativeActionTimeScale();
    const nextState = options.onComplete ? undefined : (options.nextState ?? 'idle');

    const newAction = this.mixer.clipAction(clip);
    newAction.enabled = true;
    newAction.setLoop(THREE.LoopOnce, 1);
    newAction.clampWhenFinished = true;
    newAction.timeScale = timeScale;
    if (options.onComplete) {
      const userComplete = options.onComplete;
      const returnToIdle = options.returnToIdleOnComplete !== false;
      (newAction as unknown as { __interactionComplete: () => void }).__interactionComplete =
        () => {
          if (returnToIdle) {
            this.crossfadeToIdle(newAction);
          }
          userComplete();
        };
    } else {
      (newAction as unknown as { __nextState?: AnimationState }).__nextState = nextState;
    }

    this.clearIdleReturnSchedule();
    this.idleBlendInProgress = false;

    this.fadeToAction(newAction, transitionDuration, { warp: false });

    this.syncCurvesToBodyAction(newAction, clip.name);
    if (nextState === 'idle') {
      this.scheduleIdleReturnAfterClip(clip, newAction);
    }
    console.log(
      `[PetRenderer] Playing interaction: "${clip.name}" (${clip.duration.toFixed(2)}s, ${this.playbackSpeed}x)`
    );
    return true;
  }

  /**
   * 右键菜单：模型内全部非战斗剪辑（标签为 GLB 原名）
   */
  getMenuAnimations(): PetMenuAnimation[] {
    return this.playableMenuClips
      .filter((clip) => !isCurvesClipName(clip.name))
      .map((clip) => ({
        id: menuIdForClip(clip.name),
        label: clip.name,
        clipName: clip.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /** 模型 GLB 内全部非 Curves 剪辑名（设置窗列表用，不做互动池过滤） */
  getAllAnimationClipNames(): string[] {
    return this.pristineModelClips
      .filter((c) => !isCurvesClipName(c.name))
      .map((c) => c.name)
      .sort((a, b) => a.localeCompare(b));
  }

  /**
   * 播放右键菜单选中的动画（按剪辑原名）
   */
  playMenuAnimation(menuId: string): void {
    if (!this.mixer || !this.model) {
      return;
    }

    this.abortDragFlyForMenu();

    const parsed = parseMenuAnimationId(menuId);
    if (!parsed || parsed.kind !== 'clip') {
      console.warn('[PetRenderer] Unknown menu animation id:', menuId);
      return;
    }

    const clip = this.findMenuClipByName(parsed.value);
    if (!clip) {
      console.warn('[PetRenderer] Menu clip not found:', parsed.value);
      return;
    }

    const loop = this.shouldMenuClipLoop(clip.name);
    if (loop) {
      this.playClipLoop(clip, { transitionDuration: PetRenderer.LOOP_CLIP_CROSSFADE });
    } else {
      this.playClipOnce(clip, {
        transitionDuration: PetRenderer.DEFAULT_CLIP_CROSSFADE,
        nextState: 'idle',
      });
    }
  }

  private shouldMenuClipLoop(clipName: string): boolean {
    const n = clipName.toLowerCase();
    if (/landing|takeoff|fly_start|fly_end|_start$|_end$/i.test(n)) {
      return false;
    }
    return /gliding|hover|idle|relax|sleep|stand|walk|run|dle$|loop/i.test(n);
  }

  private findMenuClipByName(clipName: string): THREE.AnimationClip | null {
    return this.playableMenuClips.find((c) => c.name === clipName) ?? null;
  }

  /** 按剪辑名查找可播放剪辑（菜单 / 互动池 / 原始 GLB） */
  private findClipByName(clipName: string): THREE.AnimationClip | null {
    const fromMenu = this.findMenuClipByName(clipName);
    if (fromMenu) {
      return fromMenu;
    }
    const fromInteraction = this.interactionClips.find((c) => c.name === clipName);
    if (fromInteraction) {
      return fromInteraction;
    }
    const raw = this.pristineModelClips.find((c) => c.name === clipName);
    if (raw && !isCurvesClipName(raw.name)) {
      return this.sanitizeClipForDesktopPet(raw);
    }
    return null;
  }

  /** 从菜单切动画时立即结束飞行拖拽，避免与手动选择冲突 */
  private abortDragFlyForMenu(): void {
    if (this.dragWalkActive) {
      this.endWalkDrag();
      return;
    }

    if (this.dragFlyPhase === 'idle' && !this.postFlyBlendActive) {
      return;
    }

    this.clearDragFlyComplete(this.currentAction);
    this.stopFlyDragClipActions();
    this.dragFlyPhase = 'idle';
    this.flyLoopIsHovering = false;
    this.postFlyBlendActive = false;
    this.flyLandingIdleBlendStarted = false;
    this.landingToIdleHandoffDone = false;
    this.flyCameraDistance = 0;
    this.resetFlyOrientationState();
  }

  /**
   * 随机播放互动动画，播完后回到待机循环
   */
  playInteractionReaction(): void {
    if (!this.mixer) {
      return;
    }

    const fallback = this.getInteractionFallbackClipNames();
    const steps = resolveClickAnimationSteps(this.clickAnimationSettings, fallback);
    if (steps.length === 0) {
      console.warn('[PetRenderer] No click animation steps configured');
      return;
    }

    this.playInteractionSteps(steps, 0);
  }

  private playInteractionSteps(
    steps: Array<{ clipName: string; delayAfterMs?: number }>,
    index: number
  ): void {
    if (index >= steps.length) {
      this.crossfadeToIdle();
      return;
    }

    const step = steps[index]!;
    const clip = this.findClipByName(step.clipName);

    if (!clip) {
      console.warn(`[PetRenderer] Click step clip not found: "${step.clipName}"`);
      this.playInteractionSteps(steps, index + 1);
      return;
    }

    const isLast = index >= steps.length - 1;
    const played = this.playClipOnce(clip, {
      transitionDuration: PetRenderer.DEFAULT_CLIP_CROSSFADE,
      nextState: isLast ? 'idle' : undefined,
      allowCombatLike: true,
      returnToIdleOnComplete: isLast,
      onComplete: isLast
        ? undefined
        : () => {
            const delay = step.delayAfterMs ?? 0;
            if (delay > 0) {
              window.setTimeout(() => this.playInteractionSteps(steps, index + 1), delay);
            } else {
              this.playInteractionSteps(steps, index + 1);
            }
          },
    });

    if (!played) {
      console.warn(`[PetRenderer] Click step blocked or failed: "${step.clipName}"`);
      this.playInteractionSteps(steps, index + 1);
    }
  }

  /**
   * 播放飞行拖拽单次剪辑（由 __dragFlyComplete 驱动阶段切换）
   */
  private playFlyDragClipOnce(
    clip: THREE.AnimationClip,
    onComplete: () => void,
    options: { transitionDuration?: number; timeScale?: number } = {}
  ): void {
    if (!this.mixer || !this.model) {
      return;
    }

    const transitionDuration =
      options.transitionDuration ?? PetRenderer.DEFAULT_CLIP_CROSSFADE;
    const timeScale = options.timeScale ?? this.getRelativeActionTimeScale();

    const newAction = this.mixer.clipAction(clip);
    newAction.enabled = true;
    newAction.setLoop(THREE.LoopOnce, 1);
    newAction.clampWhenFinished = true;
    newAction.timeScale = timeScale;
    (newAction as unknown as { __dragFlyComplete: () => void }).__dragFlyComplete = onComplete;

    this.fadeToAction(newAction, transitionDuration, { warp: false });

    this.currentAnimation = 'drag';
    this.syncCurvesToBodyAction(newAction, clip.name);
    console.log(
      `[PetRenderer] Fly drag once: "${clip.name}" (${clip.duration.toFixed(2)}s, ${timeScale}x)`
    );
  }

  private clearDragFlyComplete(action: THREE.AnimationAction | null): void {
    if (!action) {
      return;
    }
    delete (action as unknown as { __dragFlyComplete?: () => void }).__dragFlyComplete;
  }

  private clearTakeoffHandoffTimer(): void {
    if (this.takeoffHandoffTimer !== null) {
      clearTimeout(this.takeoffHandoffTimer);
      this.takeoffHandoffTimer = null;
    }
  }

  /** 起飞剪辑已结束但未满最短可见时长：保持尾帧，稍后再切入滑翔 */
  private scheduleTakeoffHandoffAfterMinVisible(): void {
    this.clearTakeoffHandoffTimer();
    const elapsed = performance.now() - this.takeoffPhaseStartedMs;
    const wait = Math.max(0, PetRenderer.FLY_TAKEOFF_MIN_VISIBLE_MS - elapsed);
    this.takeoffHandoffTimer = setTimeout(() => {
      this.takeoffHandoffTimer = null;
      this.handoffTakeoffToLoop('min-visible');
    }, wait);
  }

  /**
   * 统一起飞 → 滑翔切换（防止 tryHandoff / finished 在首帧或高倍速下立刻 playClipLoop 打断起飞）
   */
  private handoffTakeoffToLoop(
    reason: 'progress' | 'clip-finished' | 'min-visible'
  ): void {
    if (this.dragFlyPhase !== 'takeoff') {
      return;
    }

    const elapsed = performance.now() - this.takeoffPhaseStartedMs;
    if (elapsed < PetRenderer.FLY_TAKEOFF_MIN_VISIBLE_MS) {
      if (reason === 'clip-finished') {
        this.scheduleTakeoffHandoffAfterMinVisible();
      }
      return;
    }

    const action = this.currentAction;
    const clip = this.flyDragClips.takeoff;
    if (reason === 'progress' && action && clip) {
      const effectiveDuration =
        clip.duration / this.getEffectiveActionTimeScale(action);
      const progress =
        effectiveDuration > 0 ? action.time / effectiveDuration : 1;
      const reachedProgress =
        progress >= PetRenderer.FLY_TAKEOFF_HANDOFF_PROGRESS;
      const reachedMaxWait = elapsed >= PetRenderer.FLY_TAKEOFF_MAX_WAIT_MS;
      const clipNearlyDone = progress >= 0.9;
      if (!reachedProgress && !reachedMaxWait && !clipNearlyDone) {
        return;
      }
    }

    this.clearTakeoffHandoffTimer();
    if (action) {
      this.clearDragFlyComplete(action);
    }
    this.enterDragFlyLoop();
  }

  /** 起飞尾段提前切入滑翔（须满足最短可见时长，避免被滑翔循环立刻 crossFade 打断） */
  private tryHandoffTakeoffToLoop(): void {
    if (this.dragFlyPhase !== 'takeoff' || !this.currentAction || !this.flyDragClips.takeoff) {
      return;
    }
    this.handoffTakeoffToLoop('progress');
  }

  private enterDragFlyLoop(): void {
    if (this.dragFlyPhase === 'loop') {
      return;
    }
    this.clearTakeoffHandoffTimer();

    const gliding = this.flyDragClips.gliding;
    const hover = this.flyDragClips.hover;
    const startClip = gliding ?? hover;
    if (!startClip) {
      console.warn('[PetRenderer] No fly loop clip, ending drag fly');
      this.finishDragFly();
      return;
    }

    this.dragFlyPhase = 'loop';
    this.flyLoopIsHovering = false;
    this.flyYawOffsetTarget = 0;
    this.flyLoopSteerStartMs = performance.now();
    this.lockFlyCameraDistance();
    this.requestViewportResize(true);
    this.playClipLoop(startClip, { transitionDuration: 0.38 });
    this.events.onDragFlyLoopStart?.();
    console.log(`[PetRenderer] Fly loop (gliding): "${startClip.name}"`);
  }

  private playDragFlyLanding(): void {
    if (this.dragFlyPhase === 'landing') {
      return;
    }

    const landingClip = this.flyDragClips.landing;
    if (!landingClip) {
      this.finishDragFly();
      return;
    }

    this.dragFlyPhase = 'landing';
    this.landingToIdleHandoffDone = false;
    this.flyYawOffsetTarget = 0;
    this.dragPitchTarget = 0;
    this.dragRollTarget = 0;
    this.playFlyDragClipOnce(landingClip, () => this.finishDragFly(), {
      transitionDuration: PetRenderer.FLY_LOOP_TO_LANDING_CROSSFADE,
    });
    console.log('[PetRenderer] Fly drag landing started');
  }

  /** 落地尾段提前切入待机，避免落地播完再硬切 */
  private tryHandoffLandingToIdle(): void {
    if (
      this.dragFlyPhase !== 'landing' ||
      this.landingToIdleHandoffDone ||
      !this.currentAction ||
      !this.flyDragClips.landing
    ) {
      return;
    }

    const action = this.currentAction;
    const clip = this.flyDragClips.landing;
    const effectiveDuration =
      clip.duration / this.getEffectiveActionTimeScale(action);
    if (action.time < effectiveDuration * PetRenderer.FLY_LANDING_HANDOFF_RATIO) {
      return;
    }

    this.landingToIdleHandoffDone = true;
    this.clearDragFlyComplete(action);
    this.finishDragFly();
  }

  private stopFlyDragClipActions(): void {
    if (!this.mixer) {
      return;
    }
    for (const clip of [
      this.flyDragClips.takeoff,
      this.flyDragClips.gliding,
      this.flyDragClips.hover,
      this.flyDragClips.landing,
    ]) {
      if (!clip) {
        continue;
      }
      const action = this.mixer.clipAction(clip);
      action.stop();
      action.setEffectiveWeight(0);
    }
  }

  /** 飞行结束后保证待机循环在播（权重为 1） */
  private ensureIdleAnimationPlaying(): void {
    this.stopFlyDragClipActions();
    this.ensureIdlePlaying();
  }

  private endPostFlyBlend(): void {
    if (!this.flyLandingIdleBlendStarted) {
      return;
    }
    const releaseDistance =
      this.flyCameraDistance > 0 ? this.flyCameraDistance : this.smoothedCameraDistance;

    this.dragFlyPhase = 'idle';
    this.postFlyBlendActive = false;
    this.flyCameraDistance = 0;
    this.landingToIdleHandoffDone = false;
    this.flyLandingIdleBlendStarted = false;
    this.resetFlyOrientationState();
    this.smoothedCameraDistance = Math.max(releaseDistance, this.baselineCameraDistance);
    this.adaptiveLookAt.copy(this.frozenLookAt ?? this.adaptiveLookAt);

    this.ensureIdleAnimationPlaying();
  }

  private crossFadeToIdleAfterFly(duration: number): void {
    if (!this.mixer) {
      this.endPostFlyBlend();
      return;
    }

    const idleClip = this.animations.get('idle');
    if (!idleClip) {
      this.endPostFlyBlend();
      return;
    }

    this.crossfadeToIdle(this.currentAction, { transitionDuration: duration });
    console.log(
      `[PetRenderer] Fly landing -> idle crossfade (${duration.toFixed(2)}s)`
    );

    const blendMs = duration * 1000 + 80;
    window.setTimeout(() => this.endPostFlyBlend(), blendMs);
  }

  private finishDragFly(): void {
    if (this.flyLandingIdleBlendStarted) {
      return;
    }
    this.flyLandingIdleBlendStarted = true;

    // 保持 landing 阶段直至交叉淡入结束，避免相机/朝向逻辑中途切换闪一下
    this.flyLoopIsHovering = false;
    this.postFlyBlendActive = true;
    this.flyYawOffsetTarget = 0;
    this.dragPitchTarget = 0;
    this.dragRollTarget = 0;
    this.events.onDragFlyEnd?.();

    this.crossFadeToIdleAfterFly(PetRenderer.FLY_LANDING_TO_IDLE_CROSSFADE);
    console.log('[PetRenderer] Fly drag finished, blending to idle');
  }

  resumeWalkDragChase(): void {
    if (!this.dragWalkActive || !this.mixer) {
      return;
    }
    this.walkLoopSteerStartMs = performance.now();
    this.resetWalkDragSteerTargets();
    this.walkDragLocomotion = 'idle';
    this.setWalkDragLocomotion('walk');
  }

  private startWalkDrag(): void {
    if (!this.mixer || this.dragWalkActive) {
      return;
    }
    if (!this.walkDragClips.walk && !this.walkDragClips.run) {
      return;
    }

    this.dragWalkActive = true;
    this.walkLoopSteerStartMs = performance.now();
    this.resetWalkDragSteerState();
    this.lockFlyCameraDistance();
    this.walkDragLocomotion = 'idle';
    this.setWalkDragLocomotion('walk');
    console.log('[PetRenderer] Walk drag chase started');
  }

  private endWalkDrag(): void {
    if (!this.dragWalkActive) {
      return;
    }

    this.walkDragLocomotion = 'walk';
    this.walkLoopSteerStartMs = 0;
    this.flyCameraDistance = 0;
    this.resetWalkDragSteerState();
    this.resetFlyOrientationState();
    this.dragWalkActive = false;
    this.ensureIdlePlaying();
    console.log('[PetRenderer] Walk drag ended');
  }

  /**
   * 开始拖拽：有飞行剪辑则起飞→循环→落地，否则循环行走
   */
  startDragAnimation(): void {
    if (!this.mixer || this.dragFlyPhase !== 'idle' || this.dragWalkActive) {
      return;
    }

    if (!this.hasFlyDragCapability()) {
      this.startWalkDrag();
      return;
    }

    const { takeoff, gliding, hover } = this.flyDragClips;
    if (!gliding && !hover) {
      this.startWalkDrag();
      return;
    }

    this.landingToIdleHandoffDone = false;
    this.flyLandingIdleBlendStarted = false;
    this.postFlyBlendActive = false;
    this.resetFlyOrientationState();
    this.lockFlyCameraDistance();
    this.events.onDragFlyStart?.();

    if (!takeoff) {
      this.enterDragFlyLoop();
      return;
    }

    const takeoffPlaySec =
      takeoff.duration /
      (this.getFlyTakeoffTimeScale() * Math.max(this.playbackSpeed, 0.01));

    this.clearTakeoffHandoffTimer();
    this.dragFlyPhase = 'takeoff';
    this.takeoffPhaseStartedMs = performance.now();
    this.playFlyDragClipOnce(takeoff, () => this.handoffTakeoffToLoop('clip-finished'), {
      transitionDuration: PetRenderer.DEFAULT_CLIP_CROSSFADE,
      timeScale: this.getFlyTakeoffTimeScale(),
    });
    console.log(
      `[PetRenderer] Fly drag takeoff "${takeoff.name}" (~${takeoffPlaySec.toFixed(2)}s)`
    );
  }

  /**
   * 结束飞行拖拽，播放落地（窗口在落地完成前保持不动）
   */
  endDragAnimation(): void {
    if (this.dragWalkActive) {
      this.endWalkDrag();
      return;
    }

    if (this.dragFlyPhase === 'idle' || this.dragFlyPhase === 'landing') {
      return;
    }

    if (this.dragFlyPhase === 'takeoff' || this.dragFlyPhase === 'loop') {
      this.playDragFlyLanding();
    }
  }

  /** 仅滑翔循环阶段跟随鼠标；起飞/落地阶段窗口保持不动 */
  isFlyDragFollowingMouse(): boolean {
    return this.dragFlyPhase === 'loop';
  }

  isWalkDragFollowingMouse(): boolean {
    return this.dragWalkActive;
  }

  isDragFollowingMouse(): boolean {
    return this.isFlyDragFollowingMouse() || this.isWalkDragFollowingMouse();
  }

  isDragFlyActive(): boolean {
    return this.dragFlyPhase !== 'idle';
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
    // 丢弃加载期间累积的时间，避免首帧 delta 过大
    this.clock?.getDelta();
    this.lastFPSUpdate = performance.now();
    this.frameCount = 0;

    console.log('[PetRenderer] Rendering started');

    // 入场展示未完成时不强制待机，避免打断 callout（由 beginPresentationAfterModelLoad 负责）
    if (this.mixer && this.startupPresentationDone && this.animations.has('idle')) {
      this.ensureIdlePlaying();
    }

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

    // 限制单帧最大 delta，避免加载完成后首帧时间跳变导致动画瞬间播完
    const deltaTime = Math.min(this.clock.getDelta(), 0.05);

    // 更新动画
    if (this.mixer) {
      this.mixer.update(deltaTime);
      this.tryHandoffTakeoffToLoop();
      this.tryHandoffLandingToIdle();
      this.enforceBindPoseLocks();
      this.applyFlyOrientation(deltaTime);
      this.applyWalkDragOrientation(deltaTime);
      this.adaptCameraToAnimatedBounds();
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

    if (this.cameraLocked) {
      this.adaptCameraToAnimatedBounds(true);
    }

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

    if (this.model) {
      if (this.orientationPivot) {
        this.orientationPivot.remove(this.model);
      } else if (this.scene) {
        this.scene.remove(this.model);
      }

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

    if (this.orientationPivot && this.scene) {
      this.scene.remove(this.orientationPivot);
    }
    this.orientationPivot = null;
    this.model = null;
    this.mixer = null;
    this.animations.clear();
    this.interactionClips = [];
    this.playableMenuClips = [];
    this.flyDragClips = { takeoff: null, gliding: null, hover: null, landing: null };
    this.pristineModelClips = [];
    this.rawModelClips = [];
    this.curvesClipMap.clear();
    this.stopCurvesActions();
    this.walkDragClips = { walk: null, run: null, idle: null };
    this.walkDragLocomotion = 'walk';
    this.dragWalkActive = false;
    this.clearTakeoffHandoffTimer();
    this.clearIdleReturnSchedule();
    this.idleBlendInProgress = false;
    this.startupPresentationDone = false;
    this.flyLoopIsHovering = false;
    this.dragFlyPhase = 'idle';
    this.modelBaseRotationY = 0;
    this.flyCameraDistance = 0;
    this.resetViewportResizeThrottle();
    this.currentAction = null;
    this.currentAnimation = null;
    this.frozenLookAt = null;
    this.frozenCameraPosition = null;
    this.cameraLocked = false;
    this.baselineCameraDistance = 0;
    this.smoothedCameraDistance = 0;
    this.adaptiveLookAt.set(0, 0, 0);
    this.bindPoseLocks.clear();
    this.bindPoseBoundsMaxDim = 0;
    this.modelBasePosition.set(0, 0, 0);
    this.baseModelScale = 1;
    this.modelScaleFactor = 1;
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