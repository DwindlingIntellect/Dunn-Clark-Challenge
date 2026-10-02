import * as THREE from 'three';
import type { CourseData, LightDef, Piece } from '../levels/types';
import { expandPieces } from '../levels/colliders';
import { buildPiece, lanternGeometry, PartSink, pieceMatrix, box, octagon } from './kit/pieces';
import type { Part } from './kit/primitives';
import { createPsxMaterial, getMaterial, MAX_LIGHTS, type MatKey } from './materials';
import { merge } from './geomUtil';
import { ATMOSPHERES } from './atmosphere';

/**
 * Turns course data into renderable meshes. Static geometry is merged into
 * one mesh per material (≈15 draw calls per course). Checkpoint lanterns
 * and the finish bell are separate so they can light up / swing.
 */
export interface CheckpointLantern {
  group: THREE.Group;
  glow: THREE.ShaderMaterial;
}

export interface LevelVisuals {
  root: THREE.Group;
  lanterns: CheckpointLantern[];
  /** Pivot the bell swings around (rotate on X). */
  bellPivot: THREE.Group;
  lights: LightDef[];
  dispose(): void;
}

export const LANTERN_UNLIT = 0x5a3a20;
export const LANTERN_LIT = 0xffd080;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Distant silhouettes (spires, towers, facades) rising out of the fog. */
export function backdropPieces(course: CourseData): Piece[] {
  const b = course.backdrop;
  if (!b) return [];
  const pieces = expandPieces(course.pieces);
  let cx = 0;
  let cz = 0;
  for (const p of pieces) {
    cx += p.pos[0];
    cz += p.pos[2];
  }
  cx /= Math.max(1, pieces.length);
  cz /= Math.max(1, pieces.length);
  const rand = rng(b.seed);
  const out: Piece[] = [];
  const base = course.killY - 60;
  for (let i = 0; i < b.count; i++) {
    const ang = (i / b.count) * Math.PI * 2 + rand() * 0.4;
    const r = b.radius * (1 + rand() * 0.6);
    const x = cx + Math.cos(ang) * r;
    const z = cz + Math.sin(ang) * r;
    const h = b.height * (0.6 + rand() * 0.8);
    const kind = rand();
    const rot = Math.round(rand() * 8) * 45;
    if (kind < 0.45) {
      const w = 8 + rand() * 10;
      out.push({ type: 'block', pos: [x, base, z], size: [w, h - base, w], rot, mat: 'darkstone' });
      out.push({ type: 'spire', pos: [x, h, z], size: [w * 0.9, w * 3, w * 0.9], rot });
    } else if (kind < 0.75) {
      const w = 6 + rand() * 6;
      out.push({ type: 'spire', pos: [x, base, z], size: [w, h - base + w * 3, w], rot });
    } else {
      const w = 30 + rand() * 30;
      out.push({ type: 'windowwall', pos: [x, base, z], size: [w, h * 0.7 - base, 4], rot: (ang * 180) / Math.PI + 90 });
      out.push({ type: 'roof', pos: [x, h * 0.7, z], size: [10, 8, w], rot: (ang * 180) / Math.PI + 180 });
    }
  }
  return out;
}

/** Geometry is merged per material *and* per spatial cell so chunks behind the camera are frustum-culled. */
const CELL = 48;
type Buckets = Map<string, { mat: MatKey; list: THREE.BufferGeometry[] }>;

function addParts(buckets: Buckets, parts: Part[], at?: [number, number, number]): void {
  for (const p of parts) {
    let cx = 0;
    let cz = 0;
    if (at) {
      cx = Math.floor(at[0] / CELL);
      cz = Math.floor(at[2] / CELL);
    }
    const key = `${p.mat}|${cx},${cz}`;
    let b = buckets.get(key);
    if (!b) {
      b = { mat: p.mat, list: [] };
      buckets.set(key, b);
    }
    b.list.push(p.geom);
  }
}

/** Bell profile (radius, height) for the lathe. */
const BELL_PROFILE: [number, number][] = [
  [0.02, 1.6], [0.36, 1.58], [0.46, 1.46], [0.5, 1.2], [0.54, 0.92], [0.64, 0.6], [0.82, 0.3], [1.0, 0.1], [1.06, 0.0], [0.98, 0.04],
];

