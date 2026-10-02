import * as THREE from 'three';
import { FixedLoop } from '../core/loop';
import { Input } from '../core/input';
import { movement } from '../config/movement';
import { CollisionWorld } from '../sim/collision';
import { PlayerController } from '../sim/controller';
import { courseColliders } from '../levels/colliders';
import { allCourses, courseById } from '../levels/index';
import type { CourseData } from '../levels/types';
import { CameraFeel } from './cameraFeel';
import { colliderGeometry, colliderWireframe } from '../render/colliderGeometry';
import { DebugMenu, type DebugHost } from '../debug/debugMenu';
import { FreeFly } from '../debug/freeFly';

/**
 * Top-level game object. Simulation runs on the fixed loop; rendering
 * interpolates the camera between the last two simulation states.
 */
export class Game implements DebugHost {
  readonly input: Input;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 4 / 3, 0.05, 1000);
  readonly feel = new CameraFeel(movement);
  readonly loop: FixedLoop;
  readonly debug: DebugMenu;
  readonly stats = { fps: 0, speed: 0, mode: '', position: '' };
  course!: CourseData;
  world!: CollisionWorld;
  player!: PlayerController;
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
  private fpsFrames = 0;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.input = new Input(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.levelRoot);
    this.scene.background = new THREE.Color(0x202630);
    this.scene.fog = new THREE.Fog(0x202630, 20, 160);
    this.scene.add(new THREE.HemisphereLight(0xc8d0e0, 0x303030, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(0.4, 1, 0.3);
    this.scene.add(sun);
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

  loadCourse(course: CourseData): void {
    this.course = course;
    this.world?.dispose();
    const descs = courseColliders(course);
    this.world = new CollisionWorld(descs);
    this.player = new PlayerController(this.world, movement);
    this.levelRoot.clear();
    for (const d of descs) {
      const wall = d.tags.includes('wallrun');
      const mat = new THREE.MeshLambertMaterial({ color: wall ? 0xe8dcc0 : d.kind === 'ramp' ? 0x8a8f98 : 0x9aa0a8 });
      this.levelRoot.add(new THREE.Mesh(colliderGeometry(d), mat));
    }
    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.2, 8), new THREE.MeshLambertMaterial({ color: 0xc89b3c }));
    bell.position.set(course.finish.pos[0], course.finish.pos[1] + 2, course.finish.pos[2]);
    this.levelRoot.add(bell);
    this.wireframe = colliderWireframe(descs);
    this.wireframe.visible = this.showColliders;
    this.levelRoot.add(this.wireframe);
    this.debug?.buildCourseFolder();
    this.restart();
  }

  restart(): void {
    const s = this.course.start;
    this.player.reset(s.pos, (s.yaw * Math.PI) / 180);
    this.input.yaw = (s.yaw * Math.PI) / 180;
    this.input.pitch = 0;
    this.feel.reset();
    this.runIsDebug = this.debug?.open ?? false;
    this.snapCamera();
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
    this.player.step(this.input.sample(), dt);
    for (const e of this.player.events) this.feel.onEvent(e);
    if (this.player.pos.y < this.course.killY) this.restart();
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
    this.camera.fov = (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / this.camera.aspect) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);

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
    this.camera.aspect = window.innerWidth / window.innerHeight;
  }
}
