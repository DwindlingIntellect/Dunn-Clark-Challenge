import * as THREE from 'three';
import { FixedLoop } from '../core/loop';
import { Input } from '../core/input';
import { movement } from '../config/movement';
import { CollisionWorld } from '../sim/collision';
import { PlayerController } from '../sim/controller';
import { courseColliders } from '../levels/colliders';
import { allCourses, courseById, onCourseHotUpdate } from '../levels/index';
import { RunState } from './runState';
import { buildLevel, LANTERN_LIT, LANTERN_UNLIT, type LevelVisuals } from '../render/levelBuilder';
import type { CourseData } from '../levels/types';
import { CameraFeel } from './cameraFeel';
import { colliderWireframe } from '../render/colliderGeometry';
import { DebugMenu, type DebugHost } from '../debug/debugMenu';
import { FreeFly } from '../debug/freeFly';
import type GUI from 'lil-gui';
import { PsxPipeline } from '../render/psxPipeline';
import { Sky } from '../render/sky';
import { ATMOSPHERES } from '../render/atmosphere';
import { applyAtmosphere, PointLights } from '../render/lighting';
import { psxUniforms } from '../render/materials';
import { psx } from '../config/render';

/**
 * Top-level game object. Simulation runs on the fixed loop; rendering
 * interpolates the camera between the last two simulation states.
 */
export class Game implements DebugHost {
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
  readonly stats = { fps: 0, speed: 0, mode: '', position: '' };
  course!: CourseData;
  world!: CollisionWorld;
  player!: PlayerController;
  run!: RunState;
  private visuals: LevelVisuals | null = null;
  /** Simulation is frozen (debug menu open). */
  paused = false;
  /** The current run has had the debug menu opened (never saves a best time). */
  runIsDebug = false;
  private levelRoot = new THREE.Group();
  private wireframe: THREE.LineSegments | null = null;
  private showColliders = false;
  private freeFly: FreeFly | null = null;
  private prevEye = new THREE.Vector3();
  private currEye = new THREE.Vector3();
  private hud: HTMLDivElement;
  private fpsAcc = 0;
  private time = 0;
  private fpsFrames = 0;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.input = new Input(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.camera.rotation.order = 'YXZ';
    this.pipeline = new PsxPipeline(this.renderer);
    this.scene.add(this.levelRoot);
    this.scene.add(this.sky.mesh);
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:absolute;left:12px;bottom:10px;font:14px monospace;color:#dde;text-shadow:1px 1px #000';
    ui.appendChild(this.hud);
    canvas.addEventListener('click', () => {
      if (!this.debug.open) this.input.requestLock();
    });
    this.input.onKey((code) => {
      if (code === 'Backquote' || code === 'F1') this.debug.toggle();
      else if (code === 'KeyR' && !this.debug.open) this.restart();
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.loop = new FixedLoop({ tick: (dt) => this.tick(dt), render: (a, fdt) => this.render(a, fdt) });
    this.course = allCourses()[0];
    this.debug = new DebugMenu(this);
    onCourseHotUpdate((c) => {
      if (c.id === this.course.id) this.loadCourse(c, true);
    });
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
    if (c) this.loadCourse(c);
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
    if (on) {
      this.freeFly = new FreeFly();
      this.freeFly.pos.copy(this.currEye);
    } else {
      this.freeFly = null;
    }
  }

  setColliderView(on: boolean): void {
    this.showColliders = on;
    if (this.wireframe) this.wireframe.visible = on;
  }

  setDebugOpen(open: boolean): void {
    this.paused = open;
    if (open) {
      this.runIsDebug = true;
      this.input.releaseLock();
    } else {
      this.input.requestLock();
      this.loop.resetAccumulator();
    }
  }

  // ---------------------------------------------------------------- course

  loadCourse(course: CourseData, keepPlayer = false): void {
    const prev = keepPlayer && this.player ? { pos: this.player.pos.clone(), vel: this.player.vel.clone() } : null;
    this.course = course;
    this.world?.dispose();
    const descs = courseColliders(course);
    this.world = new CollisionWorld(descs);
    this.player = new PlayerController(this.world, movement);
    const prevRun = keepPlayer ? this.run : null;
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
    if (prev && prevRun) {
      // Hot reload: keep the run going where the player is.
      this.run.ticks = prevRun.ticks;
      this.run.started = prevRun.started;
      this.run.debug = prevRun.debug;
      this.player.reset(prev.pos, this.input.yaw);
      this.player.vel.copy(prev.vel);
      this.snapCamera();
    } else {
      this.restart();
    }
  }

  restart(): void {
    const s = this.course.start;
    this.run.reset();
    this.updateLanterns();
    this.input.yaw = (s.yaw * Math.PI) / 180;
    this.input.pitch = 0;
    this.feel.reset();
    this.runIsDebug = this.debug?.open ?? false;
    this.snapCamera();
  }

  private updateLanterns(): void {
    this.visuals?.lanterns.forEach((l, i) => l.glow.uniforms.uTint.value.setHex(this.run.activated[i] ? LANTERN_LIT : LANTERN_UNLIT));
  }

  private snapCamera(): void {
    this.player.eyePosition(this.currEye);
    this.prevEye.copy(this.currEye);
  }

  start(): void {
    this.loop.start();
  }

  // ------------------------------------------------------------------ loop

  private tick(dt: number): void {
    if (this.paused) return;
    if (this.freeFly) {
      this.freeFly.update(this.input, dt);
      return;
    }
    this.prevEye.copy(this.currEye);
    this.run.step(this.input.sample(), dt);
    for (const e of this.player.events) this.feel.onEvent(e);
    for (const e of this.run.events) {
      if (e.type === 'checkpoint') {
        this.updateLanterns();
        this.pipeline.flash = 0.35;
      } else if (e.type === 'respawn') {
        const r = this.run.respawnPoint();
        this.input.yaw = (r.yaw * Math.PI) / 180;
        this.input.pitch = 0;
        this.feel.reset();
        this.player.eyePosition(this.currEye);
        this.prevEye.copy(this.currEye);
      }
    }
    this.player.eyePosition(this.currEye);
  }

  private render(alpha: number, frameDt: number): void {
    const p = this.player;
    if (!this.paused) this.feel.update(p, frameDt);
    if (this.freeFly) {
      this.camera.position.copy(this.freeFly.pos);
      this.camera.rotation.set(this.input.pitch, this.input.yaw, 0);
    } else {
      this.camera.position.lerpVectors(this.prevEye, this.currEye, this.paused ? 1 : alpha);
      this.camera.position.y += this.feel.offsetY;
      this.camera.rotation.set(this.input.pitch, this.input.yaw, this.feel.roll);
    }
    const hfov = 90 + this.feel.fovKick;
    this.camera.aspect = this.pipeline.aspect();
    this.camera.fov = (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / this.camera.aspect) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
    this.sky.follow(this.camera);
    this.sky.setHorizon(psxUniforms.uFogColor.value);
    this.time += frameDt;
    this.pipeline.flash = Math.max(0, this.pipeline.flash - frameDt * 1.5);
    psxUniforms.uTime.value = this.time;
    this.lights.update(this.time);
    this.pipeline.render(this.scene, this.camera);

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
    this.hud.textContent = `${this.stats.speed.toFixed(1)} m/s  ${this.stats.mode}${this.runIsDebug ? '  [debug run]' : ''}`;
  }

  private resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  /** Adds the PSX effect folder to the debug menu. */
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
}
