import { describe, it, expect } from 'vitest';
import { FLOOR, DT, makePlayer, input, stepN, freshConfig } from './helpers';
import type { Piece } from '../src/levels/types';

const cfg = freshConfig();
const sec = (s: number) => Math.round(s / DT);

describe('ground movement', () => {
  it('reaches max run speed and no more', async () => {
    const pc = await makePlayer([FLOOR], [0, 0, 0]);
    stepN(pc, input({ forward: 1 }), sec(1));
    expect(pc.mode).toBe('ground');
    expect(pc.horizontalSpeed).toBeCloseTo(cfg.ground.maxSpeed, 3);
    // 0 -> 10 m/s at 60 m/s² takes ~0.17 s: snappy.
    const pc2 = await makePlayer([FLOOR], [0, 0, 0]);
    stepN(pc2, input({ forward: 1 }), sec(0.2));
    expect(pc2.horizontalSpeed).toBeCloseTo(cfg.ground.maxSpeed, 3);
  });

  it('decelerates to a stop without input', async () => {
    const pc = await makePlayer([FLOOR], [0, 0, 0]);
    stepN(pc, input({ forward: 1 }), sec(0.5));
    stepN(pc, input(), sec(0.3));
    expect(pc.horizontalSpeed).toBeLessThan(0.01);
  });
});

describe('jump', () => {
  it('reaches the configured jump height (v²/2g)', async () => {
    const pc = await makePlayer([FLOOR], [0, 0, 0]);
    stepN(pc, input(), 5);
    let maxY = 0;
    stepN(pc, input({ jump: true }), sec(1), () => (maxY = Math.max(maxY, pc.pos.y)));
    const expected = cfg.jump.velocity ** 2 / (2 * cfg.air.gravity);
    expect(maxY).toBeGreaterThan(expected * 0.98);
    expect(maxY).toBeLessThan(expected * 1.02);
    expect(pc.grounded).toBe(true);
  });

  it('covers the expected distance on a running jump', async () => {
    const pc = await makePlayer([FLOOR], [0, 0, 100]);
    stepN(pc, input({ forward: 1 }), sec(0.6));
    const z0 = pc.pos.z;
    pc.step(input({ forward: 1, jump: true }), DT);
    let ticks = 1;
    while (!pc.grounded && ticks < 500) {
      pc.step(input({ forward: 1, jump: true }), DT);
      ticks++;
    }
    const dist = z0 - pc.pos.z;
    const airTime = (2 * cfg.jump.velocity) / cfg.air.gravity;
    const expected = cfg.ground.maxSpeed * airTime;
    expect(dist).toBeGreaterThan(expected * 0.97);
    expect(dist).toBeLessThan(expected * 1.05);
  });

  it('allows a coyote-time jump shortly after leaving a ledge', async () => {
    const ledge: Piece = { type: 'block', pos: [0, -1, 0], size: [10, 1, 10] };
    const pc = await makePlayer([ledge], [0, 0, 0]);
    // Run toward -Z until we leave the ledge.
    let t = 0;
    while (pc.grounded && t < 500) {
      pc.step(input({ forward: 1 }), DT);
      t++;
    }
    expect(pc.mode).toBe('air');
    stepN(pc, input({ forward: 1 }), sec(cfg.jump.coyoteTime * 0.6));
    pc.step(input({ forward: 1, jump: true }), DT);
    expect(pc.vel.y).toBeGreaterThan(cfg.jump.velocity * 0.9);
  });

  it('rejects a jump after coyote time has expired', async () => {
    const ledge: Piece = { type: 'block', pos: [0, -1, 0], size: [10, 1, 10] };
    const pc = await makePlayer([ledge], [0, 0, 0]);
    let t = 0;
    while (pc.grounded && t < 500) {
      pc.step(input({ forward: 1 }), DT);
      t++;
    }
    stepN(pc, input({ forward: 1 }), sec(cfg.jump.coyoteTime + 0.05));
    pc.step(input({ forward: 1, jump: true }), DT);
    expect(pc.vel.y).toBeLessThan(0);
  });

  it('buffers a jump pressed shortly before landing', async () => {
    const pc = await makePlayer([FLOOR], [0, 3, 0]);
    // Fall until we are about to land (~0.07 s before touching the floor).
    while (pc.pos.y > 0.6) pc.step(input(), DT);
    pc.step(input({ jump: true }), DT);
    let jumped = false;
    stepN(pc, input({ jump: true }), sec(0.2), () => {
      if (pc.vel.y > cfg.jump.velocity * 0.8) jumped = true;
    });
    expect(jumped).toBe(true);
  });

  it('does not buffer a jump pressed too early', async () => {
    const pc = await makePlayer([FLOOR], [0, 6, 0]);
    // Press (and hold) jump ~0.3 s before landing; holding must not re-trigger.
    while (pc.pos.y > 3.2) pc.step(input(), DT);
    let jumped = false;
    stepN(pc, input({ jump: true }), sec(0.8), () => {
      if (pc.vel.y > 1) jumped = true;
    });
    expect(jumped).toBe(false);
    expect(pc.grounded).toBe(true);
  });
});

