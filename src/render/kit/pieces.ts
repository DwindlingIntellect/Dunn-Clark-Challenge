import * as THREE from 'three';
import type { Piece, MaterialName } from '../../levels/types';
import { pieceSize, pieceYaw, RAIL_HEIGHT, RAIL_THICKNESS, archGeometry } from '../../levels/colliders';
import type { MatKey } from '../materials';
import { colliderGeometry } from '../colliderGeometry';
import {
  PartSink, pieceMatrix, box, boxSplit, octagon, cone, pointedArchShape, pointedArchPoints, extrude, candle, beam, crossQuads, type Part,
} from './primitives';

/**
 * Builds render geometry for each level piece type. Visual language:
 * - wall-runnable ('wallrun') surfaces: pale ivory stone with gold trim bands;
 * - mantle ledges ('mantle'): lit candles along the top edges;
 * - everything else: cold grey stone, flagstone tops, slate roofs.
 */

function sideMat(p: Piece): MatKey {
  if (p.tags?.includes('wallrun')) return 'ivory';
  return (p.mat ?? 'stone') as MatKey;
}

function topMat(p: Piece): MatKey {
  if (p.tags?.includes('wallrun')) return 'ivory';
  const m: MaterialName = p.mat ?? 'stone';
  return m === 'stone' ? 'flagstone' : (m as MatKey);
}

/** Gold trim bands along the vertical faces of a wall-runnable box. */
function goldTrim(s: PartSink, w: number, h: number, d: number): void {
  const t = 0.05;
  const band = Math.min(0.22, h * 0.08);
  for (const y of [h - band / 2, 0.9, Math.max(1.0, h * 0.5)]) {
    if (y > h - band / 2 + 0.01 || y < band) continue;
    s.add('gold', box(w + 2 * t, band, d + 2 * t, 0, y, 0), { ao: false, maxEdge: 4 });
  }
}

/** Candles along the top edges of a mantle ledge. */
function ledgeCandles(s: PartSink, w: number, h: number, d: number): void {
  const inset = 0.18;
  const edge = (len: number, place: (t: number) => [number, number]) => {
    const n = Math.max(2, Math.min(10, Math.floor(len / 1.4)));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const [x, z] = place(t * len);
      candle(s, x, h, z, 0.18 + ((i * 7) % 3) * 0.05);
    }
  };
  edge(w - 2 * inset, (t) => [t, -d / 2 + inset]);
  edge(w - 2 * inset, (t) => [t, d / 2 - inset]);
  if (d > 1.2) {
    edge(d - 2 * inset - 0.6, (t) => [-w / 2 + inset, t]);
    edge(d - 2 * inset - 0.6, (t) => [w / 2 - inset, t]);
  }
}

function buildBlock(s: PartSink, p: Piece): void {
  const [w, h, d] = pieceSize(p);
  const { top, sides } = boxSplit(w, h, d, 0, h / 2, 0);
  s.add(topMat(p), top);
  s.add(sideMat(p), sides);
  if (p.tags?.includes('wallrun')) goldTrim(s, w, h, d);
  if (p.tags?.includes('mantle')) ledgeCandles(s, w, h, d);
}

function buildWindowWall(s: PartSink, p: Piece): void {
  buildBlock(s, p);
  const [w, h, d] = pieceSize(p);
  const ww = Math.min(2.2, Math.max(0.8, h * 0.16));
  const count = Math.max(1, Math.floor(w / (ww * 2.4)));
  const sill = h * 0.22;
  const top = h * 0.82;
  const spring = sill + (top - sill) * 0.62;
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5 - count / 2) * (w / count);
    for (const side of [-1, 1]) {
      const z = side * (d / 2 + 0.03);
      // Frame: outer arch minus inner arch, extruded.
      const outer = pointedArchShape(ww + 0.5, spring - sill, top - sill + 0.35, x, sill - 0.2);
      outer.holes.push(new THREE.Path(pointedArchPoints(ww, spring - sill, top - sill).map((v) => new THREE.Vector2(v.x + x, v.y + sill))));
      const frame = extrude(outer, 0.2);
      frame.translate(0, 0, z);
      s.add(p.tags?.includes('wallrun') ? 'gold' : 'darkstone', frame, { ao: false });
      const glass = new THREE.ShapeGeometry(pointedArchShape(ww, spring - sill, top - sill, x, sill)).toNonIndexed();
      glass.translate(0, 0, z + side * 0.005);
      s.add('glass', glass, { ao: false, maxEdge: 2 });
      // Mullion
      s.add('darkstone', box(0.12, top - sill - 0.4, 0.14, x, sill + (top - sill - 0.4) / 2, z), { ao: false });
    }
  }
}

