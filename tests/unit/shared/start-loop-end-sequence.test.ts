import { describe, expect, it } from 'vitest';

import {
  buildFlatStepsFromTriplet,
  detectStartLoopEndTriplets,
  expandClickAnimationSequenceSteps,
} from '../../../src/shared/config/start-loop-end-sequence';

describe('start-loop-end-sequence', () => {
  it('detects complete start/loop/end triplets', () => {
    const triplets = detectStartLoopEndTriplets([
      'Common_Sleep_Start',
      'Common_Sleep_Loop',
      'Common_Sleep_End',
      'Common_Shock',
    ]);
    expect(triplets).toHaveLength(1);
    expect(triplets[0]?.startClipName).toBe('Common_Sleep_Start');
  });

  it('buildFlatStepsFromTriplet expands start loop end', () => {
    const triplet = detectStartLoopEndTriplets([
      'Common_Sleep_Start',
      'Common_Sleep_Loop',
      'Common_Sleep_End',
    ])[0]!;
    const steps = buildFlatStepsFromTriplet(triplet, 2);
    expect(steps.map((s) => s.clipName)).toEqual([
      'Common_Sleep_Start',
      'Common_Sleep_Loop',
      'Common_Sleep_Loop',
      'Common_Sleep_End',
    ]);
  });

  it('expandClickAnimationSequenceSteps handles legacy loopGroup', () => {
    const steps = expandClickAnimationSequenceSteps(
      [
        {
          loopGroup: {
            startClipName: 'A_Start',
            loopClipName: 'A_Loop',
            endClipName: 'A_End',
            loopCount: 2,
          },
        },
      ],
      () => 0
    );
    expect(steps.map((s) => s.clipName)).toEqual([
      'A_Start',
      'A_Loop',
      'A_Loop',
      'A_End',
    ]);
  });
});
