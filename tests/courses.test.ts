import { describe, it, expect, beforeAll } from 'vitest';
import { Vector3 } from 'three';
import { initPhysics, CollisionWorld } from '../src/sim/collision';
import { measureCapabilities, reachAt, type Capabilities } from '../src/sim/capabilities';
import { movement } from '../src/config/movement';
import { COURSES } from '../src/levels/index';
import { testCourse } from '../src/levels/testCourse';
import { courseColliders, expandPieces } from '../src/levels/colliders';
import { checkLink } from '../src/levels/validate';
import type { CourseData, Vec3 } from '../src/levels/types';

const cfg = structuredClone(movement);
let caps: Capabilities;

beforeAll(async () => {
  await initPhysics();
  caps = measureCapabilities(cfg);
});

describe('movement capabilities', () => {
  it('are measured sensibly from movement.ts', () => {
    const runFlat = reachAt(caps.runJump, 0);
    const expected = cfg.ground.maxSpeed * (2 * cfg.jump.velocity) / cfg.air.gravity;
    expect(runFlat).toBeGreaterThan(expected * 0.95);
    expect(reachAt(caps.slideJump, 0)).toBeGreaterThan(runFlat);
    expect(reachAt(caps.wallRun, 0)).toBeGreaterThan(runFlat);
    expect(caps.climbHeight).toBeGreaterThan(caps.mantleHeight);
    expect(caps.mantleHeight).toBeGreaterThan(cfg.mantle.handHeight + cfg.mantle.reach);
  });
});

function groundBelow(world: CollisionWorld, p: Vec3, maxDrop: number): boolean {
  const hit = world.raycast(new Vector3(p[0], p[1] + 1, p[2]), new Vector3(0, -1, 0), maxDrop + 1);
  return !!hit && hit.normal.y > 0.6;
}

const ALL: CourseData[] = [...COURSES, testCourse];

describe.each(ALL.map((c) => [c.name, c] as const))('course %s', (_name, course) => {
  it('has a start, a finish bell and checkpoints standing on solid ground', () => {
    const world = new CollisionWorld(courseColliders(course));
    expect(groundBelow(world, course.start.pos, 1), 'start').toBe(true);
    expect(groundBelow(world, course.finish.pos, 1), 'finish').toBe(true);
    expect(course.checkpoints.length).toBeGreaterThan(0);
    course.checkpoints.forEach((cp, i) => {
      expect(groundBelow(world, cp.pos, 1), `checkpoint ${i}`).toBe(true);
      expect(cp.pos[1]).toBeGreaterThan(course.killY);
    });
    expect(course.start.pos[1]).toBeGreaterThan(course.killY);
    world.dispose();
  });

  it('has unique piece ids and sensible medal times', () => {
    const ids = expandPieces(course.pieces).map((p) => p.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    const m = course.medals;
    expect(m.gold).toBeLessThan(m.silver);
    expect(m.silver).toBeLessThan(m.bronze);
    expect(course.name.length).toBeGreaterThan(0);
    expect(course.flavor.length).toBeGreaterThan(0);
  });

  it('every jump link is makeable with a 15% margin, and no required gap exceeds the movement', () => {
    expect(course.jumpLinks.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const link of course.jumpLinks) {
      const r = checkLink(course, link, caps, cfg);
      if (!r.ok) failures.push(`${link.from} -> ${link.to}: ${r.detail}`);
    }
    expect(failures).toEqual([]);
  });

  if (course.id !== 'test') {
    it('has a risky shortcut on top of the safe route', () => {
      expect(course.jumpLinks.some((l) => l.route === 'shortcut')).toBe(true);
      expect(course.jumpLinks.some((l) => (l.route ?? 'safe') === 'safe')).toBe(true);
    });
  }
});
