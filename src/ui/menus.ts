import { formatTime, isUnlocked, medalFor, type Medal, type SaveData, type Settings } from '../core/save';
import type { CourseData } from '../levels/types';

/** Callbacks from the menus into the game. */
export interface MenuActions {
  playCourse(index: number): void;
  resume(): void;
  restart(): void;
  quitToTitle(): void;
  continueAfterResults(): void;
  settingsChanged(s: Settings): void;
}

export interface ResultsInfo {
  course: CourseData;
  time: number;
  best: number | undefined;
  newBest: boolean;
  debug: boolean;
  hasNext: boolean;
}

const MEDAL_GLYPH: Record<Medal, string> = { gold: '◆ Gold', silver: '◆ Silver', bronze: '◆ Bronze', none: '◇ No medal' };

export function medalHtml(m: Medal, short = false): string {
  return `<span class="medal ${m}">${short ? (m === 'none' ? '◇' : '◆') : MEDAL_GLYPH[m]}</span>`;
}

/** DOM menus: title, course select, settings, pause and results. */
export class Menus {
  private el: HTMLDivElement | null = null;
  current: 'title' | 'select' | 'settings' | 'pause' | 'results' | null = null;

  constructor(
    private root: HTMLElement,
    private actions: MenuActions,
    private data: () => { save: SaveData; courses: CourseData[] },
  ) {}

  clear(): void {
    this.el?.remove();
    this.el = null;
    this.current = null;
  }

  private mount(html: string, cls = 'screen'): HTMLDivElement {
    this.clear();
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    this.root.appendChild(el);
    this.el = el;
    return el;
  }

