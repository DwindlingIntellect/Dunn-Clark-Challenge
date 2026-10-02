import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { movementToCode, movementToLiteral } from '../src/debug/movementCode';
import { MOVEMENT_DEFAULTS, assignMovement } from '../src/config/movement';

const source = readFileSync(new URL('../src/config/movement.ts', import.meta.url), 'utf8');

describe('copy config as code', () => {
  it('reproduces movement.ts exactly for the default values', () => {
    expect(movementToCode(source, structuredClone(MOVEMENT_DEFAULTS))).toBe(source);
  });

  it('writes changed values and keeps comments', () => {
    const cfg = structuredClone(MOVEMENT_DEFAULTS);
    cfg.ground.maxSpeed = 11.5;
    cfg.camera.headBob = false;
    const code = movementToCode(source, cfg);
    expect(code).toContain('    maxSpeed: 11.5,');
    expect(code).toContain('    headBob: false,');
    expect(code).toContain('/** Top running speed. */');
  });

  it('literal output round-trips through assignMovement', () => {
    const cfg = structuredClone(MOVEMENT_DEFAULTS);
    cfg.air.gravity = 27;
    const lit = movementToLiteral(cfg).replace('export const movement = ', 'return ');
    const parsed = new Function(lit)();
    const fresh = structuredClone(MOVEMENT_DEFAULTS);
    assignMovement(fresh, parsed);
    expect(fresh).toEqual(cfg);
  });
});
