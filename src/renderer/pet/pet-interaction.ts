/**
 * 宠物交互系统
 * 实现鼠标点击检测 (Raycasting)、拖拽、hover 等交互
 * 
 * Task: T040 [US2] 实现鼠标点击检测 (Raycasting)
 */

import * as THREE from 'three';

// ============================================================
// 类型定义
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
  setRaycastTargets(targets: THREE.Object3D[]): void;
  setCamera(camera: THREE.Camera): void;
  checkIntersection(x: number, y: number): boolean;
}

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_CONFIG: InteractionConfig = {
  doubleClickInterval: 300,
  dragThreshold: 5,
  longPressTime: 500,
  enableHover: true,
};

// ============================================================
// PetInteraction 实现
// ============================================================

/**
 * 宠物交互系统
 */
export class PetInteraction implements IPetInteraction {
  // 配置
  private _config: InteractionConfig;
  private _callbacks: InteractionCallbacks = {};
  
  // 状态
  private _dragState: DragState = {
    isDragging: false,
    startPosition: null,
    currentPosition: null,
    offset: null,
  };
  private _isHovering = false;
  private _isInitialized = false;
  
  // 双击检测
  private _lastClickTime = 0;
  private _lastClickPosition: { x: number; y: number } | null = null;
  
  // 长按检测
  private _longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private _isLongPress = false;
  
  // 鼠标按下状态 (用于区分点击和拖拽)
  private _mouseDownPosition: { x: number; y: number } | null = null;
  private _mouseDownTime = 0;
  
  // DOM 元素
  private _container: HTMLElement | null = null;
  
  // Three.js Raycasting
  private _raycaster: THREE.Raycaster;
  private _mouse: THREE.Vector2;
  private _raycastTargets: THREE.Object3D[] = [];
  private _camera: THREE.Camera | null = null;
  
  // 事件处理函数引用 (用于移除监听)
  private _boundHandlers: {
    mouseDown?: (e: MouseEvent) => void;
    mouseUp?: (e: MouseEvent) => void;
    mouseMove?: (e: MouseEvent) => void;
    contextMenu?: (e: MouseEvent) => void;
    mouseLeave?: (e: MouseEvent) => void;
  } = {};

  /**
   * 构造函数
   */
  constructor(config?: Partial<InteractionConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
  }

  // ============================================================
  // 属性访问器
  // ============================================================

  get config(): InteractionConfig {
    return { ...this._config };
  }

  get dragState(): DragState {
    return {
      isDragging: this._dragState.isDragging,
      startPosition: this._dragState.startPosition ? { ...this._dragState.startPosition } : null,
      currentPosition: this._dragState.currentPosition ? { ...this._dragState.currentPosition } : null,
      offset: this._dragState.offset ? { ...this._dragState.offset } : null,
    };
  }

  get isHovering(): boolean {
    return this._isHovering;
  }

  // ============================================================
  // 生命周期
  // ============================================================

  /**
   * 初始化交互系统
   */
  initialize(container: HTMLElement): void {
    if (this._isInitialized) {
      throw new Error('Already initialized');
    }

    this._container = container;
    this._setupEventListeners();
    this._isInitialized = true;

    console.log('[PetInteraction] Initialized');
  }

  /**
   * 销毁交互系统
   */
  dispose(): void {
    this._removeEventListeners();
    this._clearLongPressTimer();
    
    this._container = null;
    this._isInitialized = false;
    this._callbacks = {};
    this._raycastTargets = [];
    this._camera = null;
    this._resetDragState();
    this._isHovering = false;
    this._lastClickTime = 0;
    this._lastClickPosition = null;
    this._mouseDownPosition = null;

    console.log('[PetInteraction] Disposed');
  }

  // ============================================================
  // 配置
  // ============================================================

  /**
   * 更新配置
   */
  setConfig(config: Partial<InteractionConfig>): void {
    this._config = { ...this._config, ...config };
  }

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: InteractionCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  // ============================================================
  // Raycasting 设置
  // ============================================================

  /**
   * 设置 Raycast 目标对象
   */
  setRaycastTargets(targets: THREE.Object3D[]): void {
    this._raycastTargets = targets;
  }

  /**
   * 设置相机 (用于 Raycasting)
   */
  setCamera(camera: THREE.Camera): void {
    this._camera = camera;
  }

  /**
   * 检查鼠标位置是否与目标相交
   */
  checkIntersection(x: number, y: number): boolean {
    if (!this._camera || this._raycastTargets.length === 0 || !this._container) {
      return false;
    }

    // 将屏幕坐标转换为标准化设备坐标 (-1 到 1)
    const rect = this._container.getBoundingClientRect();
    this._mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

    // 更新 Raycaster
    this._raycaster.setFromCamera(this._mouse, this._camera);

    // 检测相交 (递归检查子对象)
    const intersects = this._raycaster.intersectObjects(this._raycastTargets, true);
    
    return intersects.length > 0;
  }

