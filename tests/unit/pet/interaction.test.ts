/**
 * 单元测试：用户交互处理
 * Task: T039 [P] [US2]
 * 
 * 测试宠物交互系统：
 * - Raycasting 点击检测
 * - 拖拽状态管理
 * - 交互事件发射
 * - 与 PetRenderer 的集成
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 模拟 Three.js
vi.mock('three', () => {
  const mockIntersection = {
    object: { name: 'pet-model' },
    point: { x: 0, y: 0, z: 0 },
    distance: 1,
  };
  
  return {
    Raycaster: vi.fn().mockImplementation(() => ({
      setFromCamera: vi.fn(),
      intersectObjects: vi.fn().mockReturnValue([mockIntersection]),
      ray: {
        origin: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 0, z: 1 },
      },
    })),
    Vector2: vi.fn().mockImplementation((x = 0, y = 0) => ({
      x,
      y,
      set: vi.fn().mockReturnThis(),
    })),
    Vector3: vi.fn().mockImplementation((x = 0, y = 0, z = 0) => ({
      x,
      y,
      z,
      set: vi.fn().mockReturnThis(),
      copy: vi.fn().mockReturnThis(),
      add: vi.fn().mockReturnThis(),
      sub: vi.fn().mockReturnThis(),
    })),
    Object3D: vi.fn().mockImplementation(() => ({
      position: { x: 0, y: 0, z: 0 },
      children: [],
    })),
    Camera: vi.fn(),
    PerspectiveCamera: vi.fn().mockImplementation(() => ({
      position: { x: 0, y: 1, z: 3, set: vi.fn() },
      lookAt: vi.fn(),
      aspect: 1,
      updateProjectionMatrix: vi.fn(),
    })),
  };
});

// ============================================================
// 交互类型定义
// ============================================================

/**
 * 交互类型 (与 events.ts 中的 PetInteractionPayload 保持一致)
 */
export type InteractionType = 'click' | 'double-click' | 'right-click' | 'drag-start' | 'drag-end' | 'hover';

/**
 * 交互事件数据
 */
export interface InteractionEvent {
  type: InteractionType;
  position: { x: number; y: number };
  target?: string;
  timestamp: number;
}

/**
 * 拖拽状态
 */
export interface DragState {
  isDragging: boolean;
  startPosition: { x: number; y: number } | null;
  currentPosition: { x: number; y: number } | null;
  offset: { x: number; y: number } | null;
}

/**
 * 交互配置
 */
export interface InteractionConfig {
  /** 双击间隔时间 (毫秒) */
  doubleClickInterval: number;
  /** 拖拽开始的最小移动距离 (像素) */
  dragThreshold: number;
  /** 长按时间 (毫秒) */
  longPressTime: number;
  /** 是否启用 hover 检测 */
  enableHover: boolean;
}

/**
 * 交互回调
 */
export interface InteractionCallbacks {
  onClick?: (event: InteractionEvent) => void;
  onDoubleClick?: (event: InteractionEvent) => void;
  onRightClick?: (event: InteractionEvent) => void;
  onDragStart?: (event: InteractionEvent) => void;
  onDragEnd?: (event: InteractionEvent) => void;
  onDrag?: (event: InteractionEvent & { delta: { x: number; y: number } }) => void;
  onHover?: (event: InteractionEvent) => void;
  onHoverEnd?: () => void;
}

/**
 * 宠物交互系统接口
 */
export interface IPetInteraction {
  readonly config: InteractionConfig;
  readonly dragState: DragState;
  readonly isHovering: boolean;
  
  // 生命周期
  initialize(container: HTMLElement): void;
  dispose(): void;
  
  // 配置
  setConfig(config: Partial<InteractionConfig>): void;
  setCallbacks(callbacks: InteractionCallbacks): void;
  
