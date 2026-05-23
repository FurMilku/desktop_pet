import { describe, expect, it } from 'vitest';
import {
  clampModelBrightness,
  createDefaultPetDesktopConfig,
  DEFAULT_MODEL_SCALE,
  normalizePetDesktopConfig,
} from '../../../src/shared/config/pet-desktop-settings';

describe('pet-desktop-settings', () => {
  it('defaults modelFileName to null', () => {
    expect(createDefaultPetDesktopConfig().modelFileName).toBeNull();
  });

  it('defaults modelScale to baseline 0.3 at 100% display', () => {
    expect(createDefaultPetDesktopConfig().modelScale).toBe(DEFAULT_MODEL_SCALE);
    expect(DEFAULT_MODEL_SCALE).toBe(0.3);
  });

  it('defaults modelBrightness to 1', () => {
    expect(createDefaultPetDesktopConfig().modelBrightness).toBe(1);
  });

  it('defaults playbackSpeed to 1', () => {
    expect(createDefaultPetDesktopConfig().playbackSpeed).toBe(1);
  });

  it('defaults fps monitor to disabled top-left', () => {
    const config = createDefaultPetDesktopConfig();
    expect(config.fpsMonitorEnabled).toBe(false);
    expect(config.fpsMonitorPosition).toBe('top-left');
  });

  it('normalizes modelFileName', () => {
    const config = normalizePetDesktopConfig({ modelFileName: '  liao1.glb  ' });
    expect(config.modelFileName).toBe('liao1.glb');
  });

  it('clamps modelBrightness', () => {
    expect(clampModelBrightness(0)).toBe(0.25);
    expect(clampModelBrightness(5)).toBe(2);
    expect(clampModelBrightness(1.2)).toBe(1.2);
  });

  it('normalizes missing modelBrightness', () => {
    const config = normalizePetDesktopConfig({ modelScale: 1.5 });
    expect(config.modelBrightness).toBe(1);
    expect(config.modelScale).toBe(1.5);
  });
});