describe('slide', () => {
  it('starts with a boost, keeps momentum with low friction, and jumping keeps speed', async () => {
    const pc = await makePlayer([FLOOR], [0, 0, 150]);
    stepN(pc, input({ forward: 1 }), sec(0.5));
    pc.step(input({ forward: 1, crouch: true }), DT);
    expect(pc.mode).toBe('slide');
    const boosted = pc.horizontalSpeed;
    expect(boosted).toBeGreaterThan(cfg.ground.maxSpeed + cfg.slide.entryBoost - 0.1);
    stepN(pc, input({ forward: 1, crouch: true }), sec(1));
    expect(pc.mode).toBe('slide');
    expect(pc.horizontalSpeed).toBeCloseTo(boosted - cfg.slide.friction * 1, 1);
    const before = pc.horizontalSpeed;
    pc.step(input({ forward: 1, crouch: true, jump: true }), DT);
    expect(pc.mode).toBe('air');
    expect(pc.horizontalSpeed).toBeGreaterThan(before - 0.05);
    expect(pc.vel.y).toBeGreaterThan(cfg.jump.velocity * 0.9);
  });

  it('requires minimum speed to start', async () => {
    const pc = await makePlayer([FLOOR], [0, 0, 0]);
    stepN(pc, input({ forward: 1 }), 3); // still slow
    pc.step(input({ forward: 1, crouch: true }), DT);
    expect(pc.mode).toBe('ground');
    expect(pc.crouched).toBe(true);
  });

  it('ends when released or when too slow', async () => {
    const pc = await makePlayer([FLOOR], [0, 0, 150]);
    stepN(pc, input({ forward: 1 }), sec(0.5));
    stepN(pc, input({ crouch: true }), sec(0.2));
    expect(pc.mode).toBe('slide');
    pc.step(input({ crouch: false }), DT);
    expect(pc.mode).toBe('ground');
    // Too slow: long slide with no input decays below endSpeed.
    const pc2 = await makePlayer([FLOOR], [0, 0, 150]);
    stepN(pc2, input({ forward: 1 }), sec(0.5));
    let ended = false;
    stepN(pc2, input({ crouch: true }), sec(6), () => {
      if (pc2.mode !== 'slide') ended = true;
    });
    expect(ended).toBe(true);
  });

  it('accelerates down slopes', async () => {
    // Long ramp descending toward -Z: rises toward +Z, so rot 180.
    const ramp: Piece = { type: 'ramp', pos: [0, 0, -15], size: [6, 6, 20], rot: 180 };
    const top: Piece = { type: 'block', pos: [0, 5, 0], size: [6, 1, 10] };
    const pc = await makePlayer([ramp, top, FLOOR], [0, 6, 4]);
    stepN(pc, input({ forward: 1 }), sec(0.6));
    // Start sliding on the slope.
    while (pc.pos.z > -8) pc.step(input({ forward: 1, crouch: true }), DT);
    expect(pc.mode).toBe('slide');
    expect(pc.speed).toBeGreaterThan(cfg.ground.maxSpeed + cfg.slide.entryBoost);
  });
});

/** Long wall-runnable wall on the player's left (x = -1.5), running along Z. */
const RUN_WALL: Piece = { id: 'wall', type: 'block', pos: [-2, -30, -20], size: [1, 38, 60], tags: ['wallrun'] };
/** Short starting platform beside the wall; below it is a 30 m drop. */
const RUNWAY: Piece = { id: 'runway', type: 'block', pos: [1, -1, 6], size: [5, 1, 10] };
const PIT_FLOOR: Piece = { type: 'block', pos: [0, -31, 0], size: [400, 1, 400] };

