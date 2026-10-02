import GUI from 'lil-gui';
import { movement, MOVEMENT_DEFAULTS, assignMovement, type MovementConfig } from '../config/movement';
import movementSource from '../config/movement.ts?raw';
import { loadJSON, saveJSON } from '../core/storage';
import { movementToCode } from './movementCode';
import type { CourseData } from '../levels/types';

/** What the debug menu needs from the game. */
export interface DebugHost {
  courses(): CourseData[];
  currentCourse(): CourseData;
  selectCourse(id: string): void;
  teleportToCheckpoint(index: number): void;
  setFreeFly(on: boolean): void;
  setColliderView(on: boolean): void;
  setDebugOpen(open: boolean): void;
  /** Live readouts. */
  readonly stats: { fps: number; speed: number; mode: string; position: string };
  /** Optional extra folders (e.g. PSX effect) added by the host. */
  extendDebug?(gui: GUI): void;
}

const FOLDERS: [keyof MovementConfig, string][] = [
  ['ground', 'Ground'],
  ['air', 'Air'],
  ['jump', 'Jump'],
  ['slide', 'Slide'],
  ['wallRun', 'Wall Run'],
  ['cling', 'Cling/Mantle'],
  ['mantle', 'Cling/Mantle'],
  ['camera', 'Camera'],
  ['body', 'Body'],
];

/** Explicit slider ranges where the automatic guess is not good enough. */
const RANGES: Record<string, [number, number, number]> = {
  'wallRun.entryVyMin': [-10, 10, 0.1],
  'wallRun.entryVyMax': [-10, 10, 0.1],
  'ground.maxSlopeDeg': [0, 89, 1],
  'cling.maxFacingAngleDeg': [0, 89, 1],
  'camera.fovKickDegrees': [0, 40, 0.5],
  'camera.wallRunTiltDegrees': [0, 30, 0.5],
  'wallRun.gravityCurve': [0.2, 5, 0.05],
};

const STORAGE_KEY = 'movement';

export class DebugMenu {
  readonly gui: GUI;
  open = false;
  private courseFolder: GUI;
  private tools = {
    freeFly: false,
    colliders: false,
    course: '',
    checkpoint: 'start',
  };

  constructor(private host: DebugHost) {
    this.gui = new GUI({ title: 'Debug (~ to close)', width: 320 });
    this.gui.domElement.style.zIndex = '50';
    this.gui.hide();

    // ---- readouts
    const ro = this.gui.addFolder('Readouts');
    ro.add(host.stats, 'fps').name('FPS').listen().disable();
    ro.add(host.stats, 'speed').name('Speed (m/s)').listen().disable();
    ro.add(host.stats, 'mode').name('Move state').listen().disable();
    ro.add(host.stats, 'position').name('Position').listen().disable();

    // ---- course tools
    this.courseFolder = this.gui.addFolder('Course & Tools');
    this.buildCourseFolder();

    // ---- movement
    const mv = this.gui.addFolder('Movement (movement.ts)');
    const sub = new Map<string, GUI>();
    for (const [group, label] of FOLDERS) {
      let f = sub.get(label);
      if (!f) {
        f = mv.addFolder(label);
        f.close();
        sub.set(label, f);
      }
      const obj = movement[group] as Record<string, number | boolean>;
      for (const key of Object.keys(obj)) {
        const v = obj[key];
        const name = label === 'Cling/Mantle' ? `${group}.${key}` : key;
        if (typeof v === 'boolean') {
          f.add(obj, key).name(name).listen();
        } else {
          const [min, max, step] = RANGES[`${group}.${key}`] ?? autoRange(v);
          f.add(obj, key, min, max, step).name(name).listen();
        }
      }
    }
    const actions = {
      copy: () => this.copyConfig(),
      reset: () => assignMovement(movement, structuredClone(MOVEMENT_DEFAULTS)),
      save: () => {
        const ok = saveJSON(STORAGE_KEY, movement);
        this.toast(ok ? 'Tuning saved in this browser' : 'Could not save (storage unavailable)');
      },
      load: () => {
        const data = loadJSON<MovementConfig>(STORAGE_KEY);
        if (data) {
          assignMovement(movement, data);
          this.toast('Tuning loaded');
        } else this.toast('No saved tuning found');
      },
    };
    mv.add(actions, 'copy').name('Copy config as code');
    mv.add(actions, 'reset').name('Reset to defaults');
    mv.add(actions, 'save').name('Save tuning (browser)');
    mv.add(actions, 'load').name('Load tuning (browser)');
    mv.close();

    host.extendDebug?.(this.gui);
  }

  /** Rebuild the course-specific controls (call after a course loads). */
  buildCourseFolder(): void {
    const f = this.courseFolder;
    for (const c of [...f.controllers]) c.destroy();
    const courses = this.host.courses();
    const current = this.host.currentCourse();
    this.tools.course = current.id;
    const courseOpts: Record<string, string> = {};
    for (const c of courses) courseOpts[c.name] = c.id;
    f.add(this.tools, 'course', courseOpts).name('Course select').onChange((id: string) => {
      this.host.selectCourse(id);
    });
    const cpOpts: Record<string, string> = { Start: 'start' };
    current.checkpoints.forEach((_, i) => (cpOpts[`Lantern ${i + 1}`] = String(i)));
    this.tools.checkpoint = 'start';
    f.add(this.tools, 'checkpoint', cpOpts).name('Teleport to');
    f.add({ go: () => this.host.teleportToCheckpoint(this.tools.checkpoint === 'start' ? -1 : Number(this.tools.checkpoint)) }, 'go').name('Teleport');
    f.add(this.tools, 'freeFly').name('Free-fly camera').onChange((v: boolean) => this.host.setFreeFly(v));
    f.add(this.tools, 'colliders').name('Collider wireframe').onChange((v: boolean) => this.host.setColliderView(v));
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    if (open) this.gui.show();
    else this.gui.hide();
    this.host.setDebugOpen(open);
  }

  private copyConfig(): void {
    const code = movementToCode(movementSource, movement);
    const done = () => this.toast('movement.ts copied to clipboard');
    try {
      navigator.clipboard.writeText(code).then(done, () => this.showCode(code));
    } catch {
      this.showCode(code);
    }
  }

  /** Fallback when the clipboard API is unavailable: show the code to copy by hand. */
  private showCode(code: string): void {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:5%;z-index:60;background:#111;border:1px solid #887;padding:8px;display:flex;flex-direction:column;gap:6px';
    const ta = document.createElement('textarea');
    ta.value = code;
    ta.style.cssText = 'flex:1;background:#000;color:#cfc;font:12px monospace';
    const btn = document.createElement('button');
    btn.textContent = 'Close';
    btn.onclick = () => wrap.remove();
    wrap.append(ta, btn);
    document.body.appendChild(wrap);
    ta.select();
  }

  private toast(msg: string): void {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:70;background:#222c;color:#eed;padding:6px 12px;font:13px monospace;border:1px solid #665';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }
}

function autoRange(v: number): [number, number, number] {
  const max = Math.max(1, Math.ceil(Math.abs(v) * 3));
  const step = Math.abs(v) < 2 ? 0.005 : 0.05;
  return [v < 0 ? -max : 0, max, step];
}
