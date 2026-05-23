import * as THREE from 'three';

/** 拖拽转向渐入（与飞行循环独立，避免共用 flyLoopSteerStartMs） */
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
  flyBankFromYaw: number;
  flyMaxPitch: number;
  flyMaxRoll: number;
  flyMaxYaw: number;
  /** 单帧位移达到该值时俯仰/偏航强度为满 */
  moveSteerFullSpeed: number;
  /** 低于该单帧位移视为静止并回正 */
  moveSteerIdleThreshold: number;
}

/**
 * 拖拽：根据窗口自身移动方向/速度更新俯仰与偏航（非鼠标相对窗口偏移）
 */
export function updateWalkDragSteerInput(
  state: WalkDragSteerState,
  constants: WalkDragSteerConstants,
  moveDx: number,
  moveDy: number,
  chaseComplete: boolean
): void {
  const steerRamp = Math.min(
    1,
    (performance.now() - state.walkLoopSteerStartMs) / WALK_LOOP_STEER_RAMP_MS
  );
  const steer = steerRamp * steerRamp;
  const moveSpeed = Math.hypot(moveDx, moveDy);

  if (moveSpeed < constants.moveSteerIdleThreshold) {
    const r = constants.flyResetLerp * (chaseComplete ? 1 : 0.4);
    state.flyYawOffsetTarget = THREE.MathUtils.lerp(state.flyYawOffsetTarget, 0, r);
    state.dragPitchTarget = THREE.MathUtils.lerp(state.dragPitchTarget, 0, r);
    state.dragRollTarget = THREE.MathUtils.lerp(state.dragRollTarget, 0, r);
    return;
  }

  const speedFactor = Math.min(moveSpeed / constants.moveSteerFullSpeed, 1) * steer;
  const invSpeed = 1 / moveSpeed;
  const dirX = moveDx * invSpeed;
  const dirY = moveDy * invSpeed;

  const targetYaw = THREE.MathUtils.clamp(
    dirX * constants.flyMaxYaw * speedFactor,
    -constants.flyMaxYaw,
    constants.flyMaxYaw
  );
  const targetPitch = THREE.MathUtils.clamp(
    dirY * constants.flyMaxPitch * speedFactor,
    -constants.flyMaxPitch,
    constants.flyMaxPitch
  );
  const steerLerp = 0.14 * Math.max(steer, 0.2);
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
