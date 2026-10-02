/**
 * Every movement and camera-feel parameter in the game lives here, in one
 * object. Units are meters, seconds, m/s and m/s² unless stated otherwise.
 *
 * The debug menu (~) edits this object live; its "Copy config as code"
 * button produces a replacement for the literal below.
 *
 * Course validation tests derive what is physically possible from these
 * values, so changing them is safe as long as `npm test` still passes.
 */
export const movement = {
  body: {
    /** Standing capsule height. */
    height: 1.8,
    /** Capsule radius. */
    radius: 0.35,
    /** Camera height above the feet while standing. */
    eyeHeight: 1.6,
    /** Capsule height while crouched or sliding. */
    crouchHeight: 1,
    /** Camera height above the feet while crouched or sliding. */
    crouchEyeHeight: 0.85,
    /** How quickly the camera moves between standing and crouched heights (1/s). */
    eyeHeightLerp: 12,
    /** Highest lip the player walks up without jumping. */
    stepHeight: 0.35,
  },
  ground: {
    /** Top running speed. */
    maxSpeed: 10,
    /** Acceleration toward the input direction. */
    accel: 60,
    /** Deceleration when there is no input. */
    decel: 40,
    /** Deceleration applied when moving faster than maxSpeed (e.g. after a slide). Low = momentum kept. */
    overspeedDecel: 20,
    /** Walking speed while crouched (not sliding). */
    crouchSpeed: 4,
    /** Steepest walkable slope in degrees; anything steeper is a wall. */
    maxSlopeDeg: 50,
    /** How far down the controller searches to stay glued to slopes and stairs. */
    snapDistance: 0.3,
  },
  air: {
    /** Acceleration from input while airborne. */
    accel: 20,
    /** Air input can only add speed up to this; above it input just steers (momentum preserved). */
    controlSpeed: 10,
    /** Hard cap on horizontal airborne speed. */
    speedCap: 18,
    /** Downward acceleration. */
    gravity: 30,
    /** Maximum fall speed. */
    terminalVelocity: 50,
  },
  jump: {
    /** Upward velocity of a jump. v²/2g = 9.5²/60 ≈ 1.5 m apex. */
    velocity: 9.5,
    /** Grace period after leaving a ledge during which jumping still works. */
    coyoteTime: 0.12,
    /** A jump pressed this long before landing still fires on landing. */
    bufferTime: 0.12,
    /** Fraction of upward slope velocity added to a jump (ramp launches). */
    slopeInherit: 0.5,
  },
  slide: {
    /** Minimum horizontal speed needed to start a slide. */
    minStartSpeed: 6,
    /** Speed added when a slide starts. */
    entryBoost: 2,
    /** Minimum time between two entry boosts (prevents crouch spamming). */
    boostCooldown: 0.75,
    /** Deceleration on flat ground while sliding. */
    friction: 2,
    /** Multiplier on gravity along slopes while sliding (downhill accelerates). */
    slopeGravityScale: 1,
    /** Slide ends below this speed. */
    endSpeed: 4,
    /** Absolute slide speed limit. */
    maxSpeed: 24,
    /** How fast input can rotate the slide direction (radians per second). */
    steerRate: 1.2,
  },
  wallRun: {
    /** Minimum speed along the wall to start a wall run. */
    minSpeed: 6,
    /** Maximum wall-run length. */
    duration: 1.4,
    /** Gravity multiplier at the start of a run. */
    gravityStart: 0.25,
    /** Gravity multiplier at the end of a run. */
    gravityEnd: 1,
    /** Shape of the gravity ramp: 1 = linear, 2 = gentle start then quicker drop. */
    gravityCurve: 2,
    /** Fastest the player can sink while wall running. */
    maxSinkSpeed: 4,
    /** Vertical velocity at the start of a run is clamped to [entryVyMin, entryVyMax]. */
    entryVyMin: 0,
    entryVyMax: 3,
    /** Cannot start a wall run when falling faster than this. */
    maxEntryFallSpeed: 9,
    /** Acceleration along the wall while holding forward (up to ground max speed). */
    accel: 8,
    /** Wall-jump push away from the wall. */
    jumpAway: 7,
    /** Wall-jump upward velocity. */
    jumpUp: 8,
    /** The same wall cannot be run again for this long after leaving it. */
    sameWallCooldown: 0.6,
    /** Distance used to look for a runnable wall beside the player. */
    detectDistance: 0.35,
  },
  cling: {
    /** Longest the player can hang on a wall. */
    duration: 0.6,
    /** Upward speed while climbing. */
    climbSpeed: 4,
    /** Longest climb within a cling. */
    climbDuration: 0.4,
    /** Must be looking within this angle (degrees) of the wall normal to grab it. */
    maxFacingAngleDeg: 50,
    /** Cannot grab when falling faster than this. */
    maxEntryFallSpeed: 12,
    /** Jumping off a cling: push away from the wall. */
    jumpAway: 5,
    /** Jumping off a cling: upward velocity. */
    jumpUp: 7.5,
  },
  mantle: {
    /** Height of the hands above the feet. */
    handHeight: 1.5,
    /** A ledge top up to this far above the hands can be mantled. */
    reach: 1.2,
    /** Ledges lower than this above the feet are stepped/jumped instead. */
    minHeight: 0.5,
    /** How far in front of the capsule to look for a ledge. */
    probeDistance: 0.45,
    /** Duration of the mantle animation. */
    duration: 0.3,
    /** Forward speed after mantling. */
    exitSpeed: 5,
    /** Fraction of the incoming horizontal speed kept after mantling (if above exitSpeed). */
    speedKeep: 0.6,
  },
  camera: {
    /** Widen the field of view with speed. */
    fovKick: true,
    /** Extra horizontal FOV in degrees at fovSpeedMax. */
    fovKickDegrees: 10,
    /** Speed at which the FOV kick starts. */
    fovSpeedMin: 9,
    /** Speed at which the FOV kick is at full strength. */
    fovSpeedMax: 18,
    /** Subtle head bob while running on the ground. */
    headBob: true,
    /** Vertical bob amplitude at full run. */
    headBobAmount: 0.035,
    /** Meters travelled per full bob cycle (two footsteps). */
    strideLength: 2.6,
    /** Camera dips on landing, scaled by fall speed. */
    landingDip: true,
    /** Dip meters per m/s of fall speed. */
    landingDipScale: 0.012,
    /** Largest landing dip. */
    landingDipMax: 0.3,
    /** Tilt the camera away from the wall while wall running. */
    wallRunTilt: true,
    /** Wall-run tilt in degrees. */
    wallRunTiltDegrees: 7,
  },
};

export type MovementConfig = typeof movement;

/** Snapshot of the shipped defaults, used by "Reset to defaults". */
export const MOVEMENT_DEFAULTS: MovementConfig = structuredClone(movement);

/** Overwrite `target` in place with values from `src` (only known keys, same types). */
export function assignMovement(target: MovementConfig, src: unknown): void {
  if (!src || typeof src !== 'object') return;
  const t = target as unknown as Record<string, Record<string, unknown>>;
  const s = src as Record<string, Record<string, unknown>>;
  for (const group of Object.keys(t)) {
    const sg = s[group];
    if (!sg || typeof sg !== 'object') continue;
    for (const key of Object.keys(t[group])) {
      if (key in sg && typeof sg[key] === typeof t[group][key]) t[group][key] = sg[key];
    }
  }
}
