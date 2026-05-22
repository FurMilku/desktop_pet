import type { BufferAttribute, BufferGeometry } from 'three';

export interface UvRangeStats {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  spanU: number;
  spanV: number;
}

/** 从 BufferAttribute 统计 UV 范围 */
export function uvRangeStatsFromAttribute(attr: BufferAttribute): UvRangeStats {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (let i = 0; i < attr.count; i++) {
    const u = attr.getX(i);
    const v = attr.getY(i);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }

  if (!Number.isFinite(minU)) {
    return { minU: 0, maxU: 0, minV: 0, maxV: 0, spanU: 0, spanV: 0 };
  }

  return {
    minU,
    maxU,
    minV,
    maxV,
    spanU: maxU - minU,
    spanV: maxV - minV,
  };
}

/** 统计几何体某一 primitive 区段（groups）的 UV 范围 */
export function uvRangeStatsForSegment(
  attr: BufferAttribute,
  start: number,
  count: number
): UvRangeStats {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (let i = start; i < start + count; i++) {
    const u = attr.getX(i);
    const v = attr.getY(i);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }

  if (!Number.isFinite(minU)) {
    return { minU: 0, maxU: 0, minV: 0, maxV: 0, spanU: 0, spanV: 0 };
  }

  return {
    minU,
    maxU,
    minV,
    maxV,
    spanU: maxU - minU,
    spanV: maxV - minV,
  };
}

function copyUvSegment(
  from: BufferAttribute,
  to: BufferAttribute,
  start: number,
  count: number
): void {
  for (let i = start; i < start + count; i++) {
    to.setXY(i, from.getX(i), from.getY(i));
  }
  to.needsUpdate = true;
}

/**
 * 手游双 UV：仅在「该 primitive 区段」上判定，避免整网格替换导致另一材质 UV 全毁。
 */
export function shouldPreferSecondaryUv(uv0: UvRangeStats, uv1: UvRangeStats): boolean {
  if (uv1.spanU < 0.15 || uv1.spanV < 0.15) {
    return false;
  }
  if (uv0.maxU <= 1.05 && uv0.maxV <= 1.05) {
    return false;
  }
  if (uv1.maxU > 1.02 || uv1.minU < -0.02) {
    return false;
  }
  if (uv1.maxV > 1.02 || uv1.minV < -0.02) {
    return false;
  }
  return true;
}

/** UV0 超出 0..1 时多为图集平铺，应使用 Repeat 而非改 UV 通道 */
export function shouldUseRepeatUvWrap(uv0: UvRangeStats): boolean {
  return uv0.maxU > 1.02 || uv0.maxV > 1.02 || uv0.minU < -0.02 || uv0.minV < -0.02;
}

export interface MeshUvFixResult {
  swappedSegmentCount: number;
  repeatMaterialIndices: number[];
}

/**
 * 按 geometry.groups 逐 primitive 修正 UV，并标记需要 Repeat 包裹的材质下标。
 */
export function fixMeshGameUvLayout(geometry: BufferGeometry): MeshUvFixResult {
  const uv0 = geometry.getAttribute('uv') as BufferAttribute | undefined;
  const uv1 = geometry.getAttribute('uv1') as BufferAttribute | undefined;
  const result: MeshUvFixResult = { swappedSegmentCount: 0, repeatMaterialIndices: [] };

  if (!uv0) {
    return result;
  }

  const groups =
    geometry.groups.length > 0
      ? geometry.groups
      : [{ start: 0, count: uv0.count, materialIndex: 0 }];

  const repeatIndices = new Set<number>();

  for (const group of groups) {
    const s0 = uvRangeStatsForSegment(uv0, group.start, group.count);

    if (uv1 && uv1.count === uv0.count) {
      const s1 = uvRangeStatsForSegment(uv1, group.start, group.count);
      if (shouldPreferSecondaryUv(s0, s1)) {
        copyUvSegment(uv1, uv0, group.start, group.count);
        result.swappedSegmentCount++;
        continue;
      }
    }

    if (shouldUseRepeatUvWrap(s0)) {
      repeatIndices.add(group.materialIndex ?? 0);
    }
  }

  result.repeatMaterialIndices = [...repeatIndices];
  return result;
}

/** @deprecated 整网格替换会破坏多材质子网格，请用 fixMeshGameUvLayout */
export function preferSecondaryUvIfNeeded(geometry: BufferGeometry): boolean {
  return fixMeshGameUvLayout(geometry).swappedSegmentCount > 0;
}
