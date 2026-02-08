# Pet Service Contract

**Feature**: 桌面3D小宠物  
**Version**: 1.0.0  
**Date**: 2026-02-08

## Overview

宠物服务接口定义了3D宠物渲染、动画控制、交互处理和状态管理的契约。该服务运行在渲染进程中，通过 IPC 与主进程通信以持久化状态。

## Type Definitions

```typescript
// ============================================
// 基础类型
// ============================================

/** 3D坐标 */
interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** 2D屏幕坐标 */
interface Vector2 {
  x: number;
  y: number;
}

/** 四元数旋转 */
interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

// ============================================
// 宠物状态类型
// ============================================

/** 情感状态枚举 */
type EmotionState = 
  | 'idle'       // 待机
  | 'happy'      // 开心
  | 'sad'        // 难过
  | 'curious'    // 好奇
  | 'thinking'   // 思考
  | 'listening'  // 倾听
  | 'confused'   // 困惑
  | 'excited';   // 兴奋

/** 动画状态枚举 */
type AnimationState = 
  | 'idle'           // 待机动画（眨眼、呼吸）
  | 'idle_variation' // 待机变体（小动作）
  | 'react_click'    // 点击反应（跳跃、挥手）
  | 'react_drag'     // 拖拽反应
  | 'thinking'       // 思考动画（挠头、看上方）
  | 'talking'        // 说话动画
  | 'listening'      // 倾听动画
  | 'remind'         // 提醒动画
  | 'sleep'          // 睡眠动画
  | 'wake_up';       // 唤醒动画

/** 宠物完整状态 */
interface PetState {
  id: string;
  name: string;
  skinId: string | null;          // 当前皮肤ID，null为默认
  position: Vector2;              // 屏幕位置
  scale: number;                  // 缩放比例 (0.5-2.0)
  emotion: EmotionState;          // 当前情感
  currentAnimation: AnimationState; // 当前动画
  isVisible: boolean;             // 是否可见
  isDragging: boolean;            // 是否正在拖拽
}

// ============================================
// 模型与动画类型
// ============================================

/** 3D模型信息 */
interface PetModel {
  id: string;
  name: string;
  filePath: string;               // GLB文件路径
  thumbnailPath: string;          // 缩略图路径
  hasSkeletonRig: boolean;        // 是否有骨骼绑定
  availableAnimations: string[];  // 可用动画列表
}

/** 动画剪辑信息 */
interface AnimationClip {
  name: string;
  duration: number;               // 秒
  loop: boolean;                  // 是否循环
  blendDuration: number;          // 混合过渡时间（秒）
}

/** 动画播放选项 */
interface AnimationPlayOptions {
  loop?: boolean;                 // 覆盖默认循环设置
  speed?: number;                 // 播放速度 (0.1-3.0)
  blendDuration?: number;         // 过渡时间覆盖
  onComplete?: () => void;        // 播放完成回调
}

// ============================================
// 交互事件类型
// ============================================

/** 点击事件 */
interface ClickEvent {
  type: 'single' | 'double';
  screenPosition: Vector2;        // 屏幕坐标
  localPosition: Vector3;         // 模型局部坐标
  timestamp: number;
}

/** 拖拽事件 */
interface DragEvent {
  type: 'start' | 'move' | 'end';
  screenPosition: Vector2;
  delta: Vector2;                 // 相对上一帧的移动量
  timestamp: number;
}

/** 悬停事件 */
interface HoverEvent {
  type: 'enter' | 'leave';
  screenPosition: Vector2;
  timestamp: number;
}

// ============================================
// 渲染配置类型
// ============================================

/** 渲染器配置 */
interface RendererConfig {
  antialias: boolean;             // 抗锯齿
  pixelRatio: number;             // 像素比 (1-2)
  targetFPS: number;              // 目标帧率 (30-60)
  shadowsEnabled: boolean;        // 阴影（透明窗口通常禁用）
}

/** 光照配置 */
interface LightingConfig {
  ambientIntensity: number;       // 环境光强度 (0-1)
  directionalIntensity: number;   // 方向光强度 (0-2)
  directionalPosition: Vector3;   // 方向光位置
}
```

## Interface: IPetRenderer