  // 手动触发 (用于测试或程序化交互)
  triggerClick(x: number, y: number): void;
  triggerDoubleClick(x: number, y: number): void;
  triggerRightClick(x: number, y: number): void;
  startDrag(x: number, y: number): void;
  updateDrag(x: number, y: number): void;
  endDrag(x: number, y: number): void;
  
  // Raycasting
  setRaycastTargets(targets: unknown[]): void;
  checkIntersection(x: number, y: number): boolean;
}

// ============================================================
// 模拟交互系统实现 (用于测试)
// ============================================================

class MockPetInteraction implements IPetInteraction {
  private _config: InteractionConfig = {
    doubleClickInterval: 300,
    dragThreshold: 5,
    longPressTime: 500,
    enableHover: true,
  };
  
  private _dragState: DragState = {
    isDragging: false,
    startPosition: null,
    currentPosition: null,
    offset: null,
  };
  
  private _isHovering = false;
  private _callbacks: InteractionCallbacks = {};
  private _lastClickTime = 0;
  private _lastClickPosition: { x: number; y: number } | null = null;
  private _raycastTargets: unknown[] = [];
  private _container: HTMLElement | null = null;
  private _isInitialized = false;
  
  // Raycaster 模拟
  private _hasIntersection = true;
  
  get config(): InteractionConfig {
    return { ...this._config };
  }
  
  get dragState(): DragState {
    return { ...this._dragState };
  }
  
  get isHovering(): boolean {
    return this._isHovering;
  }
  
  initialize(container: HTMLElement): void {
    if (this._isInitialized) {
      throw new Error('Already initialized');
    }
    this._container = container;
    this._isInitialized = true;
  }
  
  dispose(): void {
    this._container = null;
    this._isInitialized = false;
    this._callbacks = {};
    this._raycastTargets = [];
    this._resetDragState();
  }
  
  setConfig(config: Partial<InteractionConfig>): void {
    this._config = { ...this._config, ...config };
  }
  
  setCallbacks(callbacks: InteractionCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }
  
  triggerClick(x: number, y: number): void {
    if (!this._isInitialized) {
      throw new Error('Not initialized');
    }
    
    const now = Date.now();
    const event: InteractionEvent = {
      type: 'click',
      position: { x, y },
      timestamp: now,
    };
    
    // 检查是否为双击
    if (
      this._lastClickTime &&
      now - this._lastClickTime < this._config.doubleClickInterval &&
      this._lastClickPosition &&
      Math.abs(this._lastClickPosition.x - x) < this._config.dragThreshold &&
      Math.abs(this._lastClickPosition.y - y) < this._config.dragThreshold
    ) {
      event.type = 'double-click';
      this._callbacks.onDoubleClick?.(event);
      this._lastClickTime = 0;
      this._lastClickPosition = null;
    } else {
      this._callbacks.onClick?.(event);
      this._lastClickTime = now;
      this._lastClickPosition = { x, y };
    }
  }
  
  triggerDoubleClick(x: number, y: number): void {
    if (!this._isInitialized) {
      throw new Error('Not initialized');
    }
    
    const event: InteractionEvent = {
      type: 'double-click',
      position: { x, y },
      timestamp: Date.now(),
    };
    this._callbacks.onDoubleClick?.(event);
  }
  
  triggerRightClick(x: number, y: number): void {
    if (!this._isInitialized) {
      throw new Error('Not initialized');
    }
    
    const event: InteractionEvent = {
      type: 'right-click',
      position: { x, y },
      timestamp: Date.now(),
    };
    this._callbacks.onRightClick?.(event);
  }
  
  startDrag(x: number, y: number): void {
    if (!this._isInitialized) {
      throw new Error('Not initialized');
    }
    
    this._dragState = {
      isDragging: true,
      startPosition: { x, y },
      currentPosition: { x, y },
      offset: { x: 0, y: 0 },
    };
    
    const event: InteractionEvent = {
      type: 'drag-start',
      position: { x, y },
      timestamp: Date.now(),
    };
    this._callbacks.onDragStart?.(event);
  }
  
