import type { AnimationClip } from 'three';

/** 名称规范化：小写并去掉非字母数字 */
export function normalizeClipNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 按下划线等拆分为命名段，如 World_Idle → ['world','idle'] */
export function clipNameSegments(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((s) => s.length > 0);
}

/**
 * 是否为表情 Curves 剪辑。
 * - `World_IdleCurves`：Curves 紧接在主体名后
 * - `Common_Shock_Curves.001`：`_Curves` 段 + Blender 数字后缀
 */
export function isCurvesClipName(name: string): boolean {
  const t = name.trim();
  if (/_curves/i.test(t)) {
    return true;
  }
  return /curves$/i.test(t);
}

/** 从 Curves 剪辑名还原对应的主体剪辑名 */
export function curvesBaseClipName(name: string): string {
  const t = name.trim();
  if (/_curves/i.test(t)) {
    return t.replace(/_curves/i, '');
  }
  return t.replace(/curves$/i, '');
}

/**
 * 严格关键词匹配（不分大小写）：
 * - 须有完整命名段等于 keyword（如 World_Idle 的 idle）
 * - 或整段以 keyword 结尾且 keyword≥4（如 worldidle 匹配 worldidle）
 */
export function clipNameMatchesKeyword(name: string, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  if (kw.length < 3) {
    return false;
  }

  const segments = clipNameSegments(name);
  if (segments.some((s) => s === kw)) {
    return true;
  }

  if (kw.length >= 4) {
    return segments.some((s) => s.endsWith(kw) && s.length >= kw.length);
  }

  return false;
}

/** 排除词：任一段落等于 keyword，或（keyword≥4 时）规范化全名包含 */
export function clipNameMatchesExclude(name: string, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  if (kw.length < 3) {
    return false;
  }

  const segments = clipNameSegments(name);
  if (segments.some((s) => s === kw)) {
    return true;
  }

  if (kw.length >= 4) {
    const key = normalizeClipNameKey(name);
    return key.includes(kw);
  }

  return false;
}

/** @deprecated 仅用于飞行等复合词；优先用 clipNameMatchesKeyword */
export function clipNameFuzzyIncludes(haystack: string, needle: string): boolean {
  return clipNameMatchesKeyword(haystack, needle);
}

export function isCalloutClipName(name: string): boolean {
  return clipNameMatchesKeyword(name, 'callout');
}

/** 从关键帧轨道名解析骨骼节点名（如 Bip001-Spine.position → Bip001-Spine） */
export function boneNameFromTrack(trackName: string): string {
  const path = trackName.replace(/\.(position|scale|quaternion|weight|morphtargetinfluences)$/i, '');
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

/**
 * 根运动骨骼：剥离其 position/scale 避免宠物在桌面漂移；子骨骼位移需保留。
 */
export function isRootMotionBoneName(nodeName: string): boolean {
  if (/^root$/i.test(nodeName)) {
    return true;
  }
  if (/^bip001$/i.test(nodeName)) {
    return true;
  }
  if (/^bip001-pelvis$/i.test(nodeName)) {
    return true;
  }
  if (/^skm_/i.test(nodeName)) {
    return true;
  }
  if (/[_-]root$/i.test(nodeName) || /^s\d+_g0_/i.test(nodeName)) {
    return true;
  }
  return false;
}

export function isRootMotionTrack(trackName: string): boolean {
  return isRootMotionBoneName(boneNameFromTrack(trackName));
}

export interface FindClipOptions {
  /** 须匹配的关键词（段匹配） */
  matchKeywords: string[];
  excludeKeywords?: string[];
  /** 优先级：按顺序尝试更具体的段名 */
  priorityKeywords?: string[];
  excludeCurves?: boolean;
  predicate?: (clip: AnimationClip) => boolean;
}

export function findClipByKeywords(
  clips: AnimationClip[],
  options: FindClipOptions
): AnimationClip | null {
  const {
    matchKeywords,
    excludeKeywords = [],
    priorityKeywords = [],
    excludeCurves = true,
    predicate,
  } = options;

  const pool = clips.filter((c) => {
    if (excludeCurves && isCurvesClipName(c.name)) {
      return false;
    }
    if (predicate && !predicate(c)) {
      return false;
    }
    for (const ex of excludeKeywords) {
      if (clipNameMatchesExclude(c.name, ex)) {
        return false;
      }
    }
    if (!matchKeywords.some((kw) => clipNameMatchesKeyword(c.name, kw))) {
      return false;
    }
    return true;
  });

  for (const kw of priorityKeywords) {
    const found = pool.find((c) => clipNameMatchesKeyword(c.name, kw));
    if (found) {
      return found;
    }
  }

  return pool[0] ?? null;
}

/** @deprecated 使用 findClipByKeywords */
export function findClipFuzzy(
  clips: AnimationClip[],
  options: {
    includeKeywords?: string[];
    excludeKeywords?: string[];
    priorityContains?: string[];
    excludeCurves?: boolean;
    predicate?: (clip: AnimationClip) => boolean;
  } = {}
): AnimationClip | null {
  return findClipByKeywords(clips, {
    matchKeywords: options.includeKeywords ?? [],
    excludeKeywords: options.excludeKeywords,
    priorityKeywords: options.priorityContains,
    excludeCurves: options.excludeCurves,
    predicate: options.predicate,
  });
}

export function buildCurvesClipMap(clips: AnimationClip[]): Map<string, AnimationClip> {
  const bodyNames = new Set(
    clips.filter((c) => !isCurvesClipName(c.name)).map((c) => normalizeClipNameKey(c.name))
  );
  const map = new Map<string, AnimationClip>();

  for (const curves of clips) {
    if (!isCurvesClipName(curves.name)) {
      continue;
    }
    const baseKey = normalizeClipNameKey(curvesBaseClipName(curves.name));
    if (bodyNames.has(baseKey)) {
      map.set(baseKey, curves);
    }
  }

  return map;
}

export function findCurvesCompanion(
  baseClipName: string,
  curvesMap: Map<string, AnimationClip>
): AnimationClip | null {
  return curvesMap.get(normalizeClipNameKey(baseClipName)) ?? null;
}
