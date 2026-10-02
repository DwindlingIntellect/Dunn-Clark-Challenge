import { formatTime } from '../core/save';

/** Minimal in-run HUD: timer, speed, lantern count, checkpoint toast. */
export class Hud {
  readonly el: HTMLDivElement;
  private timer: HTMLDivElement;
  private speed: HTMLDivElement;
  private lanterns: HTMLDivElement;
  private toast: HTMLDivElement;
  private tag: HTMLDivElement;
  private hint: HTMLDivElement;
  private toastTimer = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hud-timer idle">0:00.00</div>
      <div class="hud-tag"></div>
      <div class="hud-toast"></div>
      <div class="hud-hint"></div>
      <div class="hud-lanterns"></div>
      <div class="hud-speed">0.0 <small>m/s</small></div>`;
    parent.appendChild(this.el);
    this.timer = this.el.querySelector('.hud-timer')!;
    this.speed = this.el.querySelector('.hud-speed')!;
    this.lanterns = this.el.querySelector('.hud-lanterns')!;
    this.toast = this.el.querySelector('.hud-toast')!;
    this.tag = this.el.querySelector('.hud-tag')!;
    this.hint = this.el.querySelector('.hud-hint')!;
  }

  show(on: boolean): void {
    this.el.style.display = on ? '' : 'none';
  }

  update(time: number, started: boolean, speed: number, lit: boolean[], debug: boolean, dt: number): void {
    this.timer.textContent = formatTime(time);
    this.timer.classList.toggle('idle', !started);
    this.speed.innerHTML = `${speed.toFixed(1)} <small>m/s</small>`;
    this.lanterns.innerHTML = lit.map((l) => `<span class="${l ? 'lit' : ''}">✦</span>`).join('');
    this.tag.textContent = debug ? 'DEBUG RUN — times not saved' : '';
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }
  }

  flash(text: string, seconds = 1.4): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    this.toastTimer = seconds;
  }

  setHint(text: string): void {
    this.hint.textContent = text;
  }
}