function buildRamp(s: PartSink, p: Piece): void {
  const [w, h, d] = pieceSize(p);
  if (p.type === 'stairs') {
    const steps = Math.max(2, Math.round(h / 0.25));
    const sd = d / steps;
    const sh = h / steps;
    for (let i = 0; i < steps; i++) {
      const z = d / 2 - (i + 0.5) * sd;
      const { top, sides } = boxSplit(w, sh * (i + 1), sd, 0, (sh * (i + 1)) / 2, z);
      s.add(topMat(p), top);
      s.add(sideMat(p), sides);
    }
    return;
  }
  // Wedge rising toward local -Z. Built from the collider shape in local space.
  const g = colliderGeometry({ kind: 'ramp', center: [0, h / 2, 0], half: [w / 2, h / 2, d / 2], yaw: 0, tags: [], surface: 'stone' });
  const pos = g.getAttribute('position').array as Float32Array;
  const slope: number[] = [];
  const rest: number[] = [];
  const n = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 9) {
    a.fromArray(pos, i);
    b.fromArray(pos, i + 3);
    c.fromArray(pos, i + 6);
    n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    (n.y > 0.2 ? slope : rest).push(...pos.slice(i, i + 9));
  }
  const mk = (arr: number[]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    geo.computeVertexNormals();
    return geo;
  };
  s.add(p.mat === 'wood' ? 'wood' : p.mat === 'slate' ? 'slate' : topMat(p), mk(slope));
  s.add(sideMat(p), mk(rest));
  if (p.tags?.includes('wallrun')) goldTrim(s, w, h * 0.5, d);
}

function buildRoof(s: PartSink, p: Piece): void {
  const [w, h, d] = pieceSize(p);
  const half = (sign: number) => {
    const g = colliderGeometry({ kind: 'ramp', center: [sign * w / 4, h / 2, 0], half: [d / 2, h / 2, w / 4], yaw: sign * Math.PI / 2, tags: [], surface: 'stone' });
    return g;
  };
  for (const sign of [-1, 1]) {
    const g = half(sign);
    const pos = g.getAttribute('position').array as Float32Array;
    const slope: number[] = [];
    const rest: number[] = [];
    for (let i = 0; i < pos.length; i += 9) {
      const a = new THREE.Vector3().fromArray(pos, i);
      const b = new THREE.Vector3().fromArray(pos, i + 3);
      const c = new THREE.Vector3().fromArray(pos, i + 6);
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      (n.y > 0.2 ? slope : rest).push(...pos.slice(i, i + 9));
    }
    const mk = (arr: number[]) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      geo.computeVertexNormals();
      return geo;
    };
    s.add('slate', mk(slope));
    s.add('stone', mk(rest));
  }
  s.add('iron', box(0.25, 0.2, d + 0.2, 0, h - 0.11, 0), { ao: false });
}

function buildPillar(s: PartSink, p: Piece): void {
  const [w, h] = pieceSize(p);
  const r = w / 2;
  const mat = sideMat(p);
  s.add(mat, octagon(r * 1.35, r * 1.45, Math.min(0.6, h * 0.08)));
  s.add(mat, octagon(r, r, h - Math.min(1.2, h * 0.14), 0, Math.min(0.6, h * 0.08)));
  s.add(mat, octagon(r * 1.4, r * 1.05, Math.min(0.6, h * 0.06), 0, h - Math.min(0.6, h * 0.06)));
  if (p.tags?.includes('wallrun')) {
    s.add('gold', octagon(r * 1.06, r * 1.06, 0.2, 0, h * 0.5), { ao: false });
  }
}

