import { describe, expect, it } from 'vitest';

import {
  PET_POINTER_SYNC_TOLERANCE,
  scaledPointerSyncTolerance,
} from '../../../src/shared/config/pet-window';

describe('pet-window pointer sync', () => {
  it('scales pointer sync tolerance with display scale factor', () => {
    expect(scaledPointerSyncTolerance(1)).toBe(PET_POINTER_SYNC_TOLERANCE);
    expect(scaledPointerSyncTolerance(1.5)).toBe(6);
    expect(scaledPointerSyncTolerance(0)).toBe(PET_POINTER_SYNC_TOLERANCE);
  });
});
