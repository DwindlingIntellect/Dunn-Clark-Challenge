import { Vector3 } from 'three';
import { movement, type MovementConfig } from '../config/movement';
import type { CollisionWorld, CastHit } from './collision';
import type { PlayerInput, SimEvent, SurfaceKind } from './types';

/**
 * Custom kinematic first-person controller.
 *
 * - Runs on a fixed timestep and is deterministic for a given input stream.
 * - Uses swept capsule casts for every movement so it cannot tunnel.
 * - Reads every tunable from the movement config (src/config/movement.ts).
 *
 * `pos` is the position of the player's feet (bottom of the capsule).
 */
export type MoveMode = 'ground' | 'air' | 'slide' | 'wallrun' | 'cling' | 'mantle';

/** Resting gap kept between the capsule and geometry. */
const SKIN = 0.015;
/** Sweeps stop this far from geometry; we then back off to SKIN so later sweeps start clear. */
const CAST_GAP = SKIN * 0.5;
const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);
/** Normals with |y| below this count as walls for wall run / cling. */
const WALL_MAX_NY = 0.35;

const tmpA = new Vector3();
const tmpB = new Vector3();

export class PlayerController {
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  mode: MoveMode = 'air';
  grounded = false;
  readonly groundNormal = new Vector3(0, 1, 0);
  groundSurface: SurfaceKind = 'stone';
  crouched = false;
  /** Smoothed camera height above the feet. */
  eyeHeight: number;
  /** Yaw used on the last tick (for camera-feel helpers). */
  yaw = 0;

  // Timers (seconds)
  coyote = 0;
  jumpBuffer = 0;
  private jumpLock = 0;
  private slideBoostCd = 0;

  // Wall run / cling
  readonly wallNormal = new Vector3();
  wallTime = 0;
  private wallId = -1;
  private lastWallId = -1;
  private readonly lastWallNormal = new Vector3();
  private lastWallCd = 0;
  clingTime = 0;
  private clingUsed = false;

  // Mantle
  mantleT = 0;
  private readonly mantleFrom = new Vector3();
  private readonly mantleMid = new Vector3();
  private readonly mantleTo = new Vector3();
  private mantleExitSpeed = 0;
  private mantleCrouched = false;

  private prevJump = false;
  private prevCrouch = false;
  private input: PlayerInput | null = null;
  /** Distance accumulated toward the next footstep. */
  stride = 0;
  /** Events produced during the last step (cleared at the start of each step). */
  readonly events: SimEvent[] = [];
  /** Total simulated time. */
  time = 0;

  constructor(public world: CollisionWorld, public cfg: MovementConfig = movement) {
    this.eyeHeight = cfg.body.eyeHeight;
  }

  // ---------------------------------------------------------------- helpers

  get height(): number {
    return this.crouched ? this.cfg.body.crouchHeight : this.cfg.body.height;
  }