function buildWalkway(s: PartSink, p: Piece): void {
  const [w, h, d] = pieceSize(p);
  const { top, sides } = boxSplit(w, h, d, 0, h / 2, 0);
  s.add(topMat(p), top);
  s.add(sideMat(p), sides);
  if (p.tags?.includes('norails')) return;
  for (const side of [-1, 1]) {
    const x = side * (w / 2 - RAIL_THICKNESS / 2);
    s.add('stone', box(RAIL_THICKNESS, 0.12, d, x, h + RAIL_HEIGHT - 0.06, 0), { ao: false });
    s.add('stone', box(RAIL_THICKNESS + 0.06, 0.14, d, x, h + 0.07, 0), { ao: false });
    const n = Math.max(2, Math.floor(d / 0.5));
    for (let i = 0; i < n; i++) {
      const z = (i + 0.5) / n * d - d / 2;
      s.add('stone', octagon(0.07, 0.09, RAIL_HEIGHT - 0.26, x, h + 0.14, z), { ao: false, maxEdge: 10 });
    }
  }
}

function buildArch(s: PartSink, p: Piece): void {
  const [w, h, d] = pieceSize(p);
  const { opening: ow, apex, spring } = archGeometry(w, h);
  const inner = pointedArchPoints(ow, spring, apex, 8);
  const apexIdx = (inner.length - 1) / 2;
  const left = new THREE.Shape();
  left.moveTo(-w / 2, 0);
  left.lineTo(-ow / 2, 0);
  for (const v of inner.slice(1, apexIdx + 1)) left.lineTo(v.x, v.y);
  left.lineTo(0, h);
  left.lineTo(-w / 2, h);
  const right = new THREE.Shape();
  right.moveTo(w / 2, 0);
  right.lineTo(ow / 2, 0);
  for (const v of [...inner].reverse().slice(1, apexIdx + 1)) right.lineTo(v.x, v.y);
  right.lineTo(0, h);
  right.lineTo(w / 2, h);
  const mat = sideMat(p);
  s.add(mat, extrude(left, d));
  s.add(mat, extrude(right, d));
  // Moulding along the arch.
  for (let i = 1; i < inner.length - 2; i++) {
    const a = inner[i];
    const b = inner[i + 1];
    if (a.y < spring - 0.01 && b.y < spring - 0.01) continue;
    s.add('darkstone', beam(new THREE.Vector3(a.x, a.y, 0), new THREE.Vector3(b.x, b.y, 0), d + 0.12, 0.18), { ao: false });
  }
  if (p.tags?.includes('wallrun')) goldTrim(s, w, h, d);
}

function buildButtress(s: PartSink, p: Piece): void {
  const [w, h, d] = pieceSize(p);
  // Pier at local +Z, arm flying up toward the wall at local -Z.
  const pierD = Math.min(2, d * 0.25);
  const pierH = h * 0.72;
  s.add('stone', box(w * 1.2, pierH, pierD, 0, pierH / 2, d / 2 - pierD / 2));
  s.add('stone', cone(w * 0.7, h * 0.22, 0, pierH, d / 2 - pierD / 2, 4));
  const a = new THREE.Vector3(0, pierH * 0.85, d / 2 - pierD);
  const b = new THREE.Vector3(0, h * 0.95, -d / 2);
  s.add('stone', beam(a, b, w * 0.8, 0.9));
  // Curved underside approximated by a second, lower strut.
  const a2 = new THREE.Vector3(0, pierH * 0.6, d / 2 - pierD);
  const m2 = new THREE.Vector3(0, pierH * 0.62 + (h - pierH) * 0.2, 0);
  const b2 = new THREE.Vector3(0, h * 0.78, -d / 2);
  s.add('darkstone', beam(a2, m2, w * 0.6, 0.5));
  s.add('darkstone', beam(m2, b2, w * 0.6, 0.5));
}

