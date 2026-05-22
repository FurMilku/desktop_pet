import { describe, it, expect } from 'vitest';
import { AnimationClip, NumberKeyframeTrack } from 'three';
import {
  computeClipDuration,
  densifyKeyframeTrack,
  fixFrameIndexTracks,
  inferClipSampleFps,
  normalizeAnimationClipTiming,
  SOURCE_ANIMATION_FPS,
} from '../../../src/renderer/pet/clip-timing';

function quatTrack(times: number[]): NumberKeyframeTrack {
  const values = new Array(times.length * 4).fill(0);
  for (let i = 0; i < times.length; i++) {
    values[i * 4 + 3] = 1;
  }
  return new NumberKeyframeTrack('Bone.quaternion', times, values);
}

function makeClip(name: string, ...trackTimes: number[][]): AnimationClip {
  return new AnimationClip(name, -1, trackTimes.map((t) => quatTrack(t)));
}

describe('clip-timing', () => {
  it('ignores sparse frame-index tracks when dense tracks exist', () => {
    const clip = makeClip(
      'World_Walk',
      [0, 180], // sparse placeholder (frames as seconds)
      Array.from({ length: 174 }, (_, i) => (i * 5) / SOURCE_ANIMATION_FPS) // dense ~7.125s
    );

    fixFrameIndexTracks(clip);
    expect(computeClipDuration(clip)).toBeCloseTo(7.208, 2);
  });

  it('rescales sparse frame-index tracks to seconds', () => {
    const clip = makeClip('sparse', [0, 180]);
    fixFrameIndexTracks(clip);
    expect(clip.tracks[0]!.times[1]).toBeCloseTo(1.5, 4);
  });

  it('leaves correctly sampled second-based tracks unchanged', () => {
    const times = [0, 1 / 24, 2 / 24, 29.7917];
    const clip = makeClip('Common_Relax', times);
    const before = [...clip.tracks[0]!.times];
    fixFrameIndexTracks(clip);
    expect([...clip.tracks[0]!.times]).toEqual(before);
    expect(computeClipDuration(clip)).toBeCloseTo(29.7917, 3);
  });

  it('normalizeAnimationClipTiming sets duration from dense tracks', () => {
    const denseTimes = [0, 1 / 24, 2 / 24, 4.958333];
    const clip = makeClip('mixed', [0, 340], denseTimes);
    normalizeAnimationClipTiming(clip);
    expect(clip.duration).toBeCloseTo(4.958333, 3);
  });

  it('inferClipSampleFps reads dense track step', () => {
    const denseTimes = Array.from({ length: 25 }, (_, i) => i / 24);
    const clip = makeClip('at24', denseTimes);
    expect(inferClipSampleFps(clip)).toBe(24);
  });

  it('normalizeAnimationClipTiming prefers inferred fps for sparse tracks', () => {
    const denseTimes = [0, 1 / 24, 2 / 24, 4.958333];
    const clip = makeClip('mixed', [0, 340], denseTimes);
    normalizeAnimationClipTiming(clip, 120);
    expect(clip.tracks[0]!.times[1]).toBeCloseTo(340 / 24, 3);
    expect(clip.duration).toBeCloseTo(4.958333, 3);
  });

  it('densifyKeyframeTrack increases key count for 24fps sampling', () => {
    const times = Array.from({ length: 25 }, (_, i) => i / 24);
    const track = quatTrack(times);
    const dense = densifyKeyframeTrack(track, 60);
    expect(dense.times.length).toBeGreaterThan(times.length);
  });
});