3D渲染器接口，负责 Three.js 场景管理和渲染循环。

```typescript
interface IPetRenderer {
  /**
   * 初始化渲染器
   * @param container - DOM容器元素
   * @param config - 渲染配置
   * @returns Promise<void>
   * @throws RendererInitError - WebGL不支持或初始化失败
   */
  initialize(container: HTMLElement, config?: Partial<RendererConfig>): Promise<void>;

  /**
   * 销毁渲染器，释放资源
   */
  dispose(): void;

  /**
   * 加载3D模型
   * @param modelPath - GLB文件路径
   * @returns Promise<PetModel> - 加载的模型信息
   * @throws ModelLoadError - 模型文件不存在或格式错误
   */
  loadModel(modelPath: string): Promise<PetModel>;

  /**
   * 卸载当前模型
   */
  unloadModel(): void;

  /**
   * 设置模型位置（屏幕坐标）
   * @param position - 屏幕坐标
   */
  setPosition(position: Vector2): void;

  /**
   * 设置模型缩放
   * @param scale - 缩放比例 (0.5-2.0)
   */
  setScale(scale: number): void;

  /**
   * 设置模型旋转
   * @param rotation - 四元数旋转
   */
  setRotation(rotation: Quaternion): void;

  /**
   * 调整渲染器大小（窗口resize时调用）
   * @param width - 新宽度
   * @param height - 新高度
   */
  resize(width: number, height: number): void;

  /**
   * 开始渲染循环
   */
  startRenderLoop(): void;

  /**
   * 停止渲染循环
   */
  stopRenderLoop(): void;

  /**
   * 获取当前帧率
   * @returns 当前FPS
   */
  getCurrentFPS(): number;

  /**
   * 设置光照配置
   * @param config - 光照配置
   */
  setLighting(config: Partial<LightingConfig>): void;

  /**
   * 截取当前渲染画面
   * @returns Promise<Blob> - PNG图片数据
   */
  captureScreenshot(): Promise<Blob>;
}
```

## Interface: IAnimationController

动画控制器接口，管理骨骼动画的播放、混合和状态转换。

```typescript
interface IAnimationController {
  /**
   * 初始化动画系统
   * @param model - 已加载的3D模型
   * @throws AnimationInitError - 模型没有动画数据
   */
  initialize(model: PetModel): void;

  /**
   * 销毁动画控制器
   */
  dispose(): void;

  /**
   * 获取可用动画列表
   * @returns AnimationClip[] - 动画剪辑列表
   */
  getAvailableAnimations(): AnimationClip[];

  /**
   * 播放指定动画
   * @param animationName - 动画名称
   * @param options - 播放选项
   * @throws AnimationNotFoundError - 动画不存在
   */
  playAnimation(animationName: string, options?: AnimationPlayOptions): void;

  /**
   * 停止当前动画
   * @param fadeOutDuration - 淡出时间（秒）
   */
  stopAnimation(fadeOutDuration?: number): void;

  /**
   * 暂停动画
   */
  pauseAnimation(): void;

  /**
   * 恢复动画
   */
  resumeAnimation(): void;

  /**
   * 设置动画状态（自动选择合适的动画）
   * @param state - 目标动画状态
   * @param blendDuration - 混合过渡时间
   */
  setAnimationState(state: AnimationState, blendDuration?: number): void;

  /**
   * 获取当前动画状态
   * @returns 当前AnimationState
   */
  getCurrentState(): AnimationState;

  /**
   * 混合到新动画
   * @param fromAnimation - 起始动画
   * @param toAnimation - 目标动画
   * @param duration - 混合时间（秒）
   */
  crossFade(fromAnimation: string, toAnimation: string, duration: number): void;

  /**
   * 更新动画（每帧调用）
   * @param deltaTime - 时间增量（秒）
   */
  update(deltaTime: number): void;

  /**
   * 注册动画事件监听器
   * @param event - 事件类型
   * @param callback - 回调函数
   */
  on(event: 'animationStart' | 'animationEnd' | 'animationLoop', callback: (animationName: string) => void): void;

  /**
   * 移除事件监听器
   * @param event - 事件类型
   * @param callback - 回调函数
   */
  off(event: 'animationStart' | 'animationEnd' | 'animationLoop', callback: (animationName: string) => void): void;
}
```

