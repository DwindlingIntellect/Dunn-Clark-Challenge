import * as THREE from 'three';
import { FixedLoop } from '../core/loop';
import { Input } from '../core/input';
import { movement } from '../config/movement';
import { CollisionWorld } from '../sim/collision';
import { PlayerController } from '../sim/controller';
import { courseColliders } from '../levels/colliders';
import type { CourseData } from '../levels/types';
import { CameraFeel } from './cameraFeel';
import { colliderGeometry } from '../render/colliderGeometry';

/**
 * Top-level game object (Milestone 2: gray-box test course).
 * Simulation runs on the fixed loop; rendering interpolates the camera.
 */
export class Game {
  readonly input: Input;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 4 / 3, 0.05, 1000);
  readonly feel = new CameraFeel(movement);
  readonly loop: FixedLoop;
  course!: CourseData;
  world!: CollisionWorld;
  player!: PlayerController;
  private levelRoot = new THREE.Group();
  private prevEye = new THREE.Vector3();
  private currEye = new THREE.Vector3();
  private hud: HTMLDivElement;

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
    canvas.addEventListener('click', () => this.input.requestLock());
    this.input.onKey((code) => {
      if (code === 'KeyR') this.restart();
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.loop = new FixedLoop({ tick: (dt) => this.tick(dt), render: (a, fdt) => this.render(a, fdt) });
  }

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
    this.restart();
  }

  restart(): void {
    const s = this.course.start;
    this.player.reset(s.pos, (s.yaw * Math.PI) / 180);
    this.input.yaw = (s.yaw * Math.PI) / 180;
    this.input.pitch = 0;
    this.feel.reset();
    this.player.eyePosition(this.currEye);
    this.prevEye.copy(this.currEye);
  }

  start(): void {
    this.loop.start();
  }

  private tick(dt: number): void {
    this.prevEye.copy(this.currEye);
    this.player.step(this.input.sample(), dt);
    for (const e of this.player.events) this.feel.onEvent(e);
    if (this.player.pos.y < this.course.killY) this.restart();
    this.player.eyePosition(this.currEye);
  }

  private render(alpha: number, frameDt: number): void {
    this.feel.update(this.player, frameDt);
    this.camera.position.lerpVectors(this.prevEye, this.currEye, alpha);
    this.camera.position.y += this.feel.offsetY;
    this.camera.rotation.set(this.input.pitch, this.input.yaw, this.feel.roll);
    const hfov = 90 + this.feel.fovKick;
    this.camera.fov = (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / this.camera.aspect) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const p = this.player;
    this.hud.textContent = `${p.horizontalSpeed.toFixed(1)} m/s  ${p.mode}${p.crouched ? ' (crouched)' : ''}`;
  }

  private resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
  }
}
