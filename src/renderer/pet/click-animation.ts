import {
  parseSequencePoolKey,
  type ClickAnimationPoolEntry,
  type ClickAnimationSequenceStep,
  type ClickAnimationSettings,
} from '../../shared/config/pet-desktop-settings';
/**
 * 按权重从池中选取剪辑名；池为空或总权重为 0 时从 fallback 中随机
 */
/** 该池条目能否解析出可播放步骤（序列须已加载步骤） */
export function resolvePoolEntrySteps(
  entry: ClickAnimationPoolEntry,
  settings: ClickAnimationSettings
): ClickAnimationSequenceStep[] | null {
  if (!entry.clipName) {
    return null;
  }
  const seqId = parseSequencePoolKey(entry.clipName);
  if (seqId) {
    const steps = settings.sequenceStepsById?.[seqId] ?? [];
    return steps.length > 0 ? steps : null;
  }
  return [{ clipName: entry.clipName }];
}

export function poolEntriesWithResolvableSteps(
  pool: ClickAnimationPoolEntry[],
  settings: ClickAnimationSettings
): ClickAnimationPoolEntry[] {
  return pool.filter((e) => resolvePoolEntrySteps(e, settings) !== null);
}

export function pickWeightedClipName(
  pool: ClickAnimationPoolEntry[],
  fallbackClipNames: string[]
): string | null {
  const enabled = pool.filter((e) => e.clipName && e.weight > 0);
  const candidates =
    enabled.length > 0
      ? enabled
      : pool.filter((e) => e.clipName).map((e) => ({ ...e, weight: 1 }));

  if (candidates.length === 0) {
    if (fallbackClipNames.length === 0) {
      return null;
    }
    return fallbackClipNames[Math.floor(Math.random() * fallbackClipNames.length)]!;
  }

  const totalWeight = candidates.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of candidates) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.clipName;
    }
  }
  return candidates[candidates.length - 1]!.clipName;
}

export function resolveClickAnimationSteps(
  settings: ClickAnimationSettings,
  fallbackClipNames: string[]
): ClickAnimationSequenceStep[] {
  if (settings.activeSequenceId) {
    const steps = settings.sequenceSteps ?? [];
    if (steps.length > 0) {
      return steps;
    }
  }

  const pool = poolEntriesWithResolvableSteps(settings.pool, settings);
  const name = pickWeightedClipName(pool, fallbackClipNames);
  if (!name) {
    return [];
  }

  const entry = pool.find((e) => e.clipName === name) ?? { clipName: name, weight: 1 };
  return resolvePoolEntrySteps(entry, settings) ?? [];
}
