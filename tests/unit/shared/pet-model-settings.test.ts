import { describe, expect, it } from 'vitest';
import {
  clampPlaybackSpeed,
  createDefaultPetModelSettings,
  MAX_PLAYBACK_SPEED,
  normalizePetModelSettings,
} from '../../../src/shared/config/pet-model-settings';

describe('pet-model-settings', () => {
  it('creates defaults', () => {
    const s = createDefaultPetModelSettings();
    expect(s.version).toBe(1);
    expect(s.modelScale).toBe(1);
    expect(s.sourceAnimationFps).toBe(120);
    expect(s.playbackSpeed).toBe(1);
    expect(s.clickAnimation.pool).toEqual([]);
  });

  it('normalizes partial input', () => {
    const s = normalizePetModelSettings({ modelScale: 5, modelBrightness: 0 });
    expect(s.modelScale).toBe(3);
    expect(s.modelBrightness).toBe(0.25);
  });

  it('clamps playback speed to extended max', () => {
    expect(MAX_PLAYBACK_SPEED).toBe(4);
    expect(clampPlaybackSpeed(10)).toBe(4);
    expect(clampPlaybackSpeed(0.1)).toBe(0.25);
  });
});
