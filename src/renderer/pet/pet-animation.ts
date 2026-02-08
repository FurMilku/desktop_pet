/**
 * 骨骼动画系统
 * 提供高级动画控制功能，包括状态机、骨骼操作和动画混合
 * 
 * Task: T032 [US1] 实现骨骼动画系统
 */

import * as THREE from 'three';
import type { AnimationState, IPetRenderer } from './pet-renderer';

// ============================================================
// 类型定义
// ============================================================

/**
 * 骨骼名称常量
 */
export const BoneNames = {
  HEAD: 'head',
  NECK: 'neck',
  SPINE: 'spine',
  LEFT_EYE: 'eye_left',
  RIGHT_EYE: 'eye_right',
  LEFT_EAR: 'ear_left',
  RIGHT_EAR: 'ear_right',
  TAIL: 'tail',
  LEFT_FRONT_LEG: 'leg_front_left',
  RIGHT_FRONT_LEG: 'leg_front_right',
  LEFT_BACK_LEG: 'leg_back_left',
  RIGHT_BACK_LEG: 'leg_back_right',
} as const;

export type BoneName = typeof BoneNames[keyof typeof BoneNames];

/**
 * 骨骼操作类型
 */
export interface BoneOperation {
  /** 骨骼名称 */
  boneName: BoneName;
  /** 旋转 (欧拉角，弧度) */
  rotation?: { x?: number; y?: number; z?: number };
  /** 位置偏移 */
  position?: { x?: number; y?: number; z?: number };
  /** 缩放 */
  scale?: { x?: number; y?: number; z?: number };
  /** 过渡时长 (秒) */
  duration?: number;
  /** 缓动函数 */
  easing?: EasingFunction;
}

/**
 * 缓动函数类型
 */
export type EasingFunction = 
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'bounce'
  | 'elastic';

/**
 * 状态机转换条件
 */
export interface StateTransition {
  /** 源状态 */
  from: AnimationState | '*';
  /** 目标状态 */
  to: AnimationState;
  /** 转换条件 */
  condition?: () => boolean;
  /** 转换优先级 (数字越大优先级越高) */
  priority?: number;
  /** 过渡时长 */
  duration?: number;
}

/**
 * 动画状态配置
 */
export interface AnimationStateConfig {
  /** 状态名称 */
  name: AnimationState;
  /** 进入状态时的回调 */
  onEnter?: () => void;
  /** 退出状态时的回调 */
  onExit?: () => void;
  /** 状态更新回调 (每帧调用) */
  onUpdate?: (deltaTime: number) => void;
  /** 附加的骨骼操作 */
  boneOperations?: BoneOperation[];
}

/**
 * 头部跟踪配置
 */
export interface HeadTrackingConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 目标位置 (世界坐标) */
  target?: THREE.Vector3;
  /** 最大水平旋转角度 (弧度) */
  maxYaw?: number;
  /** 最大垂直旋转角度 (弧度) */
  maxPitch?: number;
  /** 跟踪速度 (0-1) */
  speed?: number;
  /** 平滑度 */
  smoothness?: number;
}

/**
 * 眨眼配置
 */
export interface BlinkConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 最小眨眼间隔 (秒) */
  minInterval?: number;
  /** 最大眨眼间隔 (秒) */
  maxInterval?: number;
  /** 眨眼时长 (秒) */
  blinkDuration?: number;
  /** 双眨眼概率 (0-1) */
  doubleBlinkChance?: number;
}

/**
 * 呼吸动画配置
 */
export interface BreathingConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 呼吸周期 (秒) */
  cycle?: number;
  /** 呼吸幅度 */
  amplitude?: number;
}

/**
 * 尾巴摇摆配置
 */
export interface TailWagConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 摇摆速度 */
  speed?: number;
  /** 摇摆幅度 (弧度) */
  amplitude?: number;
}

/**
 * 动画系统配置
 */
export interface AnimationSystemConfig {
  /** 头部跟踪 */
  headTracking?: HeadTrackingConfig;
  /** 眨眼 */
  blink?: BlinkConfig;
  /** 呼吸 */
  breathing?: BreathingConfig;
  /** 尾巴摇摆 */
  tailWag?: TailWagConfig;
}

