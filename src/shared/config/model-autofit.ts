/**
 * 模型 autoFit 缩放：仅缩小超过目标尺寸的模型，不把矮小角色放大到统一尺寸。
 * 避免小体型 GLB 在桌面上看起来比大体型角色还大。
 */

export interface ModelBoundsSize {
  x: number;
  y: number;
  z: number;
}

/** 用于 autoFit 的体型尺度：优先身高（Y），极扁模型回退到最大轴向 */
export function autoFitDimensionFromBounds(size: ModelBoundsSize): number {
  const { x, y, z } = size;
  const maxAxis = Math.max(x, y, z);
  if (!Number.isFinite(maxAxis) || maxAxis <= 0) {
    return 0;
  }
  if (Number.isFinite(y) && y > 1e-6 && y >= maxAxis * 0.35) {
    return y;
  }
  return maxAxis;
}

/**
 * 在现有缩放上追加的 autoFit 倍率（≤ 1）。
 * 仅当 mesh 尺度大于 targetSize 时缩小；较小模型保持原始比例。
 */
export function computeAutoFitScaleMultiplier(
  boundsSize: ModelBoundsSize,
  targetSize: number
): number {
  if (!Number.isFinite(targetSize) || targetSize <= 0) {
    return 1;
  }

  const dimension = autoFitDimensionFromBounds(boundsSize);
  if (dimension <= 0) {
    return 1;
  }

  if (dimension <= targetSize) {
    return 1;
  }

  return targetSize / dimension;
}
