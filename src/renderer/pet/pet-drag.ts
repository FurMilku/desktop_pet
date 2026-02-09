/**
 * 宠物拖拽系统
 * 实现拖拽宠物时移动窗口位置的功能
 * 
 * Task: T041 [US2] 实现宠物拖拽功能
 */

import { IPetInteraction, InteractionEvent, DragState } from './pet-interaction';
import { IPetRenderer, AnimationState } from './pet-renderer';

// ============================================================
// 类型定义
// ============================================================

/**
 * 拖拽配置
 */
export interface DragConfig {
  /** 是否启用拖拽 */
  enabled: boolean;
  /** 拖拽时的动画状态 */
  dragAnimation: AnimationState;
  /** 拖拽结束后的动画状态 */
  idleAnimation: AnimationState;
  /** 是否平滑移动窗口 */
  smoothMovement: boolean;
  /** 平滑移动的阻尼系数 (0-1, 越小越平滑) */
  smoothingFactor: number;
  /** 窗口边界约束 */
  boundaryConstraints: BoundaryConstraints;
  /** 是否在拖拽结束时保存位置 */
  savePositionOnDrop: boolean;
}

/**
 * 窗口边界约束
 */
export interface BoundaryConstraints {
  /** 是否启用边界约束 */
  enabled: boolean;
  /** 左边界最小值 (像素) */
  minX: number;
  /** 上边界最小值 (像素) */
  minY: number;
  /** 右边界最大值 (null 表示屏幕宽度) */
  maxX: number | null;
  /** 下边界最大值 (null 表示屏幕高度) */
  maxY: number | null;
  /** 边界吸附距离 (像素) */
  snapDistance: number;
}

/**
 * 窗口位置
 */
export interface WindowPosition {
  x: number;
  y: number;
}

/**
 * 拖拽事件回调
 */
export interface DragCallbacks {
  /** 拖拽开始 */
  onDragStart?: (position: WindowPosition) => void;
  /** 拖拽移动 */
  onDragMove?: (position: WindowPosition, delta: { x: number; y: number }) => void;
  /** 拖拽结束 */
  onDragEnd?: (position: WindowPosition) => void;
  /** 窗口位置改变 */
  onPositionChange?: (position: WindowPosition) => void;
  /** 位置保存请求 */
  onPositionSaveRequest?: (position: WindowPosition) => void;
}

/**
 * 窗口 API 接口 (用于 IPC 通信)
 */
export interface IWindowAPI {
  /** 获取窗口位置 */
  getPosition(): Promise<WindowPosition>;
  /** 设置窗口位置 */
  setPosition(x: number, y: number): Promise<void>;
  /** 获取屏幕尺寸 */
  getScreenSize(): Promise<{ width: number; height: number }>;
  /** 保存窗口位置到设置 */
  savePosition(position: WindowPosition): Promise<void>;
}

/**
 * 宠物拖拽系统接口
 */
export interface IPetDrag {
  readonly config: DragConfig;
  readonly isDragging: boolean;
  readonly currentPosition: WindowPosition | null;
  
  // 生命周期
  initialize(
    interaction: IPetInteraction,
    renderer?: IPetRenderer,
    windowAPI?: IWindowAPI
  ): void;
  dispose(): void;
  
  // 配置
  setConfig(config: Partial<DragConfig>): void;
  setCallbacks(callbacks: DragCallbacks): void;
  
  // 状态
  enable(): void;
  disable(): void;
  
  // 窗口操作
  moveWindow(x: number, y: number): Promise<void>;
  getWindowPosition(): Promise<WindowPosition>;
  constrainToBounds(position: WindowPosition): WindowPosition;
}

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_CONFIG: DragConfig = {
  enabled: true,
  dragAnimation: 'drag',
  idleAnimation: 'idle',
  smoothMovement: false, // Electron 窗口移动本身就比较流畅
  smoothingFactor: 0.3,
  boundaryConstraints: {
    enabled: true,
    minX: 0,
    minY: 0,
    maxX: null,
    maxY: null,
    snapDistance: 20,
  },
  savePositionOnDrop: true,
};

// ============================================================
// PetDrag 实现
// ============================================================

/**
 * 宠物拖拽系统
 */
export class PetDrag implements IPetDrag {
  // 配置
  private _config: DragConfig;
  private _callbacks: DragCallbacks = {};
  
  // 关联系统
  private _interaction: IPetInteraction | null = null;
  private _renderer: IPetRenderer | null = null;
  private _windowAPI: IWindowAPI | null = null;
  
  // 状态
  private _isDragging = false;
  private _isInitialized = false;
  private _currentPosition: WindowPosition | null = null;
  private _previousAnimation: AnimationState | null = null;
  
