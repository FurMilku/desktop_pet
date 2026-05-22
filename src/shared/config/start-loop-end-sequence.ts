import type { ClickAnimationSequenceStep } from './click-animation-sequence-file';

export type StartLoopEndPhase = 'start' | 'loop' | 'end';

const PHASE_SET = new Set<StartLoopEndPhase>(['start', 'loop', 'end']);

/** @deprecated 旧版 JSON 中的 loopGroup；加载时会被展开为逐步 clipName */
export interface ClickAnimationLoopGroup {
  startClipName: string;
  loopClipName: string;
  endClipName: string;
  loopCount?: number;
  loopCountMin?: number;
  loopCountMax?: number;
}

export interface StartLoopEndTriplet {
  baseKey: string;
  displayLabel: string;
  startClipName: string;
  loopClipName: string;
  endClipName: string;
}

function clipNameSegments(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((s) => s.length > 0);
}

function isCurvesClipName(name: string): boolean {
  const t = name.trim();
  if (/_curves/i.test(t)) {
    return true;
  }
  return /curves$/i.test(t);
}

export function parseStartLoopEndPhaseClip(clipName: string): {
  baseKey: string;
  phase: StartLoopEndPhase;
} | null {
  if (!clipName.trim() || isCurvesClipName(clipName)) {
    return null;
  }
  const segments = clipNameSegments(clipName);
  const last = segments[segments.length - 1];
  if (!last || !PHASE_SET.has(last as StartLoopEndPhase)) {
    return null;
  }
  const baseSegs = segments.slice(0, -1);
  if (baseSegs.length === 0) {
    return null;
  }
  return { baseKey: baseSegs.join('_'), phase: last as StartLoopEndPhase };
}

function displayLabelForStartLoopEndBase(
  startClipName: string,
  loopClipName: string,
  endClipName: string
): string {
  const strip = (n: string) =>
    n.replace(/_(start|loop|end)$/i, '').replace(/(start|loop|end)$/i, '');
  const a = strip(startClipName);
  if (a === strip(loopClipName) && a === strip(endClipName) && a) {
    return a;
  }
  return startClipName.replace(/_?(start|loop|end)$/i, '');
}

export function detectStartLoopEndTriplets(clipNames: string[]): StartLoopEndTriplet[] {
  const byBase = new Map<string, Partial<Record<StartLoopEndPhase, string>>>();

  for (const name of clipNames) {
    const parsed = parseStartLoopEndPhaseClip(name);
    if (!parsed) continue;
    let bucket = byBase.get(parsed.baseKey);
    if (!bucket) {
      bucket = {};
      byBase.set(parsed.baseKey, bucket);
    }
    if (!bucket[parsed.phase]) {
      bucket[parsed.phase] = name;
    }
  }

  const result: StartLoopEndTriplet[] = [];
  for (const [baseKey, bucket] of byBase) {
    const { start, loop, end } = bucket;
    if (!start || !loop || !end) continue;
    result.push({
      baseKey,
      displayLabel: displayLabelForStartLoopEndBase(start, loop, end),
      startClipName: start,
      loopClipName: loop,
      endClipName: end,
    });
  }
  return result.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
}

export function normalizeLoopCount(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 99);
}

function resolveLoopRepeatCount(group: ClickAnimationLoopGroup, random = Math.random): number {
  const minRaw = group.loopCountMin;
  const maxRaw = group.loopCountMax;
  const hasMin = minRaw !== undefined && minRaw !== null;
  const hasMax = maxRaw !== undefined && maxRaw !== null;

  if (hasMin || hasMax) {
    const min = normalizeLoopCount(hasMin ? minRaw : maxRaw);
    const max = normalizeLoopCount(hasMax ? maxRaw : minRaw);
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    if (lo === hi) return lo;
    return lo + Math.floor(random() * (hi - lo + 1));
  }
  return normalizeLoopCount(group.loopCount ?? 1);
}

/** 将旧版 loopGroup 步骤展开为逐步 clipName（新版 JSON 直接存展开结果） */
export function expandClickAnimationSequenceSteps(
  steps: Array<ClickAnimationSequenceStep | { loopGroup?: ClickAnimationLoopGroup; delayAfterMs?: number }>,
  random = Math.random
): ClickAnimationSequenceStep[] {
  const out: ClickAnimationSequenceStep[] = [];

  for (const step of steps) {
    const lg = (step as { loopGroup?: ClickAnimationLoopGroup }).loopGroup;
    if (
      lg &&
      lg.startClipName &&
      lg.loopClipName &&
      lg.endClipName
    ) {
      const repeats = resolveLoopRepeatCount(lg, random);
      out.push({ clipName: lg.startClipName });
      for (let i = 0; i < repeats; i++) {
        out.push({ clipName: lg.loopClipName });
      }
      out.push({
        clipName: lg.endClipName,
        delayAfterMs: step.delayAfterMs,
      });
      continue;
    }

    if (step.clipName) {
      out.push({
        clipName: step.clipName,
        delayAfterMs: step.delayAfterMs,
      });
    }
  }

  return out;
}

/** 生成可直接保存/播放的逐步序列：Start → Loop×N → End */
export function buildFlatStepsFromTriplet(
  triplet: StartLoopEndTriplet,
  loopCount = 2
): ClickAnimationSequenceStep[] {
  const n = normalizeLoopCount(loopCount);
  const steps: ClickAnimationSequenceStep[] = [{ clipName: triplet.startClipName }];
  for (let i = 0; i < n; i++) {
    steps.push({ clipName: triplet.loopClipName });
  }
  steps.push({ clipName: triplet.endClipName });
  return steps;
}
