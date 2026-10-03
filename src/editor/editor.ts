import * as THREE from 'three';
import GUI from 'lil-gui';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { Game, EditorOverlay } from '../game/game';
import { movement } from '../config/movement';
import { psx } from '../config/render';
import { allCourses, courseById, isCampaign, onCourseHotUpdate, COURSES } from '../levels/index';
import { DEFAULT_SIZES, pieceSize } from '../levels/colliders';
import type { CourseData, JumpLink, MaterialName, MoveType, Piece, PieceTag, PieceType, AtmospherePreset } from '../levels/types';
import { ATMOSPHERES } from '../render/atmosphere';
import { applyAtmosphere } from '../render/lighting';
import { courseLights } from '../render/levelBuilder';
import { psxUniforms } from '../render/materials';
import { initPhysics } from '../sim/collision';
import { measureCapabilities, type Capabilities } from '../sim/capabilities';
import {
  EditorDoc, resolve, keyPos, keyYaw, setKeyTransform, duplicate, deleteKeys, ensureId, renamePiece, newCourseTemplate, uniqueId,
  type SelKey,
} from './doc';
import { evaluateLinks, type LinkView } from './links';
import { pickRay, keysInRect } from './pick';
import { createEditorDom, button, el, type EditorDom } from './ui';
import { EditorView } from './view';

/**
 * Dev-only level editor (F2). Edits the course JSON files in
 * src/levels/courses, saving through the dev server (see vite.config.ts).
 *
 * Camera: hold the right mouse button to look; WASD / Q E / Space C to fly.
 * Selection: click, Shift/Ctrl+click to toggle, drag a box on empty space.
 * F5 plays the edited course from its start, Shift+F5 from the camera; the
 * same key returns to the editor.
 */
type GizmoMode = 'translate' | 'rotate' | 'scale';

const PIECE_TYPES: PieceType[] = ['block', 'ramp', 'stairs', 'roof', 'walkway', 'pillar', 'arch', 'windowwall', 'buttress', 'rosewindow', 'spire', 'lantern', 'candles'];
const TAGS: PieceTag[] = ['wallrun', 'mantle', 'solid', 'deco', 'wood', 'iron', 'norails'];
const MATS: (MaterialName | '(default)')[] = ['(default)', 'stone', 'flagstone', 'darkstone', 'wood', 'iron', 'ivory', 'glass', 'bone', 'slate'];
const MOVES: MoveType[] = ['run-jump', 'slide-jump', 'boost-jump', 'drop', 'mantle', 'climb', 'wallrun'];
const SNAPS = [0, 0.1, 0.25, 0.5, 1, 2];
const EYE = 1.6;

interface DragStart {
  key: SelKey;
  pos: THREE.Vector3;
  yaw: number | null;
  size: [number, number, number] | null;
}

export class LevelEditor implements EditorOverlay {
  active = false;
  playing = false;
  private doc: EditorDoc | null = null;
  private dom: EditorDom | null = null;
  private view = new EditorView();
  private gizmo: TransformControls;
  private pivot = new THREE.Object3D();
  private mode: GizmoMode = 'translate';
  private snap = 0.25;
  private caps: Capabilities | null = null;
  private linkViews: LinkView[] = [];
  private gui: GUI | null = null;
  private refreshInspector: (() => void) | null = null;
  private camPos = new THREE.Vector3();
  private camYaw = 0;
  private camPitch = -0.3;
  private flySpeed = 14;
  private looking = false;
  private fog = false;
  private psxPreview = false;
  private savedPsx: typeof psx | null = null;
  private dragStart: DragStart[] = [];
  private pivotStart = { pos: new THREE.Vector3(), yaw: 0 };
  private mouseDown: { x: number; y: number; shift: boolean } | null = null;
  private message = '';
  private messageTimer = 0;
  private outlinerCollapsed = new Set<string>();
  /** Outliner groups hidden from view (and from picking). Editor-only, not saved. */
  private hiddenGroups = new Set<string>();
  private isVisible = (index: number): boolean => !this.hiddenGroups.has(this.doc?.course.pieces[index]?.group ?? 'Ungrouped');
  private newLink: { move: MoveType; route: 'safe' | 'shortcut' } = { move: 'run-jump', route: 'safe' };

  constructor(private game: Game) {
    const canvas = game.renderer.domElement;
    this.gizmo = new TransformControls(game.camera, canvas);
    this.gizmo.setSize(0.9);
    this.gizmo.addEventListener('mouseDown', () => this.onGizmoStart());
    this.gizmo.addEventListener('objectChange', () => this.onGizmoChange());
    this.gizmo.addEventListener('mouseUp', () => this.onGizmoEnd());
    this.gizmo.enabled = false;

    window.addEventListener('keydown', (e) => this.onKeyDown(e), true);
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.flySpeed = Math.min(120, Math.max(2, this.flySpeed * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      this.flash(`Fly speed ${this.flySpeed.toFixed(0)} m/s`);
    }, { passive: false });

    onCourseHotUpdate((c) => this.onHotUpdate(c));
  }

  // ------------------------------------------------------------ lifecycle

  /** Enter the editor on the course the game currently shows. */
  open(): void {
    if (this.active) return;
    const g = this.game;
    const course = this.doc && this.doc.course.id === g.course.id ? this.doc.course : courseById(g.course.id) ?? g.course;
    if (!this.doc || this.doc.course.id !== course.id) this.setDoc(new EditorDoc(course));
    g.enterEditorMode();
    g.overlay = this;
    this.active = true;
    this.savedPsx = { ...psx };
    this.applyEditorLook();
    g.scene.add(this.view.root);
    g.scene.add(this.gizmo.getHelper());
    this.gizmo.enabled = true;
    if (!this.dom) this.buildDom();
    this.dom!.root.style.display = '';
    // Start the camera above the course start, looking down the course.
    if (this.camPos.lengthSq() === 0) this.frameCourse();
    this.syncLook();
    this.rebuildAll();
    if (!this.caps) {
      this.flash('Measuring movement capabilities…');
      setTimeout(async () => {
        await initPhysics();
        this.caps = measureCapabilities(structuredClone(movement));
        this.refreshLinks();
        this.flash('Ready');
      }, 30);
    }
  }

