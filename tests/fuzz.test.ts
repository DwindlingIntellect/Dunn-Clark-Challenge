import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { initPhysics, CollisionWorld } from '../src/sim/collision';
import { PlayerController } from '../src/sim/controller';
import { courseColliders } from '../src/levels/colliders';
import { RunState } from '../src/game/runState';
import { allCourses } from '../src/levels/index';
import { MOVEMENT_DEFAULTS } from '../src/config/movement';
import { DT } from './helpers';

/** Deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Mash random inputs on every course (including respawns) and check the
 * controller never produces NaNs or ends a tick embedded in geometry.
 */
describe.each(allCourses().map((c) => [c.name, c] as const))('fuzz %s', (_n, course) => {
  it('stays finite and never ends a tick inside geometry', async () => {
    await initPhysics();
    const world = new CollisionWorld(courseColliders(course));
    for (const seed of [1, 2, 3]) {
      const rand = rng(seed * 7919 + course.id.length);
      const pc = new PlayerController(world, structuredClone(MOVEMENT_DEFAULTS));
      const run = new RunState(course, pc);
      run.reset();
      let inp = { forward: 1, right: 0, jump: false, crouch: false, yaw: (course.start.yaw * Math.PI) / 180, pitch: 0 };
      for (let t = 0; t < 120 * 15; t++) {
        if (t % 15 === 0) {
          inp = {
            forward: rand() < 0.8 ? 1 : rand() < 0.5 ? 0 : -1,
            right: rand() < 0.6 ? 0 : rand() < 0.5 ? 1 : -1,
            jump: rand() < 0.3,
            crouch: rand() < 0.2,
            yaw: inp.yaw + (rand() - 0.5) * 1.2,
            pitch: 0,
          };
        }
        run.step(inp, DT);
        const p = pc.pos;
        expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), `NaN at tick ${t}`).toBe(true);
        expect(Number.isFinite(pc.vel.length())).toBe(true);
        if (pc.mode !== 'mantle') {
          const inside = world.overlapCapsule(new Vector3(p.x, p.y + 0.04, p.z), pc.height - 0.08, pc.radius - 0.04);
          expect(inside, `inside geometry at tick ${t} pos ${p.toArray().map((v) => v.toFixed(2))} mode ${pc.mode}`).toBe(false);
        }
        if (run.finished) break;
      }
    }
    world.dispose();
  });
});
