import { Box3, Ray, Vector3, type Camera } from 'three';
import type { CourseData } from '../levels/types';
import { pieceSize, pieceYaw, rotateXZ } from '../levels/colliders';
import type { SelKey } from './doc';

/**
 * Click and box selection. Pieces are picked against their oriented
 * bounding boxes (every copy of a `repeat` piece selects its source);
 * markers (start, bell, lanterns) against small spheres.
 */
export interface PickHit {
  key: SelKey;
  distance: number;
  point: Vector3;
}

/** Marker centres and radii used for picking and drawing. */
export function markerSpheres(c: CourseData): { key: SelKey; center: Vector3; radius: number }[] {
  const out = [
    { key: 'start', center: new Vector3(c.start.pos[0], c.start.pos[1] + 0.9, c.start.pos[2]), radius: 0.7 },
    { key: 'finish', center: new Vector3(c.finish.pos[0], c.finish.pos[1] + 3.6, c.finish.pos[2]), radius: 1.6 },
  ];
  c.checkpoints.forEach((cp, i) =>
    out.push({ key: `cp:${i}`, center: new Vector3(cp.pos[0], cp.pos[1] + 2.5, cp.pos[2]), radius: 0.7 }),
  );
  return out;
}

/** Each placed copy of every piece: source index, bottom-centre position, yaw (rad), size. */
export function pieceInstances(c: CourseData): { index: number; pos: Vector3; yaw: number; size: [number, number, number] }[] {
  const out: { index: number; pos: Vector3; yaw: number; size: [number, number, number] }[] = [];
  c.pieces.forEach((p, index) => {
    const n = p.repeat ? p.repeat.count : 1;
    for (let i = 0; i < n; i++) {
      const s = p.repeat?.step ?? [0, 0, 0];
      out.push({ index, pos: new Vector3(p.pos[0] + s[0] * i, p.pos[1] + s[1] * i, p.pos[2] + s[2] * i), yaw: pieceYaw(p), size: pieceSize(p) });
    }
  });
  return out;
}

const tmpRay = new Ray();
const box = new Box3();
const hit = new Vector3();

export function pickRay(c: CourseData, ray: Ray, visible: (index: number) => boolean = () => true): PickHit | null {
  let best: PickHit | null = null;
  const consider = (key: SelKey, distance: number, point: Vector3) => {
    if (!best || distance < best.distance) best = { key, distance, point: point.clone() };
  };
  for (const m of markerSpheres(c)) {
    const d = ray.distanceSqToPoint(m.center);
    if (d <= m.radius * m.radius) {
      const t = ray.origin.distanceTo(m.center);
      consider(m.key, t, m.center);
    }
  }
  for (const inst of pieceInstances(c)) {
    if (!visible(inst.index)) continue;
    const [w, h, d] = inst.size;
    // Ray into the piece's local frame (inverse yaw about its base).
    const [ox, oz] = rotateXZ(ray.origin.x - inst.pos.x, ray.origin.z - inst.pos.z, -inst.yaw);
    const [dx, dz] = rotateXZ(ray.direction.x, ray.direction.z, -inst.yaw);
    tmpRay.origin.set(ox, ray.origin.y - inst.pos.y, oz);
    tmpRay.direction.set(dx, ray.direction.y, dz);
    box.min.set(-w / 2, 0, -d / 2);
    box.max.set(w / 2, h, d / 2);
    // Ignore boxes the camera is inside (huge walls, the shaft of a tower...).
    if (box.containsPoint(tmpRay.origin)) continue;
    if (!tmpRay.intersectBox(box, hit)) continue;
    const t = hit.distanceTo(tmpRay.origin);
    consider(`p:${inst.index}`, t, ray.origin.clone().addScaledVector(ray.direction, t));
  }
  return best;
}

/** Everything whose centre projects inside the screen rectangle (NDC, x/y in [-1, 1]). */
export function keysInRect(c: CourseData, camera: Camera, x0: number, y0: number, x1: number, y1: number, visible: (index: number) => boolean = () => true): SelKey[] {
  const [minX, maxX] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [minY, maxY] = [Math.min(y0, y1), Math.max(y0, y1)];
  const keys = new Set<SelKey>();
  const v = new Vector3();
  const inside = (p: Vector3) => {
    v.copy(p).project(camera);
    return v.z < 1 && v.x >= minX && v.x <= maxX && v.y >= minY && v.y <= maxY;
  };
  for (const inst of pieceInstances(c)) {
    if (!visible(inst.index)) continue;
    if (inside(inst.pos.clone().setY(inst.pos.y + inst.size[1] / 2))) keys.add(`p:${inst.index}`);
  }
  for (const m of markerSpheres(c)) if (inside(m.center)) keys.add(m.key);
  return [...keys];
}