  /** Leave the editor (F2) and return to the title screen. */
  close(): void {
    if (!this.active) return;
    const g = this.game;
    this.detachScene();
    this.gizmo.detach();
    this.active = false;
    g.overlay = null;
    if (this.savedPsx) Object.assign(psx, this.savedPsx);
    const c = courseById(this.doc?.course.id ?? '') ?? COURSES[0];
    g.loadCourse(c);
    g.toTitle();
    if (this.doc?.dirty) console.info('[editor] unsaved changes are kept in memory; press F2 to continue editing.');
  }

  private detachScene(): void {
    const g = this.game;
    g.scene.remove(this.view.root);
    g.scene.remove(this.gizmo.getHelper());
    this.gizmo.enabled = false;
    this.releaseLook();
    if (this.dom) this.dom.root.style.display = 'none';
  }

  private setDoc(doc: EditorDoc): void {
    this.doc = doc;
    doc.onChange = (structural) => {
      if (structural) {
        this.rebuildAll();
        this.buildInspector();
      }
      this.updateToolbar();
    };
  }

  // ---------------------------------------------------------- play-test

  private play(fromCamera: boolean): void {
    if (!this.doc) return;
    const g = this.game;
    this.detachScene();
    this.active = false;
    this.playing = true;
    if (this.savedPsx) Object.assign(psx, this.savedPsx);
    g.overlay = null;
    g.playtestHint = 'F5 — back to the editor';
    const spawn = fromCamera ? { pos: [this.camPos.x, this.camPos.y - EYE, this.camPos.z] as [number, number, number], yaw: this.camYaw } : undefined;
    g.playtest(this.doc.course, spawn);
  }

  private stopPlaying(): void {
    const g = this.game;
    this.playing = false;
    g.playtestHint = '';
    g.enterEditorMode();
    g.overlay = this;
    this.active = true;
    this.savedPsx = { ...psx };
    this.applyEditorLook();
    g.scene.add(this.view.root);
    g.scene.add(this.gizmo.getHelper());
    this.gizmo.enabled = true;
    this.dom!.root.style.display = '';
    this.syncLook();
  }

  // ------------------------------------------------------------ rendering

  /** Clean, full-resolution view for editing; atmosphere/lights from the course. */
  private applyEditorLook(): void {
    if (!this.doc) return;
    const c = this.doc.course;
    const atmo = ATMOSPHERES[c.atmosphere];
    applyAtmosphere(atmo);
    this.game.sky.apply(atmo);
    this.game.lights.set(courseLights(c));
    if (!this.fog) {
      psxUniforms.uFogNear.value = 400;
      psxUniforms.uFogFar.value = 1500;
      psxUniforms.uHeightFogTop.value = -1e4;
    }
    if (this.savedPsx) {
      Object.assign(psx, this.savedPsx);
      psx.aspect = 'fill';
      if (!this.psxPreview) {
        Object.assign(psx, { enabled: true, height: Math.min(1080, Math.max(480, window.innerHeight)), vertexSnap: 0, affine: false, dither: false, colorBits: 8, vignette: 0 });
      }
    }
  }

