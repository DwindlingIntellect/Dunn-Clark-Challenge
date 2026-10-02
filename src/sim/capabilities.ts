import { Vector3 } from 'three';
import type { MovementConfig } from '../config/movement';
import { CollisionWorld } from './collision';
import { PlayerController } from './controller';
import { pieceColliders } from '../levels/colliders';
import type { MoveType, Piece } from '../levels/types';
import type { PlayerInput } from './types';

/**
 * What the movement kit can physically do with a given config, measured by
 * running the real controller in small synthetic worlds. Used by the course
 * validation tests (and handy for level design).
 *
 * Every envelope is a list of (x, y) points the player's feet reached,
 * where x is horizontal distance from the take-off edge and y the height
 * relative to the take-off surface.
 *
 * `initPhysics()` must have resolved before calling these.
 */
export interface Envelope {
  points: [number, number][];
}

const DT = 1 / 120;

function inp(p: Partial<PlayerInput>): PlayerInput {
  return { forward: 0, right: 0, jump: false, crouch: false, yaw: 0, pitch: 0, ...p };
}

function world(pieces: Piece[]): CollisionWorld {
  return new CollisionWorld(pieces.flatMap(pieceColliders));
}

/** Runway whose edge is at z = 0, top at y = 0, running toward -Z. Pit far below. */
const RUNWAY: Piece = { type: 'block', pos: [0, -1, 30], size: [8, 1, 60] };

function record(pc: PlayerController, step: (t: number) => PlayerInput, maxTicks = 600): [number, number][] {
  const pts: [number, number][] = [];
  for (let t = 0; t < maxTicks; t++) {
    pc.step(step(t), DT);
    pts.push([-pc.pos.z, pc.pos.y]);
    if (pc.pos.y < -25) break;
  }
  return pts;
}

/** Jump at the runway edge at full run speed (optionally out of a slide). */
function jumpEnvelope(cfg: MovementConfig, slide: boolean): Envelope {
  const w = world([RUNWAY]);
  const pc = new PlayerController(w, cfg);
  pc.reset(new Vector3(0, 0, 40), 0);
  let jumped = false;
  let t = 0;
  // Approach.
  while (!jumped && t < 2000) {
    const crouch = slide && pc.pos.z < 3;
    const jump = pc.pos.z <= 0.05;
    pc.step(inp({ forward: 1, crouch, jump }), DT);
    if (jump) jumped = true;
    t++;
  }
  const pts = record(pc, () => inp({ forward: 1 }));
  w.dispose();
  return { points: pts.filter(([x]) => x >= 0) };
}

/** Walk off the edge at full speed without jumping. */
function dropEnvelope(cfg: MovementConfig): Envelope {
  const w = world([RUNWAY]);
  const pc = new PlayerController(w, cfg);
  pc.reset(new Vector3(0, 0, 40), 0);
  const pts = record(pc, () => inp({ forward: 1 }), 2000);
  w.dispose();
  return { points: pts.filter(([x]) => x >= 0) };
}

/**
 * Run along a wall-runnable wall from the runway edge, wall-jump after
 * `jumpAfter` seconds (or never), keep holding forward.
 */
function wallRunEnvelope(cfg: MovementConfig): Envelope {
  const all: [number, number][] = [];
  const wall: Piece = { type: 'block', pos: [-2.0, -40, -40], size: [1, 50, 100], tags: ['wallrun'] };
  const T = cfg.wallRun.duration;
  for (let jt = 0.1; jt <= T + 0.2; jt += 0.1) {
    const w = world([RUNWAY, wall]);
    const pc = new PlayerController(w, cfg);
    pc.reset(new Vector3(-1.0, 0, 20), 0);
    let wallTime = -1;
    for (let t = 0; t < 1200; t++) {
      const jump = (pc.pos.z <= 0.05 && pc.grounded) || (wallTime >= 0 && wallTime >= jt && pc.mode === 'wallrun');
      pc.step(inp({ forward: 1, right: pc.mode === 'air' && wallTime < 0 ? -0.4 : 0, jump }), DT);
      if (pc.mode === 'wallrun') wallTime = wallTime < 0 ? 0 : wallTime + DT;
      if (pc.pos.z < 0) all.push([-pc.pos.z, pc.pos.y]);
      if (pc.pos.y < -25) break;
    }
    w.dispose();
  }
  return { points: all };
}

/** Highest ledge (above the floor) that can be reached by jump + cling + climb + mantle. */
function maxClimbHeight(cfg: MovementConfig, allowCling: boolean): number {
  const can = (H: number) => {
    const floor: Piece = { type: 'block', pos: [0, -1, 0], size: [20, 1, 20] };
    const wall: Piece = { type: 'block', pos: [0, 0, -6], size: [10, H, 10] };
    const w = world([floor, wall]);
    const pc = new PlayerController(w, cfg);
    pc.reset(new Vector3(0, 0, -0.2), 0);
    let ok = false;
    for (let t = 0; t < 600; t++) {
      pc.step(inp({ forward: 1, jump: t < 2 }), DT);
      if (!allowCling && pc.mode === 'cling') break;
      if (pc.grounded && pc.pos.y > H - 0.1) {
        ok = true;
        break;
      }
    }
    w.dispose();
    return ok;
  };
  let lo = 0.5;
  let hi = 12;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (can(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface Capabilities {
  runJump: Envelope;
  slideJump: Envelope;
  drop: Envelope;
  wallRun: Envelope;
  /** Max ledge height (above take-off) reachable by jump + mantle without clinging. */
  mantleHeight: number;
  /** Max ledge height reachable with jump + cling/climb + mantle. */
  climbHeight: number;
}

export function measureCapabilities(cfg: MovementConfig): Capabilities {
  return {
    runJump: jumpEnvelope(cfg, false),
    slideJump: jumpEnvelope(cfg, true),
    drop: dropEnvelope(cfg),
    wallRun: wallRunEnvelope(cfg),
    mantleHeight: maxClimbHeight(cfg, false),
    climbHeight: maxClimbHeight(cfg, true),
  };
}

/** Furthest horizontal distance at which the feet are still at or above `dy`. */
export function reachAt(env: Envelope, dy: number): number {
  let best = -Infinity;
  for (const [x, y] of env.points) if (y >= dy && x > best) best = x;
  return best;
}

/** Highest point of an envelope. */
export function apex(env: Envelope): number {
  return env.points.reduce((m, [, y]) => Math.max(m, y), -Infinity);
}

export function envelopeFor(c: Capabilities, move: MoveType): Envelope {
  switch (move) {
    case 'slide-jump':
      return c.slideJump;
    case 'drop':
      return c.drop;
    case 'wallrun':
      return c.wallRun;
    default:
      return c.runJump;
  }
}
