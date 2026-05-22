import { describe, expect, it } from 'vitest';

import { normalizeClickAnimationSettings } from '../../../src/shared/config/pet-desktop-settings';

describe('normalizeClickAnimationSettings', () => {
  it('preserves runtime sequenceSteps from enriched config', () => {
    const settings = normalizeClickAnimationSettings({
      pool: [],
      activeSequenceId: 'sleep',
      sequenceSteps: [
        { clipName: 'Common_Sleep_Start' },
        { clipName: 'Common_Sleep_Loop' },
        { clipName: 'Common_Sleep_End' },
      ],
    });
    expect(settings.sequenceSteps).toHaveLength(3);
    expect(settings.sequenceSteps?.[0]?.clipName).toBe('Common_Sleep_Start');
  });
});
