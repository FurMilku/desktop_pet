import type { ClickAnimationSequenceStep } from './click-animation-sequence-file';
import {
  clampPlaybackSpeed,
  clampSourceAnimationFps,
  DEFAULT_PLAYBACK_SPEED,
  DEFAULT_SOURCE_ANIMATION_FPS,
} from './pet-model-settings';
import {
  PET_WINDOW_HEIGHT,
  PET_WINDOW_MAX_HEIGHT,
  PET_WINDOW_MAX_WIDTH,
  PET_WINDOW_MIN_HEIGHT,
  PET_WINDOW_MIN_WIDTH,
  PET_WINDOW_WIDTH,
} from './pet-window';

export type { ClickAnimationSequenceStep };

/** 随机池中序列条目的 clipName 前缀，后接序列文件 id */
export const SEQUENCE_POOL_PREFIX = 'seq:';

export function sequencePoolKey(sequenceId: string): string {
  return `${SEQUENCE_POOL_PREFIX}${sequenceId}`;
}

export function parseSequencePoolKey(clipName: string): string | null {
  if (!clipName.startsWith(SEQUENCE_POOL_PREFIX)) {
    return null;
  }
  const id = clipName.slice(SEQUENCE_POOL_PREFIX.length);
  return id || null;
}

/** 随机模式：单个剪辑及其权重 */
export interface ClickAnimationPoolEntry {
  clipName: string;
  /** 相对权重（≥0，全为 0 时均分） */
  weight: number;
}

export interface ClickAnimationSettings {
  pool: ClickAnimationPoolEntry[];
  /** 选中的序列文件 id（无扩展名）；null 表示按权重随机 */
  activeSequenceId: string | null;
  /** 由主进程从模型目录 JSON 解析，不写入数据库 */
  sequenceSteps?: ClickAnimationSequenceStep[];
  /** 随机池中引用的序列步骤（key 为序列 id） */
  sequenceStepsById?: Record<string, ClickAnimationSequenceStep[]>;
}

export interface PetDesktopConfig {
  windowWidth: number;
  windowHeight: number;
  /** assets/models 下的 .glb 文件名；null 表示自动选择默认模型 */
  modelFileName: string | null;
  /** 在 autoFit 之后的额外缩放倍率 */
  modelScale: number;
  /** 模型整体亮度倍率（灯光与材质环境反射） */
  modelBrightness: number;
  /** 该模型动画源帧率（帧号轨道换算，默认 120） */
  sourceAnimationFps: number;
  /** 播放速度倍率（1 = 正常） */
  playbackSpeed: number;
  position: {
    x: number;
    y: number;
    monitor: number;
  };
  clickAnimation: ClickAnimationSettings;
}

export const PET_DESKTOP_CONFIG_KEY = 'pet.desktopConfig';

/** 仅写入数据库的全局桌面配置（窗口与当前模型指针） */
export interface PetGlobalDesktopConfig {
  windowWidth: number;
  windowHeight: number;
  modelFileName: string | null;
  position: {
    x: number;
    y: number;
    monitor: number;
  };
}

export function extractGlobalDesktopConfig(
  config: PetDesktopConfig
): PetGlobalDesktopConfig {
  return {
    windowWidth: config.windowWidth,
    windowHeight: config.windowHeight,
    modelFileName: config.modelFileName,
    position: { ...config.position },
  };
}

export function mergeGlobalAndModelSettings(
  global: PetGlobalDesktopConfig,
  model: {
    modelScale: number;
    modelBrightness: number;
    sourceAnimationFps: number;
    playbackSpeed: number;
    clickAnimation: ClickAnimationSettings;
  }
): PetDesktopConfig {
  return normalizePetDesktopConfig({
    ...global,
    modelScale: model.modelScale,
    modelBrightness: model.modelBrightness,
    sourceAnimationFps: model.sourceAnimationFps,
    playbackSpeed: model.playbackSpeed,
    clickAnimation: model.clickAnimation,
  });
}

export const DEFAULT_CLICK_ANIMATION: ClickAnimationSettings = {
  pool: [],
  activeSequenceId: null,
};

export function clampWindowWidth(width: number): number {
  return Math.round(
    Math.min(PET_WINDOW_MAX_WIDTH, Math.max(PET_WINDOW_MIN_WIDTH, width))
  );
}

export function clampWindowHeight(height: number): number {
  return Math.round(
    Math.min(PET_WINDOW_MAX_HEIGHT, Math.max(PET_WINDOW_MIN_HEIGHT, height))
  );
}

/** 100% 显示缩放下可存的最小倍率；高 DPI 下有效最小值 = 本值 × Windows 缩放比例 */
export const MIN_MODEL_SCALE = 0.15;
export const MAX_MODEL_SCALE = 3;

export function clampModelScale(scale: number): number {
  return Math.min(MAX_MODEL_SCALE, Math.max(MIN_MODEL_SCALE, scale));
}