async function startWallRun() {
  const pc = await makePlayer([RUNWAY, PIT_FLOOR, RUN_WALL], [-1.0, 0, 9]);
  stepN(pc, input({ forward: 1 }), sec(0.4));
  pc.step(input({ forward: 1, jump: true }), DT);
  let t = 0;
  while (pc.mode !== 'wallrun' && t < 120) {
    pc.step(input({ forward: 1, right: -0.3 }), DT);
    t++;
  }
  return pc;
}

describe('wall run', () => {
  it('starts on tagged walls and lasts the configured duration', async () => {
    const pc = await startWallRun();
    expect(pc.mode).toBe('wallrun');
    let ticks = 0;
    while (pc.mode === 'wallrun' && ticks < 1000) {
      pc.step(input({ forward: 1 }), DT);
      ticks++;
    }
    expect(ticks * DT).toBeGreaterThan(cfg.wallRun.duration - 2 * DT);
    expect(ticks * DT).toBeLessThan(cfg.wallRun.duration + 2 * DT);
  });

  it('does not start on untagged walls', async () => {
    const plain: Piece = { ...RUN_WALL, tags: [] };
    const pc = await makePlayer([RUNWAY, PIT_FLOOR, plain], [-1.0, 0, 9]);
    stepN(pc, input({ forward: 1 }), sec(0.4));
    pc.step(input({ forward: 1, jump: true }), DT);
    let ran = false;
    stepN(pc, input({ forward: 1, right: -0.3 }), sec(0.6), () => {
      if (pc.mode === 'wallrun') ran = true;
    });
    expect(ran).toBe(false);
  });

  it('wall-jumps away from the wall and upward', async () => {
    const pc = await startWallRun();
    stepN(pc, input({ forward: 1 }), sec(0.3));
    expect(pc.mode).toBe('wallrun');
    const n = pc.wallNormal.clone();
    expect(n.x).toBeGreaterThan(0.99); // wall is on the left, normal points +X
    pc.step(input({ forward: 1, jump: true }), DT);
    expect(pc.mode).toBe('air');
    const away = pc.vel.x * n.x + pc.vel.z * n.z;
    expect(away).toBeGreaterThan(cfg.wallRun.jumpAway * 0.95);
    expect(pc.vel.y).toBeGreaterThan(cfg.wallRun.jumpUp - cfg.air.gravity * DT * 1.5);
    // Still moving forward along the wall.
    expect(pc.vel.z).toBeLessThan(-5);
  });

  it('cannot immediately re-run the same wall', async () => {
    const pc = await startWallRun();
    stepN(pc, input({ forward: 1 }), sec(0.2));
    pc.step(input({ forward: 1, jump: true }), DT);
    // Steer straight back into the wall.
    let reran = false;
    stepN(pc, input({ forward: 1, right: -1 }), sec(cfg.wallRun.sameWallCooldown * 0.8), () => {
      if (pc.mode === 'wallrun') reran = true;
    });
    expect(reran).toBe(false);
  });
});

describe('cling and climb', () => {
  it('clings to a wall and climbs at the configured speed', async () => {
    const wall: Piece = { type: 'block', pos: [0, 0, -3], size: [10, 12, 2] };
    const pc = await makePlayer([FLOOR, wall], [0, 0, 0]);
    stepN(pc, input({ forward: 1 }), sec(0.05));
    pc.step(input({ forward: 1, jump: true }), DT);
    let t = 0;
    while (pc.mode !== 'cling' && t < 120) {
      pc.step(input({ forward: 1 }), DT);
      t++;
    }
    expect(pc.mode).toBe('cling');
    const y0 = pc.pos.y;
    stepN(pc, input({ forward: 1 }), sec(cfg.cling.climbDuration));
    const climbed = pc.pos.y - y0;
    expect(climbed).toBeGreaterThan(cfg.cling.climbSpeed * cfg.cling.climbDuration * 0.9);
    expect(climbed).toBeLessThan(cfg.cling.climbSpeed * cfg.cling.climbDuration * 1.1);
    // Then hangs until the cling expires.
    let clingTicks = 0;
    while (pc.mode === 'cling' && clingTicks < 500) {
      pc.step(input({ forward: 1 }), DT);
      clingTicks++;
    }
    expect((clingTicks + sec(cfg.cling.climbDuration)) * DT).toBeLessThan(cfg.cling.duration + 0.05);
    expect(pc.mode).toBe('air');
  });
});

