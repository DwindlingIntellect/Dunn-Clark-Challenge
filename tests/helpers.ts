import { Vector3 } from 'three';
import { initPhysics, CollisionWorld } from '../src/sim/collision';
import { PlayerController } from '../src/sim/controller';
import { pieceColliders } from '../src/levels/colliders';
import type { Piece } from '../src/levels/types';
import type { PlayerInput } from '../src/sim/types';
import { MOVEMENT_DEFAULTS, type MovementConfig } from '../src/config/movement';
import { SIM_DT } from '../src/core/loop';

export const DT = SIM_DT;

export async function makeWorld(pieces: Piece[]): Promise<CollisionWorld> {
  await initPhysics();
  return new CollisionWorld(pieces.flatMap(pieceColliders));
}

export function freshConfig(): MovementConfig {
  return structuredClone(MOVEMENT_DEFAULTS);
}

export async function makePlayer(pieces: Piece[], start: [number, number, number], yaw = 0, cfg = freshConfig()) {
  const world = await makeWorld(pieces);
  const pc = new PlayerController(world, cfg);
  pc.reset(new Vector3(...start), yaw);
  return pc;
}

export function input(p: Partial<PlayerInput> = {}): PlayerInput {
  return { forward: 0, right: 0, jump: false, crouch: false, yaw: 0, pitch: 0, ...p };
}

/** Step `n` ticks with the same input; returns nothing. */
export function stepN(pc: PlayerController, inp: PlayerInput, n: number, each?: (i: number) => void): void {
  for (let i = 0; i < n; i++) {
    pc.step(inp, DT);
    each?.(i);
  }
}

/** A big flat floor with top at y = 0. */
export const FLOOR: Piece = { id: 'floor', type: 'block', pos: [0, -1, 0], size: [400, 1, 400] };
