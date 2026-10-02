import { describe, it, expect } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';

describe('rapier in node', () => {
  it('initialises and answers a shape cast', async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    world.createCollider(RAPIER.ColliderDesc.cuboid(5, 0.5, 5).setTranslation(0, -0.5, 0));
    world.step();
    const hit = world.castShape({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 },
      new RAPIER.Capsule(0.55, 0.35), 0, 10, true);
    expect(hit).not.toBeNull();
    expect(hit!.time_of_impact).toBeCloseTo(1.1, 2);
  });
});
