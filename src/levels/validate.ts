import type { MovementConfig } from '../config/movement';
import { apex, envelopeFor, reachAt, type Capabilities } from '../sim/capabilities';
import { findPiece, pieceAABB, type AABB } from './colliders';
import type { CourseData, JumpLink } from './types';

/** Safety margin every intended jump must clear. */
export const LINK_MARGIN = 1.15;

/** Horizontal (XZ) distance between two boxes' footprints; 0 when they overlap. */
export function footprintGap(a: AABB, b: AABB): number {
  const dx = Math.max(0, a.min[0] - b.max[0], b.min[0] - a.max[0]);
  const dz = Math.max(0, a.min[2] - b.max[2], b.min[2] - a.max[2]);
  return Math.hypot(dx, dz);
}

export interface LinkCheck {
  ok: boolean;
  gap: number;
  dy: number;
  /** What the move can do at this height difference. */
  available: number;
  /** What the link needs, including the margin. */
  required: number;
  detail: string;
}

export function checkLink(course: CourseData, link: JumpLink, caps: Capabilities, cfg: MovementConfig): LinkCheck {
  const from = findPiece(course, link.from);
  const to = findPiece(course, link.to);
  if (!from || !to) {
    return { ok: false, gap: NaN, dy: NaN, available: 0, required: 0, detail: `missing piece ${!from ? link.from : link.to}` };
  }
  const a = pieceAABB(from);
  const b = pieceAABB(to);
  const gap = footprintGap(a, b);
  const dy = b.max[1] - a.max[1];
  const dyReq = dy > 0 ? dy * LINK_MARGIN : dy;
  const gapReq = gap * LINK_MARGIN;

  switch (link.move) {
    case 'mantle':
    case 'climb': {
      const maxH = link.move === 'mantle' ? caps.mantleHeight : caps.climbHeight;
      // Must be able to get to the wall (a running jump at the height the hands need).
      const handsNeed = dyReq - cfg.mantle.handHeight - cfg.mantle.reach;
      const approach = gap < 0.05 ? Infinity : reachAt(caps.runJump, Math.min(handsNeed, apex(caps.runJump) - 0.05));
      const ok = dyReq <= maxH && gapReq <= approach;
      return {
        ok, gap, dy, available: maxH, required: dyReq,
        detail: `${link.move}: needs rise ${dyReq.toFixed(2)} (max ${maxH.toFixed(2)}), gap ${gapReq.toFixed(2)} (approach ${approach.toFixed(2)})`,
      };
    }
    case 'drop': {
      const reach = reachAt(caps.drop, dyReq);
      const ok = dy < 0 && reach >= gapReq;
      return { ok, gap, dy, available: reach, required: gapReq, detail: `drop: gap ${gapReq.toFixed(2)} vs reach ${reach.toFixed(2)} at dy ${dy.toFixed(2)}` };
    }
    case 'wallrun': {
      const via = link.via ? findPiece(course, link.via) : undefined;
      if (!via || !via.tags?.includes('wallrun')) {
        return { ok: false, gap, dy, available: 0, required: gapReq, detail: `wallrun link needs a 'via' piece tagged wallrun (${link.via})` };
      }
      const reach = reachAt(caps.wallRun, dyReq);
      return { ok: reach >= gapReq, gap, dy, available: reach, required: gapReq, detail: `wallrun: gap ${gapReq.toFixed(2)} vs reach ${reach.toFixed(2)} at dy ${dy.toFixed(2)}` };
    }
    default: {
      const env = envelopeFor(caps, link.move);
      const reach = reachAt(env, dyReq);
      return { ok: reach >= gapReq, gap, dy, available: reach, required: gapReq, detail: `${link.move}: gap ${gapReq.toFixed(2)} vs reach ${reach.toFixed(2)} at dy ${dy.toFixed(2)}` };
    }
  }
}
