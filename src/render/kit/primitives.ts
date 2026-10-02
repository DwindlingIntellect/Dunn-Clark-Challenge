import * as THREE from 'three';
import type { MatKey } from '../materials';
import { finalize } from '../geomUtil';

/** A piece of world-space geometry tagged with the material it renders with. */
export interface Part {
  mat: MatKey;
  geom: THREE.BufferGeometry;
}

/**
 * Collects kit geometry for one level piece. Geometry is authored in the
 * piece's local space (origin at the bottom-centre, +Y up, front = -Z) and
 * transformed into world space on add.
 */
export class PartSink {
  readonly parts: Part[] = [];
  constructor(readonly matrix: THREE.Matrix4, private baseY: number, private maxEdge = 3) {}

  add(mat: MatKey, geom: THREE.BufferGeometry, opts: { maxEdge?: number; color?: number; ao?: boolean; keepUV?: boolean } = {}): void {
    const g = geom.index ? geom.toNonIndexed() : geom;
    g.applyMatrix4(this.matrix);
    this.parts.push({
      mat,
      geom: finalize(g, {
        maxEdge: Math.max(opts.maxEdge ?? 3, this.maxEdge),
        color: opts.color,
        aoBaseY: opts.ao === false ? undefined : this.baseY,
        keepUV: opts.keepUV,
      }),
    });
  }
}

export function pieceMatrix(pos: [number, number, number], yawRad: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRad),
    new THREE.Vector3(1, 1, 1),
  );
}

/** Axis-aligned box centred at (x, y, z). */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  return g;
}

/**
 * Box split into its top face and the rest, so tops and sides can use
 * different materials. Returns non-indexed geometries.
 */
export function boxSplit(w: number, h: number, d: number, x = 0, y = 0, z = 0): { top: THREE.BufferGeometry; sides: THREE.BufferGeometry } {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const ni = g.toNonIndexed();
  const pos = ni.getAttribute('position').array as Float32Array;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z ; 6 vertices each after toNonIndexed.
  const slice = (from: number, to: number) => {
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos.slice(from * 18, to * 18), 3));
    out.computeVertexNormals();
    return out;
  };
  const top = slice(2, 3);
  const rest = new THREE.BufferGeometry();
  rest.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([...pos.slice(0, 2 * 18), ...pos.slice(3 * 18, 6 * 18)], 3),
  );
  rest.computeVertexNormals();
  return { top, sides: rest };
}

/** Octagonal prism (flat faces aligned with the axes). */
export function octagon(rTop: number, rBottom: number, h: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop / Math.cos(Math.PI / 8), rBottom / Math.cos(Math.PI / 8), h, 8, 1, false, Math.PI / 8);
  g.translate(x, y + h / 2, z);
  return g.toNonIndexed();
}

/** Octagonal pyramid / cone. */
export function cone(r: number, h: number, x = 0, y = 0, z = 0, sides = 8): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, sides, 1, false, Math.PI / sides);
  g.translate(x, y + h / 2, z);
  return g.toNonIndexed();
}

/** Outline of a pointed (gothic) arch opening, as points from bottom-left to bottom-right. */
export function pointedArchPoints(width: number, springY: number, apexY: number, segments = 6): THREE.Vector2[] {
  const half = width / 2;
  const ha = Math.max(0.01, apexY - springY);
  // Two arcs with centres at (±c, springY) meeting at the apex.
  let c = (ha * ha - half * half) / width;
  if (c < 0) c = 0;
  const r = half + c;
  const pts: THREE.Vector2[] = [new THREE.Vector2(-half, 0), new THREE.Vector2(-half, springY)];
  // Left side arc: centre (c, springY), from angle PI to apex angle.
  const apexAng = Math.atan2(ha, -c);
  for (let i = 1; i <= segments; i++) {
    const a = Math.PI + (apexAng - Math.PI) * (i / segments);
    pts.push(new THREE.Vector2(c + Math.cos(a) * r, springY + Math.sin(a) * r));
  }
  for (let i = segments - 1; i >= 1; i--) {
    const a = Math.PI + (apexAng - Math.PI) * (i / segments);
    pts.push(new THREE.Vector2(-(c + Math.cos(a) * r), springY + Math.sin(a) * r));
  }
  pts.push(new THREE.Vector2(half, springY), new THREE.Vector2(half, 0));
  return pts;
}

/** Shape of a pointed arch window (closed, without the bottom straight line duplicated). */
export function pointedArchShape(width: number, springY: number, apexY: number, x = 0, y = 0): THREE.Shape {
  const pts = pointedArchPoints(width, springY, apexY).map((p) => new THREE.Vector2(p.x + x, p.y + y));
  return new THREE.Shape(pts);
}

/** Extrude a shape along Z, centred on z = 0. */
export function extrude(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g.index ? g.toNonIndexed() : g;
}

/** Crossed quads for a flame or glow sprite. */
export function crossQuads(w: number, h: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(w, h).toNonIndexed();
  const b = new THREE.PlaneGeometry(w, h).toNonIndexed();
  b.rotateY(Math.PI / 2);
  const pos = [...(a.getAttribute('position').array as Float32Array), ...(b.getAttribute('position').array as Float32Array)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.translate(x, y + h / 2, z);
  return g;
}

/** A single candle (wax prism + flame) standing at (x, y, z). */
export function candle(sink: PartSink, x: number, y: number, z: number, height = 0.25): void {
  sink.add('wax', octagon(0.045, 0.05, height, x, y, z), { ao: false });
  sink.add('flame', crossQuads(0.09, 0.16, x, y + height, z), { ao: false, maxEdge: 10 });
}

/** Box oriented from point a to point b (a beam / strut) with the given cross-section. */
export function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, h, len).toNonIndexed();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
  m.setPosition(mid);
  g.applyMatrix4(m);
  return g;
}
