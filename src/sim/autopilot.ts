import type { PlayerController } from './controller';
import type { PlayerInput } from './types';

/**
 * A tiny waypoint-following bot used to drive courses headlessly (smoke
 * tests, route timing for medal estimates, and recording input sequences).
 * Each waypoint is reached when the player passes it along the segment from
 * the previous waypoint (or gets within `radius`).
 */
export interface Waypoint {
  /** Target position (x, z). */
  at: [number, number];
  /** Action performed when this waypoint is reached. */
  act?: 'jump' | 'slide' | 'stand' | 'wall' | 'none';
  /** Steering input held while heading to this waypoint (e.g. lean into a wall). */
  lean?: number;
  /** Hold crouch while heading to this waypoint. */
  crouch?: boolean;
  /** Arrival radius (default 0.8 m). */
  radius?: number;
  /** Hold still for this many seconds after reaching the waypoint. */
  wait?: number;
}

export class Autopilot {
  index = 0;
  private prev: [number, number];
  private jumpTicks = 0;
  private crouching = false;
  private waitTicks = 0;
  done = false;

  constructor(private route: Waypoint[], start: [number, number]) {
    this.prev = start;
  }

  next(pc: PlayerController): PlayerInput {
    const inp: PlayerInput = { forward: 1, right: 0, jump: false, crouch: this.crouching, yaw: pc.yaw, pitch: 0 };
    if (this.waitTicks > 0) {
      this.waitTicks--;
      inp.forward = 0;
      return inp;
    }
    if (this.index >= this.route.length) {
      this.done = true;
      return inp;
    }
    const wp = this.route[this.index];
    const [tx, tz] = wp.at;
    const dx = tx - pc.pos.x;
    const dz = tz - pc.pos.z;
    // Passed the waypoint along the route segment?
    const sx = tx - this.prev[0];
    const sz = tz - this.prev[1];
    const segLen2 = sx * sx + sz * sz;
    const t = segLen2 > 1e-6 ? ((pc.pos.x - this.prev[0]) * sx + (pc.pos.z - this.prev[1]) * sz) / segLen2 : 1;
    const r = wp.radius ?? 0.8;
    if (t >= 1 || dx * dx + dz * dz < r * r) {
      this.arrive(wp);
      this.prev = [tx, tz];
      this.index++;
      return this.next(pc);
    }
    inp.yaw = Math.atan2(-dx, -dz);
    inp.right = wp.lean ?? 0;
    inp.crouch = this.crouching || !!wp.crouch;
    if (this.jumpTicks > 0) {
      inp.jump = true;
      this.jumpTicks--;
    }
    return inp;
  }

  private arrive(wp: Waypoint): void {
    switch (wp.act) {
      case 'jump':
      case 'wall':
        this.jumpTicks = 3;
        break;
      case 'slide':
        this.crouching = true;
        break;
      case 'stand':
        this.crouching = false;
        break;
    }
    if (wp.act === 'jump' || wp.act === 'wall') this.crouching = false;
    if (wp.wait) this.waitTicks = Math.round(wp.wait * 120);
  }
}
