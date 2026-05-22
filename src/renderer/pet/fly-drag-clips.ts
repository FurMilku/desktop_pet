import * as THREE from 'three';
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

export type FlyDragClipSet = {
  takeoff: THREE.AnimationClip | null;
  gliding: THREE.AnimationClip | null;
  hover: THREE.AnimationClip | null;
  landing: THREE.AnimationClip | null;
};

export function isFlyDragClipName(name: string): boolean {
  if (isCurvesClipName(name)) {
    return false;
  }
  return (
    clipNameMatchesKeyword(name, 'flystart') ||
    clipNameMatchesKeyword(name, 'flygliding') ||
    clipNameMatchesKeyword(name, 'flyhover') ||
    clipNameMatchesKeyword(name, 'flylanding') ||
    clipNameMatchesKeyword(name, 'takeoff') ||
    clipNameMatchesKeyword(name, 'rideflystart') ||
    clipNameMatchesKeyword(name, 'rideflygliding') ||
    clipNameMatchesKeyword(name, 'rideflyhover') ||
    clipNameMatchesKeyword(name, 'rideflylanding') ||
    hasFlySegmentPair(name, 'start') ||
    hasFlySegmentPair(name, 'gliding') ||
    hasFlySegmentPair(name, 'hover') ||
    hasFlySegmentPair(name, 'landing')
  );
}

function pickFlyClip(
  clips: THREE.AnimationClip[],
  matchKeywords: string[],
  priorityKeywords: string[]
): THREE.AnimationClip | null {
  return findClipByKeywords(clips, {
    matchKeywords,
    priorityKeywords,
    excludeCurves: true,
  });
}

export function pickFlyDragClips(clips: THREE.AnimationClip[]): FlyDragClipSet {
  const flyClips = clips.filter((c) => isFlyDragClipName(c.name));
  return {
    takeoff: pickFlyClip(flyClips, ['flystart', 'takeoff', 'start'], [
      'worldflystart',
      'rideflystart',
      'flystart',
      'takeoff',
    ]),
    gliding: pickFlyClip(flyClips, ['gliding'], [
      'worldflygliding',
      'rideflygliding',
      'flygliding',
      'gliding',
    ]),
    hover: pickFlyClip(flyClips, ['flyhover', 'hover'], [
      'worldflyhover',
      'rideflyhover',
      'flyhover',
    ]),
    landing: pickFlyClip(flyClips, ['flylanding', 'landing'], [
      'worldflylanding',
      'rideflylanding',
      'flylanding',
    ]),
  };
}
