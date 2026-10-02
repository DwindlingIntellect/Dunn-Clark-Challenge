/**
 * Fixed-timestep game loop. Simulation ticks run at a constant rate
 * (SIM_HZ) independent of the display refresh; rendering receives an
 * interpolation alpha in [0,1) describing how far we are between the
 * previous and the current simulation state.
 */
export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;

/** Never simulate more than this many ticks per frame (avoids spiral of death). */
const MAX_TICKS_PER_FRAME = 12;

export interface LoopCallbacks {
  /** Advance simulation by exactly SIM_DT. */
  tick(dt: number): void;
  /** Draw a frame. `alpha` interpolates between previous and current sim state. */
  render(alpha: number, frameDt: number): void;
}

export class FixedLoop {
  private acc = 0;
  private last = 0;
  private running = false;
  private rafId = 0;

  constructor(private cb: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(frame);
      let frameDt = (now - this.last) / 1000;
      this.last = now;
      if (frameDt > 0.25) frameDt = 0.25;
      this.acc += frameDt;
      let n = 0;
      while (this.acc >= SIM_DT && n < MAX_TICKS_PER_FRAME) {
        this.cb.tick(SIM_DT);
        this.acc -= SIM_DT;
        n++;
      }
      if (n === MAX_TICKS_PER_FRAME) this.acc = 0;
      this.cb.render(this.acc / SIM_DT, frameDt);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Drop any accumulated time (e.g. after unpausing) so we do not fast-forward. */
  resetAccumulator(): void {
    this.acc = 0;
    this.last = performance.now();
  }
}