/**
 * 动画系统事件
 */
export interface AnimationSystemEvents {
  /** 状态改变 */
  onStateChanged?: (from: AnimationState | null, to: AnimationState) => void;
  /** 眨眼 */
  onBlink?: () => void;
  /** 骨骼操作完成 */
  onBoneOperationComplete?: (boneName: BoneName) => void;
}

/**
 * 骨骼动画系统接口
 */
export interface IAnimationSystem {
  /** 初始化 */
  init(model: THREE.Group): void;
  /** 更新 (每帧调用) */
  update(deltaTime: number): void;
  /** 设置动画状态 */
  setState(state: AnimationState): void;
  /** 获取当前状态 */
  getState(): AnimationState | null;
  /** 添加状态转换规则 */
  addTransition(transition: StateTransition): void;
  /** 移除状态转换规则 */
  removeTransition(from: AnimationState | '*', to: AnimationState): void;
  /** 执行骨骼操作 */
  applyBoneOperation(operation: BoneOperation): void;
  /** 重置骨骼到默认位置 */
  resetBone(boneName: BoneName): void;
  /** 重置所有骨骼 */
  resetAllBones(): void;
  /** 设置头部跟踪目标 */
  setHeadTrackingTarget(target: THREE.Vector3 | null): void;
  /** 触发眨眼 */
  triggerBlink(): void;
  /** 设置配置 */
  setConfig(config: Partial<AnimationSystemConfig>): void;
  /** 获取配置 */
  getConfig(): AnimationSystemConfig;
  /** 销毁 */
  dispose(): void;
}

// ============================================================
// 缓动函数实现
// ============================================================

const EasingFunctions: Record<EasingFunction, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  bounce: (t) => {
    if (t < 1 / 2.75) {
      return 7.5625 * t * t;
    } else if (t < 2 / 2.75) {
      t -= 1.5 / 2.75;
      return 7.5625 * t * t + 0.75;
    } else if (t < 2.5 / 2.75) {
      t -= 2.25 / 2.75;
      return 7.5625 * t * t + 0.9375;
    } else {
      t -= 2.625 / 2.75;
      return 7.5625 * t * t + 0.984375;
    }
  },
  elastic: (t) => {
    if (t === 0 || t === 1) return t;
    const p = 0.3;
    const s = p / 4;
    return Math.pow(2, -10 * t) * Math.sin(((t - s) * (2 * Math.PI)) / p) + 1;
  },
};

// ============================================================
// 骨骼操作动画类
// ============================================================

/**
 * 骨骼操作动画
 */
class BoneAnimation {
  private bone: THREE.Bone;
  private startRotation: THREE.Euler;
  private startPosition: THREE.Vector3;
  private startScale: THREE.Vector3;
  private targetRotation: THREE.Euler;
  private targetPosition: THREE.Vector3;
  private targetScale: THREE.Vector3;
  private duration: number;
  private elapsed: number = 0;
  private easing: EasingFunction;
  private complete: boolean = false;
  private onComplete?: () => void;

  constructor(
    bone: THREE.Bone,
    operation: BoneOperation,
    onComplete?: () => void
  ) {
    this.bone = bone;
    this.duration = operation.duration ?? 0.3;
    this.easing = operation.easing ?? 'easeInOut';
    this.onComplete = onComplete;

    // 保存起始状态
    this.startRotation = bone.rotation.clone();
    this.startPosition = bone.position.clone();
    this.startScale = bone.scale.clone();

    // 计算目标状态
    this.targetRotation = this.startRotation.clone();
    if (operation.rotation) {
      if (operation.rotation.x !== undefined) this.targetRotation.x = operation.rotation.x;
      if (operation.rotation.y !== undefined) this.targetRotation.y = operation.rotation.y;
      if (operation.rotation.z !== undefined) this.targetRotation.z = operation.rotation.z;
    }

    this.targetPosition = this.startPosition.clone();
    if (operation.position) {
      if (operation.position.x !== undefined) this.targetPosition.x += operation.position.x;
      if (operation.position.y !== undefined) this.targetPosition.y += operation.position.y;
      if (operation.position.z !== undefined) this.targetPosition.z += operation.position.z;
    }

    this.targetScale = this.startScale.clone();
    if (operation.scale) {
      if (operation.scale.x !== undefined) this.targetScale.x = operation.scale.x;
      if (operation.scale.y !== undefined) this.targetScale.y = operation.scale.y;
      if (operation.scale.z !== undefined) this.targetScale.z = operation.scale.z;
    }
  }