  get radius(): number {
    return this.cfg.body.radius;
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  get speed(): number {
    return this.vel.length();
  }

  /** Camera position (feet + eye height). */
  eyePosition(out = new Vector3()): Vector3 {
    return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  private cosMaxSlope(): number {
    return Math.cos((this.cfg.ground.maxSlopeDeg * Math.PI) / 180);
  }

  private isWalkable(n: Vector3): boolean {
    return n.y >= this.cosMaxSlope();
  }

  private cast(dir: Vector3, dist: number, from = this.pos, height = this.height): CastHit | null {
    return this.world.castCapsule(from, height, this.radius, dir, dist, CAST_GAP);
  }

  /** Place the player at `pos` facing `yaw`, clearing all movement state. */
  reset(pos: Vector3 | [number, number, number], yaw = 0): void {
    if (Array.isArray(pos)) this.pos.set(pos[0], pos[1], pos[2]);
    else this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.mode = 'air';
    this.grounded = false;
    this.crouched = false;
    this.eyeHeight = this.cfg.body.eyeHeight;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpLock = 0;
    this.slideBoostCd = 0;
    this.wallTime = 0;
    this.wallId = -1;
    this.lastWallId = -1;
    this.lastWallCd = 0;
    this.clingTime = 0;
    this.clingUsed = false;
    this.mantleT = 0;
    this.prevJump = false;
    this.prevCrouch = false;
    this.stride = 0;
    this.yaw = yaw;
    this.events.length = 0;
    // Settle onto the ground if we start just above it.
    const hit = this.probeGround(0.5);
    if (hit) {
      this.pos.y = hit.y;
      this.grounded = true;
      this.mode = 'ground';
      this.groundNormal.copy(hit.normal);
      this.groundSurface = hit.surface;
    }
  }

  // ------------------------------------------------------------------ step

  step(input: PlayerInput, dt: number): void {
    const c = this.cfg;
    this.events.length = 0;
    this.input = input;
    this.time += dt;
    this.yaw = input.yaw;

    const jumpPressed = input.jump && !this.prevJump;
    const crouchPressed = input.crouch && !this.prevCrouch;
    this.prevJump = input.jump;
    this.prevCrouch = input.crouch;
    if (jumpPressed) this.jumpBuffer = c.jump.bufferTime;

    this.jumpLock = Math.max(0, this.jumpLock - dt);
    this.slideBoostCd = Math.max(0, this.slideBoostCd - dt);
    this.lastWallCd = Math.max(0, this.lastWallCd - dt);
    if (!this.grounded) this.coyote = Math.max(0, this.coyote - dt);

    // Desired horizontal direction from input + yaw.
    const fwd = new Vector3(-Math.sin(input.yaw), 0, -Math.cos(input.yaw));
    const right = new Vector3(Math.cos(input.yaw), 0, -Math.sin(input.yaw));
    const wish = fwd.clone().multiplyScalar(input.forward).addScaledVector(right, input.right);
    if (wish.lengthSq() > 1) wish.normalize();

    if (this.mode === 'mantle') {
      this.updateMantle(dt, fwd);
    } else {
      const delta = new Vector3();
      switch (this.mode) {
        case 'ground':
          this.updateGround(input, wish, fwd, crouchPressed, dt, delta);
          break;
        case 'slide':
          this.updateSlide(input, wish, dt, delta);
          break;
        case 'air':
          this.updateAir(input, wish, fwd, dt, delta);
          break;
        case 'wallrun':
          this.updateWallRun(input, wish, fwd, crouchPressed, dt, delta);
          break;
        case 'cling':
          this.updateCling(input, wish, fwd, crouchPressed, dt, delta);
          break;
      }
      if ((this.mode as MoveMode) !== 'mantle') {
        const preVel = this.vel.clone();
        const hits = this.moveAndSlide(delta, this.mode === 'ground' || this.mode === 'slide');
        this.updateGrounding(preVel, hits);
      }
    }

    this.updateCrouch(input);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    const eyeTarget = this.crouched ? c.body.crouchEyeHeight : c.body.eyeHeight;
    this.eyeHeight += (eyeTarget - this.eyeHeight) * Math.min(1, c.body.eyeHeightLerp * dt);
  }

  // ---------------------------------------------------------------- ground

  private updateGround(input: PlayerInput, wish: Vector3, fwd: Vector3, crouchPressed: boolean, dt: number, delta: Vector3): void {
    const c = this.cfg;
    const hs = this.horizontalSpeed;

    if (input.crouch && crouchPressed && hs >= c.slide.minStartSpeed) {
      this.startSlide();
      this.updateSlide(input, wish, dt, delta);
      return;
    }
    if (this.jumpBuffer > 0) {
      this.doJump();
      this.updateAir(input, wish, fwd, dt, delta, true);
      return;
    }
    if (input.forward > 0 && this.tryMantle(fwd)) return;

    const maxSpeed = this.crouched ? c.ground.crouchSpeed : c.ground.maxSpeed;
    const vx = this.vel.x;
    const vz = this.vel.z;
    let nx: number;
    let nz: number;
    const wl = Math.hypot(wish.x, wish.z);
    if (wl > 1e-4) {
      if (hs > maxSpeed && vx * wish.x + vz * wish.z > 0) {
        // Above top speed: keep momentum, decay slowly, steer toward input.
        const newSpeed = Math.max(maxSpeed * wl, hs - c.ground.overspeedDecel * dt);
        [nx, nz] = moveTowards2(vx, vz, wish.x * hs, wish.z * hs, c.ground.accel * dt);
        const l = Math.hypot(nx, nz) || 1;
        nx = (nx / l) * newSpeed;
        nz = (nz / l) * newSpeed;
      } else {
        [nx, nz] = moveTowards2(vx, vz, wish.x * maxSpeed, wish.z * maxSpeed, c.ground.accel * dt);
      }
    } else {
      [nx, nz] = moveTowards2(vx, vz, 0, 0, c.ground.decel * dt);
    }
    this.vel.x = nx;
    this.vel.z = nz;
    this.followGroundPlane();
    delta.copy(this.vel).multiplyScalar(dt);

    // Footsteps / head-bob stride.
    const before = Math.floor(this.stride / (c.camera.strideLength / 2));
    this.stride += Math.hypot(nx, nz) * dt;
    const after = Math.floor(this.stride / (c.camera.strideLength / 2));
    if (after !== before) this.events.push({ type: 'footstep', surface: this.groundSurface, speed: Math.hypot(nx, nz) });
  }

  /** Make the velocity follow the ground plane while keeping horizontal speed. */
  private followGroundPlane(): void {
    const n = this.groundNormal;
    this.vel.y = n.y > 0.01 ? -(n.x * this.vel.x + n.z * this.vel.z) / n.y : 0;
  }

  private doJump(): void {
    const c = this.cfg;
    const inherit = Math.max(0, this.vel.y) * c.jump.slopeInherit;
    if (this.mode === 'slide') this.events.push({ type: 'slideEnd' });
    this.vel.y = c.jump.velocity + inherit;
    this.mode = 'air';
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpLock = 0.1;
    this.events.push({ type: 'jump', speed: this.horizontalSpeed });
  }

  // ----------------------------------------------------------------- slide

  private startSlide(): void {
    const c = this.cfg;
    this.mode = 'slide';
    this.crouched = true;
    if (this.slideBoostCd <= 0) {
      const hs = this.horizontalSpeed;
      if (hs > 1e-3) {
        const target = Math.min(c.slide.maxSpeed, hs + c.slide.entryBoost);
        this.vel.x *= target / hs;
        this.vel.z *= target / hs;
      }
      this.slideBoostCd = c.slide.boostCooldown;
    }
    this.events.push({ type: 'slideStart', speed: this.horizontalSpeed });
  }

  private endSlide(): void {
    this.mode = 'ground';
    this.events.push({ type: 'slideEnd' });
  }

  private updateSlide(input: PlayerInput, wish: Vector3, dt: number, delta: Vector3): void {
    const c = this.cfg;
    if (this.jumpBuffer > 0) {
      this.doJump();
      this.updateAir(input, wish, new Vector3(-Math.sin(input.yaw), 0, -Math.cos(input.yaw)), dt, delta, true);
      return;
    }
    const n = this.groundNormal;
    // Redirect the velocity into the ground plane, keeping its magnitude.
    const mag = this.vel.length();
    this.vel.addScaledVector(n, -this.vel.dot(n));
    const pm = this.vel.length();
    if (pm > 1e-6) this.vel.multiplyScalar(mag / pm);

    // Gravity component along the slope (downhill accelerates, uphill slows).
    const g = tmpA.set(0, -c.air.gravity * c.slide.slopeGravityScale, 0);
    g.addScaledVector(n, -g.dot(n));
    this.vel.addScaledVector(g, dt);

    // Friction.
    let speed = this.vel.length();
    if (speed > 1e-6) {
      const ns = Math.max(0, speed - c.slide.friction * dt);
      this.vel.multiplyScalar(ns / speed);
      speed = ns;
    }

    // Gentle steering toward the input direction.
    if (wish.lengthSq() > 1e-4 && speed > 1e-3) {
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > 1e-3) {
        const cur = Math.atan2(this.vel.x, this.vel.z);
        const want = Math.atan2(wish.x, wish.z);
        let d = want - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        // Only steer for inputs in front of the slide direction.
        if (Math.abs(d) < Math.PI / 2) {
          const step = Math.max(-c.slide.steerRate * dt, Math.min(c.slide.steerRate * dt, d));
          const a = cur + step;
          this.vel.x = Math.sin(a) * hs;
          this.vel.z = Math.cos(a) * hs;
          this.vel.addScaledVector(n, -this.vel.dot(n));
        }
      }
    }

    if (speed > c.slide.maxSpeed) this.vel.multiplyScalar(c.slide.maxSpeed / speed);
    delta.copy(this.vel).multiplyScalar(dt);

    if (this.horizontalSpeed < c.slide.endSpeed && speed < c.slide.endSpeed) {
      this.endSlide();
    } else if (!input.crouch && this.hasHeadroom()) {
      this.endSlide();
    }
  }

  // ------------------------------------------------------------------- air

  private updateAir(input: PlayerInput, wish: Vector3, fwd: Vector3, dt: number, delta: Vector3, skipChecks = false): void {
    const c = this.cfg;
    if (!skipChecks) {
      if (this.jumpBuffer > 0 && this.coyote > 0) {
        this.doJump();
      } else {
        if (input.forward > 0 && this.tryMantle(fwd)) return;
        if (this.tryWallRun(input, delta, dt)) return;
        if (this.tryCling(input, fwd, delta, dt)) return;
      }
    }

    // Momentum-preserving air control.
    const wl = Math.hypot(wish.x, wish.z);
    if (wl > 1e-4) {
      const hs = this.horizontalSpeed;
      let nx = this.vel.x + wish.x * c.air.accel * dt;
      let nz = this.vel.z + wish.z * c.air.accel * dt;
      const limit = Math.max(hs, c.air.controlSpeed);
      const nl = Math.hypot(nx, nz);
      if (nl > limit) {
        nx = (nx / nl) * limit;
        nz = (nz / nl) * limit;
      }
      this.vel.x = nx;
      this.vel.z = nz;
    }
    const hs = this.horizontalSpeed;
    if (hs > c.air.speedCap) {
      this.vel.x *= c.air.speedCap / hs;
      this.vel.z *= c.air.speedCap / hs;
    }

    this.applyGravity(1, dt, delta, -c.air.terminalVelocity);
  }

  /** Integrates gravity with an exact (trapezoidal) position update so jump arcs are true parabolas. */
  private applyGravity(scale: number, dt: number, delta: Vector3, minVy: number): void {
    const vy0 = this.vel.y;
    let vy1 = vy0 - this.cfg.air.gravity * scale * dt;
    if (vy1 < minVy) vy1 = Math.min(vy0, minVy);
    this.vel.y = vy1;
    delta.set(this.vel.x * dt, ((vy0 + vy1) / 2) * dt, this.vel.z * dt);
  }

  // -------------------------------------------------------------- wall run

  private tryWallRun(input: PlayerInput, delta: Vector3, dt: number): boolean {
    const c = this.cfg.wallRun;
    if (input.forward <= 0) return false;
    const hs = this.horizontalSpeed;
    if (hs < c.minSpeed) return false;
    if (this.vel.y < -c.maxEntryFallSpeed) return false;

    const d = new Vector3(this.vel.x / hs, 0, this.vel.z / hs);
    const side = new Vector3(-d.z, 0, d.x);
    const probes = [side, side.clone().negate(), d];
    let best: CastHit | null = null;
    for (const dir of probes) {
      const hit = this.cast(dir, c.detectDistance);
      if (!hit || !hit.meta.wallrun || Math.abs(hit.normal.y) > WALL_MAX_NY) continue;
      // A wall straight ahead is a cling, not a run.
      if (dir === d && -hit.normal.dot(d) > 0.8) continue;
      if (!best || hit.toi < best.toi) best = hit;
    }
    if (!best) return false;

    const n = new Vector3(best.normal.x, 0, best.normal.z).normalize();
    if (best.meta.index === this.lastWallId && this.lastWallCd > 0 && n.dot(this.lastWallNormal) > 0.7) return false;

    const tangent = new Vector3(this.vel.x, 0, this.vel.z);
    tangent.addScaledVector(n, -tangent.dot(n));
    const ts = tangent.length();
    if (ts < c.minSpeed) return false;

    this.mode = 'wallrun';
    this.wallTime = 0;
    this.wallNormal.copy(n);
    this.wallId = best.meta.index;
    tangent.multiplyScalar(hs / ts);
    this.vel.x = tangent.x;
    this.vel.z = tangent.z;
    this.vel.y = Math.min(c.entryVyMax, Math.max(c.entryVyMin, this.vel.y));
    const rightVec = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.events.push({ type: 'wallrunStart', side: n.dot(rightVec) < 0 ? 1 : -1 });
    this.wallRunMotion(dt, delta);
    return true;
  }

  private updateWallRun(input: PlayerInput, wish: Vector3, fwd: Vector3, crouchPressed: boolean, dt: number, delta: Vector3): void {
    const c = this.cfg.wallRun;
    this.wallTime += dt;

    if (this.jumpBuffer > 0) {
      this.wallJump(c.jumpAway, c.jumpUp, true);
      this.updateAir(input, wish, fwd, dt, delta, true);
      return;
    }

    const probeDir = this.wallNormal.clone().negate();
    const hit = this.cast(probeDir, c.detectDistance + 0.1);
    const lost = !hit || !hit.meta.wallrun || Math.abs(hit.normal.y) > WALL_MAX_NY;
    if (lost || crouchPressed || input.forward <= 0 || this.wallTime >= c.duration) {
      this.endWallRun(lost ? 0 : 1);
      this.updateAir(input, wish, fwd, dt, delta, true);
      return;
    }
    this.wallNormal.set(hit.normal.x, 0, hit.normal.z).normalize();
    this.wallId = hit.meta.index;
    this.wallRunMotion(dt, delta);
  }

  private wallRunMotion(dt: number, delta: Vector3): void {
    const c = this.cfg.wallRun;
    const n = this.wallNormal;
    const vh = tmpB.set(this.vel.x, 0, this.vel.z);
    vh.addScaledVector(n, -vh.dot(n));
    let speed = vh.length();
    if (speed > 1e-4) {
      const target = this.cfg.ground.maxSpeed;
      if (speed < target) speed = Math.min(target, speed + c.accel * dt);
      vh.multiplyScalar(speed / vh.length());
    }
    this.vel.x = vh.x;
    this.vel.z = vh.z;
    const t = Math.min(1, this.wallTime / c.duration);
    const scale = c.gravityStart + (c.gravityEnd - c.gravityStart) * Math.pow(t, c.gravityCurve);
    this.applyGravity(scale, dt, delta, -c.maxSinkSpeed);
    // Lean slightly into the wall to keep contact.
    delta.addScaledVector(n, -0.5 * dt);
  }

  private endWallRun(push: number): void {
    this.lastWallId = this.wallId;
    this.lastWallNormal.copy(this.wallNormal);
    this.lastWallCd = this.cfg.wallRun.sameWallCooldown;
    this.mode = 'air';
    this.vel.addScaledVector(this.wallNormal, push);
    this.events.push({ type: 'wallrunEnd' });
  }

  private wallJump(away: number, up: number, keepTangent: boolean): void {
    const n = this.wallNormal;
    if (!keepTangent) {
      this.vel.set(0, 0, 0);
    } else {
      const vn = this.vel.x * n.x + this.vel.z * n.z;
      this.vel.x -= n.x * vn;
      this.vel.z -= n.z * vn;
    }
    this.vel.x += n.x * away;
    this.vel.z += n.z * away;
    this.vel.y = up;
    this.lastWallId = this.wallId;
    this.lastWallNormal.copy(n);
    this.lastWallCd = this.cfg.wallRun.sameWallCooldown;
    this.mode = 'air';
    this.jumpBuffer = 0;
    this.jumpLock = 0.1;
    this.events.push({ type: 'wallJump' });
  }

  // ----------------------------------------------------------------- cling

  private tryCling(input: PlayerInput, fwd: Vector3, delta: Vector3, dt: number): boolean {
    const c = this.cfg.cling;
    // coyote > 0 means we only just left the ground without jumping: no cling.
    if (this.clingUsed || input.forward <= 0 || this.coyote > 0) return false;
    if (this.vel.y < -c.maxEntryFallSpeed) return false;
    const hit = this.cast(fwd, 0.25);
    if (!hit || Math.abs(hit.normal.y) > WALL_MAX_NY) return false;
    const n = new Vector3(hit.normal.x, 0, hit.normal.z).normalize();
    if (-n.dot(fwd) < Math.cos((c.maxFacingAngleDeg * Math.PI) / 180)) return false;
    this.mode = 'cling';
    this.clingTime = 0;
    this.clingUsed = true;
    this.wallNormal.copy(n);
    this.wallId = hit.meta.index;
    this.events.push({ type: 'cling' });
    this.clingMotion(input, delta, dt);
    return true;
  }

  private updateCling(input: PlayerInput, wish: Vector3, fwd: Vector3, crouchPressed: boolean, dt: number, delta: Vector3): void {
    const c = this.cfg.cling;
    this.clingTime += dt;
    if (input.forward > 0 && this.tryMantle(fwd)) return;
    if (this.jumpBuffer > 0) {
      this.wallJump(c.jumpAway, c.jumpUp, false);
      this.updateAir(input, wish, fwd, dt, delta, true);
      return;
    }
    const hit = this.cast(this.wallNormal.clone().negate(), 0.3);
    if (!hit || crouchPressed || input.forward <= 0 || this.clingTime >= c.duration) {
      this.mode = 'air';
      if (hit) this.vel.addScaledVector(this.wallNormal, 0.5);
      this.updateAir(input, wish, fwd, dt, delta, true);
      return;
    }
    this.clingMotion(input, delta, dt);
  }

  private clingMotion(input: PlayerInput, delta: Vector3, dt: number): void {
    const c = this.cfg.cling;
    const climbing = this.clingTime < c.climbDuration && input.forward > 0;
    this.vel.set(0, climbing ? c.climbSpeed : 0, 0);
    delta.set(0, this.vel.y * dt, 0).addScaledVector(this.wallNormal, -0.5 * dt);
  }

  // ---------------------------------------------------------------- mantle

  /** Look for a ledge in front of the player and start a mantle if one is in reach. */
  private tryMantle(fwd: Vector3): boolean {
    const c = this.cfg.mantle;
    const hit = this.cast(fwd, c.probeDistance);
    if (!hit || Math.abs(hit.normal.y) > 0.5 || hit.normal.dot(fwd) > -0.5) return false;

    const r = this.radius;
    const handY = this.pos.y + c.handHeight;
    const topY = handY + c.reach + 0.02;
    // Probe just past the wall face for the ledge top.
    const face = new Vector3(hit.point.x, 0, hit.point.z);
    const origin = face.clone().addScaledVector(fwd, 0.12).setY(topY);
    const ray = this.world.raycast(origin, DOWN, topY - (this.pos.y + c.minHeight));
    if (!ray || ray.toi < 0.01 || !this.isWalkable(ray.normal)) return false;
    const ledgeY = topY - ray.toi;
    if (ledgeY - handY > c.reach || ledgeY < this.pos.y + c.minHeight) return false;

    const endFeet = face.clone().addScaledVector(fwd, r + 0.12).setY(ledgeY + 0.03);
    const mid = new Vector3(this.pos.x, ledgeY + 0.03, this.pos.z);
    const b = this.cfg.body;
    let endCrouched = false;
    if (this.world.overlapCapsule(endFeet, b.height, r - 0.02)) {
      if (this.world.overlapCapsule(endFeet, b.crouchHeight, r - 0.02)) return false;
      endCrouched = true;
    }
    if (this.world.overlapCapsule(mid, b.crouchHeight, r - 0.02)) return false;

    const hs = this.horizontalSpeed;
    this.mantleExitSpeed = Math.max(c.exitSpeed, hs * c.speedKeep);
    this.mantleFrom.copy(this.pos);
    this.mantleMid.copy(mid);
    this.mantleTo.copy(endFeet);
    this.mantleCrouched = endCrouched;
    this.mantleT = 0;
    this.mode = 'mantle';
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.events.push({ type: 'mantle' });
    return true;
  }

  private updateMantle(dt: number, fwd: Vector3): void {
    const c = this.cfg.mantle;
    this.mantleT = Math.min(1, this.mantleT + dt / Math.max(0.01, c.duration));
    const t = this.mantleT;
    const split = 0.6;
    if (t < split) {
      const k = t / split;
      this.pos.lerpVectors(this.mantleFrom, this.mantleMid, 1 - (1 - k) * (1 - k));
    } else {
      this.pos.lerpVectors(this.mantleMid, this.mantleTo, (t - split) / (1 - split));
    }
    if (this.mantleCrouched) this.crouched = true;
    if (t >= 1) {
      const dir = tmpA.subVectors(this.mantleTo, this.mantleFrom).setY(0);
      if (dir.lengthSq() < 1e-6) dir.copy(fwd);
      dir.normalize();
      this.vel.set(dir.x * this.mantleExitSpeed, 0, dir.z * this.mantleExitSpeed);
      this.mode = 'ground';
      this.clingUsed = false;
      const g = this.probeGround(0.2);
      if (g) {
        this.pos.y = g.y;
        this.groundNormal.copy(g.normal);
        this.groundSurface = g.surface;
        this.grounded = true;
        this.coyote = this.cfg.jump.coyoteTime;
      } else {
        this.mode = 'air';
      }
    }
  }

  // ------------------------------------------------------------- collision

  /** Collide-and-slide: sweep the capsule along `delta`, sliding along obstacles. */
  private moveAndSlide(delta: Vector3, allowStep: boolean): CastHit[] {
    // Keep a small gap from all geometry so sweeps never start in contact.
    this.pos.copy(this.world.depenetrate(this.pos, this.height, this.radius, SKIN * 0.5));
    const start = this.pos.clone();
    const startVel = this.vel.clone();
    const hits = this.slide(delta);

    if (allowStep && this.grounded && hits.some((h) => !this.isWalkable(h.normal) && Math.abs(h.normal.y) < 0.5)) {
      this.tryStep(start, startVel, delta, hits);
    }
    // Riding over slope changes and step edges should not bleed running speed.
    if (allowStep && this.grounded && hits.length > 0 && hits.every((h) => h.normal.y > 0.05)) {
      const before = Math.hypot(startVel.x, startVel.z);
      const after = this.horizontalSpeed;
      if (after > 1e-4 && after < before) {
        this.vel.x *= before / after;
        this.vel.z *= before / after;
      }
    }
    return hits;
  }

  private slide(delta: Vector3): CastHit[] {
    const hits: CastHit[] = [];
    const remaining = delta.clone();
    let prevN: Vector3 | null = null;
    for (let i = 0; i < 5; i++) {
      const dist = remaining.length();
      if (dist < 1e-7) break;
      const dir = remaining.clone().divideScalar(dist);
      const hit = this.cast(dir, dist);
      if (!hit) {
        this.pos.add(remaining);
        break;
      }
      const n = hit.normal;
      if (hit.toi < 1e-5 && Math.abs(dir.dot(n)) < 0.05) {
        // Touching contact while moving tangentially: step away from it and retry.
        this.pos.addScaledVector(n, SKIN * 0.5);
        continue;
      }
      this.pos.addScaledVector(dir, hit.toi);
      // Back off along the normal to restore the resting gap.
      this.pos.addScaledVector(n, SKIN - CAST_GAP);
      hits.push(hit);
      remaining.copy(dir).multiplyScalar(dist - hit.toi);
      remaining.addScaledVector(n, -remaining.dot(n));
      if (prevN && remaining.dot(prevN) < 0) {
        const crease = new Vector3().crossVectors(prevN, n);
        if (crease.lengthSq() > 1e-8) {
          crease.normalize();
          remaining.copy(crease.multiplyScalar(remaining.dot(crease)));
        } else {
          remaining.set(0, 0, 0);
        }
      }
      const vn = this.vel.dot(n);
      if (vn < 0) this.vel.addScaledVector(n, -vn);
      prevN = n;
    }
    return hits;
  }

  /** Try to walk up a small step that blocked horizontal movement. */
  private tryStep(start: Vector3, startVel: Vector3, delta: Vector3, hits: CastHit[]): void {
    const stepH = this.cfg.body.stepHeight;
    const slidPos = this.pos.clone();
    const slidVel = this.vel.clone();
    const up = this.cast(UP, stepH, start);
    const upDist = up ? up.toi : stepH;
    if (upDist < 0.05) return;
    const p = start.clone().addScaledVector(UP, upDist);
    const dh = new Vector3(delta.x, 0, delta.z);
    const dl = dh.length();
    if (dl < 1e-6) return;
    dh.divideScalar(dl);
    const fh = this.cast(dh, dl, p);
    const travel = fh ? fh.toi : dl;
    p.addScaledVector(dh, travel);
    const down = this.cast(DOWN, upDist + 0.05, p);
    if (!down) return;
    const support = this.supportNormal(down, p);
    if (!support) return;
    p.y -= down.toi - (SKIN - CAST_GAP);
    const progStep = Math.hypot(p.x - start.x, p.z - start.z);
    const progSlide = Math.hypot(slidPos.x - start.x, slidPos.z - start.z);
    if (progStep > progSlide + 0.002) {
      this.pos.copy(p);
      this.vel.copy(startVel);
      this.vel.y = 0;
      this.groundNormal.copy(support);
      hits.length = 0;
    } else {
      this.pos.copy(slidPos);
      this.vel.copy(slidVel);
    }
  }

  /**
   * Sweep down up to `dist` looking for walkable ground. The cast starts a
   * skin's width higher so it never begins in contact, and flat faces get an
   * exact normal from a ray (contact normals can be noisy).
   */
  private probeGround(dist: number): { y: number; normal: Vector3; surface: SurfaceKind } | null {
    const from = tmpA.copy(this.pos);
    from.y += SKIN;
    const hit = this.cast(DOWN, dist + SKIN, from);
    if (!hit) return null;
    const normal = this.faceNormal(hit, from) ?? this.supportNormal(hit, from);
    if (!normal) return null;
    const y = from.y - hit.toi + (SKIN - CAST_GAP);
    const ray = this.world.raycast(new Vector3(this.pos.x, y + 0.25, this.pos.z), DOWN, 0.6);
    if (ray && this.isWalkable(ray.normal) && Math.abs(ray.point.y - y) < 0.12) normal.copy(ray.normal);
    return { y, normal, surface: hit.meta.surface };
  }

  /**
   * Walkable normal supporting the capsule for a downward cast hit, or null.
   * Edge/corner contacts report tilted normals, so we look at the actual face
   * just beyond the contact point.
   */
  private supportNormal(hit: CastHit, feet: Vector3): Vector3 | null {
    if (this.isWalkable(hit.normal)) return hit.normal.clone();
    return this.faceNormal(hit, feet);
  }

  /** Normal of the walkable face just beyond a contact point (null if none). */
  private faceNormal(hit: CastHit, feet: Vector3): Vector3 | null {
    if (hit.normal.y < 0.05) return null;
    const out = tmpB.set(hit.point.x - feet.x, 0, hit.point.z - feet.z);
    if (out.lengthSq() < 1e-8) return null;
    out.normalize().multiplyScalar(0.03);
    const origin = new Vector3(hit.point.x + out.x, hit.point.y + 0.1, hit.point.z + out.z);
    const ray = this.world.raycast(origin, DOWN, 0.2);
    if (ray && ray.toi > 0.001 && this.isWalkable(ray.normal) && Math.abs(ray.point.y - hit.point.y) < 0.05) {
      return ray.normal.clone();
    }
    return null;
  }

  private updateGrounding(preVel: Vector3, hits: CastHit[]): void {
    const c = this.cfg;
    const wasGrounded = this.grounded;

    if (this.mode === 'wallrun' || this.mode === 'cling') {
      // Touching walkable ground ends wall interactions.
      const floor = hits.find((h) => this.isWalkable(h.normal));
      if (floor && this.vel.y <= 0.01) {
        if (this.mode === 'wallrun') this.endWallRun(0);
        else this.mode = 'air';
      } else {
        this.grounded = false;
        return;
      }
    }

    if (this.jumpLock > 0 || (!wasGrounded && this.vel.y > 0.5)) {
      this.grounded = false;
      return;
    }
    const dist = wasGrounded ? c.ground.snapDistance : 0.05;
    const hit = this.probeGround(dist);
    if (hit) {
      this.pos.y = hit.y;
      this.grounded = true;
      this.groundNormal.copy(hit.normal);
      this.groundSurface = hit.surface;
      this.coyote = c.jump.coyoteTime;
      if (!wasGrounded) this.land(preVel);
      if (this.mode === 'ground') this.followGroundPlane();
    } else {
      this.grounded = false;
      if (this.mode === 'ground' || this.mode === 'slide') {
        if (this.mode === 'slide') this.events.push({ type: 'slideEnd' });
        this.mode = 'air';
      }
    }
  }

  private land(preVel: Vector3): void {
    const c = this.cfg;
    const fall = Math.max(0, -preVel.y);
    this.events.push({ type: 'land', fallSpeed: fall, surface: this.groundSurface });
    this.clingUsed = false;
    if (this.vel.y < 0) this.vel.y = 0;
    const input = this.input;
    if (this.mode === 'slide') return;
    if (input && input.crouch && this.horizontalSpeed >= c.slide.minStartSpeed && this.jumpBuffer <= 0) {
      this.startSlide();
    } else {
      this.mode = 'ground';
    }
  }

  // ---------------------------------------------------------------- crouch

  private hasHeadroom(): boolean {
    const p = tmpB.copy(this.pos);
    p.y += 0.03;
    return !this.world.overlapCapsule(p, this.cfg.body.height - 0.03, this.radius - 0.01);
  }

  private updateCrouch(input: PlayerInput): void {
    const m = this.mode;
    const want = m === 'slide' || (m === 'mantle' && this.mantleCrouched) || (input.crouch && (m === 'ground' || m === 'air'));
    if (want) {
      this.crouched = true;
    } else if (this.crouched && m !== 'mantle' && this.hasHeadroom()) {
      this.crouched = false;
    }
  }
}

function moveTowards2(x: number, z: number, tx: number, tz: number, maxDelta: number): [number, number] {
  const dx = tx - x;
  const dz = tz - z;
  const d = Math.hypot(dx, dz);
  if (d <= maxDelta || d < 1e-9) return [tx, tz];
  return [x + (dx / d) * maxDelta, z + (dz / d) * maxDelta];
}
