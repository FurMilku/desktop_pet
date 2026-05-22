/** 保存在模型目录 click-sequences/*.json 的点击动画序列 */

import { expandClickAnimationSequenceSteps } from './start-loop-end-sequence';

export const CLICK_SEQUENCE_FILE_VERSION = 1;

export interface ClickAnimationSequenceStep {
  clipName: string;
  /** 本步播完后、下一步之前的间隔（毫秒） */
  delayAfterMs?: number;
}

export interface ClickAnimationSequenceFile {
  version: typeof CLICK_SEQUENCE_FILE_VERSION;
  name: string;
  steps: ClickAnimationSequenceStep[];
}

export interface ClickAnimationSequenceSummary {
  id: string;
  name: string;
}

function normalizeSequenceStep(raw: unknown): ClickAnimationSequenceStep | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const step = raw as {
    clipName?: string;
    delayAfterMs?: number;
    loopGroup?: {
      startClipName?: string;
      loopClipName?: string;
      endClipName?: string;
      loopCount?: number;
      loopCountMin?: number;
      loopCountMax?: number;
    };
  };

  if (step.loopGroup) {
    return null;
  }

  if (typeof step.clipName === 'string' && step.clipName) {
    return {
      clipName: step.clipName,
      delayAfterMs: Math.max(0, Number(step.delayAfterMs) || 0),
    };
  }

  return null;
}

export function createEmptySequenceFile(name: string): ClickAnimationSequenceFile {
  return {
    version: CLICK_SEQUENCE_FILE_VERSION,
    name,
    steps: [],
  };
}

export function normalizeClickAnimationSequenceFile(
  raw: unknown
): ClickAnimationSequenceFile | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : '未命名序列';
  const rawSteps = Array.isArray(obj.steps) ? obj.steps : [];
  const steps = expandClickAnimationSequenceSteps(
    rawSteps
      .map((s) => normalizeSequenceStep(s) ?? s)
      .filter((s) => s !== null) as ClickAnimationSequenceStep[]
  ).filter((s) => s.clipName);

  return {
    version: CLICK_SEQUENCE_FILE_VERSION,
    name,
    steps,
  };
}

/** 将显示名转为安全的文件 id（仅 ASCII，与 click-sequence-store 的 SAFE_ID 一致） */
export function slugifySequenceId(name: string): string {
  const base = name
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 48);
  return base || 'sequence';
}