  update(deltaTime: number): boolean {
    if (this.complete) return true;

    this.elapsed += deltaTime;
    let t = Math.min(this.elapsed / this.duration, 1);
    t = EasingFunctions[this.easing](t);

    // 插值旋转
    this.bone.rotation.x = THREE.MathUtils.lerp(this.startRotation.x, this.targetRotation.x, t);
    this.bone.rotation.y = THREE.MathUtils.lerp(this.startRotation.y, this.targetRotation.y, t);
    this.bone.rotation.z = THREE.MathUtils.lerp(this.startRotation.z, this.targetRotation.z, t);

    // 插值位置
    this.bone.position.lerpVectors(this.startPosition, this.targetPosition, t);

    // 插值缩放
    this.bone.scale.lerpVectors(this.startScale, this.targetScale, t);

    if (this.elapsed >= this.duration) {
      this.complete = true;
      this.onComplete?.();
    }

    return this.complete;
  }

  isComplete(): boolean {
    return this.complete;
  }
}

// ============================================================
// AnimationSystem 实现
// ============================================================

/**
 * 骨骼动画系统
 */
export class AnimationSystem implements IAnimationSystem {
  // 模型和骨骼
  private model: THREE.Group | null = null;
  private bones: Map<BoneName, THREE.Bone> = new Map();
  private defaultBoneStates: Map<BoneName, { rotation: THREE.Euler; position: THREE.Vector3; scale: THREE.Vector3 }> = new Map();

  // 状态机
  private currentState: AnimationState | null = null;
  private stateConfigs: Map<AnimationState, AnimationStateConfig> = new Map();
  private transitions: StateTransition[] = [];

  // 骨骼动画
  private activeBoneAnimations: Map<BoneName, BoneAnimation> = new Map();

  // 配置
  private config: AnimationSystemConfig;
  private events: AnimationSystemEvents;

  // 头部跟踪
  private headTrackingTarget: THREE.Vector3 | null = null;
  private currentHeadRotation: THREE.Euler = new THREE.Euler();

  // 眨眼
  private nextBlinkTime: number = 0;
  private isBlinking: boolean = false;
  private blinkPhase: 'closing' | 'opening' | 'none' = 'none';
  private blinkProgress: number = 0;

  // 呼吸
  private breathingPhase: number = 0;

  // 尾巴摇摆
  private tailWagPhase: number = 0;

  // 关联的渲染器
  private renderer: IPetRenderer | null = null;

  /**
   * 构造函数
   */
  constructor(config?: Partial<AnimationSystemConfig>, events?: AnimationSystemEvents) {
    this.config = {
      headTracking: {
        enabled: true,
        maxYaw: Math.PI / 4,      // 45度
        maxPitch: Math.PI / 6,    // 30度
        speed: 0.1,
        smoothness: 0.9,
        ...config?.headTracking,
      },
      blink: {
        enabled: true,
        minInterval: 2,
        maxInterval: 6,
        blinkDuration: 0.15,
        doubleBlinkChance: 0.2,
        ...config?.blink,
      },
      breathing: {
        enabled: true,
        cycle: 3,
        amplitude: 0.02,
        ...config?.breathing,
      },
      tailWag: {
        enabled: false,  // 默认关闭，特定状态下启用
        speed: 3,
        amplitude: Math.PI / 8,
        ...config?.tailWag,
      },
    };
    this.events = events ?? {};

    // 初始化默认状态配置
    this.initializeDefaultStateConfigs();

    // 设置下一次眨眼时间
    this.scheduleNextBlink();
  }