export function clampModelBrightness(brightness: number): number {
  return Math.min(2, Math.max(0.25, brightness));
}

/** 规范化模型文件名（仅保留非空字符串） */
export function normalizeModelFileName(
  raw: string | null | undefined
): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createDefaultPetDesktopConfig(
  overrides?: Partial<PetDesktopConfig>
): PetDesktopConfig {
  return {
    windowWidth: PET_WINDOW_WIDTH,
    windowHeight: PET_WINDOW_HEIGHT,
    modelFileName: null,
    modelScale: 1,
    modelBrightness: 1,
    sourceAnimationFps: DEFAULT_SOURCE_ANIMATION_FPS,
    playbackSpeed: DEFAULT_PLAYBACK_SPEED,
    position: { x: 0, y: 0, monitor: 0 },
    clickAnimation: { ...DEFAULT_CLICK_ANIMATION, pool: [] },
    ...overrides,
  };
}

export function normalizePetDesktopConfig(
  raw: Partial<PetDesktopConfig> | null | undefined,
  fallbackPosition?: { x: number; y: number; monitor: number }
): PetDesktopConfig {
  const base = createDefaultPetDesktopConfig();
  if (!raw || typeof raw !== 'object') {
    if (fallbackPosition) {
      base.position = { ...fallbackPosition };
    }
    return base;
  }

  return {
    windowWidth: clampWindowWidth(raw.windowWidth ?? base.windowWidth),
    windowHeight: clampWindowHeight(raw.windowHeight ?? base.windowHeight),
    modelFileName: normalizeModelFileName(raw.modelFileName),
    modelScale: clampModelScale(raw.modelScale ?? base.modelScale),
    modelBrightness: clampModelBrightness(
      raw.modelBrightness ?? base.modelBrightness
    ),
    sourceAnimationFps: clampSourceAnimationFps(
      raw.sourceAnimationFps ?? base.sourceAnimationFps
    ),
    playbackSpeed: clampPlaybackSpeed(raw.playbackSpeed ?? base.playbackSpeed),
    position: {
      x: Math.round(raw.position?.x ?? fallbackPosition?.x ?? 0),
      y: Math.round(raw.position?.y ?? fallbackPosition?.y ?? 0),
      monitor: raw.position?.monitor ?? fallbackPosition?.monitor ?? 0,
    },
    clickAnimation: normalizeClickAnimationSettings(raw.clickAnimation),
  };
}

/** 从数据库 JSON 规范化点击动画设置（不含 sequenceSteps） */
export function normalizeClickAnimationSettings(
  raw:
    | (Partial<ClickAnimationSettings> & {
        mode?: string;
        sequence?: ClickAnimationSequenceStep[];
      })
    | null
    | undefined
): ClickAnimationSettings {
  const pool = Array.isArray(raw?.pool)
    ? raw.pool
        .filter((e) => e && typeof e.clipName === 'string')
        .map((e) => ({
          clipName: e.clipName,
          weight: Math.max(0, Number(e.weight) || 0),
        }))
    : [];

  let activeSequenceId: string | null = null;
  if (typeof raw?.activeSequenceId === 'string' && raw.activeSequenceId.trim()) {
    activeSequenceId = raw.activeSequenceId.trim();
  } else if (raw?.mode === 'sequence') {
    activeSequenceId = 'default';
  }

  const result: ClickAnimationSettings = { pool, activeSequenceId };

  if (Array.isArray(raw?.sequenceSteps) && raw.sequenceSteps.length > 0) {
    result.sequenceSteps = raw.sequenceSteps
      .filter((s) => s && typeof s.clipName === 'string' && s.clipName)
      .map((s) => ({
        clipName: s.clipName,
        delayAfterMs: Math.max(0, Number(s.delayAfterMs) || 0),
      }));
  }

  if (raw?.sequenceStepsById && typeof raw.sequenceStepsById === 'object') {
    const byId: Record<string, ClickAnimationSequenceStep[]> = {};
    for (const [id, steps] of Object.entries(raw.sequenceStepsById)) {
      if (!Array.isArray(steps)) continue;
      const normalized = steps
        .filter((s) => s && typeof s.clipName === 'string' && s.clipName)
        .map((s) => ({
          clipName: s.clipName,
          delayAfterMs: Math.max(0, Number(s.delayAfterMs) || 0),
        }));
      if (normalized.length > 0) {
        byId[id] = normalized;
      }
    }
    if (Object.keys(byId).length > 0) {
      result.sequenceStepsById = byId;
    }
  }

  return result;
}

/** 持久化到数据库时去掉运行时字段 */
export function clickAnimationSettingsForStorage(
  settings: ClickAnimationSettings
): Pick<ClickAnimationSettings, 'pool' | 'activeSequenceId'> {
  return {
    pool: settings.pool,
    activeSequenceId: settings.activeSequenceId,
  };
}