  frame(dt: number): void {
    const g = this.game;
    const typing = isTyping();
    if (!typing) {
      const i = g.input;
      const fwd = new THREE.Vector3(-Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), -Math.cos(this.camYaw) * Math.cos(this.camPitch));
      const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
      const v = new THREE.Vector3();
      const ctrl = i.isDown('ControlLeft') || i.isDown('ControlRight') || i.isDown('MetaLeft') || i.isDown('MetaRight');
      if (!ctrl) {
        if (i.isDown('KeyW')) v.add(fwd);
        if (i.isDown('KeyS')) v.sub(fwd);
        if (i.isDown('KeyD')) v.add(right);
        if (i.isDown('KeyA')) v.sub(right);
        if (i.isDown('KeyE') || i.isDown('Space')) v.y += 1;
        if (i.isDown('KeyQ') || i.isDown('KeyC')) v.y -= 1;
      }
      const fast = i.isDown('ShiftLeft') || i.isDown('ShiftRight');
      if (v.lengthSq() > 0) this.camPos.addScaledVector(v.normalize(), this.flySpeed * (fast ? 3 : 1) * dt);
    }
    if (this.looking && g.input.locked) {
      this.camYaw = g.input.yaw;
      this.camPitch = g.input.pitch;
    }
    g.camera.position.copy(this.camPos);
    g.camera.rotation.set(this.camPitch, this.camYaw, 0);
    g.camera.updateMatrixWorld();
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message = '';
    }
    this.updateStatus();
  }

  private syncLook(): void {
    this.game.input.yaw = this.camYaw;
    this.game.input.pitch = this.camPitch;
  }

  private releaseLook(): void {
    this.looking = false;
    this.game.input.releaseLock();
  }

  private frameCourse(): void {
    const c = this.doc!.course;
    this.camYaw = ((c.start.yaw ?? 0) * Math.PI) / 180;
    this.camPitch = -0.35;
    const back = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw)).multiplyScalar(14);
    this.camPos.set(c.start.pos[0] + back.x, c.start.pos[1] + 9, c.start.pos[2] + back.z);
  }

  private focusSelection(): void {
    const doc = this.doc;
    if (!doc || doc.selection.length === 0) return;
    const center = this.selectionCenter();
    let radius = 4;
    for (const k of doc.selection) {
      const r = resolve(doc.course, k);
      if (r?.kind === 'piece') radius = Math.max(radius, Math.max(...pieceSize(r.piece)) * 0.8);
    }
    center.y += 1;
    const fwd = new THREE.Vector3(-Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), -Math.cos(this.camYaw) * Math.cos(this.camPitch));
    this.camPos.copy(center).addScaledVector(fwd, -radius * 2.2);
  }

  // --------------------------------------------------------------- rebuild

  private rebuildAll(): void {
    if (!this.doc) return;
    this.view.rebuildAll(this.doc.course);
    this.applyVisibility();
    this.afterChange();
    this.buildOutliner();
  }

  private applyVisibility(): void {
    this.doc?.course.pieces.forEach((_, i) => this.view.setPieceVisible(i, this.isVisible(i)));
  }

  /** Cheap refresh after any edit: markers/lights, selection, links, pivot, UI. */
  private afterChange(rebuildKeys: SelKey[] = []): void {
    const doc = this.doc;
    if (!doc) return;
    for (const k of rebuildKeys) {
      const r = resolve(doc.course, k);
      if (r?.kind === 'piece') {
        this.view.rebuildPiece(doc.course, r.index);
        this.view.setPieceVisible(r.index, this.isVisible(r.index));
      }
    }
    if (rebuildKeys.some((k) => !k.startsWith('p:'))) {
      this.view.rebuildMarkers(doc.course);
      this.game.lights.set(courseLights(doc.course));
    }
    this.view.setKillY(doc.course.killY);
    this.view.updateSelection(doc.course, doc.selection);
    this.refreshLinks();
    this.placePivot();
    this.updateToolbar();
  }

  private refreshLinks(): void {
    const doc = this.doc;
    if (!doc) return;
    this.linkViews = this.caps ? evaluateLinks(doc.course, this.caps, movement) : [];
    const ids = new Set<string>();
    for (const k of doc.selection) {
      const r = resolve(doc.course, k);
      if (r?.kind === 'piece' && r.piece.id) ids.add(r.piece.id);
    }
    this.view.updateLinks(this.linkViews, this.caps, ids);
    this.buildLinksPanel();
  }

  // ------------------------------------------------------------- selection

  private select(keys: SelKey[], mode: 'set' | 'toggle' | 'add' = 'set'): void {
    const doc = this.doc;
    if (!doc) return;
    if (mode === 'set') doc.selection = [...keys];
    else {
      for (const k of keys) {
        const i = doc.selection.indexOf(k);
        if (i >= 0 && mode === 'toggle') doc.selection.splice(i, 1);
        else if (i < 0) doc.selection.push(k);
      }
    }
    this.view.updateSelection(doc.course, doc.selection);
    this.refreshLinks();
    this.placePivot();
    this.buildInspector();
    this.highlightOutliner();
    const one = doc.selection.length === 1 ? keyPos(doc.course, doc.selection[0]) : null;
    this.view.setGrid(one ? one[1] : null, one?.[0], one?.[2]);
  }

  private selectionCenter(): THREE.Vector3 {
    const doc = this.doc!;
    const c = new THREE.Vector3();
    let n = 0;
    for (const k of doc.selection) {
      const p = keyPos(doc.course, k);
      if (p) {
        c.add(new THREE.Vector3(...p));
        n++;
      }
    }
    return n ? c.divideScalar(n) : c;
  }

  private placePivot(): void {
    const doc = this.doc;
    if (!doc || this.gizmo.dragging) return;
    const sel = doc.selection;
    const singlePiece = sel.length === 1 && sel[0].startsWith('p:');
    const scalable = singlePiece && this.mode === 'scale';
    const rotatable = this.mode !== 'rotate' || sel.some((k) => keyYaw(doc.course, k) !== null);
    if (sel.length === 0 || (this.mode === 'scale' && !scalable) || !rotatable) {
      this.gizmo.detach();
      return;
    }
    this.pivot.position.copy(this.selectionCenter());
    const yaw = sel.length === 1 ? keyYaw(doc.course, sel[0]) ?? 0 : 0;
    this.pivot.rotation.set(0, (yaw * Math.PI) / 180, 0);
    this.pivot.scale.set(1, 1, 1);
    if (!this.pivot.parent) this.game.scene.add(this.pivot);
    this.pivot.updateMatrixWorld();
    this.gizmo.attach(this.pivot);
    this.applyGizmoMode();
  }

  private applyGizmoMode(): void {
    const g = this.gizmo;
    g.setMode(this.mode);
    g.setSpace(this.mode === 'translate' ? 'world' : 'local');
    g.showX = this.mode !== 'rotate';
    g.showZ = this.mode !== 'rotate';
    g.showY = true;
    g.setTranslationSnap(this.snap > 0 ? this.snap : null);
    g.setRotationSnap(THREE.MathUtils.degToRad(15));
    g.setScaleSnap(null);
  }

  private setMode(m: GizmoMode): void {
    this.mode = m;
    this.placePivot();
    this.updateToolbar();
  }

  // ------------------------------------------------------------- gizmo drag

  private onGizmoStart(): void {
    const doc = this.doc;
    if (!doc) return;
    doc.begin();
    this.pivotStart.pos.copy(this.pivot.position);
    this.pivotStart.yaw = yawOf(this.pivot);
    this.dragStart = doc.selection.map((key) => {
      const r = resolve(doc.course, key);
      const p = keyPos(doc.course, key)!;
      return {
        key,
        pos: new THREE.Vector3(...p),
        yaw: keyYaw(doc.course, key),
        size: r?.kind === 'piece' ? ([...pieceSize(r.piece)] as [number, number, number]) : null,
      };
    });
  }

  private onGizmoChange(): void {
    const doc = this.doc;
    if (!doc || !this.gizmo.dragging) return;
    const dPos = this.pivot.position.clone().sub(this.pivotStart.pos);
    const dYaw = yawOf(this.pivot) - this.pivotStart.yaw;
    const markerKeys: SelKey[] = [];
    for (const s of this.dragStart) {
      const r = resolve(doc.course, s.key);
      if (!r) continue;
      if (this.mode === 'scale' && r.kind === 'piece' && s.size) {
        const k = this.pivot.scale;
        const q = (v: number) => Math.max(0.1, this.snap > 0 ? Math.round(v / this.snap) * this.snap : Math.round(v * 100) / 100);
        r.piece.size = [q(s.size[0] * Math.abs(k.x)), q(s.size[1] * Math.abs(k.y)), q(s.size[2] * Math.abs(k.z))];
        this.view.rebuildPiece(doc.course, r.index);
        continue;
      }
      let pos = s.pos.clone();
      let yaw = s.yaw;
      if (this.mode === 'translate') pos.add(dPos);
      else if (this.mode === 'rotate') {
        const off = pos.clone().sub(this.pivotStart.pos).applyAxisAngle(new THREE.Vector3(0, 1, 0), dYaw);
        pos = this.pivotStart.pos.clone().add(off);
        if (yaw !== null) yaw = yaw + THREE.MathUtils.radToDeg(dYaw);
      }
      setKeyTransform(doc.course, s.key, [pos.x, pos.y, pos.z], yaw);
      if (r.kind === 'piece') {
        // Preview: transform the existing world-space geometry instead of rebuilding.
        const newYaw = THREE.MathUtils.degToRad(r.piece.rot ?? 0);
        const oldYaw = THREE.MathUtils.degToRad(s.yaw ?? 0);
        const m = new THREE.Matrix4()
          .makeTranslation(r.piece.pos[0], r.piece.pos[1], r.piece.pos[2])
          .multiply(new THREE.Matrix4().makeRotationY(newYaw - oldYaw))
          .multiply(new THREE.Matrix4().makeTranslation(-s.pos.x, -s.pos.y, -s.pos.z));
        this.view.setPieceMatrix(r.index, m);
      } else markerKeys.push(s.key);
    }
    if (markerKeys.length) this.view.rebuildMarkers(doc.course);
    this.view.updateSelection(doc.course, doc.selection);
    doc.touch();
    this.refreshInspector?.();
  }

  private onGizmoEnd(): void {
    const doc = this.doc;
    if (!doc) return;
    for (const s of this.dragStart) {
      const r = resolve(doc.course, s.key);
      if (r?.kind === 'piece') this.view.setPieceMatrix(r.index, null);
    }
    const keys = this.dragStart.map((s) => s.key);
    this.dragStart = [];
    doc.end();
    this.afterChange(keys);
    this.refreshInspector?.();
  }

  // ------------------------------------------------------------- pointer

  private ndc(e: { clientX: number; clientY: number }): THREE.Vector2 {
    const r = this.game.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.active) return;
    if (e.button === 2) {
      this.looking = true;
      this.gizmo.enabled = false;
      this.game.input.yaw = this.camYaw;
      this.game.input.pitch = this.camPitch;
      this.game.input.requestLock();
      return;
    }
    if (e.button !== 0) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (this.gizmo.dragging || this.gizmo.axis !== null) return;
    this.mouseDown = { x: e.clientX, y: e.clientY, shift: e.shiftKey || e.ctrlKey || e.metaKey };
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.active) return;
    if (this.looking && !this.game.input.locked) {
      // Fallback when pointer lock is unavailable: rotate while the button is held.
      this.camYaw -= e.movementX * this.game.input.sensitivity;
      this.camPitch = Math.max(-1.55, Math.min(1.55, this.camPitch - e.movementY * this.game.input.sensitivity));
    }
    const m = this.mouseDown;
    if (m && this.dom && Math.hypot(e.clientX - m.x, e.clientY - m.y) > 5) {
      const s = this.dom.marquee.style;
      s.display = 'block';
      s.left = `${Math.min(m.x, e.clientX)}px`;
      s.top = `${Math.min(m.y, e.clientY)}px`;
      s.width = `${Math.abs(e.clientX - m.x)}px`;
      s.height = `${Math.abs(e.clientY - m.y)}px`;
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.active) return;
    if (e.button === 2 && this.looking) {
      this.looking = false;
      this.gizmo.enabled = true;
      this.game.input.releaseLock();
      return;
    }
    const m = this.mouseDown;
    this.mouseDown = null;
    if (!m || e.button !== 0 || !this.doc) return;
    const boxSelect = this.dom && this.dom.marquee.style.display === 'block';
    if (this.dom) this.dom.marquee.style.display = 'none';
    if (boxSelect) {
      const a = this.ndc({ clientX: m.x, clientY: m.y });
      const b = this.ndc(e);
      const keys = keysInRect(this.doc.course, this.game.camera, a.x, a.y, b.x, b.y, this.isVisible);
      this.select(keys, m.shift ? 'add' : 'set');
      return;
    }
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.ndc(e), this.game.camera);
    const hit = pickRay(this.doc.course, ray.ray, this.isVisible);
    if (hit) this.select([hit.key], m.shift ? 'toggle' : 'set');
    else if (!m.shift) this.select([]);
  }

  // --------------------------------------------------------------- keys

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'F2') {
      e.preventDefault();
      if (this.playing) return;
      if (this.active) this.close();
      else this.open();
      return;
    }
    if (e.code === 'F5' && (this.active || this.playing)) {
      e.preventDefault();
      e.stopPropagation();
      if (this.playing) this.stopPlaying();
      else this.play(e.shiftKey);
      return;
    }
    if (!this.active || isTyping() || !this.doc) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const doc = this.doc;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (ctrl && e.code === 'KeyS') {
      handled();
      void this.save();
    } else if (ctrl && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
      handled();
      doc.redo();
      this.buildInspector();
    } else if (ctrl && e.code === 'KeyZ') {
      handled();
      doc.undo();
      this.buildInspector();
    } else if (ctrl && e.code === 'KeyD') {
      handled();
      this.duplicateSelection();
    } else if (ctrl && e.code === 'KeyA') {
      handled();
      this.select([...doc.course.pieces.map((_, i) => `p:${i}`), ...doc.course.checkpoints.map((_, i) => `cp:${i}`), 'start', 'finish']);
    } else if (e.code === 'Delete' || e.code === 'Backspace') {
      handled();
      this.deleteSelection();
    } else if (e.code === 'Escape') {
      handled();
      this.select([]);
    } else if (!ctrl && e.code === 'Digit1') this.setMode('translate');
    else if (!ctrl && e.code === 'Digit2') this.setMode('rotate');
    else if (!ctrl && e.code === 'Digit3') this.setMode('scale');
    else if (!ctrl && e.code === 'KeyF') this.focusSelection();
  }

  // ------------------------------------------------------------- editing

  private duplicateSelection(): void {
    const doc = this.doc!;
    if (!doc.selection.length) return;
    let keys: SelKey[] = [];
    const step = Math.max(1, this.snap * 4);
    doc.change((c) => (keys = duplicate(c, doc.selection, [step, 0, 0])), true);
    this.select(keys);
    this.flash(`Duplicated ${keys.length}`);
  }

  private deleteSelection(): void {
    const doc = this.doc!;
    const n = doc.selection.filter((k) => k !== 'start' && k !== 'finish').length;
    if (!n) return;
    doc.change((c) => deleteKeys(c, doc.selection), true);
    this.select([]);
    this.flash(`Deleted ${n}`);
  }

  /** Add a piece where the camera is looking. */
  private addPiece(type: PieceType): void {
    const doc = this.doc!;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), this.game.camera);
    const hit = pickRay(doc.course, ray.ray, this.isVisible);
    const size = DEFAULT_SIZES[type];
    const at = hit && hit.distance < 80 ? hit.point : this.camPos.clone().addScaledVector(ray.ray.direction, 12);
    const s = this.snap || 0.25;
    const q = (v: number) => Math.round(v / s) * s;
    const sel = doc.selection.map((k) => resolve(doc.course, k)).find((r) => r?.kind === 'piece');
    const piece: Piece = {
      id: uniqueId(doc.course, type),
      type,
      pos: [q(at.x), q(hit ? at.y : at.y - size[1] / 2), q(at.z)],
      size: [...size],
      group: sel?.kind === 'piece' ? sel.piece.group : 'New',
    };
    doc.change((c) => c.pieces.push(piece), true);
    this.select([`p:${doc.course.pieces.length - 1}`]);
    this.setMode('translate');
  }

  private addCheckpoint(): void {
    const doc = this.doc!;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), this.game.camera);
    const hit = pickRay(doc.course, ray.ray);
    const at = hit ? hit.point : this.camPos.clone().addScaledVector(ray.ray.direction, 10);
    doc.change((c) => c.checkpoints.push({ pos: [Math.round(at.x * 4) / 4, Math.round(at.y * 4) / 4, Math.round(at.z * 4) / 4], yaw: 0 }), true);
    this.select([`cp:${doc.course.checkpoints.length - 1}`]);
  }

  private linkSelection(): void {
    const doc = this.doc!;
    const pieces = doc.selection.map((k) => resolve(doc.course, k)).filter((r): r is Extract<NonNullable<ReturnType<typeof resolve>>, { kind: 'piece' }> => r?.kind === 'piece');
    if (pieces.length < 2) {
      this.flash('Select the take-off piece, then the landing piece (and a wall for wall runs)');
      return;
    }
    doc.change((c) => {
      const link: JumpLink = { from: ensureId(c, pieces[0].index), to: ensureId(c, pieces[1].index), move: this.newLink.move };
      if (pieces[2]) link.via = ensureId(c, pieces[2].index);
      if (this.newLink.route === 'shortcut') link.route = 'shortcut';
      c.jumpLinks.push(link);
    });
    this.afterChange();
    this.buildOutliner();
  }

  // ------------------------------------------------------------- saving

  private async save(): Promise<void> {
    const doc = this.doc;
    if (!doc) return;
    try {
      const res = await fetch('/__editor/save-course', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: doc.course.id, content: doc.text() }),
      });
      const body = (await res.json()) as { ok: boolean; msg: string };
      if (!body.ok) throw new Error(body.msg);
      doc.markSaved();
      this.flash(`Saved src/levels/courses/${doc.course.id}.json`);
    } catch (err) {
      this.flash(`Save failed: ${String(err)}`);
    }
  }

  private async setCampaign(include: boolean): Promise<void> {
    const id = this.doc!.course.id;
    const ids = COURSES.map((c) => c.id).filter((x) => x !== id);
    if (include) ids.push(id);
    const res = await fetch('/__editor/save-campaign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) });
    const body = (await res.json()) as { ok: boolean; msg: string };
    this.flash(body.ok ? (include ? 'Added to the campaign (last)' : 'Removed from the campaign') : `Failed: ${body.msg}`);
  }

  private switchCourse(id: string): void {
    if (this.doc?.dirty && !confirm('Discard unsaved changes to this course?')) {
      this.updateToolbar();
      return;
    }
    const c = courseById(id);
    if (!c) return;
    this.setDoc(new EditorDoc(c));
    this.frameCourse();
    this.applyEditorLook();
    this.rebuildAll();
    this.select([]);
  }

  private async newCourse(): Promise<void> {
    const id = prompt('New course id (lowercase letters, digits, - or _):', 'draft')?.trim();
    if (!id) return;
    if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(id)) return void this.flash('Invalid id');
    if (courseById(id)) return void this.flash(`A course called "${id}" already exists`);
    if (this.doc?.dirty && !confirm('Discard unsaved changes to the current course?')) return;
    const name = prompt('Course name:', 'Untitled') ?? 'Untitled';
    this.setDoc(new EditorDoc(newCourseTemplate(id, name)));
    this.doc!.touch(); // unsaved until written
    await this.save();
    this.frameCourse();
    this.applyEditorLook();
    this.rebuildAll();
    this.select([]);
  }

  /** A course file changed on disk (our own save, or an external edit). */
  private onHotUpdate(c: CourseData): void {
    const doc = this.doc;
    if (!doc || c.id !== doc.course.id) {
      if (this.active) this.updateToolbar();
      return;
    }
    if (JSON.stringify(c) === JSON.stringify(doc.course)) return;
    if (doc.dirty) {
      this.flash('The course file changed on disk; you have unsaved edits (save to overwrite)');
      return;
    }
    doc.reset(c);
    this.flash('Reloaded the course from disk');
  }

  // ------------------------------------------------------------------- UI

  private flash(msg: string): void {
    this.message = msg;
    this.messageTimer = 4;
    this.updateStatus();
  }

  private buildDom(): void {
    this.dom = createEditorDom();
    this.buildPalette();
    this.updateToolbar();
  }

  private updateToolbar(): void {
    const dom = this.dom;
    const doc = this.doc;
    if (!dom || !doc) return;
    const t = dom.toolbar;
    t.innerHTML = '';
    t.append(el('span', 'ed-title', 'EDITOR'));
    const sel = el('select');
    for (const c of allCourses().concat(courseById(doc.course.id) ? [] : [doc.course])) {
      const o = el('option', undefined, `${c.name} (${c.id})${isCampaign(c.id) ? '' : ' · draft'}`);
      o.value = c.id;
      o.selected = c.id === doc.course.id;
      sel.append(o);
    }
    sel.addEventListener('change', () => this.switchCourse(sel.value));
    t.append(sel, button('New course', 'Create a course from the template', () => void this.newCourse()));
    const save = button('Save', 'Ctrl+S', () => void this.save());
    t.append(save);
    if (doc.dirty) t.append(el('span', 'ed-dirty', '● unsaved'));
    t.append(el('span', 'ed-sep'));
    const undo = button('Undo', 'Ctrl+Z', () => doc.undo());
    undo.disabled = !doc.canUndo;
    const redo = button('Redo', 'Ctrl+Y / Ctrl+Shift+Z', () => doc.redo());
    redo.disabled = !doc.canRedo;
    t.append(undo, redo, el('span', 'ed-sep'));
    for (const [m, label, key] of [['translate', 'Move', '1'], ['rotate', 'Rotate', '2'], ['scale', 'Scale', '3']] as const) {
      const b = button(`${label} ${key}`, `${label} (${key})`, () => this.setMode(m));
      if (this.mode === m) b.classList.add('ed-on');
      t.append(b);
    }
    const snap = el('select');
    snap.title = 'Grid snap';
    for (const s of SNAPS) {
      const o = el('option', undefined, s ? `snap ${s} m` : 'no snap');
      o.value = String(s);
      o.selected = s === this.snap;
      snap.append(o);
    }
    snap.addEventListener('change', () => {
      this.snap = Number(snap.value);
      this.applyGizmoMode();
    });
    t.append(snap, el('span', 'ed-sep'));
    const fog = button('Fog', 'Preview the course fog', () => {
      this.fog = !this.fog;
      this.applyEditorLook();
      this.updateToolbar();
    });
    if (this.fog) fog.classList.add('ed-on');
    const psxB = button('PSX', 'Preview the real 240p PSX look', () => {
      this.psxPreview = !this.psxPreview;
      this.applyEditorLook();
      this.updateToolbar();
    });
    if (this.psxPreview) psxB.classList.add('ed-on');
    t.append(fog, psxB, el('span', 'ed-sep'));
    t.append(
      button('▶ Play F5', 'Play from the course start (F5 again to come back)', () => this.play(false)),
      button('▶ From camera ⇧F5', 'Play from the camera position', () => this.play(true)),
      button('Exit F2', 'Back to the game', () => this.close()),
    );
  }

  private buildPalette(): void {
    const p = this.dom!.palette;
    p.innerHTML = '';
    for (const t of PIECE_TYPES) p.append(button(t, `Add a ${t} where you are looking`, () => this.addPiece(t)));
    p.append(button('lantern ✦', 'Add a checkpoint lantern', () => this.addCheckpoint()));
  }

  private buildOutliner(): void {
    const dom = this.dom;
    const doc = this.doc;
    if (!dom || !doc) return;
    const o = dom.outliner;
    o.innerHTML = '';
    const row = (key: SelKey, label: string, type = '') => {
      const r = el('div', 'ed-row', label);
      if (type) r.append(el('span', 'ed-t', type));
      r.dataset.key = key;
      r.addEventListener('click', (e) => this.select([key], e.shiftKey || e.ctrlKey || e.metaKey ? 'toggle' : 'set'));
      r.addEventListener('dblclick', () => this.focusSelection());
      return r;
    };
    const group = (name: string, rows: HTMLElement[], hideable = true) => {
      const collapsed = this.outlinerCollapsed.has(name);
      const hidden = this.hiddenGroups.has(name);
      const g = el('div', 'ed-grp', `${collapsed ? '▸' : '▾'} ${name} (${rows.length})`);
      if (hidden) g.style.opacity = '0.45';
      g.addEventListener('click', () => {
        if (collapsed) this.outlinerCollapsed.delete(name);
        else this.outlinerCollapsed.add(name);
        this.buildOutliner();
      });
      if (hideable) {
        const eye = button(hidden ? 'show' : 'hide', 'Hide/show this group in the viewport (editor only)', () => {
          if (hidden) this.hiddenGroups.delete(name);
          else this.hiddenGroups.add(name);
          this.applyVisibility();
          this.buildOutliner();
        });
        eye.className = 'ed-eye';
        g.prepend(eye);
      }
      o.append(g);
      if (!collapsed) o.append(...rows);
    };
    group('Markers', [
      row('start', 'Start'),
      row('finish', 'Bell (finish)'),
      ...doc.course.checkpoints.map((_, i) => row(`cp:${i}`, `Lantern ${i + 1}`)),
    ], false);
    const groups = new Map<string, HTMLElement[]>();
    doc.course.pieces.forEach((p, i) => {
      const g = p.group ?? 'Ungrouped';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(row(`p:${i}`, p.id ?? `#${i}`, p.type + (p.repeat ? ` ×${p.repeat.count}` : '')));
    });
    for (const [name, rows] of groups) group(name, rows);
    this.highlightOutliner();
  }

  private highlightOutliner(): void {
    const sel = new Set(this.doc?.selection ?? []);
    this.dom?.outliner.querySelectorAll<HTMLElement>('.ed-row').forEach((r) => r.classList.toggle('ed-sel', sel.has(r.dataset.key ?? '')));
  }

  private buildLinksPanel(): void {
    const dom = this.dom;
    const doc = this.doc;
    if (!dom || !doc) return;
    const p = dom.links;
    p.innerHTML = '';
    const bad = this.linkViews.filter((v) => !v.check.ok).length;
    p.append(el('h4', undefined, `Jump links (${doc.course.jumpLinks.length}${this.caps ? `, ${bad} failing` : ', measuring…'})`));
    doc.course.jumpLinks.forEach((l, i) => {
      const v = this.linkViews[i];
      const r = el('div', 'ed-lrow');
      const ok = v ? (v.check.ok ? (l.route === 'shortcut' ? 'ed-sc' : 'ed-ok') : 'ed-bad') : '';
      r.append(el('span', ok, v ? (v.check.ok ? '●' : '✖') : '○'));
      const txt = el('span', 'ed-txt', `${l.from} → ${l.to} · ${l.move}${l.via ? ` via ${l.via}` : ''}${l.route === 'shortcut' ? ' · shortcut' : ''}`);
      txt.title = v?.check.detail ?? '';
      r.append(txt);
      r.append(button('×', 'Delete this link', () => {
        doc.change((c) => c.jumpLinks.splice(i, 1));
        this.afterChange();
      }));
      r.addEventListener('click', () => {
        const keys: SelKey[] = [];
        for (const id of [l.from, l.to, l.via]) {
          const idx = doc.course.pieces.findIndex((pc) => pc.id === id);
          if (id && idx >= 0) keys.push(`p:${idx}`);
        }
        this.select(keys);
        this.flash(v?.check.detail ?? '');
      });
      p.append(r);
    });
    const add = el('div', 'ed-add');
    const move = el('select');
    for (const m of MOVES) {
      const o = el('option', undefined, m);
      o.selected = m === this.newLink.move;
      move.append(o);
    }
    move.addEventListener('change', () => (this.newLink.move = move.value as MoveType));
    const route = el('select');
    for (const r of ['safe', 'shortcut'] as const) {
      const o = el('option', undefined, r);
      o.selected = r === this.newLink.route;
      route.append(o);
    }
    route.addEventListener('change', () => (this.newLink.route = route.value as 'safe' | 'shortcut'));
    add.append(move, route, button('Link selected', 'Selection order: take-off, landing, [wall for wall runs]', () => this.linkSelection()));
    p.append(add);
  }

  private updateStatus(): void {
    const dom = this.dom;
    const doc = this.doc;
    if (!dom || !doc) return;
    const bad = this.linkViews.filter((v) => !v.check.ok).length;
    const p = this.camPos;
    const parts = [
      `${doc.course.pieces.length} pieces`,
      `${doc.selection.length} selected`,
      this.caps ? `links ${doc.course.jumpLinks.length - bad} ok / ${bad} failing` : 'links: measuring…',
      `camera ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`,
      `fly ${this.flySpeed.toFixed(0)} m/s`,
    ];
    const text = parts.join(' · ') + '\u0000' + this.message;
    if (dom.status.dataset.text === text) return;
    dom.status.dataset.text = text;
    dom.status.innerHTML = '';
    for (const s of parts) dom.status.append(el('span', undefined, s));
    if (this.message) dom.status.append(el('span', 'ed-msg', this.message));
  }

  // ------------------------------------------------------------ inspector

  private buildInspector(): void {
    const dom = this.dom;
    const doc = this.doc;
    if (!dom || !doc) return;
    this.gui?.destroy();
    this.refreshInspector = null;
    const gui = new GUI({ container: dom.inspector, autoPlace: false, width: 280 });
    this.gui = gui;
    const sel = doc.selection;
    /** Wrap a live edit: one undo step per slider drag / text entry. */
    const edit = (keys: SelKey[], fn: () => void, structural = false) => {
      doc.begin();
      fn();
      doc.touch(structural);
      this.afterChange(keys);
    };
    const commit = () => {
      doc.end();
      this.updateToolbar();
    };

    if (sel.length === 0) {
      this.courseInspector(gui, edit, commit);
    } else if (sel.length === 1) {
      const r = resolve(doc.course, sel[0]);
      if (!r) return;
      if (r.kind === 'piece') this.pieceInspector(gui, r.index, edit, commit);
      else this.markerInspector(gui, sel[0], edit, commit);
    } else {
      this.multiInspector(gui, edit, commit);
    }
  }

  private courseInspector(gui: GUI, edit: (k: SelKey[], fn: () => void) => void, commit: () => void): void {
    const c = this.doc!.course;
    gui.title(`Course · ${c.id}`);
    const o = {
      name: c.name,
      flavor: c.flavor,
      atmosphere: c.atmosphere,
      killY: c.killY,
      bronze: c.medals.bronze,
      silver: c.medals.silver,
      gold: c.medals.gold,
      droneHz: c.droneHz ?? 55,
      backdrop: !!c.backdrop,
      seed: c.backdrop?.seed ?? 1,
      count: c.backdrop?.count ?? 12,
      radius: c.backdrop?.radius ?? 140,
      height: c.backdrop?.height ?? 60,
      campaign: isCampaign(c.id),
    };
    gui.add(o, 'name').onChange((v: string) => edit([], () => (c.name = v))).onFinishChange(commit);
    gui.add(o, 'flavor').onChange((v: string) => edit([], () => (c.flavor = v))).onFinishChange(commit);
    gui.add(o, 'atmosphere', Object.keys(ATMOSPHERES)).onChange((v: AtmospherePreset) => {
      edit([], () => (c.atmosphere = v));
      commit();
      this.applyEditorLook();
    });
    gui.add(o, 'killY', -200, 200, 0.5).name('kill height').onChange((v: number) => edit([], () => (c.killY = v))).onFinishChange(commit);
    const m = gui.addFolder('Medal times (s)');
    for (const k of ['gold', 'silver', 'bronze'] as const) {
      m.add(o, k, 1, 600, 0.5).onChange((v: number) => edit([], () => (c.medals[k] = v))).onFinishChange(commit);
    }
    gui.add(o, 'droneHz', 20, 120, 0.1).name('drone (Hz)').onChange((v: number) => edit([], () => (c.droneHz = v))).onFinishChange(commit);
    const b = gui.addFolder('Distant backdrop');
    const setBackdrop = () => {
      edit([], () => (c.backdrop = o.backdrop ? { seed: o.seed, count: o.count, radius: o.radius, height: o.height } : undefined));
      commit();
      this.view.rebuildBackdrop(c);
    };
    b.add(o, 'backdrop').name('enabled').onChange(setBackdrop);
    b.add(o, 'seed', 0, 999, 1).onFinishChange(setBackdrop);
    b.add(o, 'count', 0, 40, 1).onFinishChange(setBackdrop);
    b.add(o, 'radius', 40, 400, 1).onFinishChange(setBackdrop);
    b.add(o, 'height', 10, 200, 1).onFinishChange(setBackdrop);
    b.close();
    gui.add(o, 'campaign').name('in campaign').onChange((v: boolean) => void this.setCampaign(v));
  }

  private pieceInspector(gui: GUI, index: number, edit: (k: SelKey[], fn: () => void, s?: boolean) => void, commit: () => void): void {
    const doc = this.doc!;
    const key = `p:${index}`;
    const piece = () => doc.course.pieces[index];
    const p = piece();
    gui.title(`Piece · ${p.id ?? `#${index}`}`);
    const [w, h, d] = pieceSize(p);
    const o = {
      id: p.id ?? '',
      type: p.type,
      x: p.pos[0], y: p.pos[1], z: p.pos[2],
      w, h, d,
      rot: p.rot ?? 0,
      mat: p.mat ?? '(default)',
      group: p.group ?? '',
      repeat: p.repeat?.count ?? 1,
      sx: p.repeat?.step[0] ?? 0, sy: p.repeat?.step[1] ?? 0, sz: p.repeat?.step[2] ?? 0,
    };
    gui.add(o, 'id').onFinishChange((v: string) => {
      edit([], () => renamePiece(doc.course, index, v));
      commit();
      this.buildOutliner();
    });
    gui.add(o, 'type', PIECE_TYPES).onChange((v: PieceType) => {
      edit([key], () => (piece().type = v));
      commit();
      this.buildOutliner();
    });
    gui.add(o, 'group').onFinishChange((v: string) => {
      edit([], () => (v ? (piece().group = v) : delete piece().group));
      commit();
      this.buildOutliner();
    });
    const pos = gui.addFolder('Position (bottom centre)');
    const posCtl = (['x', 'y', 'z'] as const).map((axis, i) =>
      pos.add(o, axis, -1000, 1000, 0.05).onChange((v: number) => edit([key], () => {
        const pp = [...piece().pos] as [number, number, number];
        pp[i] = v;
        piece().pos = pp;
      })).onFinishChange(commit),
    );
    const size = gui.addFolder('Size');
    const sizeCtl = (['w', 'h', 'd'] as const).map((axis, i) =>
      size.add(o, axis, 0.05, 400, 0.05).name(['width (x)', 'height (y)', 'depth (z)'][i]).onChange((v: number) => edit([key], () => {
        const s = [...pieceSize(piece())] as [number, number, number];
        s[i] = v;
        piece().size = s;
      })).onFinishChange(commit),
    );
    const rotCtl = gui.add(o, 'rot', -180, 180, 1).name('yaw (°)').onChange((v: number) => edit([key], () => setKeyTransform(doc.course, key, piece().pos, v))).onFinishChange(commit);
    gui.add(o, 'mat', MATS).name('material').onChange((v: string) => {
      edit([key], () => (v === '(default)' ? delete piece().mat : (piece().mat = v as MaterialName)));
      commit();
    });
    const tags = gui.addFolder('Tags');
    for (const t of TAGS) {
      const to = { [t]: !!p.tags?.includes(t) };
      tags.add(to, t).onChange((v: boolean) => {
        edit([key], () => {
          const cur = new Set(piece().tags ?? []);
          if (v) cur.add(t);
          else cur.delete(t);
          if (cur.size) piece().tags = [...cur];
          else delete piece().tags;
        });
        commit();
      });
    }
    const rep = gui.addFolder('Repeat');
    const setRepeat = () => {
      edit([key], () => {
        if (o.repeat > 1) piece().repeat = { count: Math.round(o.repeat), step: [o.sx, o.sy, o.sz] };
        else delete piece().repeat;
      });
    };
    rep.add(o, 'repeat', 1, 50, 1).name('copies').onChange(setRepeat).onFinishChange(commit);
    rep.add(o, 'sx', -100, 100, 0.25).name('step x').onChange(setRepeat).onFinishChange(commit);
    rep.add(o, 'sy', -100, 100, 0.25).name('step y').onChange(setRepeat).onFinishChange(commit);
    rep.add(o, 'sz', -100, 100, 0.25).name('step z').onChange(setRepeat).onFinishChange(commit);
    if (!p.repeat) rep.close();
    gui.add({ dup: () => this.duplicateSelection() }, 'dup').name('Duplicate (Ctrl+D)');
    gui.add({ del: () => this.deleteSelection() }, 'del').name('Delete (Del)');
    this.refreshInspector = () => {
      const q = piece();
      if (!q) return;
      const s = pieceSize(q);
      [o.x, o.y, o.z] = q.pos;
      [o.w, o.h, o.d] = s;
      o.rot = q.rot ?? 0;
      for (const c of [...posCtl, ...sizeCtl, rotCtl]) c.updateDisplay();
    };
  }

  private markerInspector(gui: GUI, key: SelKey, edit: (k: SelKey[], fn: () => void) => void, commit: () => void): void {
    const doc = this.doc!;
    const r = resolve(doc.course, key)!;
    gui.title(r.kind === 'start' ? 'Start' : r.kind === 'finish' ? 'Bell (finish)' : `Lantern ${(r as { index: number }).index + 1}`);
    const p = keyPos(doc.course, key)!;
    const yaw = keyYaw(doc.course, key);
    const o = { x: p[0], y: p[1], z: p[2], yaw: yaw ?? 0 };
    const set = () => edit([key], () => setKeyTransform(doc.course, key, [o.x, o.y, o.z], yaw === null ? null : o.yaw));
    const ctl = (['x', 'y', 'z'] as const).map((a) => gui.add(o, a, -1000, 1000, 0.05).onChange(set).onFinishChange(commit));
    if (yaw !== null) ctl.push(gui.add(o, 'yaw', -180, 180, 1).name('facing (°)').onChange(set).onFinishChange(commit));
    if (r.kind === 'checkpoint') gui.add({ del: () => this.deleteSelection() }, 'del').name('Delete lantern');
    this.refreshInspector = () => {
      const q = keyPos(doc.course, key);
      if (!q) return;
      [o.x, o.y, o.z] = q;
      o.yaw = keyYaw(doc.course, key) ?? 0;
      for (const c of ctl) c.updateDisplay();
    };
  }

  private multiInspector(gui: GUI, edit: (k: SelKey[], fn: () => void) => void, commit: () => void): void {
    const doc = this.doc!;
    const keys = doc.selection;
    const pieces = keys.map((k) => resolve(doc.course, k)).filter((r) => r?.kind === 'piece').map((r) => (r as { piece: Piece }).piece);
    gui.title(`${keys.length} selected (${pieces.length} pieces)`);
    if (pieces.length) {
      const groups = new Set(pieces.map((p) => p.group ?? ''));
      const o = { group: groups.size === 1 ? [...groups][0] : '' };
      gui.add(o, 'group').name('set group').onFinishChange((v: string) => {
        edit([], () => pieces.forEach((p) => (v ? (p.group = v) : delete p.group)));
        commit();
        this.buildOutliner();
      });
      const tags = gui.addFolder('Tags (all selected)');
      for (const t of TAGS) {
        const to = { [t]: pieces.every((p) => p.tags?.includes(t)) };
        tags.add(to, t).onChange((v: boolean) => {
          edit(keys, () =>
            pieces.forEach((p) => {
              const cur = new Set(p.tags ?? []);
              if (v) cur.add(t);
              else cur.delete(t);
              if (cur.size) p.tags = [...cur];
              else delete p.tags;
            }),
          );
          commit();
        });
      }
      const mo = { mat: '(mixed)' };
      gui.add(mo, 'mat', ['(mixed)', ...MATS]).name('material').onChange((v: string) => {
        if (v === '(mixed)') return;
        edit(keys, () => pieces.forEach((p) => (v === '(default)' ? delete p.mat : (p.mat = v as MaterialName))));
        commit();
      });
    }
    gui.add({ dup: () => this.duplicateSelection() }, 'dup').name('Duplicate (Ctrl+D)');
    gui.add({ del: () => this.deleteSelection() }, 'del').name('Delete (Del)');
  }
}

/** Yaw of an object that is only ever rotated about +Y (Euler angles flip past 90°). */
function yawOf(o: THREE.Object3D): number {
  return 2 * Math.atan2(o.quaternion.y, o.quaternion.w);
}

function isTyping(): boolean {
  const a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a as HTMLElement).isContentEditable);
}

/** Wire the editor into the game (dev builds only; see main.ts). */
export function installEditor(game: Game): LevelEditor {
  return new LevelEditor(game);
}
