import {
  parseSequencePoolKey,
  type ClickAnimationPoolEntry,
  type ClickAnimationSequenceStep,
  type ClickAnimationSettings,
} from '../../shared/config/pet-desktop-settings';

/** 序列每一步的剪辑均存在于当前模型时才视为可播 */
export function stepsArePlayableOnModel(
  steps: ClickAnimationSequenceStep[],
  availableClipNames?: ReadonlySet<string> | readonly string[] | null
): boolean {
  if (steps.length === 0) {
    return false;
  }
  if (!availableClipNames) {
    return true;
  }
  const available =
    availableClipNames instanceof Set
      ? availableClipNames
      : new Set(availableClipNames);
  return steps.every((s) => s.clipName && available.has(s.clipName));
}

/** 该池条目能否解析出可播放步骤（序列须已加载步骤，且剪辑在当前模型中存在） */
export function resolvePoolEntrySteps(
  entry: ClickAnimationPoolEntry,
  settings: ClickAnimationSettings,
  availableClipNames?: ReadonlySet<string> | readonly string[] | null
): ClickAnimationSequenceStep[] | null {
  if (!entry.clipName) {
    return null;
  }
  const seqId = parseSequencePoolKey(entry.clipName);
  if (seqId) {
    const steps = settings.sequenceStepsById?.[seqId] ?? [];
    return stepsArePlayableOnModel(steps, availableClipNames) ? steps : null;
  }
  if (!stepsArePlayableOnModel([{ clipName: entry.clipName }], availableClipNames)) {
    return null;
  }
  return [{ clipName: entry.clipName }];
}

export function poolEntriesWithResolvableSteps(
  pool: ClickAnimationPoolEntry[],
  settings: ClickAnimationSettings,
  availableClipNames?: ReadonlySet<string> | readonly string[] | null
): ClickAnimationPoolEntry[] {
  return pool.filter((e) => resolvePoolEntrySteps(e, settings, availableClipNames) !== null);
}

/**
 * 按权重从池中选取剪辑名；池为空或总权重为 0 时从 fallback 中随机
 */
export function pickWeightedClipName(
  pool: ClickAnimationPoolEntry[],
  fallbackClipNames: string[],
  availableClipNames?: ReadonlySet<string> | readonly string[] | null
): string | null {
  const available =
    availableClipNames instanceof Set
      ? availableClipNames
      : availableClipNames
        ? new Set(availableClipNames)
        : null;

  const enabled = pool.filter((e) => e.clipName && e.weight > 0);
  const candidates =
    enabled.length > 0
      ? enabled
      : pool.filter((e) => e.clipName).map((e) => ({ ...e, weight: 1 }));

  if (candidates.length === 0) {
    const playableFallback = available
      ? fallbackClipNames.filter((name) => available.has(name))
      : fallbackClipNames;
    if (playableFallback.length === 0) {
      return null;
    }
    return playableFallback[Math.floor(Math.random() * playableFallback.length)]!;
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
  fallbackClipNames: string[],
  availableClipNames?: readonly string[]
): ClickAnimationSequenceStep[] {
  const available =
    availableClipNames && availableClipNames.length > 0
      ? new Set(availableClipNames)
      : null;

  if (settings.activeSequenceId) {
    const steps = settings.sequenceSteps ?? [];
    if (stepsArePlayableOnModel(steps, available)) {
      return steps;
    }
  }

  const pool = poolEntriesWithResolvableSteps(settings.pool, settings, available);
  const name = pickWeightedClipName(pool, fallbackClipNames, available);
  if (!name) {
    return [];
  }

  const entry = pool.find((e) => e.clipName === name) ?? { clipName: name, weight: 1 };
  return resolvePoolEntrySteps(entry, settings, available) ?? [];
}
