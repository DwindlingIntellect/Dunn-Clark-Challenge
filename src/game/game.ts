import * as THREE from 'three';
import type GUI from 'lil-gui';
import { FixedLoop, SIM_DT } from '../core/loop';
import { Input } from '../core/input';
import { movement } from '../config/movement';
import { psx } from '../config/render';
import { loadSave, recordTime, writeSave, isUnlocked, type SaveData, type Settings } from '../core/save';
import { CollisionWorld } from '../sim/collision';
import { PlayerController } from '../sim/controller';
import { courseColliders } from '../levels/colliders';
import { COURSES, allCourses, courseById, onCourseHotUpdate } from '../levels/index';
import type { CourseData } from '../levels/types';
import { RunState } from './runState';
import { CameraFeel } from './cameraFeel';
import { colliderWireframe } from '../render/colliderGeometry';
import { buildLevel, LANTERN_LIT, LANTERN_UNLIT, type LevelVisuals } from '../render/levelBuilder';
import { PsxPipeline } from '../render/psxPipeline';
import { Sky } from '../render/sky';
import { ATMOSPHERES } from '../render/atmosphere';
import { applyAtmosphere, PointLights } from '../render/lighting';
import { psxUniforms } from '../render/materials';
import { DebugMenu, type DebugHost } from '../debug/debugMenu';
import { FreeFly } from '../debug/freeFly';
import { Hud } from '../ui/hud';
import { Menus, type MenuActions } from '../ui/menus';
import type { SimEvent } from '../sim/types';

export type GameMode = 'title' | 'playing' | 'paused' | 'results' | 'editor';

/** Something that drives the camera and draws while the game is in 'editor' mode. */
export interface EditorOverlay {
  frame(dt: number): void;
}

/** Base mouse sensitivity in radians per pixel (multiplied by the setting). */
const BASE_SENSITIVITY = 0.0022;

/**
 * Top-level game: owns the renderer, the fixed-step loop, the current
 * course and the game flow (title → run → results). Simulation runs at
 * 120 Hz; rendering interpolates the camera between sim states.
 */