  /**
   * 初始化默认状态配置
   */
  private initializeDefaultStateConfigs(): void {
    // Idle 状态 - 平静待机
    this.stateConfigs.set('idle', {
      name: 'idle',
      onEnter: () => {
        this.config.tailWag!.enabled = false;
        this.config.breathing!.enabled = true;
      },
    });

    // Happy 状态 - 开心时摇尾巴
    this.stateConfigs.set('happy', {
      name: 'happy',
      onEnter: () => {
        this.config.tailWag!.enabled = true;
        this.config.tailWag!.speed = 5;
        this.config.tailWag!.amplitude = Math.PI / 6;
      },
      onExit: () => {
        this.config.tailWag!.enabled = false;
      },
    });

    // Thinking 状态 - 思考时耳朵微动
    this.stateConfigs.set('thinking', {
      name: 'thinking',
      onEnter: () => {
        this.config.blink!.minInterval = 4;
        this.config.blink!.maxInterval = 8;
      },
      onExit: () => {
        this.config.blink!.minInterval = 2;
        this.config.blink!.maxInterval = 6;
      },
    });

    // Sad 状态 - 难过时头低垂
    this.stateConfigs.set('sad', {
      name: 'sad',
      onEnter: () => {
        this.applyBoneOperation({
          boneName: BoneNames.HEAD,
          rotation: { x: 0.2 },  // 低头
          duration: 0.5,
        });
        this.config.blink!.minInterval = 1;
        this.config.blink!.maxInterval = 3;
      },
      onExit: () => {
        this.resetBone(BoneNames.HEAD);
        this.config.blink!.minInterval = 2;
        this.config.blink!.maxInterval = 6;
      },
    });

    // Confused 状态 - 困惑时歪头
    this.stateConfigs.set('confused', {
      name: 'confused',
      onEnter: () => {
        this.applyBoneOperation({
          boneName: BoneNames.HEAD,
          rotation: { z: 0.3 },  // 歪头
          duration: 0.3,
        });
      },
      onExit: () => {
        this.resetBone(BoneNames.HEAD);
      },
    });

    // Listening 状态 - 倾听时耳朵竖起
    this.stateConfigs.set('listening', {
      name: 'listening',
      onEnter: () => {
        // 耳朵竖起
        this.applyBoneOperation({
          boneName: BoneNames.LEFT_EAR,
          rotation: { x: -0.2 },
          duration: 0.2,
        });
        this.applyBoneOperation({
          boneName: BoneNames.RIGHT_EAR,
          rotation: { x: -0.2 },
          duration: 0.2,
        });
      },
      onExit: () => {
        this.resetBone(BoneNames.LEFT_EAR);
        this.resetBone(BoneNames.RIGHT_EAR);
      },
    });

    // Celebrating 状态 - 庆祝时跳跃
    this.stateConfigs.set('celebrating', {
      name: 'celebrating',
      onEnter: () => {
        this.config.tailWag!.enabled = true;
        this.config.tailWag!.speed = 8;
        this.config.tailWag!.amplitude = Math.PI / 4;
      },
      onExit: () => {
        this.config.tailWag!.enabled = false;
      },
    });

    // Sleepy 状态 - 瞌睡时眼睛半闭
    this.stateConfigs.set('sleepy', {
      name: 'sleepy',
      onEnter: () => {
        this.config.blink!.minInterval = 0.5;
        this.config.blink!.maxInterval = 1.5;
        this.config.blink!.blinkDuration = 0.3;
        this.config.breathing!.cycle = 4;  // 呼吸变慢
      },
      onExit: () => {
        this.config.blink!.minInterval = 2;
        this.config.blink!.maxInterval = 6;
        this.config.blink!.blinkDuration = 0.15;
        this.config.breathing!.cycle = 3;
      },
    });

    // Curious 状态 - 好奇时头前倾
    this.stateConfigs.set('curious', {
      name: 'curious',
      onEnter: () => {
        this.applyBoneOperation({
          boneName: BoneNames.HEAD,
          rotation: { x: -0.15 },  // 抬头前倾
          position: { z: 0.05 },
          duration: 0.3,
        });
        // 耳朵向前
        this.applyBoneOperation({
          boneName: BoneNames.LEFT_EAR,
          rotation: { y: 0.2 },
          duration: 0.3,
        });
        this.applyBoneOperation({
          boneName: BoneNames.RIGHT_EAR,
          rotation: { y: -0.2 },
          duration: 0.3,
        });
      },
      onExit: () => {
        this.resetBone(BoneNames.HEAD);
        this.resetBone(BoneNames.LEFT_EAR);
        this.resetBone(BoneNames.RIGHT_EAR);
      },
    });

    // Drag 状态 - 被拖拽时
    this.stateConfigs.set('drag', {
      name: 'drag',
      onEnter: () => {
        // 禁用头部跟踪
        this.config.headTracking!.enabled = false;
      },
      onExit: () => {
        this.config.headTracking!.enabled = true;
      },
    });
  }

