import {
  MAX_MODEL_SCALE,
  MIN_MODEL_SCALE,
  clampModelScale,
} from './pet-desktop-settings';

/**
 * Windows 显示缩放基准（100%）。
 * 拖动速度、模型缩放等常量均在此缩放下调校。
 */
export const REFERENCE_DISPLAY_SCALE = 1;

/** 当前显示缩放相对基准的倍率 */
export function displayScaleRatio(scaleFactor: number): number {
  const safe = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : REFERENCE_DISPLAY_SCALE;
  return safe / REFERENCE_DISPLAY_SCALE;
}

/** 将基准像素量换算到当前显示缩放（用于拖动距离、阈值等） */
export function scaleDragMetric(basePixels: number, scaleFactor: number): number {
  return basePixels * displayScaleRatio(scaleFactor);
}

/** 拖动速度补偿：Windows 显示缩放越高，窗口追鼠标的飞行/行走速度越慢 */
export function dragSpeedScaleRatio(scaleFactor: number): number {
  const ratio = displayScaleRatio(scaleFactor);
  return ratio > 0 ? REFERENCE_DISPLAY_SCALE / ratio : REFERENCE_DISPLAY_SCALE;
}

export function scaleDragSpeedMetric(baseSpeed: number, scaleFactor: number): number {
  return baseSpeed * dragSpeedScaleRatio(scaleFactor);
}

/** 设置界面/运行时可见的模型缩放范围（随 Windows 显示缩放换算） */
export function effectiveModelScaleLimits(scaleFactor: number): {
  min: number;
  max: number;
} {
  const ratio = displayScaleRatio(scaleFactor);
  return {
    min: MIN_MODEL_SCALE * ratio,
    max: MAX_MODEL_SCALE * ratio,
  };
}

export function clampEffectiveModelScale(
  effectiveScale: number,
  scaleFactor: number
): number {
  const { min, max } = effectiveModelScaleLimits(scaleFactor);
  return Math.min(max, Math.max(min, effectiveScale));
}

/** 持久化配置 → 运行时实际模型缩放 */
export function applyDisplayScaleToModelScale(storedScale: number, scaleFactor: number): number {
  return clampModelScale(storedScale) * displayScaleRatio(scaleFactor);
}

/** 设置界面显示/编辑值 → 持久化配置 */
export function unapplyDisplayScaleFromModelScale(
  displayScale: number,
  scaleFactor: number
): number {
  const ratio = displayScaleRatio(scaleFactor);
  if (ratio <= 0) {
    return clampModelScale(displayScale);
  }
  return clampModelScale(clampEffectiveModelScale(displayScale, scaleFactor) / ratio);
}

/** 拖动相关像素常量（在 REFERENCE_DISPLAY_SCALE 下调校） */
export interface DragMetricBaselines {
  dragThreshold: number;
  flyMoveSpeedMin: number;
  flyMoveSpeedMax: number;
  flySpeedDistRef: number;
  flyArriveDist: number;
  flyEaseRadius: number;
  flyMouseMoveThreshold: number;
  walkDragRunSpeed: number;
}

export const DRAG_METRIC_BASELINES: DragMetricBaselines = {
  dragThreshold: 2,
  flyMoveSpeedMin: 360,
  flyMoveSpeedMax: 1180,
  flySpeedDistRef: 380,
  flyArriveDist: 18,
  flyEaseRadius: 220,
  flyMouseMoveThreshold: 2,
  walkDragRunSpeed: 640,
};

export type ScaledDragMetrics = DragMetricBaselines;

export function scaleDragMetrics(
  scaleFactor: number,
  baselines: DragMetricBaselines = DRAG_METRIC_BASELINES
): ScaledDragMetrics {
  return {
    dragThreshold: scaleDragMetric(baselines.dragThreshold, scaleFactor),
    flyMoveSpeedMin: scaleDragSpeedMetric(baselines.flyMoveSpeedMin, scaleFactor),
    flyMoveSpeedMax: scaleDragSpeedMetric(baselines.flyMoveSpeedMax, scaleFactor),
    flySpeedDistRef: scaleDragMetric(baselines.flySpeedDistRef, scaleFactor),
    flyArriveDist: scaleDragMetric(baselines.flyArriveDist, scaleFactor),
    flyEaseRadius: scaleDragMetric(baselines.flyEaseRadius, scaleFactor),
    flyMouseMoveThreshold: scaleDragMetric(baselines.flyMouseMoveThreshold, scaleFactor),
    walkDragRunSpeed: scaleDragSpeedMetric(baselines.walkDragRunSpeed, scaleFactor),
  };
}