function buildRose(s: PartSink, p: Piece): void {
  const [w, , d] = pieceSize(p);
  const r = w / 2;
  const cy = r;
  const ring = new THREE.Shape();
  ring.absarc(0, cy, r, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, cy, r * 0.86, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  s.add('darkstone', extrude(ring, d + 0.2), { ao: false });
  const glass = new THREE.CircleGeometry(r * 0.88, 16).toNonIndexed();
  glass.translate(0, cy, 0);
  s.add('glass', glass, { ao: false, maxEdge: 2 });
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const a = new THREE.Vector3(Math.cos(ang) * r * 0.18, cy + Math.sin(ang) * r * 0.18, 0);
    const b = new THREE.Vector3(Math.cos(ang) * r * 0.86, cy + Math.sin(ang) * r * 0.86, 0);
    s.add('darkstone', beam(a, b, 0.14, d + 0.1), { ao: false });
  }
  const hub = new THREE.CylinderGeometry(r * 0.2, r * 0.2, d + 0.12, 8).toNonIndexed();
  hub.rotateX(Math.PI / 2);
  hub.translate(0, cy, 0);
  s.add('darkstone', hub, { ao: false });
}

function buildSpire(s: PartSink, p: Piece): void {
  const [w, h] = pieceSize(p);
  const r = w / 2;
  const drum = h * 0.28;
  const mat = sideMat(p);
  s.add(mat, octagon(r, r * 1.05, drum));
  s.add('slate', cone(r * 0.95, h - drum, 0, drum));
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    s.add(mat, cone(r * 0.22, h * 0.16, x * r * 0.85, drum - 0.2, z * r * 0.85, 4), { ao: false });
  }
  s.add('iron', box(0.08, h * 0.05, 0.08, 0, h + h * 0.025, 0), { ao: false });
}

function buildLantern(s: PartSink, p: Piece): void {
  const [w, h] = pieceSize(p);
  lanternGeometry(s, w, h, 0);
}

/** Iron lantern cage with a glowing core; shared by decorative and checkpoint lanterns. */
export function lanternGeometry(s: PartSink, w: number, h: number, y: number, glow: MatKey = 'lanternGlow'): void {
  s.add('iron', box(w, 0.06, w, 0, y + 0.03, 0), { ao: false });
  s.add('iron', cone(w * 0.62, h * 0.3, 0, y + h * 0.7, 0, 4), { ao: false });
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    s.add('iron', box(0.04, h * 0.7, 0.04, (x * w) / 2, y + h * 0.35, (z * w) / 2), { ao: false, maxEdge: 10 });
  }
  s.add(glow, box(w * 0.55, h * 0.5, w * 0.55, 0, y + h * 0.33, 0), { ao: false });
}

function buildCandles(s: PartSink, p: Piece): void {
  const [w] = pieceSize(p);
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = (i % 2 ? 0.5 : 0.25) * (w / 2);
    candle(s, Math.cos(a) * rr, 0, Math.sin(a) * rr, 0.15 + (i % 3) * 0.08);
  }
}

const BUILDERS: Record<Piece['type'], (s: PartSink, p: Piece) => void> = {
  block: buildBlock,
  windowwall: buildWindowWall,
  ramp: buildRamp,
  stairs: buildRamp,
  roof: buildRoof,
  pillar: buildPillar,
  walkway: buildWalkway,
  arch: buildArch,
  buttress: buildButtress,
  rosewindow: buildRose,
  spire: buildSpire,
  lantern: buildLantern,
  candles: buildCandles,
};

/** World-space parts for one piece. */
export function buildPiece(p: Piece, maxEdge = 3): Part[] {
  const sink = new PartSink(pieceMatrix(p.pos, pieceYaw(p)), p.pos[1], maxEdge);
  BUILDERS[p.type](sink, p);
  return sink.parts;
}

/** Re-exported for the level builder (bell, checkpoint lanterns). */
export { PartSink, pieceMatrix, box, octagon, cone, crossQuads, beam };
