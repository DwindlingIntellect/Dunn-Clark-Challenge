import type { ColliderDesc } from '../sim/colliderTypes';
import type { SurfaceKind } from '../sim/types';
import type { CourseData, Piece, PieceType, Vec3 } from './types';

/**
 * Pure (DOM-free) conversion from level pieces to collider descriptions.
 * Used by the game, the course validation tests and the headless smoke test.
 */

export const DEFAULT_SIZES: Record<PieceType, Vec3> = {
  block: [4, 1, 4],
  ramp: [4, 2, 6],
  stairs: [3, 2, 4],
  pillar: [1.2, 8, 1.2],
  walkway: [3, 0.5, 10],
  arch: [6, 8, 1],
  buttress: [1, 10, 8],
  rosewindow: [6, 6, 0.5],
  spire: [4, 30, 4],
  roof: [8, 3, 10],
  lantern: [0.5, 0.8, 0.5],
  candles: [0.6, 0.3, 0.6],
  windowwall: [10, 12, 1],
};

/** Pieces that collide by default (others need the 'solid' tag). */
const SOLID_BY_DEFAULT: Partial<Record<PieceType, boolean>> = {
  block: true,
  ramp: true,
  stairs: true,
  pillar: true,
  walkway: true,
  roof: true,
  windowwall: true,
  arch: true,
};

export const RAIL_HEIGHT = 1.0;
export const RAIL_THICKNESS = 0.25;

export function pieceSize(p: Piece): Vec3 {
  return p.size ?? DEFAULT_SIZES[p.type];
}

export function pieceYaw(p: Piece): number {
  return ((p.rot ?? 0) * Math.PI) / 180;
}

export function pieceSurface(p: Piece): SurfaceKind {
  const t = p.tags ?? [];
  if (t.includes('wood') || p.mat === 'wood') return 'wood';
  if (t.includes('iron') || p.mat === 'iron') return 'iron';
  if (p.mat === 'glass') return 'glass';
  return 'stone';
}

export function isCollidable(p: Piece): boolean {
  const t = p.tags ?? [];
  if (t.includes('deco')) return false;
  if (t.includes('solid') || t.includes('wallrun') || t.includes('mantle')) return true;
  return !!SOLID_BY_DEFAULT[p.type];
}

/** Rotate a local XZ offset by yaw (same convention as three.js rotation.y). */
export function rotateXZ(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

function box(p: Piece, local: Vec3, half: Vec3, yawOffset = 0, kind: 'box' | 'ramp' = 'box'): ColliderDesc {
  const yaw = pieceYaw(p);
  const [ox, oz] = rotateXZ(local[0], local[2], yaw);
  return {
    kind,
    center: [p.pos[0] + ox, p.pos[1] + local[1], p.pos[2] + oz],
    half,
    yaw: yaw + yawOffset,
    tags: [...(p.tags ?? [])],
    surface: pieceSurface(p),
    pieceId: p.id,
  };
}

export function pieceColliders(p: Piece): ColliderDesc[] {
  if (!isCollidable(p)) return [];
  const [w, h, d] = pieceSize(p);
  switch (p.type) {
    case 'ramp':
    case 'stairs':
      return [box(p, [0, h / 2, 0], [w / 2, h / 2, d / 2], 0, 'ramp')];
    case 'roof': {
      // Ridge along local Z at x = 0. Each half is a wedge rising toward the ridge.
      return [
        box(p, [-w / 4, h / 2, 0], [d / 2, h / 2, w / 4], -Math.PI / 2, 'ramp'),
        box(p, [w / 4, h / 2, 0], [d / 2, h / 2, w / 4], Math.PI / 2, 'ramp'),
      ];
    }
    case 'pillar':
      return [box(p, [0, h / 2, 0], [w * 0.45, h / 2, d * 0.45])];
    case 'arch': {
      // Two jambs and a lintel above the apex; the opening stays clear.
      const g = archGeometry(w, h);
      return [
        box(p, [-(w / 2 - g.jamb / 2), h / 2, 0], [g.jamb / 2, h / 2, d / 2]),
        box(p, [w / 2 - g.jamb / 2, h / 2, 0], [g.jamb / 2, h / 2, d / 2]),
        box(p, [0, (g.apex + h) / 2, 0], [g.opening / 2, (h - g.apex) / 2, d / 2]),
      ];
    }
    case 'walkway': {
      const out = [box(p, [0, h / 2, 0], [w / 2, h / 2, d / 2])];
      if (!(p.tags ?? []).includes('norails')) {
        const ry = h + RAIL_HEIGHT / 2;
        const rx = w / 2 - RAIL_THICKNESS / 2;
        const half: Vec3 = [RAIL_THICKNESS / 2, RAIL_HEIGHT / 2, d / 2];
        const tags = (p.tags ?? []).filter((t) => t !== 'wallrun' && t !== 'mantle');
        out.push({ ...box(p, [-rx, ry, 0], half), tags, pieceId: p.id ? `${p.id}:rail` : undefined });
        out.push({ ...box(p, [rx, ry, 0], half), tags, pieceId: p.id ? `${p.id}:rail` : undefined });
      }
      return out;
    }
    default:
      return [box(p, [0, h / 2, 0], [w / 2, h / 2, d / 2])];
  }
}

/** Expand `repeat` pieces into individual pieces. */
export function expandPieces(pieces: Piece[]): Piece[] {
  const out: Piece[] = [];
  for (const p of pieces) {
    if (!p.repeat) {
      out.push(p);
      continue;
    }
    const { count, step } = p.repeat;
    for (let i = 0; i < count; i++) {
      out.push({
        ...p,
        repeat: undefined,
        id: p.id ? `${p.id}.${i}` : undefined,
        pos: [p.pos[0] + step[0] * i, p.pos[1] + step[1] * i, p.pos[2] + step[2] * i],
      });
    }
  }
  return out;
}

/** Shared arch proportions (used by both the collider and the visual kit). */
export function archGeometry(w: number, h: number): { jamb: number; opening: number; apex: number; spring: number } {
  const jamb = Math.min(1.2, w * 0.15);
  const opening = w - 2 * jamb;
  const apex = h - Math.max(0.6, h * 0.1);
  const spring = Math.max(0.5, apex - opening * 0.95);
  return { jamb, opening, apex, spring };
}

export function courseColliders(course: CourseData): ColliderDesc[] {
  return expandPieces(course.pieces).flatMap(pieceColliders);
}

/** Look up a (possibly repeated) piece by id. */
export function findPiece(course: CourseData, id: string): Piece | undefined {
  return expandPieces(course.pieces).find((p) => p.id === id);
}

export interface AABB {
  min: Vec3;
  max: Vec3;
}

/** World-space axis-aligned bounds of a piece's main box. */
export function pieceAABB(p: Piece): AABB {
  const [w, h, d] = pieceSize(p);
  const yaw = pieceYaw(p);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [x, z] = rotateXZ((sx * w) / 2, (sz * d) / 2, yaw);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  return {
    min: [p.pos[0] + minX, p.pos[1], p.pos[2] + minZ],
    max: [p.pos[0] + maxX, p.pos[1] + h, p.pos[2] + maxZ],
  };
}