  // 屏幕尺寸缓存
  private _screenSize: { width: number; height: number } | null = null;
  
  // 平滑移动相关
  private _smoothAnimationId: number | null = null;
  private _targetPosition: WindowPosition | null = null;

  /**
   * 构造函数
   */
  constructor(config?: Partial<DragConfig>) {
    this._config = this._mergeConfig(DEFAULT_CONFIG, config);
  }

  /**
   * 合并配置
   */
  private _mergeConfig(base: DragConfig, override?: Partial<DragConfig>): DragConfig {
    if (!override) return { ...base };
    
    return {
      ...base,
      ...override,
      boundaryConstraints: {
        ...base.boundaryConstraints,
        ...(override.boundaryConstraints || {}),
      },
    };
  }

  // ============================================================
  // 属性访问器
  // ============================================================

  get config(): DragConfig {
    return {
      ...this._config,
      boundaryConstraints: { ...this._config.boundaryConstraints },
    };
  }

  get isDragging(): boolean {
    return this._isDragging;
  }

  get currentPosition(): WindowPosition | null {
    return this._currentPosition ? { ...this._currentPosition } : null;
  }

  // ============================================================
  // 生命周期
  // ============================================================

  /**
   * 初始化拖拽系统
   */
  initialize(
    interaction: IPetInteraction,
    renderer?: IPetRenderer,
    windowAPI?: IWindowAPI
  ): void {
    if (this._isInitialized) {
      throw new Error('Already initialized');
    }

    this._interaction = interaction;
    this._renderer = renderer || null;
    this._windowAPI = windowAPI || null;

    // 设置交互回调
    this._setupInteractionCallbacks();

    // 获取初始屏幕尺寸
    this._updateScreenSize();

    this._isInitialized = true;
    console.log('[PetDrag] Initialized');
  }

  /**
   * 销毁拖拽系统
   */
  dispose(): void {
    // 停止平滑动画
    this._stopSmoothAnimation();

    // 清理状态
    this._interaction = null;
    this._renderer = null;
    this._windowAPI = null;
    this._callbacks = {};
    this._isDragging = false;
    this._isInitialized = false;
    this._currentPosition = null;
    this._screenSize = null;
    this._targetPosition = null;
    this._previousAnimation = null;

    console.log('[PetDrag] Disposed');
  }

  // ============================================================
  // 配置
  // ============================================================

  /**
   * 更新配置
   */
  setConfig(config: Partial<DragConfig>): void {
    this._config = this._mergeConfig(this._config, config);
  }

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: DragCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  // ============================================================
  // 状态控制
  // ============================================================

  /**
   * 启用拖拽
   */
  enable(): void {
    this._config.enabled = true;
    console.log('[PetDrag] Enabled');
  }

  /**
   * 禁用拖拽
   */
  disable(): void {
    this._config.enabled = false;
    
    // 如果正在拖拽，强制结束
    if (this._isDragging) {
      this._endDrag();
    }
    
    console.log('[PetDrag] Disabled');
  }

  // ============================================================
  // 交互回调设置
  // ============================================================

  /**
   * 设置交互系统回调
   */
  private _setupInteractionCallbacks(): void {
    if (!this._interaction) return;

    this._interaction.setCallbacks({
      onDragStart: (event: InteractionEvent) => this._handleDragStart(event),
      onDrag: (event: InteractionEvent & { delta: { x: number; y: number } }) => 
        this._handleDrag(event),
      onDragEnd: (event: InteractionEvent) => this._handleDragEnd(event),
    });
  }

  // ============================================================
  // 拖拽处理
  // ============================================================

  /**
   * 处理拖拽开始
   */
  private async _handleDragStart(event: InteractionEvent): Promise<void> {
    if (!this._config.enabled) return;

    this._isDragging = true;

    // 获取当前窗口位置
    try {
      this._currentPosition = await this.getWindowPosition();
    } catch (error) {
      console.warn('[PetDrag] Failed to get window position:', error);
      this._currentPosition = { x: 0, y: 0 };
    }

    // 切换到拖拽动画
    if (this._renderer) {
      this._previousAnimation = this._renderer.getCurrentAnimation();
      this._renderer.setAnimation(this._config.dragAnimation, {
        transitionDuration: 0.1,
      });
    }

    // 触发回调
    this._callbacks.onDragStart?.(this._currentPosition);

    console.log('[PetDrag] Drag started at', this._currentPosition);
  }

