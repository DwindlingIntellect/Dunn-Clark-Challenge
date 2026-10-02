import * as THREE from 'three';
import type { ColliderDesc } from '../sim/colliderTypes';

/** Triangle geometry matching a collider exactly (box or wedge), in world space. */
export function colliderGeometry(d: ColliderDesc): THREE.BufferGeometry {
  const [hx, hy, hz] = d.half;
  let g: THREE.BufferGeometry;
  if (d.kind === 'ramp') {
    // Wedge: bottom rectangle, top edge at local -Z.
    const v = [
      [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], // 0-3 bottom
      [-hx, hy, -hz], [hx, hy, -hz], // 4-5 top edge
    ];
    const tris = [
      [0, 2, 1], [0, 3, 2], // bottom
      [0, 1, 5], [0, 5, 4], // back (vertical, -Z)
      [3, 4, 5], [3, 5, 2], // slope
      [0, 4, 3], // left
      [1, 2, 5], // right
    ];
    const pos: number[] = [];
    const center = [0, -hy / 3, -hz / 3];
    for (const t of tris) {
      // Orient every triangle outward (away from the wedge centroid).
      const [a, b, c] = t.map((i) => v[i]);
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const m = [(a[0] + b[0] + c[0]) / 3 - center[0], (a[1] + b[1] + c[1]) / 3 - center[1], (a[2] + b[2] + c[2]) / 3 - center[2]];
      const order = n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0 ? [a, c, b] : [a, b, c];
      for (const p of order) pos.push(...p);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
  } else {
    g = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2).toNonIndexed();
  }
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...d.center),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw),
    new THREE.Vector3(1, 1, 1),
  );
  g.applyMatrix4(m);
  return g;
}

/** Wireframe overlay of all colliders (debug view). */
export function colliderWireframe(descs: ColliderDesc[]): THREE.LineSegments {
  const positions: number[] = [];
  for (const d of descs) {
    const edges = new THREE.EdgesGeometry(colliderGeometry(d));
    const arr = edges.getAttribute('position').array;
    for (let i = 0; i < arr.length; i++) positions.push(arr[i]);
    edges.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x00ff88, depthTest: false, transparent: true, opacity: 0.8 }));
  lines.renderOrder = 999;
  lines.frustumCulled = false;
  return lines;
}