## Interface: IInteractionHandler

交互处理器接口，处理鼠标/触摸事件并转换为宠物交互。

```typescript
interface IInteractionHandler {
  /**
   * 初始化交互处理器
   * @param renderer - 渲染器实例（用于射线检测）
   * @param container - DOM容器（用于事件监听）
   */
  initialize(renderer: IPetRenderer, container: HTMLElement): void;

  /**
   * 销毁交互处理器
   */
  dispose(): void;

  /**
   * 启用交互
   */
  enable(): void;

  /**
   * 禁用交互
   */
  disable(): void;

  /**
   * 检查指定点是否在宠物模型上
   * @param screenPosition - 屏幕坐标
   * @returns boolean - 是否命中
   */
  hitTest(screenPosition: Vector2): boolean;

  /**
   * 注册点击事件监听器
   * @param callback - 回调函数
   */
  onClick(callback: (event: ClickEvent) => void): void;

  /**
   * 注册拖拽事件监听器
   * @param callback - 回调函数
   */
  onDrag(callback: (event: DragEvent) => void): void;

  /**
   * 注册悬停事件监听器
   * @param callback - 回调函数
   */
  onHover(callback: (event: HoverEvent) => void): void;

  /**
   * 移除点击事件监听器
   * @param callback - 回调函数
   */
  offClick(callback: (event: ClickEvent) => void): void;

  /**
   * 移除拖拽事件监听器
   * @param callback - 回调函数
   */
  offDrag(callback: (event: DragEvent) => void): void;

  /**
   * 移除悬停事件监听器
   * @param callback - 回调函数
   */
  offHover(callback: (event: HoverEvent) => void): void;

  /**
   * 设置拖拽边界（屏幕范围限制）
   * @param bounds - 边界矩形 { x, y, width, height }
   */
  setDragBounds(bounds: { x: number; y: number; width: number; height: number }): void;
}
```

## Interface: IPetStateManager

宠物状态管理器接口，协调渲染、动画和交互，管理宠物整体状态。

```typescript
interface IPetStateManager {
  /**
   * 初始化状态管理器
   * @param renderer - 渲染器
   * @param animationController - 动画控制器
   * @param interactionHandler - 交互处理器
   */
  initialize(
    renderer: IPetRenderer,
    animationController: IAnimationController,
    interactionHandler: IInteractionHandler
  ): Promise<void>;

  /**
   * 销毁状态管理器
   */
  dispose(): void;

  /**
   * 获取当前宠物状态
   * @returns PetState
   */
  getState(): PetState;

  /**
   * 设置宠物名称
   * @param name - 新名称
   */
  setName(name: string): void;

  /**
   * 设置情感状态（触发对应动画）
   * @param emotion - 目标情感
   * @param duration - 持续时间（毫秒），0表示持续到下次更改
   */
  setEmotion(emotion: EmotionState, duration?: number): void;

  /**
   * 设置可见性
   * @param visible - 是否可见
   */
  setVisible(visible: boolean): void;

  /**
   * 移动宠物到指定位置
   * @param position - 屏幕坐标
   * @param animate - 是否使用动画过渡
   */
  moveTo(position: Vector2, animate?: boolean): void;

  /**
   * 切换皮肤/模型
   * @param skinId - 皮肤ID，null为默认
   * @returns Promise<void>
   * @throws SkinLoadError - 皮肤加载失败
   */
  changeSkin(skinId: string | null): Promise<void>;

  /**
   * 触发反应动画（点击反馈）
   * @param type - 反应类型
   */
  triggerReaction(type: 'click' | 'double_click' | 'pet' | 'poke'): void;

  /**
   * 进入思考状态
   */
  startThinking(): void;

  /**
   * 退出思考状态
   */
  stopThinking(): void;

  /**
   * 进入倾听状态（语音输入）
   */
  startListening(): void;

  /**
   * 退出倾听状态
   */
  stopListening(): void;

  /**
   * 播放提醒动画
   * @returns Promise<void> - 动画播放完成
   */
  playRemindAnimation(): Promise<void>;

  /**
   * 保存当前状态到存储
   * @returns Promise<void>
   */
  saveState(): Promise<void>;

  /**
   * 从存储恢复状态
   * @returns Promise<void>
   */
  restoreState(): Promise<void>;

  /**
   * 注册状态变更监听器
   * @param callback - 回调函数
   */
  onStateChange(callback: (state: PetState) => void): void;

  /**
   * 移除状态变更监听器
   * @param callback - 回调函数
   */
  offStateChange(callback: (state: PetState) => void): void;
}
```

