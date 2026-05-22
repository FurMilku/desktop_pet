import { describe, expect, it } from 'vitest';
import {
  boneNameFromTrack,
  buildCurvesClipMap,
  clipNameMatchesKeyword,
  clipNameSegments,
  curvesBaseClipName,
  findClipByKeywords,
  isCurvesClipName,
  isRootMotionBoneName,
  isRootMotionTrack,
} from '../../../src/renderer/pet/animation-clip-match';

function clip(name: string) {
  return { name, duration: 1, tracks: [] };
}

describe('animation-clip-match', () => {
  it('segments split by underscore', () => {
    expect(clipNameSegments('World_Idle')).toEqual(['world', 'idle']);
  });

  it('matches idle only on segment not substring of unrelated words', () => {
    expect(clipNameMatchesKeyword('World_Idle', 'idle')).toBe(true);
    expect(clipNameMatchesKeyword('WORLD_IDLE', 'idle')).toBe(true);
    expect(clipNameMatchesKeyword('Common_Middle', 'idle')).toBe(false);
    expect(clipNameMatchesKeyword('World_Walk', 'idle')).toBe(false);
  });

  it('does not match short dle inside unrelated names', () => {
    expect(clipNameMatchesKeyword('Common_Middle', 'dle')).toBe(false);
  });

  it('detects Curves suffix', () => {
    expect(isCurvesClipName('World_IdleCurves')).toBe(true);
    expect(isCurvesClipName('World_Idle')).toBe(false);
  });

  it('detects _Curves segment with Blender numeric suffix', () => {
    expect(isCurvesClipName('Common_Shock_Curves.001')).toBe(true);
    expect(isCurvesClipName('Common_Shock.001')).toBe(false);
    expect(curvesBaseClipName('Common_Shock_Curves.001')).toBe('Common_Shock.001');
  });

  it('binds Curves to body clip', () => {
    const clips = [clip('World_Idle'), clip('World_IdleCurves')];
    const map = buildCurvesClipMap(clips);
    expect(map.size).toBe(1);
  });

  it('binds _Curves.001 to body clip with same suffix', () => {
    const clips = [clip('Common_Shock.001'), clip('Common_Shock_Curves.001')];
    const map = buildCurvesClipMap(clips);
    expect(map.size).toBe(1);
    expect(map.has('commonshock001')).toBe(true);
  });

  it('identifies root motion bones vs limb bones', () => {
    expect(isRootMotionBoneName('Root')).toBe(true);
    expect(isRootMotionBoneName('Bip001')).toBe(true);
    expect(isRootMotionBoneName('Bip001-Pelvis')).toBe(true);
    expect(isRootMotionBoneName('SKM_Win_LiAo3_001_Skin')).toBe(true);
    expect(isRootMotionBoneName('Bip001-L-Foot')).toBe(false);
    expect(isRootMotionBoneName('Bip001-Spine')).toBe(false);
    expect(boneNameFromTrack('Bip001-L-Foot.position')).toBe('Bip001-L-Foot');
    expect(isRootMotionTrack('Bip001.position')).toBe(true);
    expect(isRootMotionTrack('Bip001-L-Foot.position')).toBe(false);
  });

  it('findClipByKeywords prefers priority', () => {
    const clips = [clip('Common_Relax'), clip('World_Idle'), clip('World_Walk')];
    expect(
      findClipByKeywords(clips, {
        matchKeywords: ['idle'],
        priorityKeywords: ['worldidle', 'idle'],
      })?.name
    ).toBe('World_Idle');
  });
});