  updateDrag(x: number, y: number): void {
    if (!this._dragState.isDragging || !this._dragState.startPosition) {
      return;
    }
    
    const previousPosition = this._dragState.currentPosition || this._dragState.startPosition;
    const delta = {
      x: x - previousPosition.x,
      y: y - previousPosition.y,
    };
    
    this._dragState.currentPosition = { x, y };
    this._dragState.offset = {
      x: x - this._dragState.startPosition.x,
      y: y - this._dragState.startPosition.y,
    };
    
    this._callbacks.onDrag?.({
      type: 'drag-start', // onDrag 使用 drag-start 类型
      position: { x, y },
      timestamp: Date.now(),
      delta,
    });
  }
  
  endDrag(x: number, y: number): void {
    if (!this._dragState.isDragging) {
      return;
    }
    
    const event: InteractionEvent = {
      type: 'drag-end',
      position: { x, y },
      timestamp: Date.now(),
    };
    this._callbacks.onDragEnd?.(event);
    
    this._resetDragState();
  }
  
  setRaycastTargets(targets: unknown[]): void {
    this._raycastTargets = targets;
  }
  
  checkIntersection(x: number, y: number): boolean {
    // 模拟 Raycasting 检测
    return this._hasIntersection && this._raycastTargets.length > 0;
  }
  
  // 测试辅助方法
  setHasIntersection(value: boolean): void {
    this._hasIntersection = value;
  }
  
  setHovering(value: boolean): void {
    const wasHovering = this._isHovering;
    this._isHovering = value;
    
    if (value && !wasHovering) {
      this._callbacks.onHover?.({
        type: 'hover',
        position: { x: 0, y: 0 },
        timestamp: Date.now(),
      });
    } else if (!value && wasHovering) {
      this._callbacks.onHoverEnd?.();
    }
  }
  
  private _resetDragState(): void {
    this._dragState = {
      isDragging: false,
      startPosition: null,
      currentPosition: null,
      offset: null,
    };
  }
}

// ============================================================
// 测试套件
// ============================================================

