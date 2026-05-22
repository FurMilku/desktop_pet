import { describe, expect, it } from 'vitest';
import {
  hasFlyDragLoopClips,
  hasWalkDragCapability,
  pickCalloutClip,
  pickIdleKeywordClip,
  pickRunClip,
  pickWalkClip,
  pickWalkDragClips,
} from '../../../src/renderer/pet/clip-keywords';

function clip(name: string) {
  return { name, duration: 1, tracks: [] };
}

describe('clip-keywords', () => {
  it('picks callout by segment', () => {
    const clips = [clip('World_Idle'), clip('Fight_CallOut'), clip('World_Walk')];
    expect(pickCalloutClip(clips)?.name).toBe('Fight_CallOut');
  });

  it('picks idle by segment', () => {
    const clips = [clip('Common_Relax'), clip('World_Idle'), clip('World_Walk')];
    expect(pickIdleKeywordClip(clips)?.name).toBe('World_Idle');
  });

  it('does not pick walk as idle', () => {
    const clips = [clip('World_Walk'), clip('Common_Show')];
    expect(pickIdleKeywordClip(clips)).toBeNull();
  });

  it('picks walk by segment', () => {
    const clips = [clip('World_Idle'), clip('world_walk')];
    expect(pickWalkClip(clips)?.name).toBe('world_walk');
  });

  it('detects fly gliding', () => {
    expect(hasFlyDragLoopClips([clip('World_Fly_Gliding')])).toBe(true);
    expect(hasFlyDragLoopClips([clip('World_Walk')])).toBe(false);
  });

  it('excludes Curves from idle pick', () => {
    expect(pickIdleKeywordClip([clip('World_IdleCurves'), clip('World_Walk')])).toBeNull();
  });

  it('picks run by segment', () => {
    const clips = [clip('World_Walk'), clip('World_Run')];
    expect(pickRunClip(clips)?.name).toBe('World_Run');
  });

  it('pickWalkDragClips bundles walk run idle', () => {
    const clips = [clip('World_Idle'), clip('World_Walk'), clip('World_Run')];
    const set = pickWalkDragClips(clips);
    expect(set.walk?.name).toBe('World_Walk');
    expect(set.run?.name).toBe('World_Run');
    expect(set.idle?.name).toBe('World_Idle');
    expect(hasWalkDragCapability(clips)).toBe(true);
  });
});