  /**
   * 获取第一个相交对象
   */
  private _getFirstIntersection(x: number, y: number): THREE.Intersection | null {
    if (!this._camera || this._raycastTargets.length === 0 || !this._container) {
      return null;
    }

    const rect = this._container.getBoundingClientRect();
    this._mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse, this._camera);
    const intersects = this._raycaster.intersectObjects(this._raycastTargets, true);

    return intersects.length > 0 ? intersects[0] : null;
  }

  // ============================================================
  // 事件监听设置
  // ============================================================

  /**
   * 设置事件监听
   */
  private _setupEventListeners(): void {
    if (!this._container) return;

    // 创建绑定的处理函数
    this._boundHandlers = {
      mouseDown: this._handleMouseDown.bind(this),
      mouseUp: this._handleMouseUp.bind(this),
      mouseMove: this._handleMouseMove.bind(this),
      contextMenu: this._handleContextMenu.bind(this),
      mouseLeave: this._handleMouseLeave.bind(this),
    };

    // 添加事件监听
    this._container.addEventListener('mousedown', this._boundHandlers.mouseDown!);
    this._container.addEventListener('mouseup', this._boundHandlers.mouseUp!);
    this._container.addEventListener('mousemove', this._boundHandlers.mouseMove!);
    this._container.addEventListener('contextmenu', this._boundHandlers.contextMenu!);
    this._container.addEventListener('mouseleave', this._boundHandlers.mouseLeave!);

    // 全局鼠标抬起 (处理拖拽时鼠标移出容器的情况)
    window.addEventListener('mouseup', this._boundHandlers.mouseUp!);
  }

  /**
   * 移除事件监听
   */
  private _removeEventListeners(): void {
    if (!this._container) return;

    if (this._boundHandlers.mouseDown) {
      this._container.removeEventListener('mousedown', this._boundHandlers.mouseDown);
    }
    if (this._boundHandlers.mouseUp) {
      this._container.removeEventListener('mouseup', this._boundHandlers.mouseUp);
      window.removeEventListener('mouseup', this._boundHandlers.mouseUp);
    }
    if (this._boundHandlers.mouseMove) {
      this._container.removeEventListener('mousemove', this._boundHandlers.mouseMove);
    }
    if (this._boundHandlers.contextMenu) {
      this._container.removeEventListener('contextmenu', this._boundHandlers.contextMenu);
    }
    if (this._boundHandlers.mouseLeave) {
      this._container.removeEventListener('mouseleave', this._boundHandlers.mouseLeave);
    }

    this._boundHandlers = {};
  }

  // ============================================================
  // 事件处理
  // ============================================================

  /**
   * 处理鼠标按下
   */
  private _handleMouseDown(e: MouseEvent): void {
    // 只处理左键
    if (e.button !== 0) return;

    const x = e.clientX;
    const y = e.clientY;

    // 检查是否点击在宠物上
    if (!this.checkIntersection(x, y)) {
      return;
    }

    this._mouseDownPosition = { x, y };
    this._mouseDownTime = Date.now();
    this._isLongPress = false;

    // 启动长按计时器
    this._startLongPressTimer(x, y);
  }

  /**
   * 处理鼠标抬起
   */
  private _handleMouseUp(e: MouseEvent): void {
    // 只处理左键
    if (e.button !== 0) return;

    const x = e.clientX;
    const y = e.clientY;

    // 清除长按计时器
    this._clearLongPressTimer();

    // 如果正在拖拽，结束拖拽
    if (this._dragState.isDragging) {
      this.endDrag(x, y);
      this._mouseDownPosition = null;
      return;
    }

    // 如果有鼠标按下记录，处理点击
    if (this._mouseDownPosition && !this._isLongPress) {
      // 检查是否移动距离足够小 (算作点击)
      const dx = Math.abs(x - this._mouseDownPosition.x);
      const dy = Math.abs(y - this._mouseDownPosition.y);

      if (dx < this._config.dragThreshold && dy < this._config.dragThreshold) {
        this._processClick(x, y);
      }
    }

    this._mouseDownPosition = null;
  }

  /**
   * 处理鼠标移动
   */
  private _handleMouseMove(e: MouseEvent): void {
    const x = e.clientX;
    const y = e.clientY;

    // 如果正在拖拽，更新拖拽位置
    if (this._dragState.isDragging) {
      this.updateDrag(x, y);
      return;
    }

    // 如果有鼠标按下记录，检查是否开始拖拽
    if (this._mouseDownPosition) {
      const dx = Math.abs(x - this._mouseDownPosition.x);
      const dy = Math.abs(y - this._mouseDownPosition.y);

      if (dx >= this._config.dragThreshold || dy >= this._config.dragThreshold) {
        // 清除长按计时器
        this._clearLongPressTimer();
        // 开始拖拽
        this.startDrag(this._mouseDownPosition.x, this._mouseDownPosition.y);
      }
      return;
    }

    // 处理 hover
    if (this._config.enableHover) {
      this._processHover(x, y);
    }
  }

  /**
   * 处理右键菜单
   */
  private _handleContextMenu(e: MouseEvent): void {
    const x = e.clientX;
    const y = e.clientY;

    // 检查是否点击在宠物上
    if (this.checkIntersection(x, y)) {
      e.preventDefault();
      this.triggerRightClick(x, y);
    }
  }

  /**
   * 处理鼠标离开
   */
  private _handleMouseLeave(_e: MouseEvent): void {
    // 结束 hover
    if (this._isHovering) {
      this._isHovering = false;
      this._callbacks.onHoverEnd?.();
    }

    // 清除长按计时器
    this._clearLongPressTimer();
  }

  // ============================================================
  // 点击处理
  // ============================================================

  /**
   * 处理点击 (检测单击/双击)
   */
  private _processClick(x: number, y: number): void {
    const now = Date.now();

    // 检查是否为双击
    if (
      this._lastClickTime &&
      now - this._lastClickTime < this._config.doubleClickInterval &&
      this._lastClickPosition &&
      Math.abs(this._lastClickPosition.x - x) < this._config.dragThreshold &&
      Math.abs(this._lastClickPosition.y - y) < this._config.dragThreshold
    ) {
      // 双击
      this._triggerEvent('double-click', x, y);
      this._lastClickTime = 0;
      this._lastClickPosition = null;
    } else {
      // 单击
      this._triggerEvent('click', x, y);
      this._lastClickTime = now;
      this._lastClickPosition = { x, y };
    }
  }

  // ============================================================
  // Hover 处理
  // ============================================================

  /**
   * 处理 hover
   */
  private _processHover(x: number, y: number): void {
    const isOverPet = this.checkIntersection(x, y);

    if (isOverPet && !this._isHovering) {
      // 开始 hover
      this._isHovering = true;
      this._triggerEvent('hover', x, y);
    } else if (!isOverPet && this._isHovering) {
      // 结束 hover
      this._isHovering = false;
      this._callbacks.onHoverEnd?.();
    }
  }

  // ============================================================
  // 长按处理
  // ============================================================

  /**
   * 启动长按计时器
   */
  private _startLongPressTimer(x: number, y: number): void {
    this._clearLongPressTimer();
    
    this._longPressTimer = setTimeout(() => {
      this._isLongPress = true;
      // 长按可以触发特殊行为，例如显示工具提示
      console.log('[PetInteraction] Long press detected at', x, y);
    }, this._config.longPressTime);
  }

  /**
   * 清除长按计时器
   */
  private _clearLongPressTimer(): void {
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
  }

  // ============================================================
  // 手动触发方法 (用于测试或程序化交互)
  // ============================================================

  /**
   * 触发点击
   */
  triggerClick(x: number, y: number): void {
    if (!this._isInitialized) {
      throw new Error('Not initialized');
    }

    this._processClick(x, y);
  }

  /**
   * 触发双击
   */
  triggerDoubleClick(x: number, y: number): void {
    if (!this._isInitialized) {
      throw new Error('Not initialized');
    }

    this._triggerEvent('double-click', x, y);
  }

  /**
   * 触发右键点击
   */
  triggerRightClick(x: number, y: number): void {
    if (!this._isInitialized) {
      throw new Error('Not initialized');
    }

    this._triggerEvent('right-click', x, y);
  }

  // ============================================================
  // 拖拽方法
  // ============================================================

  /**
   * 开始拖拽
   */
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

    this._triggerEvent('drag-start', x, y);
  }

  /**
   * 更新拖拽位置
   */
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

    // 触发拖拽回调
    this._callbacks.onDrag?.({
      type: 'drag-start',
      position: { x, y },
      timestamp: Date.now(),
      delta,
    });
  }

  /**
   * 结束拖拽
   */
  endDrag(x: number, y: number): void {
    if (!this._dragState.isDragging) {
      return;
    }

    this._triggerEvent('drag-end', x, y);
    this._resetDragState();
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 触发交互事件
   */
  private _triggerEvent(type: InteractionType, x: number, y: number): void {
    const event: InteractionEvent = {
      type,
      position: { x, y },
      timestamp: Date.now(),
    };

    // 添加目标信息
    const intersection = this._getFirstIntersection(x, y);
    if (intersection) {
      event.target = intersection.object.name || undefined;
    }

    // 调用对应的回调
    switch (type) {
      case 'click':
        this._callbacks.onClick?.(event);
        break;
      case 'double-click':
        this._callbacks.onDoubleClick?.(event);
        break;
      case 'right-click':
        this._callbacks.onRightClick?.(event);
        break;
      case 'drag-start':
        this._callbacks.onDragStart?.(event);
        break;
      case 'drag-end':
        this._callbacks.onDragEnd?.(event);
        break;
      case 'hover':
        this._callbacks.onHover?.(event);
        break;
    }
  }

  /**
   * 重置拖拽状态
   */
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
// 工厂函数
// ============================================================

/**
 * 创建宠物交互系统实例
 */
export function createPetInteraction(config?: Partial<InteractionConfig>): IPetInteraction {
  return new PetInteraction(config);
}

// ============================================================
// 导出
// ============================================================

export default PetInteraction;