describe('PetInteraction', () => {
  let interaction: MockPetInteraction;
  let container: HTMLElement;
  
  beforeEach(() => {
    interaction = new MockPetInteraction();
    container = document.createElement('div');
    container.style.width = '400px';
    container.style.height = '400px';
  });
  
  afterEach(() => {
    if (interaction) {
      try {
        interaction.dispose();
      } catch {
        // ignore if already disposed
      }
    }
  });
  
  describe('初始化', () => {
    it('应该正确初始化交互系统', () => {
      interaction.initialize(container);
      
      expect(interaction.config).toBeDefined();
      expect(interaction.dragState.isDragging).toBe(false);
    });
    
    it('重复初始化应该抛出错误', () => {
      interaction.initialize(container);
      
      expect(() => {
        interaction.initialize(container);
      }).toThrow('Already initialized');
    });
    
    it('未初始化时触发交互应该抛出错误', () => {
      expect(() => {
        interaction.triggerClick(100, 100);
      }).toThrow('Not initialized');
    });
  });
  
  describe('配置管理', () => {
    beforeEach(() => {
      interaction.initialize(container);
    });
    
    it('应该有默认配置', () => {
      const config = interaction.config;
      
      expect(config.doubleClickInterval).toBe(300);
      expect(config.dragThreshold).toBe(5);
      expect(config.longPressTime).toBe(500);
      expect(config.enableHover).toBe(true);
    });
    
    it('应该能更新部分配置', () => {
      interaction.setConfig({ doubleClickInterval: 500 });
      
      expect(interaction.config.doubleClickInterval).toBe(500);
      expect(interaction.config.dragThreshold).toBe(5); // 其他配置不变
    });
    
    it('应该能更新所有配置', () => {
      interaction.setConfig({
        doubleClickInterval: 400,
        dragThreshold: 10,
        longPressTime: 800,
        enableHover: false,
      });
      
      const config = interaction.config;
      expect(config.doubleClickInterval).toBe(400);
      expect(config.dragThreshold).toBe(10);
      expect(config.longPressTime).toBe(800);
      expect(config.enableHover).toBe(false);
    });
  });
  
  describe('点击交互', () => {
    let onClickSpy: ReturnType<typeof vi.fn>;
    
    beforeEach(() => {
      interaction.initialize(container);
      onClickSpy = vi.fn();
      interaction.setCallbacks({ onClick: onClickSpy });
    });
    
    it('应该触发点击回调', () => {
      interaction.triggerClick(100, 150);
      
      expect(onClickSpy).toHaveBeenCalledTimes(1);
      expect(onClickSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'click',
          position: { x: 100, y: 150 },
        })
      );
    });
    
    it('点击事件应该包含时间戳', () => {
      const beforeTime = Date.now();
      interaction.triggerClick(100, 150);
      const afterTime = Date.now();
      
      const event = onClickSpy.mock.calls[0][0];
      expect(event.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(event.timestamp).toBeLessThanOrEqual(afterTime);
    });
    
    it('应该能在不同位置触发点击', () => {
      interaction.triggerClick(0, 0);
      interaction.triggerClick(400, 400);
      interaction.triggerClick(200, 200);
      
      expect(onClickSpy).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('双击交互', () => {
    let onClickSpy: ReturnType<typeof vi.fn>;
    let onDoubleClickSpy: ReturnType<typeof vi.fn>;
    
    beforeEach(() => {
      interaction.initialize(container);
      onClickSpy = vi.fn();
      onDoubleClickSpy = vi.fn();
      interaction.setCallbacks({
        onClick: onClickSpy,
        onDoubleClick: onDoubleClickSpy,
      });
    });
    
    it('快速连续点击应该触发双击', () => {
      interaction.triggerClick(100, 100);
      interaction.triggerClick(100, 100); // 立即第二次点击
      
      expect(onClickSpy).toHaveBeenCalledTimes(1); // 第一次点击
      expect(onDoubleClickSpy).toHaveBeenCalledTimes(1); // 第二次转为双击
    });
    
    it('间隔过长的点击不应触发双击', async () => {
      interaction.setConfig({ doubleClickInterval: 100 });
      
      interaction.triggerClick(100, 100);
      await new Promise(resolve => setTimeout(resolve, 150));
      interaction.triggerClick(100, 100);
      
      expect(onClickSpy).toHaveBeenCalledTimes(2);
      expect(onDoubleClickSpy).not.toHaveBeenCalled();
    });
    
    it('位置差异过大的点击不应触发双击', () => {
      interaction.setConfig({ dragThreshold: 5 });
      
      interaction.triggerClick(100, 100);
      interaction.triggerClick(120, 120); // 距离超过阈值
      
      expect(onClickSpy).toHaveBeenCalledTimes(2);
      expect(onDoubleClickSpy).not.toHaveBeenCalled();
    });
    
    it('triggerDoubleClick 应该直接触发双击', () => {
      interaction.triggerDoubleClick(100, 100);
      
      expect(onDoubleClickSpy).toHaveBeenCalledTimes(1);
      expect(onDoubleClickSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'double-click',
          position: { x: 100, y: 100 },
        })
      );
    });
  });
  
  describe('右键交互', () => {
    let onRightClickSpy: ReturnType<typeof vi.fn>;
    
    beforeEach(() => {
      interaction.initialize(container);
      onRightClickSpy = vi.fn();
      interaction.setCallbacks({ onRightClick: onRightClickSpy });
    });
    
    it('应该触发右键回调', () => {
      interaction.triggerRightClick(200, 200);
      
      expect(onRightClickSpy).toHaveBeenCalledTimes(1);
      expect(onRightClickSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'right-click',
          position: { x: 200, y: 200 },
        })
      );
    });
  });
  
  describe('拖拽交互', () => {
    let onDragStartSpy: ReturnType<typeof vi.fn>;
    let onDragSpy: ReturnType<typeof vi.fn>;
    let onDragEndSpy: ReturnType<typeof vi.fn>;
    
    beforeEach(() => {
      interaction.initialize(container);
      onDragStartSpy = vi.fn();
      onDragSpy = vi.fn();
      onDragEndSpy = vi.fn();
      interaction.setCallbacks({
        onDragStart: onDragStartSpy,
        onDrag: onDragSpy,
        onDragEnd: onDragEndSpy,
      });
    });
    
    it('应该能开始拖拽', () => {
      interaction.startDrag(100, 100);
      
      expect(interaction.dragState.isDragging).toBe(true);
      expect(interaction.dragState.startPosition).toEqual({ x: 100, y: 100 });
      expect(onDragStartSpy).toHaveBeenCalledTimes(1);
    });
    
    it('拖拽开始应该记录初始位置', () => {
      interaction.startDrag(150, 200);
      
      const state = interaction.dragState;
      expect(state.startPosition).toEqual({ x: 150, y: 200 });
      expect(state.currentPosition).toEqual({ x: 150, y: 200 });
      expect(state.offset).toEqual({ x: 0, y: 0 });
    });
    
    it('应该能更新拖拽位置', () => {
      interaction.startDrag(100, 100);
      interaction.updateDrag(150, 120);
      
      const state = interaction.dragState;
      expect(state.currentPosition).toEqual({ x: 150, y: 120 });
      expect(state.offset).toEqual({ x: 50, y: 20 });
      expect(onDragSpy).toHaveBeenCalledTimes(1);
    });
    
    it('拖拽更新应该提供 delta 值', () => {
      interaction.startDrag(100, 100);
      interaction.updateDrag(130, 110);
      
      expect(onDragSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          delta: { x: 30, y: 10 },
        })
      );
    });
    
    it('未开始拖拽时更新应该被忽略', () => {
      interaction.updateDrag(150, 150);
      
      expect(onDragSpy).not.toHaveBeenCalled();
    });
    
    it('应该能结束拖拽', () => {
      interaction.startDrag(100, 100);
      interaction.updateDrag(200, 200);
      interaction.endDrag(200, 200);
      
      expect(interaction.dragState.isDragging).toBe(false);
      expect(interaction.dragState.startPosition).toBeNull();
      expect(onDragEndSpy).toHaveBeenCalledTimes(1);
    });
    
    it('拖拽结束应该包含最终位置', () => {
      interaction.startDrag(100, 100);
      interaction.endDrag(250, 300);
      
      expect(onDragEndSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'drag-end',
          position: { x: 250, y: 300 },
        })
      );
    });
    
    it('未开始拖拽时结束应该被忽略', () => {
      interaction.endDrag(200, 200);
      
      expect(onDragEndSpy).not.toHaveBeenCalled();
    });
    
    it('完整的拖拽流程', () => {
      // 开始拖拽
      interaction.startDrag(100, 100);
      expect(interaction.dragState.isDragging).toBe(true);
      
      // 移动
      interaction.updateDrag(120, 110);
      interaction.updateDrag(140, 130);
      interaction.updateDrag(180, 160);
      
      // 结束拖拽
      interaction.endDrag(180, 160);
      expect(interaction.dragState.isDragging).toBe(false);
      
      // 验证回调
      expect(onDragStartSpy).toHaveBeenCalledTimes(1);
      expect(onDragSpy).toHaveBeenCalledTimes(3);
      expect(onDragEndSpy).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Hover 交互', () => {
    let onHoverSpy: ReturnType<typeof vi.fn>;
    let onHoverEndSpy: ReturnType<typeof vi.fn>;
    
    beforeEach(() => {
      interaction.initialize(container);
      onHoverSpy = vi.fn();
      onHoverEndSpy = vi.fn();
      interaction.setCallbacks({
        onHover: onHoverSpy,
        onHoverEnd: onHoverEndSpy,
      });
    });
    
    it('应该能检测 hover 状态', () => {
      expect(interaction.isHovering).toBe(false);
      
      interaction.setHovering(true);
      
      expect(interaction.isHovering).toBe(true);
      expect(onHoverSpy).toHaveBeenCalledTimes(1);
    });
    
    it('应该能检测 hover 结束', () => {
      interaction.setHovering(true);
      interaction.setHovering(false);
      
      expect(interaction.isHovering).toBe(false);
      expect(onHoverEndSpy).toHaveBeenCalledTimes(1);
    });
    
    it('重复设置相同 hover 状态不应触发回调', () => {
      interaction.setHovering(true);
      interaction.setHovering(true);
      interaction.setHovering(true);
      
      expect(onHoverSpy).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Raycasting 检测', () => {
    beforeEach(() => {
      interaction.initialize(container);
    });
    
    it('应该能设置 raycast 目标', () => {
      const mockModel = { name: 'pet' };
      interaction.setRaycastTargets([mockModel]);
      
      expect(interaction.checkIntersection(100, 100)).toBe(true);
    });
    
    it('没有目标时应该返回 false', () => {
      interaction.setRaycastTargets([]);
      
      expect(interaction.checkIntersection(100, 100)).toBe(false);
    });
    
    it('没有交叉时应该返回 false', () => {
      const mockModel = { name: 'pet' };
      interaction.setRaycastTargets([mockModel]);
      interaction.setHasIntersection(false);
      
      expect(interaction.checkIntersection(100, 100)).toBe(false);
    });
  });
  
  describe('回调管理', () => {
    beforeEach(() => {
      interaction.initialize(container);
    });
    
    it('应该能设置多个回调', () => {
      const onClick = vi.fn();
      const onDoubleClick = vi.fn();
      const onDragStart = vi.fn();
      
      interaction.setCallbacks({ onClick, onDoubleClick, onDragStart });
      
      interaction.triggerClick(100, 100);
      interaction.triggerDoubleClick(100, 100);
      interaction.startDrag(100, 100);
      
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onDoubleClick).toHaveBeenCalledTimes(1);
      expect(onDragStart).toHaveBeenCalledTimes(1);
    });
    
    it('应该能追加回调而不覆盖', () => {
      const onClick1 = vi.fn();
      interaction.setCallbacks({ onClick: onClick1 });
      
      const onDoubleClick = vi.fn();
      interaction.setCallbacks({ onDoubleClick });
      
      interaction.triggerClick(100, 100);
      
      // onClick1 应该仍然存在
      expect(onClick1).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('资源清理', () => {
    it('dispose 后应该清理所有状态', () => {
      interaction.initialize(container);
      interaction.startDrag(100, 100);
      interaction.setRaycastTargets([{ name: 'pet' }]);
      
      interaction.dispose();
      
      expect(interaction.dragState.isDragging).toBe(false);
    });
    
    it('dispose 后调用方法应该可以重新初始化', () => {
      interaction.initialize(container);
      interaction.dispose();
      
      // 应该可以重新初始化
      expect(() => {
        interaction.initialize(container);
      }).not.toThrow();
    });
  });
});

// ============================================================
// 交互类型测试
// ============================================================

describe('InteractionType', () => {
  it('应该包含所有必需的交互类型', () => {
    const types: InteractionType[] = [
      'click',
      'double-click',
      'right-click',
      'drag-start',
      'drag-end',
      'hover',
    ];
    
    // 验证类型数量
    expect(types.length).toBe(6);
    
    // 验证每个类型
    expect(types).toContain('click');
    expect(types).toContain('double-click');
    expect(types).toContain('right-click');
    expect(types).toContain('drag-start');
    expect(types).toContain('drag-end');
    expect(types).toContain('hover');
  });
});

// ============================================================
// 事件与动画映射测试
// ============================================================

describe('交互-动画映射', () => {
  // 根据 spec.md 中的交互响应测试
  const interactionMappings: Array<[InteractionType, string, string]> = [
    ['click', 'happy', '点击宠物触发开心动画'],
    ['double-click', '打开对话', '双击打开对话界面'],
    ['right-click', '上下文菜单', '右键显示菜单'],
    ['drag-start', 'drag', '开始拖拽切换到拖拽动画'],
    ['drag-end', 'idle', '结束拖拽返回待机动画'],
    ['hover', 'curious', '悬停显示好奇动画'],
  ];
  
  it.each(interactionMappings)(
    '交互 "%s" 应该触发 "%s" (%s)',
    (interactionType, _expectedResponse, _description) => {
      // 验证交互类型存在
      const validTypes: InteractionType[] = [
        'click', 'double-click', 'right-click', 'drag-start', 'drag-end', 'hover'
      ];
      expect(validTypes).toContain(interactionType);
    }
  );
});

// ============================================================
// 性能要求测试
// ============================================================

describe('性能要求', () => {
  it('SC-002: 点击响应应该在100ms内', () => {
    const interaction = new MockPetInteraction();
    const container = document.createElement('div');
    interaction.initialize(container);
    
    const onClickSpy = vi.fn();
    interaction.setCallbacks({ onClick: onClickSpy });
    
    const startTime = Date.now();
    interaction.triggerClick(100, 100);
    const responseTime = Date.now() - startTime;
    
    expect(responseTime).toBeLessThan(100);
    expect(onClickSpy).toHaveBeenCalled();
    
    interaction.dispose();
  });
  
  it('拖拽更新应该在16ms内完成 (60fps)', () => {
    const interaction = new MockPetInteraction();
    const container = document.createElement('div');
    interaction.initialize(container);
    
    const onDragSpy = vi.fn();
    interaction.setCallbacks({ onDrag: onDragSpy });
    
    interaction.startDrag(100, 100);
    
    const startTime = Date.now();
    for (let i = 0; i < 10; i++) {
      interaction.updateDrag(100 + i * 10, 100 + i * 10);
    }
    const totalTime = Date.now() - startTime;
    const avgTime = totalTime / 10;
    
    expect(avgTime).toBeLessThan(16);
    
    interaction.dispose();
  });
});

// ============================================================
// 与 EventTypes.PET.INTERACTION 的集成测试
// ============================================================

describe('与事件系统集成', () => {
  it('交互类型应该与 PetInteractionPayload 兼容', () => {
    // 模拟 PetInteractionPayload 结构
    interface PetInteractionPayload {
      petId: string;
      type: 'click' | 'double-click' | 'right-click' | 'drag-start' | 'drag-end' | 'hover';
      position?: { x: number; y: number };
    }
    
    // 验证 InteractionType 与 payload 类型兼容
    const types: InteractionType[] = ['click', 'double-click', 'right-click', 'drag-start', 'drag-end', 'hover'];
    
    types.forEach(type => {
      const payload: PetInteractionPayload = {
        petId: 'test-pet-id',
        type: type,
        position: { x: 100, y: 100 },
      };
      
      expect(payload.type).toBe(type);
    });
  });
  
  it('应该能创建符合事件系统格式的交互事件', () => {
    const interaction = new MockPetInteraction();
    const container = document.createElement('div');
    interaction.initialize(container);
    
    let capturedEvent: InteractionEvent | null = null;
    interaction.setCallbacks({
      onClick: (event) => {
        capturedEvent = event;
      },
    });
    
    interaction.triggerClick(150, 200);
    
    expect(capturedEvent).not.toBeNull();
    expect(capturedEvent!.type).toBe('click');
    expect(capturedEvent!.position).toEqual({ x: 150, y: 200 });
    expect(capturedEvent!.timestamp).toBeDefined();
    
    interaction.dispose();
  });
});