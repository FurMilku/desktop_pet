import {
  clickAnimationSettingsForStorage,
  clampModelBrightness,
  clampModelScale,
  createDefaultPetDesktopConfig,
  DEFAULT_CLICK_ANIMATION,
  normalizeClickAnimationSettings,
  type ClickAnimationSettings,
} from './pet-desktop-settings';

export const PET_MODEL_SETTINGS_VERSION = 1;

export const DEFAULT_SOURCE_ANIMATION_FPS = 120;
export const MIN_SOURCE_ANIMATION_FPS = 24;
export const MAX_SOURCE_ANIMATION_FPS = 240;
export const DEFAULT_PLAYBACK_SPEED = 1;
export const MIN_PLAYBACK_SPEED = 0.25;
export const MAX_PLAYBACK_SPEED = 4;

export function clampPlaybackSpeed(speed: number): number {
  return Math.min(MAX_PLAYBACK_SPEED, Math.max(MIN_PLAYBACK_SPEED, speed));
}

/** 仅存于各模型目录旁 {name}.pet-settings.json */
export interface PetModelSettings {
  version: number;
  modelScale: number;
  modelBrightness: number;
  /** 动画制作帧率（用于帧号→秒换算，默认 120） */
  sourceAnimationFps: number;
  /** 播放速度倍率（1 = 正常；<1 变慢，>1 变快） */
  playbackSpeed: number;
  clickAnimation: Pick<ClickAnimationSettings, 'pool' | 'activeSequenceId'>;
}

export function clampSourceAnimationFps(fps: number): number {
  return Math.round(Math.min(MAX_SOURCE_ANIMATION_FPS, Math.max(MIN_SOURCE_ANIMATION_FPS, fps)));
}

export function createDefaultPetModelSettings(
  overrides?: Partial<PetModelSettings>
): PetModelSettings {
  const base = createDefaultPetDesktopConfig();
  return {
    version: PET_MODEL_SETTINGS_VERSION,
    modelScale: base.modelScale,
    modelBrightness: base.modelBrightness,
    sourceAnimationFps: DEFAULT_SOURCE_ANIMATION_FPS,
    playbackSpeed: DEFAULT_PLAYBACK_SPEED,
    clickAnimation: { ...DEFAULT_CLICK_ANIMATION, pool: [] },
    ...overrides,
  };
}

export function normalizePetModelSettings(
  raw: Partial<PetModelSettings> | null | undefined
): PetModelSettings {
  const base = createDefaultPetModelSettings();
  if (!raw || typeof raw !== 'object') {
    return base;
  }

  return {
    version: PET_MODEL_SETTINGS_VERSION,
    modelScale: clampModelScale(raw.modelScale ?? base.modelScale),
    modelBrightness: clampModelBrightness(
      raw.modelBrightness ?? base.modelBrightness
    ),
    sourceAnimationFps: clampSourceAnimationFps(
      raw.sourceAnimationFps ?? base.sourceAnimationFps
    ),
    playbackSpeed: clampPlaybackSpeed(raw.playbackSpeed ?? base.playbackSpeed),
    clickAnimation: normalizeClickAnimationSettings(raw.clickAnimation),
  };
}

export function petModelSettingsForStorage(
  settings: PetModelSettings
): PetModelSettings {
  return {
    version: PET_MODEL_SETTINGS_VERSION,
    modelScale: settings.modelScale,
    modelBrightness: settings.modelBrightness,
    sourceAnimationFps: clampSourceAnimationFps(settings.sourceAnimationFps),
    playbackSpeed: clampPlaybackSpeed(settings.playbackSpeed),
    clickAnimation: clickAnimationSettingsForStorage(settings.clickAnimation),
  };
}
