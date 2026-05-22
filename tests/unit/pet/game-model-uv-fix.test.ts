import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry } from 'three';

import {
  fixMeshGameUvLayout,
  shouldPreferSecondaryUv,
  shouldUseRepeatUvWrap,
  uvRangeStatsFromAttribute,
} from '../../../src/renderer/pet/game-model-uv-fix';

function geomWithGroups(
  uv0: number[][],
  uv1: number[][],
  groups: { start: number; count: number; materialIndex: number }[]
): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv0.flat()), 2));
  g.setAttribute('uv1', new BufferAttribute(new Float32Array(uv1.flat()), 2));
  for (const gr of groups) {
    g.addGroup(gr.start, gr.count, gr.materialIndex);
  }
  return g;
}

describe('game-model-uv-fix', () => {
  it('裘卡 body: UV0>1 uses Repeat, small part keeps UV0', () => {
    const nBody = 4;
    const uv0Body = Array.from({ length: nBody }, () => [1.9, 0.5]);
    const uv1Body = [
      [0.1, 0.2],
      [-0.5, 0.8],
      [0.3, 0.4],
      [0.7, 0.6],
    ];
    const uv0Small = [
      [0.1, 0.1],
      [0.4, 0.2],
    ];
    const uv1Small = [
      [0, 0],
      [0, 0],
    ];
    const g = geomWithGroups(
      [...uv0Body, ...uv0Small],
      [...uv1Body, ...uv1Small],
      [
        { start: 0, count: nBody, materialIndex: 0 },
        { start: nBody, count: uv0Small.length, materialIndex: 1 },
      ]
    );

    const result = fixMeshGameUvLayout(g);
    expect(result.swappedSegmentCount).toBe(0);
    expect(result.repeatMaterialIndices).toContain(0);
    expect(result.repeatMaterialIndices).not.toContain(1);

    const uv = g.getAttribute('uv') as BufferAttribute;
    expect(uv.getX(0)).toBeCloseTo(1.9);
    expect(uv.getX(nBody)).toBeCloseTo(0.1);
  });

  it('shouldUseRepeatUvWrap when UV0 exceeds 1', () => {
    expect(
      shouldUseRepeatUvWrap({ minU: 0, maxU: 1.99, minV: 0, maxV: 1, spanU: 1.99, spanV: 1 })
    ).toBe(true);
  });

  it('shouldPreferSecondaryUv only when UV1 is valid 0..1', () => {
    expect(
      shouldPreferSecondaryUv(
        { minU: 0, maxU: 2, minV: 0, maxV: 1, spanU: 2, spanV: 1 },
        { minU: 0, maxU: 0, minV: 0, maxV: 0, spanU: 0, spanV: 0 }
      )
    ).toBe(false);
    expect(
      shouldPreferSecondaryUv(
        { minU: 0, maxU: 2, minV: 0, maxV: 1, spanU: 2, spanV: 1 },
        { minU: 0.1, maxU: 0.9, minV: 0.1, maxV: 0.9, spanU: 0.8, spanV: 0.8 }
      )
    ).toBe(true);
  });

  it('uvRangeStatsFromAttribute', () => {
    const attr = new BufferAttribute(new Float32Array([0, 0, 2, 1]), 2);
    expect(uvRangeStatsFromAttribute(attr).maxU).toBe(2);
  });
});
