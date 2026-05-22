/**
 * 宠物窗口配置
 * 公共变量，用于统一管理宠物窗口尺寸
 * 主进程和渲染进程都使用这些常量
 */

// ============================================================================
// 窗口尺寸配置
// ============================================================================

/**
 * 宠物窗口默认宽度（像素）
 * 用户可以通过修改此值来调整宠物大小
 */
export const PET_WINDOW_WIDTH = 600;

/**
 * 宠物窗口默认高度（像素）
 * 用户可以通过修改此值来调整宠物大小
 */
export const PET_WINDOW_HEIGHT = 800;

/** 飞行/大动作时窗口宽度下限 */
export const PET_WINDOW_MIN_WIDTH = 400;

/** 飞行/大动作时窗口高度下限 */
export const PET_WINDOW_MIN_HEIGHT = 500;

/** 飞行/大动作时窗口宽度上限 */
export const PET_WINDOW_MAX_WIDTH = 1200;

/** 飞行/大动作时窗口高度上限 */
export const PET_WINDOW_MAX_HEIGHT = 1400;

/** 飞行自适应视口边距（像素） */
export const PET_FLY_VIEWPORT_PADDING = 56;

/** 设置项：是否显示窗口边缘并允许手动调整大小 */
export const SETTING_SHOW_WINDOW_FRAME = 'pet.showWindowFrame';

// ============================================================================
// 窗口尺寸对象（便于解构使用）
// ============================================================================

/**
 * 宠物窗口尺寸配置对象
 * 包含宽度和高度，便于一次性获取
 */
export const PET_WINDOW_SIZE = {
  width: PET_WINDOW_WIDTH,
  height: PET_WINDOW_HEIGHT,
} as const;

// ============================================================================
// 尺寸预设（可选）
// ============================================================================

/**
 * 预设尺寸选项
 * 用户可以选择不同的尺寸预设
 */
export const PET_SIZE_PRESETS = {
  /** 小尺寸 */
  small: { width: 100, height: 133 },
  /** 中等尺寸（默认） */
  medium: { width: 150, height: 200 },
  /** 大尺寸 */
  large: { width: 225, height: 300 },
  /** 超大尺寸 */
  xlarge: { width: 300, height: 400 },
} as const;

/**
 * 尺寸预设名称类型
 */
export type PetSizePreset = keyof typeof PET_SIZE_PRESETS;

/**
 * 根据预设名称获取窗口尺寸
 * @param preset 预设名称
 * @returns 窗口尺寸 { width, height }
 */
export function getWindowSizeByPreset(preset: PetSizePreset): { width: number; height: number } {
  return { ...PET_SIZE_PRESETS[preset] };
}