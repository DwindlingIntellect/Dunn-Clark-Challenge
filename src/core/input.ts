import type { PlayerInput } from '../sim/types';

/**
 * Keyboard + mouse input. Keys are tracked by `event.code` so layouts and
 * modifier keys do not matter. Mouse look is accumulated straight into
 * yaw/pitch so it is applied at display rate; the simulation samples the
 * current yaw/pitch each tick.
 */
export type KeyHandler = (code: string, e: KeyboardEvent) => void;

const PITCH_LIMIT = Math.PI / 2 - 0.01;

export class Input {
  private down = new Set<string>();
  private keyHandlers: KeyHandler[] = [];
  yaw = 0;
  pitch = 0;
  /** Mouse sensitivity in radians per pixel. */
  sensitivity = 0.0022;
  /** When false the mouse does not turn the view (menus open). */
  lookEnabled = true;
  /** Raw mouse delta since last consume (used by free-fly camera). */
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      // Prevent browser defaults for game keys (space scroll, F1 help, backquote).
      if (['Space', 'F1', 'Backquote', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) for (const h of this.keyHandlers) h(e.code, e);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.lookEnabled) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
      if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.down.clear();
      this.onLockChange?.(this.locked);
    });
  }

  onKey(h: KeyHandler): void {
    this.keyHandlers.push(h);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  requestLock(): void {
    if (this.locked) return;
    try {
      const p = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* pointer lock unavailable (e.g. iframe sandbox); ignore */
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Build the per-tick input frame for the simulation. */
  sample(): PlayerInput {
    const f = (this.isDown('KeyW') ? 1 : 0) - (this.isDown('KeyS') ? 1 : 0);
    const r = (this.isDown('KeyD') ? 1 : 0) - (this.isDown('KeyA') ? 1 : 0);
    return {
      forward: f,
      right: r,
      jump: this.isDown('Space'),
      crouch: this.isDown('ShiftLeft') || this.isDown('ShiftRight') || this.isDown('KeyC'),
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }

  clearKeys(): void {
    this.down.clear();
  }
}