## Animation State Machine

动画状态转换规则：

```
┌─────────────────────────────────────────────────────────────┐
│                    Animation State Machine                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐                                               │
│  │   idle   │◄────────────────────────────────────────────┐ │
│  └────┬─────┘                                             │ │
│       │                                                   │ │
│       │ timeout(5s)                                       │ │
│       ▼                                                   │ │
│  ┌────────────────┐                                       │ │
│  │ idle_variation │───────────────(complete)──────────────┘ │
│  └────────────────┘                                         │
│                                                             │
│  ┌──────────┐                                               │
│  │   idle   │                                               │
│  └────┬─────┘                                               │
│       │                                                     │
│       │ onClick                                             │
│       ▼                                                     │
│  ┌─────────────┐                                            │
│  │ react_click │───────────────(complete)──────►idle        │
│  └─────────────┘                                            │
│                                                             │
│  ┌──────────┐                                               │
│  │   idle   │                                               │
│  └────┬─────┘                                               │
│       │                                                     │
│       │ onDragStart                                         │
│       ▼                                                     │
│  ┌────────────┐         onDragEnd                           │
│  │ react_drag │─────────────────────────────────►idle       │
│  └────────────┘                                             │
│                                                             │
│  ┌──────────┐                                               │
│  │   idle   │                                               │
│  └────┬─────┘                                               │
│       │                                                     │
│       │ startThinking()                                     │
│       ▼                                                     │
│  ┌──────────┐         stopThinking()                        │
│  │ thinking │─────────────────────────────────►idle         │
│  └──────────┘                                               │
│                                                             │
│  ┌──────────┐                                               │
│  │   idle   │                                               │
│  └────┬─────┘                                               │
│       │                                                     │
│       │ startListening()                                    │
│       ▼                                                     │
│  ┌───────────┐        stopListening()                       │
│  │ listening │─────────────────────────────────►idle        │
│  └───────────┘                                              │
│                                                             │
│  ┌──────────┐                                               │
│  │   idle   │                                               │
│  └────┬─────┘                                               │
│       │                                                     │
│       │ playRemindAnimation()                               │
│       ▼                                                     │
│  ┌──────────┐                                               │
│  │  remind  │───────────────(complete)──────────►idle       │
│  └──────────┘                                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Emotion to Animation Mapping

情感状态与动画的映射关系：

| Emotion | Primary Animation | Secondary Animation | Transition Duration |
|---------|------------------|---------------------|---------------------|
| idle | idle | idle_variation | 0.3s |
| happy | react_click | talking | 0.2s |
| sad | idle (slow) | - | 0.5s |
| curious | idle_variation | thinking | 0.3s |
| thinking | thinking | - | 0.3s |
| listening | listening | - | 0.2s |
| confused | thinking (slow) | idle_variation | 0.4s |
| excited | react_click (fast) | - | 0.2s |

## Error Types

```typescript
/** 渲染器初始化错误 */
class RendererInitError extends Error {
  constructor(
    message: string,
    public readonly cause?: 'webgl_not_supported' | 'canvas_creation_failed' | 'unknown'
  ) {
    super(message);
    this.name = 'RendererInitError';
  }
}

/** 模型加载错误 */
class ModelLoadError extends Error {
  constructor(
    message: string,
    public readonly modelPath: string,
    public readonly cause?: 'file_not_found' | 'invalid_format' | 'parse_error' | 'unknown'
  ) {
    super(message);
    this.name = 'ModelLoadError';
  }
}

/** 动画初始化错误 */
class AnimationInitError extends Error {
  constructor(
    message: string,
    public readonly cause?: 'no_animation_data' | 'no_skeleton' | 'unknown'
  ) {
    super(message);
    this.name = 'AnimationInitError';
  }
}