  /**
   * 处理拖拽移动
   */
  private async _handleDrag(
    event: InteractionEvent & { delta: { x: number; y: number } }
  ): Promise<void> {
    if (!this._config.enabled || !this._isDragging) return;

    // 计算新位置
    if (!this._currentPosition) {
      this._currentPosition = { x: 0, y: 0 };
    }

    const newPosition: WindowPosition = {
      x: this._currentPosition.x + event.delta.x,
      y: this._currentPosition.y + event.delta.y,
    };

    // 应用边界约束
    const constrainedPosition = this.constrainToBounds(newPosition);

    // 移动窗口
    if (this._config.smoothMovement) {
      this._smoothMoveWindow(constrainedPosition);
    } else {
      await this.moveWindow(constrainedPosition.x, constrainedPosition.y);
    }

    // 更新当前位置
    this._currentPosition = constrainedPosition;

    // 触发回调
    this._callbacks.onDragMove?.(constrainedPosition, event.delta);
    this._callbacks.onPositionChange?.(constrainedPosition);
  }

  /**
   * 处理拖拽结束
   */
  private async _handleDragEnd(event: InteractionEvent): Promise<void> {
    if (!this._isDragging) return;

    await this._endDrag();

    // 触发回调
    if (this._currentPosition) {
      this._callbacks.onDragEnd?.(this._currentPosition);

      // 保存位置
      if (this._config.savePositionOnDrop) {
        this._savePosition(this._currentPosition);
      }
    }

    console.log('[PetDrag] Drag ended at', this._currentPosition);
  }

  /**
   * 结束拖拽
   */
  private async _endDrag(): Promise<void> {
    this._isDragging = false;

    // 停止平滑动画
    this._stopSmoothAnimation();

    // 恢复之前的动画或切换到 idle
    if (this._renderer) {
      const targetAnimation = this._previousAnimation || this._config.idleAnimation;
      this._renderer.setAnimation(targetAnimation, {
        transitionDuration: 0.2,
      });
    }

    this._previousAnimation = null;
  }

  // ============================================================
  // 窗口操作
  // ============================================================