  /**
   * 初始化动画系统
   */
  init(model: THREE.Group): void {
    this.model = model;
    this.bones.clear();
    this.defaultBoneStates.clear();

    console.log('[AnimationSystem] Initializing with model');

    // 查找并缓存所有骨骼
    model.traverse((child) => {
      if (child instanceof THREE.Bone) {
        const boneName = this.matchBoneName(child.name);
        if (boneName) {
          this.bones.set(boneName, child);
          // 保存默认状态
          this.defaultBoneStates.set(boneName, {
            rotation: child.rotation.clone(),
            position: child.position.clone(),
            scale: child.scale.clone(),
          });
          console.log(`[AnimationSystem] Found bone: ${child.name} -> ${boneName}`);
        }
      }
    });

    console.log(`[AnimationSystem] Initialized with ${this.bones.size} bones`);
  }

  /**
   * 匹配骨骼名称
   */
  private matchBoneName(name: string): BoneName | null {
    const lowerName = name.toLowerCase();

    // 头部
    if (lowerName.includes('head') && !lowerName.includes('eye')) {
      return BoneNames.HEAD;
    }
    // 颈部
    if (lowerName.includes('neck')) {
      return BoneNames.NECK;
    }
    // 脊柱
    if (lowerName.includes('spine') || lowerName.includes('body') || lowerName.includes('torso')) {
      return BoneNames.SPINE;
    }
    // 左眼
    if ((lowerName.includes('eye') && lowerName.includes('left')) || lowerName.includes('eye_l') || lowerName.includes('l_eye')) {
      return BoneNames.LEFT_EYE;
    }
    // 右眼
    if ((lowerName.includes('eye') && lowerName.includes('right')) || lowerName.includes('eye_r') || lowerName.includes('r_eye')) {
      return BoneNames.RIGHT_EYE;
    }
    // 左耳
    if ((lowerName.includes('ear') && lowerName.includes('left')) || lowerName.includes('ear_l') || lowerName.includes('l_ear')) {
      return BoneNames.LEFT_EAR;
    }
    // 右耳
    if ((lowerName.includes('ear') && lowerName.includes('right')) || lowerName.includes('ear_r') || lowerName.includes('r_ear')) {
      return BoneNames.RIGHT_EAR;
    }
    // 尾巴
    if (lowerName.includes('tail')) {
      return BoneNames.TAIL;
    }
    // 左前腿
    if ((lowerName.includes('front') && lowerName.includes('left') && lowerName.includes('leg')) ||
        (lowerName.includes('arm') && lowerName.includes('left'))) {
      return BoneNames.LEFT_FRONT_LEG;
    }
    // 右前腿
    if ((lowerName.includes('front') && lowerName.includes('right') && lowerName.includes('leg')) ||
        (lowerName.includes('arm') && lowerName.includes('right'))) {
      return BoneNames.RIGHT_FRONT_LEG;
    }
    // 左后腿
    if ((lowerName.includes('back') && lowerName.includes('left') && lowerName.includes('leg')) ||
        (lowerName.includes('leg') && lowerName.includes('left') && !lowerName.includes('front'))) {
      return BoneNames.LEFT_BACK_LEG;
    }
    // 右后腿
    if ((lowerName.includes('back') && lowerName.includes('right') && lowerName.includes('leg')) ||
        (lowerName.includes('leg') && lowerName.includes('right') && !lowerName.includes('front'))) {
      return BoneNames.RIGHT_BACK_LEG;
    }

    return null;
  }

