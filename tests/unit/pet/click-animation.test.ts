import { describe, expect, it } from 'vitest';

import { pickWeightedClipName, resolveClickAnimationSteps } from '../../../src/renderer/pet/click-animation';



describe('click-animation', () => {

  it('pickWeightedClipName respects weights', () => {

    const counts = { A: 0, B: 0 };

    for (let i = 0; i < 200; i++) {

      const name = pickWeightedClipName(

        [

          { clipName: 'A', weight: 1 },

          { clipName: 'B', weight: 9 },

        ],

        []

      );

      if (name === 'A') counts.A++;

      if (name === 'B') counts.B++;

    }

    expect(counts.B).toBeGreaterThan(counts.A);

  });



  it('resolveClickAnimationSteps uses active sequence steps', () => {

    const steps = resolveClickAnimationSteps(

      {

        pool: [],

        activeSequenceId: 'intro',

        sequenceSteps: [

          { clipName: 'clip_a' },

          { clipName: 'clip_b', delayAfterMs: 100 },

        ],

      },

      ['fallback']

    );

    expect(steps).toHaveLength(2);

    expect(steps[0]?.clipName).toBe('clip_a');

  });



  it('resolveClickAnimationSteps picks from pool when no active sequence', () => {

    const steps = resolveClickAnimationSteps(

      {

        pool: [{ clipName: 'only_one', weight: 1 }],

        activeSequenceId: null,

      },

      []

    );

    expect(steps).toEqual([{ clipName: 'only_one' }]);

  });



  it('resolveClickAnimationSteps uses active flat sequence steps', () => {
    const steps = resolveClickAnimationSteps(
      {
        pool: [],
        activeSequenceId: 'sleep',
        sequenceSteps: [
          { clipName: 'S_Start' },
          { clipName: 'S_Loop' },
          { clipName: 'S_Loop' },
          { clipName: 'S_End' },
        ],
      },
      []
    );
    expect(steps.map((s) => s.clipName)).toEqual(['S_Start', 'S_Loop', 'S_Loop', 'S_End']);
  });

  it('resolveClickAnimationSteps skips unresolvable sequence and picks clip from pool', () => {
    const steps = resolveClickAnimationSteps(
      {
        pool: [
          { clipName: 'seq:broken', weight: 10 },
          { clipName: 'Common_Shock', weight: 1 },
        ],
        activeSequenceId: null,
        sequenceStepsById: {},
      },
      []
    );
    expect(steps).toEqual([{ clipName: 'Common_Shock' }]);
  });

  it('resolveClickAnimationSteps expands sequence pool entry', () => {

    const steps = resolveClickAnimationSteps(

      {

        pool: [{ clipName: 'seq:combo', weight: 1 }],

        activeSequenceId: null,

        sequenceStepsById: {

          combo: [

            { clipName: 'a' },

            { clipName: 'b', delayAfterMs: 50 },

          ],

        },

      },

      []

    );

    expect(steps).toHaveLength(2);

    expect(steps[1]?.delayAfterMs).toBe(50);

  });

});

