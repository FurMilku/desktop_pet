import { describe, expect, it } from 'vitest';

import {

  REFERENCE_DISPLAY_SCALE,

  applyDisplayScaleToModelScale,

  dragSpeedScaleRatio,

  effectiveModelScaleLimits,

  isDisplayScaledValueMisstoredAsStored,

  sanitizeIncomingModelScale,

  scaleDragMetric,

  scaleDragMetrics,

  scaleDragSpeedMetric,

  unapplyDisplayScaleFromModelScale,

} from '../../../src/shared/config/display-scale';



describe('display-scale', () => {

  it('uses 100% as reference ratio', () => {

    expect(scaleDragMetric(280, REFERENCE_DISPLAY_SCALE)).toBe(280);

    expect(applyDisplayScaleToModelScale(1, REFERENCE_DISPLAY_SCALE)).toBe(1);

  });



  it('scales drag distance metrics with display scale factor', () => {

    expect(scaleDragMetric(280, 1.5)).toBe(420);

    const scaled = scaleDragMetrics(1.25);

    expect(scaled.flyArriveDist).toBe(22.5);

    expect(scaled.flyEaseRadius).toBe(275);

  });



  it('slows drag fly/walk speeds as display scale increases', () => {

    expect(dragSpeedScaleRatio(1.5)).toBeCloseTo(1 / 1.5);

    expect(scaleDragSpeedMetric(280, 1.5)).toBeCloseTo(280 / 1.5);

    const scaled = scaleDragMetrics(1.25);

    expect(scaled.flyMoveSpeedMin).toBe(288);

    expect(scaled.flyMoveSpeedMax).toBe(944);

    expect(scaled.walkDragRunSpeed).toBe(512);

  });



  it('round-trips model scale through display compensation', () => {

    const stored = 1.2;

    const factor = 1.5;

    const effective = applyDisplayScaleToModelScale(stored, factor);

    expect(effective).toBeCloseTo(1.8);

    expect(unapplyDisplayScaleFromModelScale(effective, factor)).toBeCloseTo(stored);

  });



  it('scales stored model scale without capping effective value at stored max', () => {

    expect(applyDisplayScaleToModelScale(2, 2)).toBe(4);

    expect(unapplyDisplayScaleFromModelScale(4, 2)).toBe(2);

  });



  it('derives effective slider limits from display scale', () => {

    expect(effectiveModelScaleLimits(2)).toEqual({ min: 0.3, max: 6 });

    expect(effectiveModelScaleLimits(1)).toEqual({ min: 0.15, max: 3 });

  });



  it('round-trips baseline stored scale at 200% display', () => {
    const stored = 0.3;
    const factor = 2;
    const effective = applyDisplayScaleToModelScale(stored, factor);
    expect(effective).toBe(0.6);
    expect(unapplyDisplayScaleFromModelScale(0.6, factor)).toBeCloseTo(stored);
    expect(unapplyDisplayScaleFromModelScale(0.5, factor)).toBeCloseTo(0.25);
    expect(unapplyDisplayScaleFromModelScale(0.7, factor)).toBeCloseTo(0.35);
  });

  it('detects display-space slider value mistaken for stored scale', () => {
    const stored = 0.3;
    const factor = 2;
    const displayOnSlider = applyDisplayScaleToModelScale(stored, factor);

    expect(isDisplayScaledValueMisstoredAsStored(displayOnSlider, stored, factor)).toBe(true);
    expect(isDisplayScaledValueMisstoredAsStored(stored, stored, factor)).toBe(false);
    expect(isDisplayScaledValueMisstoredAsStored(0.4, stored, factor)).toBe(false);
  });

  it('sanitizeIncomingModelScale keeps user edits but fixes display-leaked stored', () => {
    const disk = 0.3;
    const factor = 2;

    expect(
      sanitizeIncomingModelScale(0.2, disk, factor, { switchingModel: false })
    ).toBe(0.2);
    expect(
      sanitizeIncomingModelScale(0.3, disk, factor, { switchingModel: false })
    ).toBe(0.3);
    expect(
      sanitizeIncomingModelScale(2, 1, factor, { switchingModel: false })
    ).toBe(2);
    expect(
      sanitizeIncomingModelScale(1, disk, factor, { switchingModel: true })
    ).toBe(disk);
  });
});

