import { Vector3 } from 'three';
import type { MovementConfig } from '../config/movement';
import { findPiece, pieceAABB } from '../levels/colliders';
import type { CourseData, JumpLink } from '../levels/types';
import { checkLink, surfaceHeight, type LinkCheck } from '../levels/validate';
import { envelopeFor, type Capabilities } from '../sim/capabilities';

/**
 * Jump-link overlay data: where each link starts and ends (the closest
 * points of the two pieces' footprints, at their surface heights), whether
 * it passes validation, and the jump arc the move can actually make.
 */
export interface LinkView {
  link: JumpLink;
  index: number;
  check: LinkCheck;
  a: Vector3;
  b: Vector3;
}

export function evaluateLinks(c: CourseData, caps: Capabilities, cfg: MovementConfig): LinkView[] {
  return c.jumpLinks.map((link, index) => {
    const check = checkLink(c, link, caps, cfg);
    const from = findPiece(c, link.from);
    const to = findPiece(c, link.to);
    const a = new Vector3();
    const b = new Vector3();
    if (from && to) {
      const fa = pieceAABB(from);
      const ta = pieceAABB(to);
      // Closest points between the two footprints.
      const ax = clamp((ta.min[0] + ta.max[0]) / 2, fa.min[0], fa.max[0]);
      const az = clamp((ta.min[2] + ta.max[2]) / 2, fa.min[2], fa.max[2]);
      const bx = clamp(ax, ta.min[0], ta.max[0]);
      const bz = clamp(az, ta.min[2], ta.max[2]);
      a.set(clamp(bx, fa.min[0], fa.max[0]), surfaceHeight(from, 'from', link.move), clamp(bz, fa.min[2], fa.max[2]));
      b.set(bx, surfaceHeight(to, 'to', link.move), bz);
    }
    return { link, index, check, a, b };
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Points of the jump this move can make, laid out from the take-off point
 * toward the landing. Mantle/climb links get a vertical bar showing the
 * highest reachable ledge instead.
 */
export function linkArc(v: LinkView, caps: Capabilities): Vector3[] {
  const { a, b, link } = v;
  if (link.move === 'mantle' || link.move === 'climb') {
    const h = link.move === 'mantle' ? caps.mantleHeight : caps.climbHeight;
    return [b.clone().setY(a.y), b.clone().setY(a.y + h)];
  }
  const dir = new Vector3(b.x - a.x, 0, b.z - a.z);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
  dir.normalize();
  const env = envelopeFor(caps, link.move);
  const maxX = Math.max(4, v.check.gap * 1.6);
  const pts: Vector3[] = [];
  let lastX = -1;
  for (const [x, y] of env.points) {
    if (x > maxX || y < Math.min(0, b.y - a.y) - 2) break;
    if (x - lastX < 0.15) continue;
    lastX = x;
    pts.push(new Vector3(a.x + dir.x * x, a.y + y, a.z + dir.z * x));
  }
  return pts;
}
