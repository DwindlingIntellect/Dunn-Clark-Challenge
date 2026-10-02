import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Geometry helpers for the PSX look. All kit geometry ends up non-indexed
 * with position, normal, uv (world-space meters) and color attributes so
 * it can be merged into one mesh per material.
 */

/** Split triangles until no edge is longer than `maxEdge` (limits affine warping). */
export function tessellate(geom: THREE.BufferGeometry, maxEdge: number): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const src = g.getAttribute('position').array as ArrayLike<number>;
  const out: number[] = [];
  const max2 = maxEdge * maxEdge;
  const stack: number[][] = [];
  for (let i = 0; i < src.length; i += 9) stack.push(Array.from({ length: 9 }, (_, k) => src[i + k]));
  let guard = 0;
  while (stack.length && guard++ < 200000) {
    const t = stack.pop()!;
    const d = (a: number, b: number) =>
      (t[a] - t[b]) ** 2 + (t[a + 1] - t[b + 1]) ** 2 + (t[a + 2] - t[b + 2]) ** 2;
    const e = [d(0, 3), d(3, 6), d(6, 0)];
    const m = Math.max(...e);
    if (m <= max2) {
      out.push(...t);
      continue;
    }
    const k = e.indexOf(m);
    const ia = [0, 3, 6][k];
    const ib = [3, 6, 0][k];
    const ic = [6, 0, 3][k];
    const mid = [(t[ia] + t[ib]) / 2, (t[ia + 1] + t[ib + 1]) / 2, (t[ia + 2] + t[ib + 2]) / 2];
    const A = t.slice(ia, ia + 3);
    const B = t.slice(ib, ib + 3);
    const C = t.slice(ic, ic + 3);
    stack.push([...A, ...mid, ...C], [...mid, ...B, ...C]);
  }
  const res = new THREE.BufferGeometry();
  res.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  res.computeVertexNormals();
  return res;
}

/** Planar world-space UVs (meters) chosen per triangle from its dominant axis. */
export function worldUVs(geom: THREE.BufferGeometry, offset = 0): void {
  const p = geom.getAttribute('position').array as ArrayLike<number>;
  const uv = new Float32Array((p.length / 3) * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 9) {
    a.set(p[i], p[i + 1], p[i + 2]);
    b.set(p[i + 3], p[i + 4], p[i + 5]);
    c.set(p[i + 6], p[i + 7], p[i + 8]);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let v = 0; v < 3; v++) {
      const x = p[i + v * 3] + offset;
      const y = p[i + v * 3 + 1];
      const z = p[i + v * 3 + 2] + offset;
      let u: number;
      let w: number;
      if (ay >= ax && ay >= az) {
        u = x;
        w = z;
      } else if (ax >= az) {
        u = n.x > 0 ? -z : z;
        w = y;
      } else {
        u = n.z > 0 ? x : -x;
        w = y;
      }
      uv[(i / 3 + v) * 2] = u;
      uv[(i / 3 + v) * 2 + 1] = w;
    }
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Fill the color attribute: base color with optional darkening toward `baseY` (fake AO). */
export function vertexColors(geom: THREE.BufferGeometry, color = 0xffffff, aoBaseY?: number, aoHeight = 2.5): void {
  const p = geom.getAttribute('position').array as ArrayLike<number>;
  const col = new Float32Array(p.length);
  const c = new THREE.Color(color);
  for (let i = 0; i < p.length; i += 3) {
    let k = 1;
    if (aoBaseY !== undefined) k = 0.55 + 0.45 * Math.min(1, Math.max(0, (p[i + 1] - aoBaseY) / aoHeight));
    col[i] = c.r * k;
    col[i + 1] = c.g * k;
    col[i + 2] = c.b * k;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Prepare a geometry for merging: non-indexed, world UVs, normals and colors present. */
export function finalize(geom: THREE.BufferGeometry, opts: { maxEdge?: number; color?: number; aoBaseY?: number; keepUV?: boolean } = {}): THREE.BufferGeometry {
  let g = geom.index ? geom.toNonIndexed() : geom;
  if (opts.maxEdge) {
    const uv = g.getAttribute('uv');
    if (!(opts.keepUV && uv)) g = tessellate(g, opts.maxEdge);
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!(opts.keepUV && g.getAttribute('uv'))) worldUVs(g);
  vertexColors(g, opts.color, opts.aoBaseY);
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
  }
  return g;
}

/** Merge many prepared geometries into one (null when empty). */
export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  return mergeGeometries(list, false);
}
