import type { CourseData, Piece, Vec3 } from '../levels/types';
import { formatCourse } from '../levels/format';

/**
 * The course being edited, with selection and undo/redo.
 *
 * Selection keys: `p:<index>` (piece), `cp:<index>` (checkpoint lantern),
 * `start`, `finish`.
 *
 * Every mutation goes through `begin()` / `end()` (or `change()`), which
 * records a JSON snapshot for undo. Drags and slider edits call `begin()`
 * once and `end()` when the gesture finishes, so they undo in one step.
 */
export type SelKey = string;

const MAX_UNDO = 300;

export class EditorDoc {
  course: CourseData;
  selection: SelKey[] = [];
  private savedText: string;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private pending: string | null = null;
  private dirtyCache = false;
  /** Called after any change. `structural` = pieces/markers added, removed or reordered. */
  onChange: (structural: boolean) => void = () => {};

  constructor(course: CourseData) {
    this.course = structuredClone(course);
    this.savedText = formatCourse(this.course);
  }

  get dirty(): boolean {
    return this.dirtyCache;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private snapshot(): string {
    return JSON.stringify(this.course);
  }

  /** Start a (possibly long) edit gesture. Nested calls are ignored. */
  begin(): void {
    if (this.pending === null) this.pending = this.snapshot();
  }

  /** Finish the current gesture; records an undo step if anything changed. */
  end(structural = false): void {
    if (this.pending === null) return;
    const before = this.pending;
    this.pending = null;
    if (before !== this.snapshot()) {
      this.undoStack.push(before);
      if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    if (structural) this.pruneSelection();
    this.touch(structural);
  }

  /** One-shot mutation recorded as a single undo step. */
  change(fn: (c: CourseData) => void, structural = false): void {
    this.begin();
    fn(this.course);
    this.end(structural);
  }

  /** Notify listeners of a live (not yet committed) change, e.g. mid-drag. */
  touch(structural = false): void {
    this.dirtyCache = formatCourse(this.course) !== this.savedText;
    this.onChange(structural);
  }

  undo(): void {
    this.pending = null;
    const prev = this.undoStack.pop();
    if (prev === undefined) return;
    this.redoStack.push(this.snapshot());
    this.course = JSON.parse(prev);
    this.pruneSelection();
    this.touch(true);
  }

  redo(): void {
    this.pending = null;
    const next = this.redoStack.pop();
    if (next === undefined) return;
    this.undoStack.push(this.snapshot());
    this.course = JSON.parse(next);
    this.pruneSelection();
    this.touch(true);
  }

  /** The file contents to write. */
  text(): string {
    return formatCourse(this.course);
  }

  markSaved(): void {
    this.savedText = formatCourse(this.course);
    this.touch(false);
  }

  /** Replace the document with a fresh copy (e.g. reloaded from disk). */
  reset(course: CourseData): void {
    this.course = structuredClone(course);
    this.savedText = formatCourse(this.course);
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.pending = null;
    this.pruneSelection();
    this.touch(true);
  }

  private pruneSelection(): void {
    this.selection = this.selection.filter((k) => resolve(this.course, k) !== null);
  }
}

// ------------------------------------------------------------------ helpers

export type Resolved =
  | { kind: 'piece'; index: number; piece: Piece }
  | { kind: 'checkpoint'; index: number }
  | { kind: 'start' }
  | { kind: 'finish' };

export function resolve(c: CourseData, key: SelKey): Resolved | null {
  if (key === 'start') return { kind: 'start' };
  if (key === 'finish') return { kind: 'finish' };
  const [kind, idx] = key.split(':');
  const i = Number(idx);
  if (kind === 'p' && c.pieces[i]) return { kind: 'piece', index: i, piece: c.pieces[i] };
  if (kind === 'cp' && c.checkpoints[i]) return { kind: 'checkpoint', index: i };
  return null;
}

/** Position (bottom-centre / marker floor point) of a selectable. */
export function keyPos(c: CourseData, key: SelKey): Vec3 | null {
  const r = resolve(c, key);
  if (!r) return null;
  if (r.kind === 'piece') return r.piece.pos;
  if (r.kind === 'checkpoint') return c.checkpoints[r.index].pos;
  if (r.kind === 'start') return c.start.pos;
  return c.finish.pos;
}

/** Yaw in degrees of a selectable (the finish bell has none). */
export function keyYaw(c: CourseData, key: SelKey): number | null {
  const r = resolve(c, key);
  if (!r) return null;
  if (r.kind === 'piece') return r.piece.rot ?? 0;
  if (r.kind === 'checkpoint') return c.checkpoints[r.index].yaw;
  if (r.kind === 'start') return c.start.yaw;
  return null;
}

export function setKeyTransform(c: CourseData, key: SelKey, pos: Vec3, yaw: number | null): void {
  const r = resolve(c, key);
  if (!r) return;
  const p: Vec3 = [round(pos[0]), round(pos[1]), round(pos[2])];
  const y = yaw === null ? null : normYaw(yaw);
  if (r.kind === 'piece') {
    r.piece.pos = p;
    if (y !== null) {
      if (y === 0) delete r.piece.rot;
      else r.piece.rot = y;
    }
  } else if (r.kind === 'checkpoint') {
    c.checkpoints[r.index].pos = p;
    if (y !== null) c.checkpoints[r.index].yaw = y;
  } else if (r.kind === 'start') {
    c.start.pos = p;
    if (y !== null) c.start.yaw = y;
  } else {
    c.finish.pos = p;
  }
}

export function round(v: number, step = 0.0001): number {
  const n = Number((Math.round(v / step) * step).toFixed(4));
  return n === 0 ? 0 : n; // never -0
}

/** Wrap degrees into (-180, 180]. */
export function normYaw(deg: number): number {
  let d = round(deg % 360, 0.01);
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d === 0 ? 0 : d;
}

/** An id not yet used by any piece (`block`, `block2`, `block3`, …). */
export function uniqueId(c: CourseData, base: string): string {
  const used = new Set(c.pieces.map((p) => p.id).filter(Boolean));
  const clean = base.replace(/[^a-zA-Z0-9_-]/g, '') || 'piece';
  if (!used.has(clean)) return clean;
  const stem = clean.replace(/\d+$/, '');
  for (let i = 2; ; i++) if (!used.has(`${stem}${i}`)) return `${stem}${i}`;
}

/** Make sure a piece has an id (needed before it can be used in a jump link). */
export function ensureId(c: CourseData, index: number): string {
  const p = c.pieces[index];
  if (!p.id) p.id = uniqueId(c, p.type);
  return p.id;
}

/** Duplicate the selected pieces and checkpoints, offset by `offset`; returns the new keys. */
export function duplicate(c: CourseData, keys: SelKey[], offset: Vec3): SelKey[] {
  const out: SelKey[] = [];
  for (const k of keys) {
    const r = resolve(c, k);
    if (!r) continue;
    if (r.kind === 'piece') {
      const copy: Piece = structuredClone(r.piece);
      copy.pos = [copy.pos[0] + offset[0], copy.pos[1] + offset[1], copy.pos[2] + offset[2]];
      if (copy.id) copy.id = uniqueId(c, copy.id);
      c.pieces.push(copy);
      out.push(`p:${c.pieces.length - 1}`);
    } else if (r.kind === 'checkpoint') {
      const cp = structuredClone(c.checkpoints[r.index]);
      cp.pos = [cp.pos[0] + offset[0], cp.pos[1] + offset[1], cp.pos[2] + offset[2]];
      c.checkpoints.push(cp);
      out.push(`cp:${c.checkpoints.length - 1}`);
    }
  }
  return out;
}

/**
 * Delete selected pieces and checkpoints (start and finish cannot be
 * deleted). Jump links that referenced a deleted piece are removed too.
 */
export function deleteKeys(c: CourseData, keys: SelKey[]): void {
  const pieces = new Set<number>();
  const cps = new Set<number>();
  for (const k of keys) {
    const r = resolve(c, k);
    if (r?.kind === 'piece') pieces.add(r.index);
    if (r?.kind === 'checkpoint') cps.add(r.index);
  }
  const goneIds = new Set([...pieces].map((i) => c.pieces[i].id).filter((x): x is string => !!x));
  c.pieces = c.pieces.filter((_, i) => !pieces.has(i));
  c.checkpoints = c.checkpoints.filter((_, i) => !cps.has(i));
  c.jumpLinks = c.jumpLinks.filter((l) => !goneIds.has(l.from) && !goneIds.has(l.to) && !(l.via && goneIds.has(l.via)));
}

/** Renaming a piece id also updates the jump links that use it. */
export function renamePiece(c: CourseData, index: number, newId: string): void {
  const p = c.pieces[index];
  const old = p.id;
  const id = newId.trim();
  if (!id) {
    delete p.id;
  } else {
    p.id = id;
  }
  if (!old) return;
  for (const l of c.jumpLinks) {
    if (l.from === old) l.from = id;
    if (l.to === old) l.to = id;
    if (l.via === old) l.via = id;
  }
}

/** A minimal playable course: start, one long platform, a lantern and the bell. */
export function newCourseTemplate(id: string, name: string): CourseData {
  return {
    id,
    name,
    flavor: 'A new course.',
    atmosphere: 'moonlit',
    start: { pos: [0, 0, 0], yaw: 0 },
    finish: { pos: [0, 0, -36] },
    checkpoints: [{ pos: [0, 0, -18], yaw: 0 }],
    killY: -20,
    medals: { bronze: 60, silver: 45, gold: 30 },
    droneHz: 55,
    backdrop: { seed: 1, count: 12, radius: 140, height: 60 },
    pieces: [{ id: 'floor', type: 'block', pos: [0, -1, -18], size: [10, 1, 44], group: 'Start' }],
    jumpLinks: [],
    lights: [],
  };
}
