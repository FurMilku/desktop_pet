import { describe, expect, it } from 'vitest';
import {
  autoFitDimensionFromBounds,
  computeAutoFitScaleMultiplier,
} from '../../../src/shared/config/model-autofit';

describe('model-autofit', () => {
  it('prefers height when it reflects character stature', () => {
    expect(autoFitDimensionFromBounds({ x: 2.8, y: 1.9, z: 1.5 })).toBe(1.9);
  });

  it('falls back to max axis for extremely flat bounds', () => {
    expect(autoFitDimensionFromBounds({ x: 3, y: 0.1, z: 2 })).toBe(3);
  });

  it('does not scale up models smaller than the target', () => {
    expect(computeAutoFitScaleMultiplier({ x: 0.8, y: 0.85, z: 0.7 }, 1.25)).toBe(1);
  });

  it('scales down models larger than the target', () => {
    const multiplier = computeAutoFitScaleMultiplier(
      { x: 1.5, y: 1.96, z: 1.4 },
      1.25
    );
    expect(multiplier).toBeCloseTo(1.25 / 1.96, 5);
  });

  it('keeps small-body models visually smaller than large-body models', () => {
    const small = computeAutoFitScaleMultiplier({ x: 0.8, y: 0.846, z: 0.7 }, 1.25);
    const large = computeAutoFitScaleMultiplier({ x: 1.5, y: 1.62, z: 1.4 }, 1.25);
    expect(small).toBe(1);
    expect(large).toBeLessThan(1);
    expect(0.846 * small).toBeLessThan(1.62 * large);
  });

  it('can upscale small models to a shared target for desktop pet switching', () => {
    const small = computeAutoFitScaleMultiplier(
      { x: 0.8, y: 0.846, z: 0.7 },
      1.25,
      { allowUpscale: true }
    );
    const large = computeAutoFitScaleMultiplier(
      { x: 1.5, y: 1.62, z: 1.4 },
      1.25,
      { allowUpscale: true }
    );
    expect(small).toBeCloseTo(1.25 / 0.846, 5);
    expect(large).toBeCloseTo(1.25 / 1.62, 5);
    expect(0.846 * small).toBeCloseTo(1.62 * large, 5);
  });
});
