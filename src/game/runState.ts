import { Vector3 } from 'three';
import { SIM_DT } from '../core/loop';
import type { PlayerController } from '../sim/controller';
import type { PlayerInput } from '../sim/types';
import type { CourseData } from '../levels/types';

/**
 * Rules of a single timed run, independent of rendering so it can run
 * headlessly: the timer starts on the first movement input, lanterns are
 * checkpoints, falling below the kill height respawns at the last lantern
 * (timer keeps running), and touching the bell finishes the run.
 */
export type RunEvent =
  | { type: 'start' }
  | { type: 'checkpoint'; index: number }
  | { type: 'respawn' }
  | { type: 'finish'; time: number };

/** Lantern trigger: horizontal radius and vertical span above the lantern base. */
export const CHECKPOINT_RADIUS = 1.8;
/** Bell trigger radius around the bell's floor position. */
export const FINISH_RADIUS = 2.8;

export class RunState {
  ticks = 0;
  started = false;
  finished = false;
  /** The debug menu was opened during this run: never saves a best time. */
  debug = false;
  activated: boolean[];
  lastCheckpoint = -1;
  readonly events: RunEvent[] = [];
  respawns = 0;

  constructor(public course: CourseData, public player: PlayerController) {
    this.activated = course.checkpoints.map(() => false);
  }

  get time(): number {
    return this.ticks * SIM_DT;
  }

  /** Restart the whole course: timer reset, player at the start. */
  reset(): void {
    this.ticks = 0;
    this.started = false;
    this.finished = false;
    this.debug = false;
    this.respawns = 0;
    this.activated = this.course.checkpoints.map(() => false);
    this.lastCheckpoint = -1;
    this.events.length = 0;
    const s = this.course.start;
    this.player.reset(new Vector3(...s.pos), (s.yaw * Math.PI) / 180);
  }

  /** Where the player respawns now (position and yaw in degrees). */
  respawnPoint(): { pos: [number, number, number]; yaw: number } {
    return this.lastCheckpoint >= 0 ? this.course.checkpoints[this.lastCheckpoint] : this.course.start;
  }

  step(input: PlayerInput, dt: number): void {
    this.events.length = 0;
    if (this.finished) return;
    if (!this.started && (input.forward !== 0 || input.right !== 0 || input.jump || input.crouch)) {
      this.started = true;
      this.events.push({ type: 'start' });
    }
    this.player.step(input, dt);
    if (this.started) this.ticks++;

    const p = this.player.pos;
    this.course.checkpoints.forEach((cp, i) => {
      if (this.activated[i]) return;
      const dx = p.x - cp.pos[0];
      const dz = p.z - cp.pos[2];
      const dy = p.y - cp.pos[1];
      if (dx * dx + dz * dz < CHECKPOINT_RADIUS * CHECKPOINT_RADIUS && dy > -1 && dy < 3) {
        this.activated[i] = true;
        this.lastCheckpoint = i;
        this.events.push({ type: 'checkpoint', index: i });
      }
    });

    if (p.y < this.course.killY) {
      const r = this.respawnPoint();
      this.player.reset(new Vector3(...r.pos), (r.yaw * Math.PI) / 180);
      this.respawns++;
      this.events.push({ type: 'respawn' });
      return;
    }

    const f = this.course.finish.pos;
    const fx = p.x - f[0];
    const fz = p.z - f[2];
    const fy = p.y - f[1];
    if (fx * fx + fz * fz < FINISH_RADIUS * FINISH_RADIUS && fy > -1 && fy < 4.5) {
      this.finished = true;
      this.events.push({ type: 'finish', time: this.time });
    }
  }
}
