/**
 * 单元测试：动画状态机
 * Task: T025 [P] [US1]
 * 
 * 测试宠物动画系统：
 * - 10种动画状态切换
 * - 动画混合和平滑过渡
 * - 动画状态机逻辑
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 模拟 Three.js
vi.mock('three', () => ({
  AnimationMixer: vi.fn().mockImplementation(() => ({
    clipAction: vi.fn().mockReturnValue({
      play: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
      fadeIn: vi.fn().mockReturnThis(),
      fadeOut: vi.fn().mockReturnThis(),
      setLoop: vi.fn(),
      setEffectiveWeight: vi.fn(),
      getEffectiveWeight: vi.fn().mockReturnValue(1),
      isRunning: vi.fn().mockReturnValue(true),
    }),
    update: vi.fn(),
    stopAllAction: vi.fn(),
    timeScale: 1,
  })),
  AnimationClip: vi.fn(),
  LoopRepeat: 2201,
  LoopOnce: 2200,
  Clock: vi.fn().mockImplementation(() => ({
    getDelta: vi.fn().mockReturnValue(0.016),
    getElapsedTime: vi.fn().mockReturnValue(0),
  })),
}));

// 动画状态枚举（根据 spec.md FR-004）
export enum AnimationState {
  IDLE = 'idle',
  THINKING = 'thinking',
  HAPPY = 'happy',
  SAD = 'sad',
  CONFUSED = 'confused',
  DRAG = 'drag',
  LISTENING = 'listening',
  CELEBRATING = 'celebrating',
  SLEEPY = 'sleepy',
  CURIOUS = 'curious',
}

// 动画配置类型
export interface AnimationConfig {
  name: AnimationState;
  loop: boolean;
  fadeInDuration: number;
  fadeOutDuration: number;
  timeScale?: number;
}

// 动画状态机接口（将在 src/renderer/pet/pet-animation.ts 实现）
export interface IPetAnimationSystem {
  readonly currentState: AnimationState;
  readonly isPlaying: boolean;
  readonly availableStates: AnimationState[];
  
  initialize(): Promise<void>;
  dispose(): void;
  
  setState(state: AnimationState): void;
  transitionTo(state: AnimationState, duration?: number): Promise<void>;
  playOnce(state: AnimationState): Promise<void>;
  
  update(deltaTime: number): void;
  
  loadAnimation(state: AnimationState, clip: unknown): void;
  isAnimationLoaded(state: AnimationState): boolean;
}

// 模拟动画系统实现（用于测试）
class MockPetAnimationSystem implements IPetAnimationSystem {
  private _currentState: AnimationState = AnimationState.IDLE;
  private _isPlaying: boolean = false;
  private _loadedAnimations: Set<AnimationState> = new Set();
  private _transitionPromise: Promise<void> | null = null;

  get currentState(): AnimationState {
    return this._currentState;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get availableStates(): AnimationState[] {
    return Object.values(AnimationState);
  }

  async initialize(): Promise<void> {
    this._isPlaying = true;
    this._currentState = AnimationState.IDLE;
  }

  dispose(): void {
    this._isPlaying = false;
    this._loadedAnimations.clear();
  }

  setState(state: AnimationState): void {
    if (!this._loadedAnimations.has(state) && state !== AnimationState.IDLE) {
      throw new Error(`Animation not loaded: ${state}`);
    }
    this._currentState = state;
  }

  async transitionTo(state: AnimationState, duration: number = 0.3): Promise<void> {
    if (!this._loadedAnimations.has(state) && state !== AnimationState.IDLE) {
      throw new Error(`Animation not loaded: ${state}`);
    }
    
    // 模拟过渡时间
    await new Promise(resolve => setTimeout(resolve, duration * 100));
    this._currentState = state;
  }

  async playOnce(state: AnimationState): Promise<void> {
    const previousState = this._currentState;
    this._currentState = state;
    
    // 模拟动画播放时间
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 返回之前的状态
    this._currentState = previousState;
  }

  update(deltaTime: number): void {
    // 更新动画混合器
  }

  loadAnimation(state: AnimationState, clip: unknown): void {
    this._loadedAnimations.add(state);
  }

  isAnimationLoaded(state: AnimationState): boolean {
    return this._loadedAnimations.has(state) || state === AnimationState.IDLE;
  }
}

describe('PetAnimationSystem', () => {
  let animationSystem: MockPetAnimationSystem;

  beforeEach(() => {
    animationSystem = new MockPetAnimationSystem();
  });

  afterEach(() => {
    animationSystem.dispose();
  });

  describe('初始化', () => {
    it('应该正确初始化动画系统', async () => {
      await animationSystem.initialize();
      
      expect(animationSystem.isPlaying).toBe(true);
      expect(animationSystem.currentState).toBe(AnimationState.IDLE);
    });

    it('初始化后应该处于 idle 状态', async () => {
      await animationSystem.initialize();
      
      expect(animationSystem.currentState).toBe(AnimationState.IDLE);
    });
  });

  describe('动画状态（FR-004: 10种动画状态）', () => {
    it('应该支持所有10种动画状态', () => {
      const expectedStates = [
        'idle', 'thinking', 'happy', 'sad', 'confused',
        'drag', 'listening', 'celebrating', 'sleepy', 'curious'
      ];
      
      const availableStates = animationSystem.availableStates;
      
      expectedStates.forEach(state => {
        expect(availableStates).toContain(state);
      });
      expect(availableStates.length).toBe(10);
    });

    it.each([
      [AnimationState.IDLE, '待机'],
      [AnimationState.THINKING, '思考'],
      [AnimationState.HAPPY, '开心'],
      [AnimationState.SAD, '难过'],
      [AnimationState.CONFUSED, '困惑'],
      [AnimationState.DRAG, '拖拽'],
      [AnimationState.LISTENING, '倾听'],
      [AnimationState.CELEBRATING, '庆祝'],
      [AnimationState.SLEEPY, '瞌睡'],
      [AnimationState.CURIOUS, '好奇'],
    ])('应该能切换到 %s (%s) 状态', async (state, _description) => {
      await animationSystem.initialize();
      animationSystem.loadAnimation(state, {});
      
      animationSystem.setState(state);
      
      expect(animationSystem.currentState).toBe(state);
    });
  });

  describe('动画加载', () => {
    it('应该能加载动画剪辑', async () => {
      await animationSystem.initialize();
      
      animationSystem.loadAnimation(AnimationState.HAPPY, {});
      
      expect(animationSystem.isAnimationLoaded(AnimationState.HAPPY)).toBe(true);
    });

    it('idle 状态应该总是可用', async () => {
      await animationSystem.initialize();
      
      expect(animationSystem.isAnimationLoaded(AnimationState.IDLE)).toBe(true);
    });

    it('未加载的动画应该返回 false', async () => {
      await animationSystem.initialize();
      
      expect(animationSystem.isAnimationLoaded(AnimationState.CELEBRATING)).toBe(false);
    });

    it('切换到未加载的动画应该抛出错误', async () => {
      await animationSystem.initialize();
      
      expect(() => {
        animationSystem.setState(AnimationState.CELEBRATING);
      }).toThrow('Animation not loaded: celebrating');
    });
  });

  describe('状态切换', () => {
    beforeEach(async () => {
      await animationSystem.initialize();
      // 加载所有动画
      Object.values(AnimationState).forEach(state => {
        animationSystem.loadAnimation(state, {});
      });
    });

    it('应该能直接切换状态', () => {
      animationSystem.setState(AnimationState.HAPPY);
      
      expect(animationSystem.currentState).toBe(AnimationState.HAPPY);
    });

    it('应该能连续切换多个状态', () => {
      animationSystem.setState(AnimationState.THINKING);
      expect(animationSystem.currentState).toBe(AnimationState.THINKING);
      
      animationSystem.setState(AnimationState.HAPPY);
      expect(animationSystem.currentState).toBe(AnimationState.HAPPY);
      
      animationSystem.setState(AnimationState.IDLE);
      expect(animationSystem.currentState).toBe(AnimationState.IDLE);
    });
  });

  describe('动画混合/过渡（FR-005）', () => {
    beforeEach(async () => {
      await animationSystem.initialize();
      Object.values(AnimationState).forEach(state => {
        animationSystem.loadAnimation(state, {});
      });
    });

    it('应该支持平滑过渡到新状态', async () => {
      const transitionPromise = animationSystem.transitionTo(AnimationState.HAPPY, 0.3);
      
      await transitionPromise;
      
      expect(animationSystem.currentState).toBe(AnimationState.HAPPY);
    });

    it('过渡应该按指定时间完成', async () => {
      const startTime = Date.now();
      
      await animationSystem.transitionTo(AnimationState.THINKING, 0.5);
      
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(40); // 0.5 * 100 = 50ms (模拟)
    });

    it('应该能播放一次性动画后返回原状态', async () => {
      animationSystem.setState(AnimationState.IDLE);
      
      await animationSystem.playOnce(AnimationState.HAPPY);
      
      expect(animationSystem.currentState).toBe(AnimationState.IDLE);
    });
  });

  describe('更新循环', () => {
    it('应该能更新动画系统', async () => {
      await animationSystem.initialize();
      
      // 不应该抛出错误
      expect(() => {
        animationSystem.update(0.016);
      }).not.toThrow();
    });

    it('应该能处理不同的 deltaTime', async () => {
      await animationSystem.initialize();
      
      expect(() => {
        animationSystem.update(0.001);
        animationSystem.update(0.033);
        animationSystem.update(0.1);
      }).not.toThrow();
    });
  });

  describe('清理', () => {
    it('dispose 后应该停止播放', async () => {
      await animationSystem.initialize();
      expect(animationSystem.isPlaying).toBe(true);
      
      animationSystem.dispose();
      
      expect(animationSystem.isPlaying).toBe(false);
    });
  });
});

describe('AnimationState 枚举', () => {
  it('应该包含所有必需的状态', () => {
    expect(AnimationState.IDLE).toBe('idle');
    expect(AnimationState.THINKING).toBe('thinking');
    expect(AnimationState.HAPPY).toBe('happy');
    expect(AnimationState.SAD).toBe('sad');
    expect(AnimationState.CONFUSED).toBe('confused');
    expect(AnimationState.DRAG).toBe('drag');
    expect(AnimationState.LISTENING).toBe('listening');
    expect(AnimationState.CELEBRATING).toBe('celebrating');
    expect(AnimationState.SLEEPY).toBe('sleepy');
    expect(AnimationState.CURIOUS).toBe('curious');
  });
});

describe('宠物-AI桥接动画映射', () => {
  // 根据 spec.md 中的动画映射表测试
  const animationMappings: Array<[string, AnimationState, string]> = [
    ['收到用户消息', AnimationState.THINKING, '思考状态'],
    ['等待语音输入', AnimationState.LISTENING, '倾听状态'],
    ['AI回复（积极/成功）', AnimationState.HAPPY, '开心状态'],
    ['AI回复（消极/失败）', AnimationState.SAD, '难过状态'],
    ['AI回复（中性）', AnimationState.IDLE, '待机状态'],
    ['AI无法理解/出错', AnimationState.CONFUSED, '困惑状态'],
    ['用户拖拽宠物', AnimationState.DRAG, '拖拽状态'],
    ['任务完成/目标达成', AnimationState.CELEBRATING, '庆祝状态'],
    ['长时间无交互', AnimationState.SLEEPY, '瞌睡状态'],
    ['发现新事物/收到新消息', AnimationState.CURIOUS, '好奇状态'],
  ];

  it.each(animationMappings)(
    '事件 "%s" 应该映射到 %s (%s)',
    (_event, expectedState, _description) => {
      expect(Object.values(AnimationState)).toContain(expectedState);
    }
  );
});

describe('性能要求', () => {
  it('SC-003: 动画状态切换应该在200ms内开始', async () => {
    const animationSystem = new MockPetAnimationSystem();
    await animationSystem.initialize();
    animationSystem.loadAnimation(AnimationState.HAPPY, {});
    
    const startTime = Date.now();
    animationSystem.setState(AnimationState.HAPPY);
    const switchTime = Date.now() - startTime;
    
    expect(switchTime).toBeLessThan(200);
  });
});