describe('mantle', () => {
  async function tryMantle(height: number, jump: boolean) {
    const box: Piece = { type: 'block', pos: [0, 0, -12], size: [10, height, 20] };
    const pc = await makePlayer([FLOOR, box], [0, 0, 0]);
    let mantled = false;
    stepN(pc, input({ forward: 1 }), sec(0.05));
    stepN(pc, input({ forward: 1, jump }), sec(1.0), () => {
      if (pc.mode === 'mantle') mantled = true;
    });
    stepN(pc, input(), sec(0.5));
    return { pc, mantled, top: height };
  }

  it('mantles a ledge within reach of the hands from standing', async () => {
    const reachTop = cfg.mantle.handHeight + cfg.mantle.reach;
    const { pc, mantled, top } = await tryMantle(reachTop - 0.2, false);
    expect(mantled).toBe(true);
    expect(pc.pos.y).toBeCloseTo(top, 1);
    expect(pc.grounded).toBe(true);
  });

  it('does not mantle a ledge out of reach from standing', async () => {
    const reachTop = cfg.mantle.handHeight + cfg.mantle.reach;
    const { mantled } = await tryMantle(reachTop + 0.3, false);
    expect(mantled).toBe(false);
  });

  it('mantles higher ledges at the top of a jump', async () => {
    const { pc, mantled, top } = await tryMantle(3.6, true);
    expect(mantled).toBe(true);
    expect(pc.pos.y).toBeCloseTo(top, 1);
  });

  it('completes in about the configured duration', async () => {
    const box: Piece = { type: 'block', pos: [0, 0, -12], size: [10, 2, 20] };
    const pc = await makePlayer([FLOOR, box], [0, 0, 0]);
    let start = -1;
    let end = -1;
    for (let i = 0; i < 300; i++) {
      pc.step(input({ forward: 1 }), DT);
      if (pc.mode === 'mantle' && start < 0) start = i;
      if (start >= 0 && pc.mode !== 'mantle' && end < 0) end = i;
    }
    expect(start).toBeGreaterThanOrEqual(0);
    expect((end - start) * DT).toBeCloseTo(cfg.mantle.duration, 1);
  });
});

describe('collision robustness', () => {
  it('never tunnels through a thin wall at extreme speed', async () => {
    const thin: Piece = { type: 'block', pos: [0, 0, -10], size: [20, 6, 0.05] };
    for (const mode of ['air', 'ground'] as const) {
      const pc = await makePlayer([FLOOR, thin], [0, mode === 'air' ? 1 : 0, 0]);
      pc.vel.set(0, 0, -120);
      if (mode === 'air') pc.mode = 'air';
      stepN(pc, input({ forward: 1 }), sec(1), () => {
        expect(pc.pos.z).toBeGreaterThan(-10 + 0.025 + cfg.body.radius - 0.01);
      });
    }
  });

  it('never tunnels through a thin floor when falling at terminal velocity', async () => {
    const thinFloor: Piece = { type: 'block', pos: [0, -0.05, 0], size: [20, 0.05, 20] };
    const pc = await makePlayer([thinFloor], [0, 200, 0]);
    pc.vel.set(0, -cfg.air.terminalVelocity, 0);
    stepN(pc, input(), sec(5), () => expect(pc.pos.y).toBeGreaterThan(-0.01));
    expect(pc.grounded).toBe(true);
  });

  it('walks up stairs/ramps and small steps', async () => {
    const step: Piece = { type: 'block', pos: [0, 0, -12], size: [6, 0.3, 20] };
    const pc = await makePlayer([FLOOR, step], [0, 0, 0]);
    stepN(pc, input({ forward: 1 }), sec(0.8));
    expect(pc.pos.z).toBeLessThan(-3);
    expect(pc.pos.y).toBeGreaterThan(0.25);
  });

  it('is deterministic', async () => {
    const run = async () => {
      const pc = await makePlayer([FLOOR, RUN_WALL], [-1.0, 0, 9]);
      for (let i = 0; i < 600; i++) {
        pc.step(input({ forward: 1, right: Math.sin(i * 0.05) * 0.5, jump: i % 70 < 3, crouch: i % 130 > 100, yaw: Math.sin(i * 0.01) * 0.3 }), DT);
      }
      return pc.pos.toArray().concat(pc.vel.toArray());
    };
    expect(await run()).toEqual(await run());
  });
});