function buildBell(course: CourseData, buckets: Buckets): THREE.Group {
  const [x, y, z] = course.finish.pos;
  // Frame (static, merged): two posts and a yoke beam with a little roof.
  const frame = new PartSink(pieceMatrix([x, y, z], 0), y);
  frame.add('wood', box(0.35, 5, 0.35, -1.9, 2.5, 0));
  frame.add('wood', box(0.35, 5, 0.35, 1.9, 2.5, 0));
  frame.add('wood', box(4.4, 0.4, 0.45, 0, 4.9, 0));
  frame.add('slate', box(5, 0.15, 1.6, 0, 5.35, 0), { ao: false });
  addParts(buckets, frame.parts, [x, y, z]);

  const pivot = new THREE.Group();
  pivot.position.set(x, y + 4.7, z);
  const lathe = new THREE.LatheGeometry(BELL_PROFILE.map(([r, h]) => new THREE.Vector2(r * 1.15, h * 1.15)), 10);
  lathe.translate(0, -1.15 * 1.6 - 0.1, 0);
  const sink = new PartSink(new THREE.Matrix4(), y, 10);
  sink.add('bronze', lathe, { ao: false, maxEdge: 10 });
  sink.add('iron', octagon(0.12, 0.12, 0.6, 0, -1.9, 0), { ao: false });
  for (const part of sink.parts) pivot.add(new THREE.Mesh(part.geom, getMaterial(part.mat)));
  return pivot;
}

function buildLanterns(course: CourseData): CheckpointLantern[] {
  return course.checkpoints.map((cp) => {
    const group = new THREE.Group();
    // Hung overhead on a chain so the running line stays clear.
    const sink = new PartSink(new THREE.Matrix4(), 0, 10);
    sink.add('iron', box(0.05, 4, 0.05, 0, 4.9, 0), { ao: false });
    sink.add('iron', box(0.5, 0.06, 0.06, 0, 2.95, 0), { ao: false });
    const glowSink = new PartSink(new THREE.Matrix4().makeTranslation(0, 2.45, 0), 0, 10);
    lanternGeometry(glowSink, 0.4, 0.5, 0);
    const glow = createPsxMaterial({ map: 'white', unlit: true, tint: LANTERN_UNLIT });
    for (const part of [...sink.parts, ...glowSink.parts]) {
      group.add(new THREE.Mesh(part.geom, part.mat === 'lanternGlow' ? glow : getMaterial(part.mat)));
    }
    group.position.set(...cp.pos);
    group.rotation.y = (cp.yaw * Math.PI) / 180;
    return { group, glow };
  });
}

function buildClouds(y: number, cx: number, cz: number): THREE.Mesh {
  const size = 1400;
  const seg = 40;
  const g = new THREE.PlaneGeometry(size, size, seg, seg).toNonIndexed();
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position').array as Float32Array;
  const col = new Float32Array(pos.length);
  const rand = rng(99);
  const heights = new Map<string, number>();
  for (let i = 0; i < pos.length; i += 3) {
    const key = `${pos[i].toFixed(1)},${pos[i + 2].toFixed(1)}`;
    if (!heights.has(key)) heights.set(key, rand());
    const h = heights.get(key)!;
    pos[i + 1] += h * 6;
    const k = 0.65 + h * 0.45;
    col[i] = k;
    col[i + 1] = k;
    col[i + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const uv = new Float32Array((pos.length / 3) * 2);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, getMaterial('cloud'));
  m.position.set(cx, y, cz);
  return m;
}

export function buildLevel(course: CourseData): LevelVisuals {
  const root = new THREE.Group();
  const buckets: Buckets = new Map();
  for (const p of expandPieces(course.pieces)) addParts(buckets, buildPiece(p), p.pos);
  // The distant backdrop surrounds everything; one chunk per material is enough.
  for (const p of backdropPieces(course)) addParts(buckets, buildPiece(p, 40), [1e5, 0, 1e5]);
  const bellPivot = buildBell(course, buckets);
  root.add(bellPivot);

  for (const { mat, list } of buckets.values()) {
    const g = merge(list);
    if (!g) continue;
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, getMaterial(mat));
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    for (const old of list) old.dispose();
  }

  const lanterns = buildLanterns(course);
  for (const l of lanterns) root.add(l.group);

  const atmo = ATMOSPHERES[course.atmosphere];
  if (atmo.cloudY !== undefined) root.add(buildClouds(atmo.cloudY, course.finish.pos[0], course.finish.pos[2]));

  const [fx, fy, fz] = course.finish.pos;
  const lights: LightDef[] = [{ pos: [fx, fy + 3, fz], color: 0xffc070, intensity: 1.6, range: 14 }];
  for (const cp of course.checkpoints) {
    lights.push({ pos: [cp.pos[0], cp.pos[1] + 2.6, cp.pos[2]], color: 0xff9a40, intensity: 1.3, range: 10 });
  }
  lights.push(...(course.lights ?? []));

  return {
    root,
    lanterns,
    bellPivot,
    lights: lights.slice(0, MAX_LIGHTS),
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const l of lanterns) l.glow.dispose();
    },
  };
}