export class Game implements DebugHost, MenuActions {
  readonly input: Input;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 4 / 3, 0.05, 1200);
  readonly pipeline: PsxPipeline;
  readonly sky = new Sky();
  readonly lights = new PointLights();
  readonly feel = new CameraFeel(movement);
  readonly loop: FixedLoop;
  readonly debug: DebugMenu;
  readonly hud: Hud;
  readonly menus: Menus;
  readonly save: SaveData;
  readonly stats = { fps: 0, speed: 0, mode: '', position: '' };
  /** Hook for the audio system (set in main). */
  onSimEvent: ((e: SimEvent, game: Game) => void) | null = null;
  onRunEvent: ((type: 'checkpoint' | 'respawn' | 'finish' | 'restart' | 'start', game: Game) => void) | null = null;
  onCourseLoaded: ((c: CourseData) => void) | null = null;
  /** Per-frame hook (continuous audio). */
  onFrame: ((dt: number, game: Game) => void) | null = null;

  mode: GameMode = 'title';
  /** Set by the dev-only level editor. */
  overlay: EditorOverlay | null = null;
  /** Extra HUD hint shown while play-testing from the editor. */
  playtestHint = '';
  course!: CourseData;
  world!: CollisionWorld;
  player!: PlayerController;
  run!: RunState;
  private visuals: LevelVisuals | null = null;
  private levelRoot = new THREE.Group();
  private wireframe: THREE.LineSegments | null = null;
  private showColliders = false;
  private freeFly: FreeFly | null = null;
  private prevEye = new THREE.Vector3();
  private currEye = new THREE.Vector3();
  private fpsAcc = 0;
  private fpsFrames = 0;
  private time = 0;
  private bellSwing = 0;
  private bellSwingVel = 0;
  private titleT = 0;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.input = new Input(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.pipeline = new PsxPipeline(this.renderer);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.levelRoot);
    this.scene.add(this.sky.mesh);
    this.save = loadSave();
    this.applySettings(this.save.settings);

    this.hud = new Hud(ui);
    this.hud.show(false);
    this.menus = new Menus(ui, this, () => ({ save: this.save, courses: COURSES }));

    canvas.addEventListener('click', () => {
      if (this.mode === 'playing' && !this.debug.open) this.input.requestLock();
    });
    this.input.onLockChange = (locked) => {
      if (!locked && this.mode === 'playing' && !this.debug.open) this.pause();
    };
    this.input.onKey((code) => this.onKey(code));
    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.loop = new FixedLoop({ tick: (dt) => this.tick(dt), render: (a, fdt) => this.render(a, fdt) });
    this.course = COURSES[0] ?? allCourses()[0];
    this.debug = new DebugMenu(this);
    onCourseHotUpdate((c) => {
      if (c.id === this.course.id && this.mode !== 'editor') this.loadCourse(c, true);
    });
  }

  /** True while the run is live and the simulation is advancing. */
  get simRunning(): boolean {
    return this.simActive();
  }

  start(): void {
    this.loadCourse(this.course);
    this.toTitle();
    this.loop.start();
  }

  // ------------------------------------------------------------------ input

  private onKey(code: string): void {
    if (this.mode === 'editor') return;
    if (code === 'Backquote' || code === 'F1') {
      if (this.mode === 'playing' || this.mode === 'paused' || this.debug.open) this.debug.toggle();
      return;
    }
    if (this.debug.open) return;
    if (code === 'KeyR' && (this.mode === 'playing' || this.mode === 'paused' || this.mode === 'results')) {
      this.restart();
    } else if (code === 'Enter' && this.mode === 'results') {
      this.continueAfterResults();
    } else if (code === 'Escape' && this.mode === 'paused' && this.menus.current === 'pause') {
      this.resume();
    }
  }

  // ------------------------------------------------------------- game flow

  toTitle(): void {
    this.mode = 'title';
    this.levelRoot.visible = true;
    this.input.releaseLock();
    this.hud.show(false);
    this.menus.title();
  }

  playCourse(index: number): void {
    const c = COURSES[index];
    if (!c) return;
    if (!isUnlocked(index, COURSES.map((x) => x.id), this.save)) return;
    if (c !== this.course) this.loadCourse(c);
    this.restart();
  }

  /** Instant restart: timer reset, player at the start, no fade. */
  restart(): void {
    this.menus.clear();
    this.mode = 'playing';
    this.hud.show(true);
    this.resetRun();
    this.input.requestLock();
    this.onRunEvent?.('restart', this);
  }

  private resetRun(): void {
    const s = this.course.start;
    this.run.reset();
    this.run.debug = this.debug.open;
    this.updateLanterns();
    this.input.yaw = (s.yaw * Math.PI) / 180;
    this.input.pitch = 0;
    this.feel.reset();
    this.bellSwing = 0;
    this.bellSwingVel = 0;
    this.snapCamera();
    this.loop.resetAccumulator();
  }

  private pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.menus.pause();
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.menus.clear();
    this.mode = 'playing';
    this.loop.resetAccumulator();
    this.input.requestLock();
  }

  quitToTitle(): void {
    this.toTitle();
  }

  continueAfterResults(): void {
    const i = COURSES.indexOf(this.course);
    const next = i + 1;
    if (i >= 0 && next < COURSES.length && isUnlocked(next, COURSES.map((c) => c.id), this.save)) {
      this.playCourse(next);
    } else {
      this.mode = 'title';
      this.hud.show(false);
      this.menus.select(() => this.toTitle());
    }
  }

  settingsChanged(s: Settings): void {
    this.applySettings(s);
    writeSave(this.save);
  }

  private applySettings(s: Settings): void {
    this.input.sensitivity = BASE_SENSITIVITY * s.sensitivity;
    this.onSettings?.(s);
  }

  onSettings: ((s: Settings) => void) | null = null;

  private finish(): void {
    const run = this.run;
    const debugRun = run.debug;
    const newBest = !debugRun && recordTime(this.save, this.course.id, run.time);
    this.mode = 'results';
    this.hud.show(false);
    this.input.releaseLock();
    this.bellSwingVel = 2.6;
    const i = COURSES.indexOf(this.course);
    this.menus.results({
      course: this.course,
      time: run.time,
      best: this.save.best[this.course.id],
      newBest,
      debug: debugRun,
      hasNext: i >= 0 && i + 1 < COURSES.length && isUnlocked(i + 1, COURSES.map((c) => c.id), this.save),
    });
  }

  // ---------------------------------------------------------- level editor

  /** Hand the screen to the editor: no menus, no HUD, no simulation, game level hidden. */
  enterEditorMode(): void {
    this.mode = 'editor';
    if (this.debug.open) this.debug.setOpen(false);
    this.menus.clear();
    this.hud.show(false);
    this.input.releaseLock();
    this.levelRoot.visible = false;
    this.freeFly = null;
  }

  /** Play a course straight from the editor (a debug run, never saved). */
  playtest(course: CourseData, spawn?: { pos: [number, number, number]; yaw: number }): void {
    this.levelRoot.visible = true;
    this.loadCourse(structuredClone(course));
    this.restart();
    this.run.debug = true;
    if (spawn) {
      this.player.reset(spawn.pos, spawn.yaw);
      this.input.yaw = spawn.yaw;
      this.input.pitch = 0;
      this.snapCamera();
    }
  }

  // ------------------------------------------------------------ DebugHost

  courses(): CourseData[] {
    return allCourses();
  }

  currentCourse(): CourseData {
    return this.course;
  }

  selectCourse(id: string): void {
    const c = courseById(id);
    if (!c) return;
    this.loadCourse(c);
    this.menus.clear();
    this.mode = 'playing';
    this.hud.show(true);
    this.resetRun();
    this.run.debug = true;
  }

  teleportToCheckpoint(index: number): void {
    const cp = index < 0 ? this.course.start : this.course.checkpoints[index];
    if (!cp) return;
    this.player.reset(cp.pos, (cp.yaw * Math.PI) / 180);
    this.input.yaw = (cp.yaw * Math.PI) / 180;
    this.input.pitch = 0;
    this.snapCamera();
  }

  setFreeFly(on: boolean): void {
    this.freeFly = on ? new FreeFly() : null;
    this.freeFly?.pos.copy(this.camera.position);
  }

  setColliderView(on: boolean): void {
    this.showColliders = on;
    if (this.wireframe) this.wireframe.visible = on;
  }

  setDebugOpen(open: boolean): void {
    if (open) {
      if (this.run) this.run.debug = true;
      this.input.releaseLock();
    } else {
      if (this.mode === 'playing') this.input.requestLock();
      this.loop.resetAccumulator();
    }
  }

  extendDebug(gui: GUI): void {
    const f = gui.addFolder('PSX Effect');
    f.add(psx, 'enabled').name('Enable PSX effect');
    f.add(psx, 'height', 120, 720, 1).name('Resolution (lines)');
    f.add(psx, 'aspect', ['4:3', 'fill']).name('Aspect');
    f.add(psx, 'vertexSnap', 0, 4, 0.05).name('Vertex snap strength');
    f.add(psx, 'affine').name('Affine textures');
    f.add(psx, 'dither').name('Bayer dither');
    f.add(psx, 'ditherStrength', 0, 3, 0.05).name('Dither strength');
    f.add(psx, 'colorBits', 2, 8, 1).name('Colour depth (bits/ch)');
    f.add(psx, 'vignette', 0, 1.5, 0.01).name('Vignette');
    const fog = { color: '#' + psxUniforms.uFogColor.value.getHexString() };
    f.add(psxUniforms.uFogNear, 'value', 0, 200, 0.5).name('Fog near').listen();
    f.add(psxUniforms.uFogFar, 'value', 5, 600, 1).name('Fog far').listen();
    f.addColor(fog, 'color').name('Fog colour').onChange((v: string) => psxUniforms.uFogColor.value.set(v));
    f.add(psxUniforms.uHeightFogTop, 'value', -60, 80, 0.5).name('Pit fog height').listen();
    f.close();
  }

  // ---------------------------------------------------------------- course

  loadCourse(course: CourseData, keepPlayer = false): void {
    const prev = keepPlayer && this.player ? { pos: this.player.pos.clone(), vel: this.player.vel.clone() } : null;
    const prevRun = keepPlayer ? this.run : null;
    this.course = course;
    this.world?.dispose();
    const descs = courseColliders(course);
    this.world = new CollisionWorld(descs);
    this.player = new PlayerController(this.world, movement);
    this.run = new RunState(course, this.player);

    if (this.visuals) {
      this.levelRoot.remove(this.visuals.root);
      this.visuals.dispose();
    }
    this.levelRoot.clear();
    const atmo = ATMOSPHERES[course.atmosphere];
    applyAtmosphere(atmo);
    this.sky.apply(atmo);
    this.visuals = buildLevel(course);
    this.levelRoot.add(this.visuals.root);
    this.lights.set(this.visuals.lights);
    this.wireframe = colliderWireframe(descs);
    this.wireframe.visible = this.showColliders;
    this.levelRoot.add(this.wireframe);
    this.debug?.buildCourseFolder();
    this.onCourseLoaded?.(course);

    if (prev && prevRun) {
      // Hot reload: keep the run going where the player is.
      this.run.ticks = prevRun.ticks;
      this.run.started = prevRun.started;
      this.run.debug = prevRun.debug;
      this.run.activated = course.checkpoints.map((_, i) => prevRun.activated[i] ?? false);
      this.run.lastCheckpoint = Math.min(prevRun.lastCheckpoint, course.checkpoints.length - 1);
      this.player.reset(prev.pos, this.input.yaw);
      this.player.vel.copy(prev.vel);
      this.updateLanterns();
      this.snapCamera();
    } else {
      this.resetRun();
    }
  }

  private updateLanterns(): void {
    this.visuals?.lanterns.forEach((l, i) => l.glow.uniforms.uTint.value.setHex(this.run.activated[i] ? LANTERN_LIT : LANTERN_UNLIT));
  }

  private snapCamera(): void {
    this.player.eyePosition(this.currEye);
    this.prevEye.copy(this.currEye);
  }

  // ------------------------------------------------------------------ loop

  /** Simulation advances only while actually playing with the mouse captured. */
  private simActive(): boolean {
    return this.mode === 'playing' && !this.debug.open && this.input.locked;
  }

  private tick(dt: number): void {
    if (this.freeFly && this.mode === 'playing' && !this.debug.open) {
      this.freeFly.update(this.input, dt);
      return;
    }
    if (!this.simActive()) return;
    this.prevEye.copy(this.currEye);
    this.run.step(this.input.sample(), dt);
    for (const e of this.player.events) {
      this.feel.onEvent(e);
      this.onSimEvent?.(e, this);
    }
    for (const e of this.run.events) {
      if (e.type === 'checkpoint') {
        this.updateLanterns();
        this.pipeline.flash = 0.3;
        this.hud.flash('Lantern lit');
        this.onRunEvent?.('checkpoint', this);
      } else if (e.type === 'respawn') {
        const r = this.run.respawnPoint();
        this.input.yaw = (r.yaw * Math.PI) / 180;
        this.input.pitch = 0;
        this.feel.reset();
        this.player.eyePosition(this.currEye);
        this.prevEye.copy(this.currEye);
        this.pipeline.flash = 0.2;
        this.pipeline.flashColor.setHex(0x101820);
        this.onRunEvent?.('respawn', this);
      } else if (e.type === 'start') {
        this.onRunEvent?.('start', this);
      } else if (e.type === 'finish') {
        this.onRunEvent?.('finish', this);
        this.finish();
      }
    }
    this.player.eyePosition(this.currEye);
  }

  private render(alpha: number, frameDt: number): void {
    const p = this.player;
    this.time += frameDt;
    if (this.mode === 'editor' && this.overlay) {
      this.overlay.frame(frameDt);
    } else if (this.mode === 'title') {
      this.titleCamera(frameDt);
    } else if (this.freeFly) {
      this.camera.position.copy(this.freeFly.pos);
      this.camera.rotation.set(this.input.pitch, this.input.yaw, 0);
    } else {
      if (this.simActive()) this.feel.update(p, frameDt);
      this.camera.position.lerpVectors(this.prevEye, this.currEye, this.simActive() ? alpha : 1);
      this.camera.position.y += this.feel.offsetY;
      this.camera.rotation.set(this.input.pitch, this.input.yaw, this.feel.roll);
    }
    const hfov = this.save.settings.fov + (this.mode === 'title' ? 0 : this.feel.fovKick);
    this.camera.aspect = this.pipeline.aspect();
    this.camera.fov = (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / this.camera.aspect) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
    this.sky.follow(this.camera);
    this.sky.setHorizon(psxUniforms.uFogColor.value);
    psxUniforms.uTime.value = this.time;
    this.lights.update(this.time);
    this.animateBell(frameDt);
    if (this.pipeline.flash > 0) {
      this.pipeline.flash = Math.max(0, this.pipeline.flash - frameDt * 1.2);
      if (this.pipeline.flash === 0) this.pipeline.flashColor.setHex(0xffd890);
    }
    this.pipeline.render(this.scene, this.camera);
    this.onFrame?.(frameDt, this);

    // Readouts / HUD
    this.fpsAcc += frameDt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.stats.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    this.stats.speed = Math.round(p.horizontalSpeed * 10) / 10;
    this.stats.mode = p.mode + (p.crouched ? ' (crouched)' : '');
    this.stats.position = p.pos.toArray().map((v) => v.toFixed(1)).join(', ');
    if (this.mode === 'playing' || this.mode === 'paused') {
      this.hud.update(this.run.time, this.run.started, p.horizontalSpeed, this.run.activated, this.run.debug, frameDt);
      this.hud.setHint(this.mode === 'playing' && !this.input.locked && !this.debug.open ? 'Click to capture the mouse' : this.playtestHint);
    }
  }

  /** Slow drifting fly-through behind the title screen. */
  private titleCamera(dt: number): void {
    this.titleT += dt;
    const s = this.course.start.pos;
    const f = this.course.finish.pos;
    const k = (Math.sin(this.titleT * 0.02 - Math.PI / 2) + 1) / 2;
    this.camera.position.set(s[0] + (f[0] - s[0]) * k + Math.sin(this.titleT * 0.13) * 3, Math.max(s[1], f[1]) + 6 + Math.sin(this.titleT * 0.2), s[2] + (f[2] - s[2]) * k);
    const dir = Math.sign(f[2] - s[2]) || -1;
    this.camera.rotation.set(-0.05 + Math.sin(this.titleT * 0.1) * 0.05, dir < 0 ? Math.sin(this.titleT * 0.07) * 0.4 : Math.PI, 0);
  }

  private animateBell(dt: number): void {
    if (!this.visuals) return;
    const k = 6;
    this.bellSwingVel += (-k * this.bellSwing - 0.25 * this.bellSwingVel) * dt;
    this.bellSwing += this.bellSwingVel * dt;
    this.visuals.bellPivot.rotation.x = this.bellSwing * 0.35;
  }

  private resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  /** Seconds per simulation tick (exposed for tools). */
  static readonly dt = SIM_DT;
}