  /**
   * 关联渲染器
   */
  setRenderer(renderer: IPetRenderer): void {
    this.renderer = renderer;
  }

  /**
   * 更新动画系统
   */
  update(deltaTime: number): void {
    if (!this.model) return;

    // 更新骨骼动画
    for (const [boneName, animation] of this.activeBoneAnimations.entries()) {
      if (animation.update(deltaTime)) {
        this.activeBoneAnimations.delete(boneName);
        this.events.onBoneOperationComplete?.(boneName);
      }
    }

    // 更新头部跟踪
    if (this.config.headTracking?.enabled) {
      this.updateHeadTracking(deltaTime);
    }

    // 更新眨眼
    if (this.config.blink?.enabled) {
      this.updateBlink(deltaTime);
    }

    // 更新呼吸
    if (this.config.breathing?.enabled) {
      this.updateBreathing(deltaTime);
    }

    // 更新尾巴摇摆
    if (this.config.tailWag?.enabled) {
      this.updateTailWag(deltaTime);
    }

    // 更新状态机
    this.updateStateMachine(deltaTime);

    // 调用状态更新回调
    if (this.currentState) {
      const stateConfig = this.stateConfigs.get(this.currentState);
      stateConfig?.onUpdate?.(deltaTime);
    }
  }

  /**
   * 更新头部跟踪
   */
  private updateHeadTracking(deltaTime: number): void {
    const headBone = this.bones.get(BoneNames.HEAD);
    if (!headBone || !this.headTrackingTarget) return;

    const config = this.config.headTracking!;
    
    // 计算目标方向
    const headPosition = new THREE.Vector3();
    headBone.getWorldPosition(headPosition);
    
    const direction = new THREE.Vector3()
      .subVectors(this.headTrackingTarget, headPosition)
      .normalize();

    // 计算目标旋转角度
    const targetYaw = Math.atan2(direction.x, direction.z);
    const targetPitch = Math.asin(-direction.y);

    // 限制角度范围
    const clampedYaw = THREE.MathUtils.clamp(targetYaw, -config.maxYaw!, config.maxYaw!);
    const clampedPitch = THREE.MathUtils.clamp(targetPitch, -config.maxPitch!, config.maxPitch!);

    // 平滑插值
    const smoothness = config.smoothness!;
    this.currentHeadRotation.y = THREE.MathUtils.lerp(
      this.currentHeadRotation.y,
      clampedYaw,
      1 - Math.pow(smoothness, deltaTime * 60)
    );
    this.currentHeadRotation.x = THREE.MathUtils.lerp(
      this.currentHeadRotation.x,
      clampedPitch,
      1 - Math.pow(smoothness, deltaTime * 60)
    );

    // 应用旋转 (叠加到默认状态)
    const defaultState = this.defaultBoneStates.get(BoneNames.HEAD);
    if (defaultState) {
      headBone.rotation.x = defaultState.rotation.x + this.currentHeadRotation.x;
      headBone.rotation.y = defaultState.rotation.y + this.currentHeadRotation.y;
    }
  }

  /**
   * 更新眨眼
   */
  private updateBlink(deltaTime: number): void {
    const config = this.config.blink!;
    const leftEye = this.bones.get(BoneNames.LEFT_EYE);
    const rightEye = this.bones.get(BoneNames.RIGHT_EYE);

    // 检查是否到眨眼时间
    if (!this.isBlinking && Date.now() >= this.nextBlinkTime) {
      this.startBlink();
    }

    // 更新眨眼动画
    if (this.isBlinking) {
      this.blinkProgress += deltaTime / config.blinkDuration!;

      let scale = 1;
      if (this.blinkPhase === 'closing') {
        scale = 1 - this.blinkProgress;
        if (this.blinkProgress >= 1) {
          this.blinkPhase = 'opening';
          this.blinkProgress = 0;
        }
      } else if (this.blinkPhase === 'opening') {
        scale = this.blinkProgress;
        if (this.blinkProgress >= 1) {
          this.endBlink();
        }
      }

      // 应用眼睛缩放
      scale = Math.max(0.1, scale);
      if (leftEye) leftEye.scale.y = scale;
      if (rightEye) rightEye.scale.y = scale;
    }
  }

