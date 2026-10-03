import * as THREE from 'three';
import type { CourseData } from '../levels/types';
import { expandPieces, pieceSize, pieceYaw } from '../levels/colliders';
import { buildPiece } from '../render/kit/pieces';
import { backdropPieces } from '../render/levelBuilder';
import { getMaterial, type MatKey } from '../render/materials';
import { finalize, merge } from '../render/geomUtil';
import type { Capabilities } from '../sim/capabilities';
import { resolve, type SelKey } from './doc';
import { linkArc, type LinkView } from './links';
import { markerSpheres } from './pick';

/**
 * Everything the editor draws: one group of meshes per piece (so a single
 * piece can be rebuilt or previewed mid-drag), the distant backdrop, start /
 * bell / lantern markers, selection outlines, jump links with arcs, the kill
 * plane and a placement grid.
 */
const SEL_COLOR = 0xffa030;
const LINK_OK = 0x50e070;
const LINK_SHORTCUT = 0x40c8ff;
const LINK_FAIL = 0xff3040;

function basic(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

export class EditorView {
  readonly root = new THREE.Group();
  private pieces: THREE.Group[] = [];
  private backdrop = new THREE.Group();
  private markers = new THREE.Group();
  private selection = new THREE.Group();
  private links = new THREE.Group();
  private killPlane: THREE.Mesh;
  private grid: THREE.GridHelper;
  private pieceRoot = new THREE.Group();

  constructor() {
    this.root.add(this.pieceRoot, this.backdrop, this.markers, this.selection, this.links);
    this.killPlane = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2), basic(0xff2020, 0.12));
    this.killPlane.renderOrder = 5;
    this.grid = new THREE.GridHelper(100, 100, 0x8899aa, 0x445566);
    const gm = this.grid.material as THREE.Material;
    gm.transparent = true;
    gm.opacity = 0.35;
    gm.depthWrite = false;
    this.root.add(this.killPlane, this.grid);
  }

  // ---------------------------------------------------------------- pieces

  rebuildAll(c: CourseData): void {
    for (const g of this.pieces) disposeGroup(g);
    this.pieceRoot.clear();
    this.pieces = c.pieces.map((_, i) => this.buildPieceGroup(c, i));
    for (const g of this.pieces) this.pieceRoot.add(g);
    this.rebuildBackdrop(c);
    this.rebuildMarkers(c);
    this.killPlane.position.y = c.killY;
  }

  private buildPieceGroup(c: CourseData, index: number): THREE.Group {
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    for (const copy of expandPieces([c.pieces[index]])) {
      for (const part of buildPiece(copy)) g.add(new THREE.Mesh(part.geom, getMaterial(part.mat)));
    }
    return g;
  }

  rebuildPiece(c: CourseData, index: number): void {
    const old = this.pieces[index];
    if (old) {
      this.pieceRoot.remove(old);
      disposeGroup(old);
    }
    const g = this.buildPieceGroup(c, index);
    this.pieces[index] = g;
    this.pieceRoot.add(g);
  }

  setPieceVisible(index: number, visible: boolean): void {
    const g = this.pieces[index];
    if (g) g.visible = visible;
  }

  /** Preview a drag by transforming the already-built world-space geometry. */
  setPieceMatrix(index: number, m: THREE.Matrix4 | null): void {
    const g = this.pieces[index];
    if (!g) return;
    if (m) g.matrix.copy(m);
    else g.matrix.identity();
    g.matrixWorldNeedsUpdate = true;
  }

  rebuildBackdrop(c: CourseData): void {
    disposeGroup(this.backdrop);
    this.backdrop.clear();
    const buckets = new Map<MatKey, THREE.BufferGeometry[]>();
    for (const p of backdropPieces(c)) {
      for (const part of buildPiece(p, 40)) {
        if (!buckets.has(part.mat)) buckets.set(part.mat, []);
        buckets.get(part.mat)!.push(part.geom);
      }
    }
    for (const [mat, list] of buckets) {
      const g = merge(list);
      if (g) this.backdrop.add(new THREE.Mesh(g, getMaterial(mat)));
    }
  }

  // --------------------------------------------------------------- markers

  rebuildMarkers(c: CourseData): void {
    disposeGroup(this.markers);
    this.markers.clear();
    const prep = (g: THREE.BufferGeometry) => finalize(g, { maxEdge: 10 });

    // Start: a translucent player capsule with an arrow showing the facing.
    const start = new THREE.Group();
    const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), basic(0x40ff80, 0.35));
    cap.position.y = 0.9;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 6).rotateX(-Math.PI / 2), basic(0x40ff80));
    arrow.position.set(0, 1.6, -0.6);
    start.add(cap, arrow);
    start.position.set(...c.start.pos);
    start.rotation.y = (c.start.yaw * Math.PI) / 180;
    this.markers.add(start);

    // Bell: frame and a simple bronze bell, matching the in-game size.
    const bell = new THREE.Group();
    bell.add(new THREE.Mesh(prep(new THREE.BoxGeometry(0.35, 5, 0.35).translate(-1.9, 2.5, 0)), getMaterial('wood')));
    bell.add(new THREE.Mesh(prep(new THREE.BoxGeometry(0.35, 5, 0.35).translate(1.9, 2.5, 0)), getMaterial('wood')));
    bell.add(new THREE.Mesh(prep(new THREE.BoxGeometry(4.4, 0.4, 0.45).translate(0, 4.9, 0)), getMaterial('wood')));
    bell.add(new THREE.Mesh(prep(new THREE.ConeGeometry(1.2, 1.8, 10, 1, true).translate(0, 3.6, 0)), getMaterial('bronze')));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.05, 4, 32).rotateX(Math.PI / 2), basic(0xffc040, 0.6));
    ring.position.y = 0.05;
    bell.add(ring);
    bell.position.set(...c.finish.pos);
    this.markers.add(bell);

    // Lanterns, numbered by order.
    c.checkpoints.forEach((cp) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(prep(new THREE.BoxGeometry(0.05, 4, 0.05).translate(0, 4.9, 0)), getMaterial('iron')));
      g.add(new THREE.Mesh(prep(new THREE.BoxGeometry(0.4, 0.5, 0.4).translate(0, 2.45, 0)), getMaterial('lanternGlow')));
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.04, 4, 24).rotateX(Math.PI / 2), basic(0xffa040, 0.5));
      r.position.y = 0.05;
      g.add(r);
      g.position.set(...cp.pos);
      this.markers.add(g);
    });
  }

  // ------------------------------------------------------------- selection

  updateSelection(c: CourseData, keys: SelKey[]): void {
    disposeGroup(this.selection);
    this.selection.clear();
    const mat = new THREE.LineBasicMaterial({ color: SEL_COLOR, depthTest: false, transparent: true });
    const spheres = new Map(markerSpheres(c).map((m) => [m.key, m]));
    for (const key of keys) {
      const r = resolve(c, key);
      if (!r) continue;
      if (r.kind === 'piece') {
        for (const copy of expandPieces([r.piece])) {
          const [w, h, d] = pieceSize(copy);
          const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.04, h + 0.04, d + 0.04)), mat);
          e.position.set(copy.pos[0], copy.pos[1] + h / 2, copy.pos[2]);
          e.rotation.y = pieceYaw(copy);
          e.renderOrder = 10;
          this.selection.add(e);
        }
      } else {
        const m = spheres.get(key);
        if (!m) continue;
        const s = m.radius * 2;
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s)), mat);
        e.position.copy(m.center);
        e.renderOrder = 10;
        this.selection.add(e);
      }
    }
  }

  // ----------------------------------------------------------------- links

  /** Draw every link as a line; links touching the selection also get their jump arc. */
  updateLinks(views: LinkView[], caps: Capabilities | null, highlightIds: Set<string>): void {
    disposeGroup(this.links);
    this.links.clear();
    for (const v of views) {
      const color = !v.check.ok ? LINK_FAIL : v.link.route === 'shortcut' ? LINK_SHORTCUT : LINK_OK;
      const mat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 });
      const lift = new THREE.Vector3(0, 0.15, 0);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v.a.clone().add(lift), v.b.clone().add(lift)]), mat);
      line.renderOrder = 11;
      this.links.add(line);
      // Endpoints.
      for (const p of [v.a, v.b]) {
        const dot = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), basic(color));
        dot.position.copy(p).add(lift);
        dot.renderOrder = 11;
        this.links.add(dot);
      }
      const touches = highlightIds.has(v.link.from) || highlightIds.has(v.link.to) || (!!v.link.via && highlightIds.has(v.link.via));
      if (caps && touches) {
        const pts = linkArc(v, caps);
        if (pts.length > 1) {
          const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: 0.4, gapSize: 0.25, depthTest: false, transparent: true }));
          arc.computeLineDistances();
          arc.renderOrder = 12;
          this.links.add(arc);
        }
      }
    }
  }

  // -------------------------------------------------------------- helpers

  setGrid(y: number | null, x = 0, z = 0): void {
    this.grid.visible = y !== null;
    if (y !== null) this.grid.position.set(Math.round(x), y + 0.01, Math.round(z));
  }

  setKillY(y: number): void {
    this.killPlane.position.y = y;
  }

  dispose(): void {
    disposeGroup(this.root);
  }
}

function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    // Shared PSX materials (ShaderMaterial) are cached globally and must survive.
    const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const x of list) if (!(x instanceof THREE.ShaderMaterial)) x.dispose();
  });
}