  private on(sel: string, fn: () => void): void {
    this.el?.querySelectorAll<HTMLElement>(sel).forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      }),
    );
  }

  title(): void {
    const { save, courses } = this.data();
    const ids = courses.map((c) => c.id);
    let next = 0;
    while (next < courses.length - 1 && ids[next] in save.best && isUnlocked(next + 1, ids, save)) next++;
    this.mount(`
      <h1 class="title"><span class="cross">✠</span>Ashen Spire<span class="cross">✠</span></h1>
      <div class="subtitle">a time trial through the drowned cathedral</div>
      <div class="menu">
        <button class="btn" data-a="start">${Object.keys(save.best).length ? 'Continue' : 'Begin'}</button>
        <button class="btn" data-a="select">Course Select</button>
        <button class="btn" data-a="settings">Settings</button>
      </div>
      <div class="keys">WASD move · Space jump · Shift/C slide · Mouse look<br>R restart · Esc pause · ~ debug</div>`);
    this.current = 'title';
    this.on('[data-a=start]', () => this.actions.playCourse(next));
    this.on('[data-a=select]', () => this.select(() => this.title()));
    this.on('[data-a=settings]', () => this.settings(() => this.title()));
  }

  select(back: () => void): void {
    const { save, courses } = this.data();
    const ids = courses.map((c) => c.id);
    const cards = courses
      .map((c, i) => {
        const open = isUnlocked(i, ids, save);
        const best = save.best[c.id];
        const medal = best !== undefined ? medalFor(best, c.medals) : 'none';
        return `<button class="btn course-card" data-i="${i}" ${open ? '' : 'disabled'}>
          <div class="name">${i + 1}. ${open ? c.name : '— sealed —'}</div>
          <div class="flavor">${open ? c.flavor : 'Finish the previous course to unseal.'}</div>
          <div class="meta">${best !== undefined ? `Best ${formatTime(best)} ${medalHtml(medal)}` : open ? 'Not yet finished' : ''}
          ${open ? `<br><span class="dim">Gold ${formatTime(c.medals.gold)} · Silver ${formatTime(c.medals.silver)} · Bronze ${formatTime(c.medals.bronze)}</span>` : ''}</div>
        </button>`;
      })
      .join('');
    const el = this.mount(`<div class="panel"><h2>Courses</h2><div class="courses">${cards}</div>
      <div class="menu" style="margin-top:16px"><button class="btn" data-a="back">Back</button></div></div>`);
    this.current = 'select';
    el.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!b.disabled) this.actions.playCourse(Number(b.dataset.i));
      }),
    );
    this.on('[data-a=back]', back);
  }

  private sliderRows(s: Settings, withVolume: boolean): string {
    return `
      <div class="row"><span>Mouse sensitivity</span><input type="range" data-k="sensitivity" min="0.1" max="3" step="0.05" value="${s.sensitivity}"><span class="val"></span></div>
      <div class="row"><span>Field of view</span><input type="range" data-k="fov" min="70" max="120" step="1" value="${s.fov}"><span class="val"></span></div>
      ${withVolume ? `<div class="row"><span>Master volume</span><input type="range" data-k="volume" min="0" max="1" step="0.01" value="${s.volume}"><span class="val"></span></div>` : ''}`;
  }

  private bindSliders(s: Settings): void {
    this.el?.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) => {
      const key = inp.dataset.k as keyof Settings;
      const val = inp.nextElementSibling as HTMLElement;
      const show = () => {
        const v = Number(inp.value);
        val.textContent = key === 'fov' ? `${v}°` : key === 'volume' ? `${Math.round(v * 100)}%` : `${v.toFixed(2)}×`;
      };
      show();
      inp.addEventListener('input', () => {
        s[key] = Number(inp.value);
        show();
        this.actions.settingsChanged(s);
      });
      inp.addEventListener('click', (e) => e.stopPropagation());
    });
  }

  settings(back: () => void): void {
    const { save } = this.data();
    this.mount(`<div class="panel" style="max-width:520px"><h2>Settings</h2>
      ${this.sliderRows(save.settings, true)}
      <div class="menu" style="margin-top:18px"><button class="btn" data-a="back">Back</button></div></div>`);
    this.current = 'settings';
    this.bindSliders(save.settings);
    this.on('[data-a=back]', back);
  }

  pause(): void {
    const { save } = this.data();
    this.mount(`<div class="panel" style="max-width:520px"><h2>Paused</h2>
      <div class="menu">
        <button class="btn" data-a="resume">Resume</button>
        <button class="btn" data-a="restart">Restart (R)</button>
        <button class="btn" data-a="select">Course Select</button>
      </div>
      ${this.sliderRows(save.settings, true)}
      <div class="menu" style="margin-top:12px"><button class="btn" data-a="quit">Quit to Title</button></div></div>`, 'screen solid');
    this.current = 'pause';
    this.bindSliders(save.settings);
    this.on('[data-a=resume]', () => this.actions.resume());
    this.on('[data-a=restart]', () => this.actions.restart());
    this.on('[data-a=select]', () => this.select(() => this.pause()));
    this.on('[data-a=quit]', () => this.actions.quitToTitle());
  }

  results(r: ResultsInfo): void {
    const medal = medalFor(r.time, r.course.medals);
    const bestMedal = r.best !== undefined ? medalFor(r.best, r.course.medals) : 'none';
    this.mount(`<div class="panel" style="max-width:560px">
      <h2>${r.course.name}</h2>
      <div class="results-time">${formatTime(r.time)}</div>
      <div class="results-line">${medalHtml(medal)}</div>
      <div class="results-line ${r.newBest ? 'newbest' : 'dim'}">${
        r.debug
          ? 'Debug run — time not saved'
          : r.newBest
            ? 'New best time'
            : `Best ${r.best !== undefined ? formatTime(r.best) : '—'} ${medalHtml(bestMedal, true)}`
      }</div>
      <div class="results-line dim">Gold ${formatTime(r.course.medals.gold)} · Silver ${formatTime(r.course.medals.silver)} · Bronze ${formatTime(r.course.medals.bronze)}</div>
      <div class="results-prompt">Press <b>R</b> to retry · <b>Enter</b> to ${r.hasNext ? 'continue' : 'return to course select'}</div>
      <div class="menu" style="margin-top:14px;flex-direction:row;justify-content:center">
        <button class="btn" data-a="retry">Retry</button>
        <button class="btn" data-a="next">${r.hasNext ? 'Next course' : 'Courses'}</button>
      </div></div>`, 'screen solid');
    this.current = 'results';
    this.on('[data-a=retry]', () => this.actions.restart());
    this.on('[data-a=next]', () => this.actions.continueAfterResults());
  }
}
