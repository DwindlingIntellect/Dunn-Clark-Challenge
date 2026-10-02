import { loadJSON, saveJSON } from './storage';

/** Persistent progress and settings (localStorage, failures ignored). */
export type Medal = 'none' | 'bronze' | 'silver' | 'gold';

export interface Settings {
  /** Mouse sensitivity multiplier (1 = default). */
  sensitivity: number;
  /** Horizontal field of view in degrees. */
  fov: number;
  /** Master volume 0..1. */
  volume: number;
}

export interface SaveData {
  version: 1;
  /** Best (non-debug) time in seconds per course id. */
  best: Record<string, number>;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, fov: 90, volume: 0.7 };

const KEY = 'save';

export function loadSave(): SaveData {
  const d = loadJSON<Partial<SaveData>>(KEY);
  const best: Record<string, number> = {};
  if (d && d.best && typeof d.best === 'object') {
    for (const [k, v] of Object.entries(d.best)) if (typeof v === 'number' && isFinite(v) && v > 0) best[k] = v;
  }
  const s = { ...DEFAULT_SETTINGS, ...(d?.settings ?? {}) };
  return { version: 1, best, settings: s };
}

export function writeSave(data: SaveData): void {
  saveJSON(KEY, data);
}

export function medalFor(time: number, medals: { bronze: number; silver: number; gold: number }): Medal {
  if (time <= medals.gold) return 'gold';
  if (time <= medals.silver) return 'silver';
  if (time <= medals.bronze) return 'bronze';
  return 'none';
}

/** Courses unlock in order: a course is open once the previous one has been finished. */
export function isUnlocked(index: number, courseIds: string[], save: SaveData): boolean {
  if (index <= 0) return true;
  return courseIds[index - 1] in save.best;
}

/** Record a finished run; returns true when it is a new best. */
export function recordTime(save: SaveData, courseId: string, time: number): boolean {
  const prev = save.best[courseId];
  if (prev === undefined || time < prev) {
    save.best[courseId] = time;
    writeSave(save);
    return true;
  }
  return false;
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
