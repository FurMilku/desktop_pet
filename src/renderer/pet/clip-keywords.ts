import type { AnimationClip } from 'three';
import {
  clipNameMatchesKeyword,
  clipNameSegments,
  findClipByKeywords,
  isCurvesClipName,
} from './animation-clip-match';

function hasFlySegmentPair(name: string, second: string): boolean {
  const segs = clipNameSegments(name);
  return segs.includes('fly') && segs.includes(second);
}

export function pickCalloutClip(clips: AnimationClip[]): AnimationClip | null {
  return findClipByKeywords(clips, {
    matchKeywords: ['callout'],
    priorityKeywords: ['fightcallout', 'worldcallout', 'commoncallout', 'callout'],
    excludeKeywords: ['fly', 'landing', 'takeoff'],
  });
}

export function pickIdleKeywordClip(clips: AnimationClip[]): AnimationClip | null {
  return findClipByKeywords(clips, {
    matchKeywords: ['idle'],
    excludeKeywords: [
      'fly',
      'glid',
      'glide',
      'slide',
      'landing',
      'takeoff',
      'walk',
      'run',
      'attack',
      'fight',
      'skill',
    ],
    priorityKeywords: [
      'worldidle',
      'rideidle',
      'commonsleepstand',
      'commonrelax',
      'idle',
    ],
  });
}

export function pickWalkClip(clips: AnimationClip[]): AnimationClip | null {
  return findClipByKeywords(clips, {
    matchKeywords: ['walk'],
    excludeKeywords: ['fly', 'landing', 'takeoff', 'idle'],
    priorityKeywords: ['worldwalk', 'commonmove', 'walk'],
  });
}

export function pickRunClip(clips: AnimationClip[]): AnimationClip | null {
  return findClipByKeywords(clips, {
    matchKeywords: ['run', 'sprint'],
    excludeKeywords: ['fly', 'landing', 'takeoff', 'walk', 'idle'],
    priorityKeywords: ['worldrun', 'commonmove', 'run', 'sprint'],
  });
}

export type WalkDragClipSet = {
  walk: AnimationClip | null;
  run: AnimationClip | null;
  idle: AnimationClip | null;
};

/** 无飞行循环剪辑时用于地面拖拽的 walk / run / idle */
export function pickWalkDragClips(clips: AnimationClip[]): WalkDragClipSet {
  const candidates = clips.filter((c) => !isCurvesClipName(c.name));
  return {
    walk: pickWalkClip(candidates),
    run: pickRunClip(candidates),
    idle: pickIdleKeywordClip(candidates) ?? pickIdleKeywordClip(clips),
  };
}

export function hasWalkDragCapability(clips: AnimationClip[]): boolean {
  const set = pickWalkDragClips(clips);
  return !!(set.walk || set.run);
}

export function hasFlyDragLoopClips(clips: AnimationClip[]): boolean {
  return clips.some((c) => {
    if (isCurvesClipName(c.name)) {
      return false;
    }
    const n = c.name;
    return (
      clipNameMatchesKeyword(n, 'flygliding') ||
      clipNameMatchesKeyword(n, 'flyhover') ||
      clipNameMatchesKeyword(n, 'rideflygliding') ||
      clipNameMatchesKeyword(n, 'rideflyhover') ||
      hasFlySegmentPair(n, 'gliding') ||
      hasFlySegmentPair(n, 'hover')
    );
  });
}