/** 动画未找到错误 */
class AnimationNotFoundError extends Error {
  constructor(
    public readonly animationName: string,
    public readonly availableAnimations: string[]
  ) {
    super(`Animation '${animationName}' not found. Available: ${availableAnimations.join(', ')}`);
    this.name = 'AnimationNotFoundError';
  }
}

/** 皮肤加载错误 */
class SkinLoadError extends Error {
  constructor(
    message: string,
    public readonly skinId: string,
    public readonly cause?: 'not_found' | 'invalid_model' | 'no_skeleton' | 'unknown'
  ) {
    super(message);
    this.name = 'SkinLoadError';
  }
}
```

## Usage Examples

### 基础初始化

```typescript
import { PetRenderer, AnimationController, InteractionHandler, PetStateManager } from '@/renderer/pet';

async function initializePet(container: HTMLElement) {
  // 1. 初始化渲染器
  const renderer = new PetRenderer();
  await renderer.initialize(container, {
    antialias: true,
    pixelRatio: window.devicePixelRatio,
    targetFPS: 30
  });

  // 2. 加载模型
  const model = await renderer.loadModel('assets/models/default-pet.glb');

  // 3. 初始化动画控制器
  const animationController = new AnimationController();
  animationController.initialize(model);

  // 4. 初始化交互处理器
  const interactionHandler = new InteractionHandler();
  interactionHandler.initialize(renderer, container);

  // 5. 初始化状态管理器
  const stateManager = new PetStateManager();
  await stateManager.initialize(renderer, animationController, interactionHandler);

  // 6. 恢复保存的状态
  await stateManager.restoreState();

  // 7. 开始渲染
  renderer.startRenderLoop();

  return { renderer, animationController, interactionHandler, stateManager };
}
```

### 处理用户交互

```typescript
function setupInteractions(stateManager: IPetStateManager, interactionHandler: IInteractionHandler) {
  // 点击反应
  interactionHandler.onClick((event) => {
    if (event.type === 'single') {
      stateManager.triggerReaction('click');
    } else if (event.type === 'double') {
      // 双击打开对话界面
      window.electronAPI.openChatWindow();
    }
  });

  // 拖拽移动
  interactionHandler.onDrag((event) => {
    if (event.type === 'move') {
      stateManager.moveTo(event.screenPosition, false);
    } else if (event.type === 'end') {
      // 保存新位置
      stateManager.saveState();
    }
  });

  // 悬停效果
  interactionHandler.onHover((event) => {
    if (event.type === 'enter') {
      document.body.style.cursor = 'pointer';
    } else {
      document.body.style.cursor = 'default';
    }
  });
}
```

### AI对话时的动画协调

```typescript
async function handleAIChat(stateManager: IPetStateManager, message: string) {
  // 1. 进入思考状态
  stateManager.startThinking();

  try {
    // 2. 发送消息到AI
    const response = await window.electronAPI.sendChatMessage(message);

    // 3. 根据回复情感调整状态
    stateManager.setEmotion(response.emotion, 3000);

  } catch (error) {
    // 4. 错误时显示困惑
    stateManager.setEmotion('confused', 2000);
  } finally {
    // 5. 退出思考状态
    stateManager.stopThinking();
  }
}
```

### 提醒触发

```typescript
async function handleReminder(stateManager: IPetStateManager, reminder: Reminder) {
  // 播放提醒动画
  await stateManager.playRemindAnimation();

  // 显示系统通知
  new Notification(reminder.title, {
    body: reminder.description,
    icon: 'assets/icons/pet-icon.png'
  });

  // 恢复正常状态
  stateManager.setEmotion('idle');
}
```

## Performance Considerations

1. **渲染优化**
   - 空闲时降低帧率到 15fps
   - 交互时恢复到 30fps
   - 使用 `requestAnimationFrame` 控制渲染循环

2. **内存管理**
   - 及时释放未使用的纹理和几何体
   - 模型加载后缓存，避免重复加载
   - 使用 `dispose()` 清理资源

3. **动画优化**
   - 预加载常用动画
   - 使用动画混合而非硬切换
   - 离屏时暂停动画更新

## Related Contracts

- [AI Service Contract](./ai-service.md) - AI对话服务接口
- [IPC Protocol](./ipc-protocol.md) - 进程间通信协议