  /**
   * 开始眨眼
   */
  private startBlink(): void {
    this.isBlinking = true;
    this.blinkPhase = 'closing';
    this.blinkProgress = 0;
    this.events.onBlink?.();
  }

  /**
   * 结束眨眼
   */
  private endBlink(): void {
    this.isBlinking = false;
    this.blinkPhase = 'none';
    this.blinkProgress = 0;

    // 恢复眼睛缩放
    const leftEye = this.bones.get(BoneNames.LEFT_EYE);
    const rightEye = this.bones.get(BoneNames.RIGHT_EYE);
    if (leftEye) leftEye.scale.y = 1;
    if (rightEye) rightEye.scale.y = 1;

    // 双眨眼检查
    const config = this.config.blink!;
    if (Math.random() < config.doubleBlinkChance!) {
      setTimeout(() => this.startBlink(), 100);
    } else {
      this.scheduleNextBlink();
    }
  }

  /**
   * 安排下一次眨眼
   */
  private scheduleNextBlink(): void {
    const config = this.config.blink!;
    const interval = config.minInterval! + Math.random() * (config.maxInterval! - config.minInterval!);
    this.nextBlinkTime = Date.now() + interval * 1000;
  }

  /**
   * 触发眨眼
   */
  triggerBlink(): void {
    if (!this.isBlinking) {
      this.startBlink();
    }
  }

  /**
   * 更新呼吸动画
   */
  private updateBreathing(deltaTime: number): void {
    const spine = this.bones.get(BoneNames.SPINE);
    if (!spine) return;

    const config = this.config.breathing!;
    this.breathingPhase += (deltaTime / config.cycle!) * Math.PI * 2;
    if (this.breathingPhase > Math.PI * 2) {
      this.breathingPhase -= Math.PI * 2;
    }

    // 呼吸缩放效果
    const breathScale = 1 + Math.sin(this.breathingPhase) * config.amplitude!;
    
    const defaultState = this.defaultBoneStates.get(BoneNames.SPINE);
    if (defaultState) {
      spine.scale.y = defaultState.scale.y * breathScale;
    }
  }

  /**
   * 更新尾巴摇摆
   */
  private updateTailWag(deltaTime: number): void {
    const tail = this.bones.get(BoneNames.TAIL);
    if (!tail) return;

    const config = this.config.tailWag!;
    this.tailWagPhase += deltaTime * config.speed!;
    if (this.tailWagPhase > Math.PI * 2) {
      this.tailWagPhase -= Math.PI * 2;
    }

    // 尾巴摇摆
    const wagAngle = Math.sin(this.tailWagPhase) * config.amplitude!;
    
    const defaultState = this.defaultBoneStates.get(BoneNames.TAIL);
    if (defaultState) {
      tail.rotation.z = defaultState.rotation.z + wagAngle;
    }
  }

  /**
   * 更新状态机
   */
  private updateStateMachine(deltaTime: number): void {
    // 检查状态转换
    for (const transition of this.transitions) {
      if (
        (transition.from === '*' || transition.from === this.currentState) &&
        transition.to !== this.currentState &&
        (!transition.condition || transition.condition())
      ) {
        this.setState(transition.to);
        break;
      }
    }
  }

  /**
   * 设置动画状态
   */
  setState(state: AnimationState): void {
    if (state === this.currentState) return;

    const previousState = this.currentState;

    // 调用退出回调
    if (previousState) {
      const previousConfig = this.stateConfigs.get(previousState);
      previousConfig?.onExit?.();
    }

    this.currentState = state;

    // 调用进入回调
    const newConfig = this.stateConfigs.get(state);
    newConfig?.onEnter?.();

    // 应用骨骼操作
    if (newConfig?.boneOperations) {
      for (const operation of newConfig.boneOperations) {
        this.applyBoneOperation(operation);
      }
    }

    // 同步渲染器动画
    if (this.renderer) {
      this.renderer.setAnimation(state);
    }

    // 触发事件
    this.events.onStateChanged?.(previousState, state);

    console.log(`[AnimationSystem] State changed: ${previousState || 'none'} -> ${state}`);
  }

  /**
   * 获取当前状态
   */
  getState(): AnimationState | null {
    return this.currentState;
  }

