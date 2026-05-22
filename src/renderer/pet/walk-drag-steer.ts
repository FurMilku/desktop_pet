import * as THREE from 'three';

/** 行走拖拽转向（与飞行循环独立，避免共用 flyLoopSteerStartMs） */
export const WALK_LOOP_STEER_RAMP_MS = 620;

export interface WalkDragSteerState {
  walkLoopSteerStartMs: number;
  flyYawOffsetTarget: number;
  flyYawOffsetSmoothed: number;
  dragPitchTarget: number;
  dragRollTarget: number;
  smoothedFlyPitch: number;
  smoothedFlyRoll: number;
}

export interface WalkDragSteerConstants {
  flyYawLerp: number;
  flyTiltLerp: number;
  flyResetLerp: number;
  flyYawFromDx: number;
  flyBankFromYaw: number;
  flyMaxPitch: number;
  flyMaxRoll: number;
  flyMaxYaw: number;
  flyHorizTurnThreshold: number;
}

/**
 * 行走拖拽：根据鼠标相对窗口位置更新朝向目标（仅 dragWalkActive 时由调用方保证）
 */
export function updateWalkDragSteerInput(
  state: WalkDragSteerState,
  constants: WalkDragSteerConstants,
  deltaX: number,
  deltaY: number,
  mouseScreenX: number,
  mouseScreenY: number,
  windowScreenX: number,
  windowScreenY: number,
  windowWidth: number,
  windowHeight: number,
  chaseComplete: boolean
): void {
  const steerRamp = Math.min(
    1,
    (performance.now() - state.walkLoopSteerStartMs) / WALK_LOOP_STEER_RAMP_MS
  );
  const steer = steerRamp * steerRamp;
  // rAF 追窗口时传入 (0,0)，不应视为「鼠标微动」而回正俯仰
  const hasMouseDelta = deltaX !== 0 || deltaY !== 0;
  const microMove = hasMouseDelta && Math.hypot(deltaX, deltaY) < 2.5;

  if (chaseComplete && microMove) {
    const r = constants.flyResetLerp;
    state.flyYawOffsetTarget = THREE.MathUtils.lerp(state.flyYawOffsetTarget, 0, r);
    state.dragPitchTarget = THREE.MathUtils.lerp(state.dragPitchTarget, 0, r);
    state.dragRollTarget = THREE.MathUtils.lerp(state.dragRollTarget, 0, r);
    return;
  }

  const centerX = windowScreenX + windowWidth * 0.5;
  const centerY = windowScreenY + windowHeight * 0.52;
  const toX = mouseScreenX - centerX;
  const toY = mouseScreenY - centerY;
  const aimDist = Math.hypot(toX, toY);
  const aim = Math.min(aimDist / 200, 1) * steer;

  const targetYaw = THREE.MathUtils.clamp(
    toX * 0.0035 * aim,
    -constants.flyMaxYaw,
    constants.flyMaxYaw
  );
  const targetPitch = THREE.MathUtils.clamp(
    toY * 0.0028 * aim,
    -constants.flyMaxPitch,
    constants.flyMaxPitch
  );
  const steerLerp = 0.1 * Math.max(steer, 0.15);
  state.flyYawOffsetTarget = THREE.MathUtils.lerp(
    state.flyYawOffsetTarget,
    targetYaw,
    steerLerp
  );
  state.dragPitchTarget = THREE.MathUtils.lerp(
    state.dragPitchTarget,
    targetPitch,
    steerLerp
  );

  const deltaYawScale = chaseComplete ? 1 : 0.5;
  if (Math.abs(deltaX) > constants.flyHorizTurnThreshold) {
    state.flyYawOffsetTarget += deltaX * constants.flyYawFromDx * deltaYawScale * steer;
    state.flyYawOffsetTarget = THREE.MathUtils.clamp(
      state.flyYawOffsetTarget,
      -constants.flyMaxYaw,
      constants.flyMaxYaw
    );
  }

  const yawRate = state.flyYawOffsetTarget - state.flyYawOffsetSmoothed;
  state.dragRollTarget = THREE.MathUtils.clamp(
    -yawRate * constants.flyBankFromYaw * steer,
    -constants.flyMaxRoll,
    constants.flyMaxRoll
  );
}

export function applyWalkDragOrientationSmoothing(
  state: WalkDragSteerState,
  constants: WalkDragSteerConstants,
  orientationPivot: THREE.Group
): void {
  state.flyYawOffsetSmoothed = THREE.MathUtils.lerp(
    state.flyYawOffsetSmoothed,
    state.flyYawOffsetTarget,
    constants.flyYawLerp
  );
  state.smoothedFlyPitch = THREE.MathUtils.lerp(
    state.smoothedFlyPitch,
    state.dragPitchTarget,
    constants.flyTiltLerp
  );
  state.smoothedFlyRoll = THREE.MathUtils.lerp(
    state.smoothedFlyRoll,
    state.dragRollTarget,
    constants.flyTiltLerp
  );
  orientationPivot.rotation.set(
    state.smoothedFlyPitch,
    state.flyYawOffsetSmoothed,
    state.smoothedFlyRoll,
    'YXZ'
  );
}
