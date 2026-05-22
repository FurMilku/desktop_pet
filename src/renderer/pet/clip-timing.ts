import * as THREE from 'three';

/** 手游/UE 导出动画的制作帧率 */
export const SOURCE_ANIMATION_FPS = 120;

/** 默认播放倍率（1 = 按剪辑真实时长；旧版曾固定 2.5× 导致过快） */
export const DESKTOP_PLAYBACK_TIME_SCALE = 1;

/** 重采样目标帧率（GLB 常见 ~24 关键帧/秒，提升到 60 减轻卡顿感） */
export const DESKTOP_SAMPLE_FPS = 60;

/** 稀疏占位轨：仅 2 个关键帧 */
const SPARSE_KEY_COUNT = 2;

/** 采样充足的轨道至少应有的关键帧数 */
const DENSE_KEY_THRESHOLD = 3;

/**
 * 从稠密关键帧轨道推断采样帧率（如步长约 1/30 → 30fps）
 */
export function inferClipSampleFps(clip: THREE.AnimationClip): number | null {
  const inferred: number[] = [];
  for (const track of clip.tracks) {
    if (track.times.length < DENSE_KEY_THRESHOLD) {
      continue;
    }
    const step = medianPositiveStep(track.times);
    if (step > 1e-5 && step < 0.2) {
      const fps = Math.round(1 / step);
      if (fps >= 24 && fps <= 120) {
        inferred.push(fps);
      }
    }
  }
  if (inferred.length === 0) {
    return null;
  }
  inferred.sort((a, b) => a - b);
  return inferred[Math.floor(inferred.length / 2)]!;
}

/**
 * 将「帧序号当作秒」的稀疏轨道时间轴换算为秒（如 0→180 → 0→1.5s @120fps）
 */
export function fixFrameIndexTracks(
  clip: THREE.AnimationClip,
  fps: number = SOURCE_ANIMATION_FPS
): void {
  for (const track of clip.tracks) {
    const times = track.times;
    if (times.length !== SPARSE_KEY_COUNT) {
      continue;
    }

    const last = times[times.length - 1]!;

    // 两帧占位轨常把总帧数写在终点（如 0→180 表示 180 帧 @120fps），而非 180 秒
    if (last >= 30) {
      for (let i = 0; i < times.length; i++) {
        times[i] = times[i]! / fps;
      }
    }
  }
}

/**
 * 从可靠轨道推算剪辑时长，忽略稀疏占位轨对 duration 的污染
 */
export function computeClipDuration(clip: THREE.AnimationClip): number {
  let denseMax = 0;
  let anyMax = 0;

  for (const track of clip.tracks) {
    const times = track.times;
    if (times.length === 0) {
      continue;
    }

    const last = times[times.length - 1]!;
    anyMax = Math.max(anyMax, last);

    if (times.length >= DENSE_KEY_THRESHOLD) {
      denseMax = Math.max(denseMax, last);
    }
  }

  return denseMax > 0 ? denseMax : anyMax;
}

function medianPositiveStep(times: ArrayLike<number>): number {
  const steps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i]! - times[i - 1]!;
    if (d > 1e-6) {
      steps.push(d);
    }
  }
  if (steps.length === 0) {
    return Infinity;
  }
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)]!;
}

/**
 * 将低采样率关键帧加密到目标帧率（改善 24fps 关键帧在 60Hz 屏上的「一顿一顿」）
 */
export function densifyKeyframeTrack(
  track: THREE.KeyframeTrack,
  samplesPerSecond: number = DESKTOP_SAMPLE_FPS
): THREE.KeyframeTrack {
  const times = track.times;
  if (times.length < DENSE_KEY_THRESHOLD) {
    return track;
  }

  const duration = times[times.length - 1]!;
  if (duration <= 0) {
    return track;
  }

  const targetStep = 1 / samplesPerSecond;
  const medianStep = medianPositiveStep(times);
  if (medianStep <= targetStep * 1.1) {
    return track;
  }

  const sampleCount = Math.max(2, Math.floor(duration * samplesPerSecond) + 1);
  const newTimes = new Float32Array(sampleCount);
  const valueSize = track.getValueSize();
  const newValues = new Float32Array(sampleCount * valueSize);
  const sample = new Float32Array(valueSize);
  const interpolant = track.createInterpolant(sample, track.times, track.values, valueSize);

  for (let i = 0; i < sampleCount; i++) {
    const t = Math.min(i / samplesPerSecond, duration);
    newTimes[i] = t;
    interpolant.evaluate(t);
    newValues.set(sample, i * valueSize);
  }

  const TrackCtor = track.constructor as new (
    name: string,
    times: ArrayLike<number>,
    values: ArrayLike<number>
  ) => THREE.KeyframeTrack;

  return new TrackCtor(track.name, newTimes, newValues);
}

/**
 * 加密剪辑内所有可采样轨道
 */
export function densifyAnimationClip(
  clip: THREE.AnimationClip,
  samplesPerSecond: number = DESKTOP_SAMPLE_FPS
): THREE.AnimationClip {
  const tracks = clip.tracks.map((track) => densifyKeyframeTrack(track, samplesPerSecond));
  const duration = computeClipDuration({ ...clip, tracks });
  return new THREE.AnimationClip(clip.name, duration > 0 ? duration : clip.duration, tracks);
}

/**
 * 统一动画时间轴：修正帧号轨道 + 加密关键帧 + 写入 clip.duration
 */
export function normalizeAnimationClipTiming(
  clip: THREE.AnimationClip,
  fps: number = SOURCE_ANIMATION_FPS
): THREE.AnimationClip {
  const effectiveFps = inferClipSampleFps(clip) ?? fps;
  fixFrameIndexTracks(clip, effectiveFps);
  const duration = computeClipDuration(clip);
  if (duration > 0) {
    clip.duration = duration;
  }
  return densifyAnimationClip(clip);
}