  /**
   * 添加状态转换规则
   */
  addTransition(transition: StateTransition): void {
    // 按优先级排序插入
    const priority = transition.priority ?? 0;
    let insertIndex = this.transitions.length;
    
    for (let i = 0; i < this.transitions.length; i++) {
      if ((this.transitions[i].priority ?? 0) < priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.transitions.splice(insertIndex, 0, transition);
  }

  /**
   * 移除状态转换规则
   */
  removeTransition(from: AnimationState | '*', to: AnimationState): void {
    this.transitions = this.transitions.filter(
      t => !(t.from === from && t.to === to)
    );
  }

  /**
   * 执行骨骼操作
   */
  applyBoneOperation(operation: BoneOperation): void {
    const bone = this.bones.get(operation.boneName);
    if (!bone) {
      console.warn(`[AnimationSystem] Bone not found: ${operation.boneName}`);
      return;
    }

    // 取消现有动画
    this.activeBoneAnimations.delete(operation.boneName);

    // 创建新动画
    const animation = new BoneAnimation(bone, operation, () => {
      this.events.onBoneOperationComplete?.(operation.boneName);
    });

    this.activeBoneAnimations.set(operation.boneName, animation);
  }

  /**
   * 重置骨骼到默认位置
   */
  resetBone(boneName: BoneName): void {
    const bone = this.bones.get(boneName);
    const defaultState = this.defaultBoneStates.get(boneName);
    
    if (!bone || !defaultState) return;

    // 取消现有动画
    this.activeBoneAnimations.delete(boneName);

    // 创建重置动画
    this.applyBoneOperation({
      boneName,
      rotation: {
        x: defaultState.rotation.x,
        y: defaultState.rotation.y,
        z: defaultState.rotation.z,
      },
      duration: 0.3,
    });
  }

  /**
   * 重置所有骨骼
   */
  resetAllBones(): void {
    for (const boneName of this.bones.keys()) {
      this.resetBone(boneName);
    }
  }

  /**
   * 设置头部跟踪目标
   */
  setHeadTrackingTarget(target: THREE.Vector3 | null): void {
    this.headTrackingTarget = target;
    
    if (!target) {
      // 重置头部旋转
      this.currentHeadRotation.set(0, 0, 0);
      const headBone = this.bones.get(BoneNames.HEAD);
      const defaultState = this.defaultBoneStates.get(BoneNames.HEAD);
      if (headBone && defaultState) {
        headBone.rotation.copy(defaultState.rotation);
      }
    }
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<AnimationSystemConfig>): void {
    if (config.headTracking) {
      Object.assign(this.config.headTracking!, config.headTracking);
    }
    if (config.blink) {
      Object.assign(this.config.blink!, config.blink);
    }
    if (config.breathing) {
      Object.assign(this.config.breathing!, config.breathing);
    }
    if (config.tailWag) {
      Object.assign(this.config.tailWag!, config.tailWag);
    }
  }

  /**
   * 获取配置
   */
  getConfig(): AnimationSystemConfig {
    return { ...this.config };
  }

  /**
   * 销毁动画系统
   */
  dispose(): void {
    console.log('[AnimationSystem] Disposing...');

    // 清除所有动画
    this.activeBoneAnimations.clear();

    // 重置所有骨骼
    for (const [boneName, bone] of this.bones.entries()) {
      const defaultState = this.defaultBoneStates.get(boneName);
      if (defaultState) {
        bone.rotation.copy(defaultState.rotation);
        bone.position.copy(defaultState.position);
        bone.scale.copy(defaultState.scale);
      }
    }

    // 清除引用
    this.model = null;
    this.bones.clear();
    this.defaultBoneStates.clear();
    this.stateConfigs.clear();
    this.transitions = [];
    this.renderer = null;

    console.log('[AnimationSystem] Disposed');
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建动画系统实例
 */
export function createAnimationSystem(
  config?: Partial<AnimationSystemConfig>,
  events?: AnimationSystemEvents
): IAnimationSystem {
  return new AnimationSystem(config, events);
}

// ============================================================
// 导出
// ============================================================

export default AnimationSystem;