  /**
   * 移动窗口到指定位置
   */
  async moveWindow(x: number, y: number): Promise<void> {
    if (this._windowAPI) {
      try {
        await this._windowAPI.setPosition(Math.round(x), Math.round(y));
      } catch (error) {
        console.error('[PetDrag] Failed to move window:', error);
      }
    } else {
      // 使用 Electron IPC (通过 preload 暴露)
      // 注意：preload 暴露的方法是 move() 而不是 setPosition()
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        try {
          await (window as any).electronAPI.window.move(
            Math.round(x),
            Math.round(y)
          );
        } catch (error) {
          console.error('[PetDrag] Failed to move window via IPC:', error);
        }
      }
    }
  }

  /**
   * 获取窗口位置
   */
  async getWindowPosition(): Promise<WindowPosition> {
    if (this._windowAPI) {
      return await this._windowAPI.getPosition();
    }

    // 使用 Electron IPC (通过 preload 暴露)
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      try {
        const position = await (window as any).electronAPI.window.getPosition();
        return { x: position.x, y: position.y };
      } catch (error) {
        console.error('[PetDrag] Failed to get window position via IPC:', error);
      }
    }

    return { x: 0, y: 0 };
  }

  /**
   * 约束位置到边界内
   */
  constrainToBounds(position: WindowPosition): WindowPosition {
    if (!this._config.boundaryConstraints.enabled) {
      return { ...position };
    }

    const bounds = this._config.boundaryConstraints;
    let { x, y } = position;

    // 获取最大边界
    const maxX = bounds.maxX ?? (this._screenSize?.width ?? 1920);
    const maxY = bounds.maxY ?? (this._screenSize?.height ?? 1080);

    // 应用边界约束
    x = Math.max(bounds.minX, Math.min(x, maxX));
    y = Math.max(bounds.minY, Math.min(y, maxY));

    // 边界吸附
    if (bounds.snapDistance > 0) {
      // 左边界吸附
      if (x - bounds.minX < bounds.snapDistance) {
        x = bounds.minX;
      }
      // 右边界吸附
      if (maxX - x < bounds.snapDistance) {
        x = maxX;
      }
      // 上边界吸附
      if (y - bounds.minY < bounds.snapDistance) {
        y = bounds.minY;
      }
      // 下边界吸附
      if (maxY - y < bounds.snapDistance) {
        y = maxY;
      }
    }

    return { x, y };
  }

  // ============================================================
  // 平滑移动
  // ============================================================

  /**
   * 平滑移动窗口
   */
  private _smoothMoveWindow(target: WindowPosition): void {
    this._targetPosition = target;

    if (this._smoothAnimationId === null) {
      this._smoothAnimationLoop();
    }
  }

  /**
   * 平滑动画循环
   */
  private _smoothAnimationLoop(): void {
    if (!this._targetPosition || !this._currentPosition) {
      this._stopSmoothAnimation();
      return;
    }

    const dx = this._targetPosition.x - this._currentPosition.x;
    const dy = this._targetPosition.y - this._currentPosition.y;

    // 如果已经足够接近目标，停止动画
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
      this.moveWindow(this._targetPosition.x, this._targetPosition.y);
      this._currentPosition = { ...this._targetPosition };
      this._stopSmoothAnimation();
      return;
    }

    // 应用阻尼
    const newX = this._currentPosition.x + dx * this._config.smoothingFactor;
    const newY = this._currentPosition.y + dy * this._config.smoothingFactor;

    // 移动窗口
    this.moveWindow(newX, newY);
    this._currentPosition = { x: newX, y: newY };

    // 继续动画
    this._smoothAnimationId = requestAnimationFrame(() => this._smoothAnimationLoop());
  }

  /**
   * 停止平滑动画
   */
  private _stopSmoothAnimation(): void {
    if (this._smoothAnimationId !== null) {
      cancelAnimationFrame(this._smoothAnimationId);
      this._smoothAnimationId = null;
    }
    this._targetPosition = null;
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 更新屏幕尺寸
   */
  private async _updateScreenSize(): Promise<void> {
    if (this._windowAPI) {
      try {
        this._screenSize = await this._windowAPI.getScreenSize();
        return;
      } catch (error) {
        console.warn('[PetDrag] Failed to get screen size:', error);
      }
    }

    // 使用 Electron IPC (通过 preload 暴露)
    // 注意：windowAPI 没有 getScreenSize 方法，需要通过 getDisplays 获取
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      try {
        const displays = await (window as any).electronAPI.window.getDisplays();
        // 使用主显示器的尺寸，如果没有主显示器则使用第一个
        const primaryDisplay = displays?.find((d: any) => d.isPrimary) || displays?.[0];
        if (primaryDisplay?.bounds) {
          this._screenSize = {
            width: primaryDisplay.bounds.width,
            height: primaryDisplay.bounds.height,
          };
          return;
        }
      } catch (error) {
        console.warn('[PetDrag] Failed to get screen size via IPC:', error);
      }
    }

    // 回退到 window.screen
    if (typeof window !== 'undefined') {
      this._screenSize = {
        width: window.screen.width,
        height: window.screen.height,
      };
    }
  }

  /**
   * 保存位置
   */
  private async _savePosition(position: WindowPosition): Promise<void> {
    // 触发保存请求回调
    this._callbacks.onPositionSaveRequest?.(position);

    // 通过 Window API 保存
    if (this._windowAPI) {
      try {
        await this._windowAPI.savePosition(position);
        console.log('[PetDrag] Position saved:', position);
        return;
      } catch (error) {
        console.warn('[PetDrag] Failed to save position:', error);
      }
    }

    // 使用 Electron IPC (通过 preload 暴露)
    // 注意：savePosition 在 petAPI 中，不在 windowAPI 中
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      try {
        // 获取当前显示器 ID
        const currentPos = await (window as any).electronAPI.window.getPosition();
        const petPosition = {
          x: position.x,
          y: position.y,
          monitor: currentPos?.monitor ?? 0,
        };
        await (window as any).electronAPI.pet.savePosition(petPosition);
        console.log('[PetDrag] Position saved via IPC:', petPosition);
      } catch (error) {
        console.warn('[PetDrag] Failed to save position via IPC:', error);
      }
    }
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建宠物拖拽系统实例
 */
export function createPetDrag(config?: Partial<DragConfig>): IPetDrag {
  return new PetDrag(config);
}

// ============================================================
// 辅助函数：创建集成的拖拽系统
// ============================================================

/**
 * 创建并初始化完整的拖拽系统
 * 
 * @example
 * ```typescript
 * const { drag, cleanup } = await setupPetDrag(
 *   petInteraction,
 *   petRenderer,
 *   {
 *     onDragStart: (pos) => console.log('Started at', pos),
 *     onDragEnd: (pos) => console.log('Ended at', pos),
 *   }
 * );
 * 
 * // 清理
 * cleanup();
 * ```
 */
export async function setupPetDrag(
  interaction: IPetInteraction,
  renderer?: IPetRenderer,
  callbacks?: DragCallbacks,
  config?: Partial<DragConfig>,
  windowAPI?: IWindowAPI
): Promise<{ drag: IPetDrag; cleanup: () => void }> {
  const drag = createPetDrag(config);

  // 初始化
  drag.initialize(interaction, renderer, windowAPI);

  // 设置回调
  if (callbacks) {
    drag.setCallbacks(callbacks);
  }

  // 返回实例和清理函数
  return {
    drag,
    cleanup: () => drag.dispose(),
  };
}

// ============================================================
// 导出
// ============================================================

export default PetDrag;