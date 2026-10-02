/**
 * Course data format. Courses are plain data (see README "Authoring a course").
 *
 * Conventions:
 * - Units are meters. +Y is up. Yaw/rot are in degrees, counter-clockwise
 *   seen from above; yaw 0 faces -Z.
 * - `pos` of a piece is the center of its *bottom* face, so the top of a
 *   piece is at pos[1] + size[1].
 * - `size` is [width (x), height (y), depth (z)] before rotation.
 */
export type Vec3 = [number, number, number];

export type PieceType =
  /** Solid stone box (floors, platforms, walls). Collides. */
  | 'block'
  /** Wedge rising toward local -Z (its "front"). Collides as a ramp. */
  | 'ramp'
  /** Stepped stairs rising toward local -Z. Collides as a smooth ramp. */
  | 'stairs'
  /** Octagonal pillar. Collides (as a box) unless tagged 'deco'. */
  | 'pillar'
  /** Bridge/walkway slab with balustrades on both long sides. Collides. */
  | 'walkway'
  /** Pointed arch spanning `size[0]`; decorative unless tagged 'solid'. */
  | 'arch'
  /** Flying buttress leaning toward local -Z; decorative unless tagged 'solid'. */
  | 'buttress'
  /** Round tracery window (decorative). `size[0]` is the diameter. */
  | 'rosewindow'
  /** Tall pointed spire (decorative unless tagged 'solid'). */
  | 'spire'
  /** Pitched roof running along local Z; collides as two ramps. */
  | 'roof'
  /** Hanging/standing lantern (decorative, emits light). */
  | 'lantern'
  /** A cluster of candles (decorative). */
  | 'candles'
  /** Wall with pointed-arch window openings (visual); collides as a solid box. */
  | 'windowwall';

export type MaterialName = 'stone' | 'flagstone' | 'darkstone' | 'wood' | 'iron' | 'ivory' | 'glass' | 'bone' | 'slate';

/**
 * Tags:
 * - 'wallrun' : wall-runnable (rendered as pale ivory stone with gold trim)
 * - 'mantle'  : intended mantle/climb ledge (rendered with lit candles on the top edges)
 * - 'solid'   : force collision on a normally decorative piece
 * - 'deco'    : disable collision on a normally solid piece
 * - 'wood' | 'iron' : surface sound/material override
 */
export type PieceTag = 'wallrun' | 'mantle' | 'solid' | 'deco' | 'wood' | 'iron' | 'norails';

export interface Piece {
  /** Unique id; required for anything referenced by a jump link. */
  id?: string;
  type: PieceType;
  pos: Vec3;
  size?: Vec3;
  /** Yaw in degrees. */
  rot?: number;
  tags?: PieceTag[];
  mat?: MaterialName;
  /** Stamp `count` copies, each offset by `step`. Copies get ids `${id}.0`, `${id}.1`, … */
  repeat?: { count: number; step: Vec3 };
}

/**
 * How a jump on the intended route is made. Validation checks every link
 * against what the current movement config allows (with a 15% margin).
 */
export type MoveType =
  /** Standing-speed running jump (ground max speed). */
  | 'run-jump'
  /** Jump out of a slide (max speed + slide boost). */
  | 'slide-jump'
  /**
   * Slide down a ramp/stairs piece (`from`, or `via`) and jump at its low
   * edge. Validated by simulating that exact slope.
   */
  | 'boost-jump'
  /** Walk/run off an edge onto something lower. */
  | 'drop'
  /** Climb a ledge by mantling (optionally after a jump). */
  | 'mantle'
  /** Wall cling + climb, then mantle. */
  | 'climb'
  /** Wall run along `via`, then wall-jump or run off onto `to`. */
  | 'wallrun';

export interface JumpLink {
  from: string;
  to: string;
  move: MoveType;
  /** Wall piece used for wall runs. */
  via?: string;
  /** Which route this jump belongs to. */
  route?: 'safe' | 'shortcut';
}

export interface Checkpoint {
  pos: Vec3;
  /** Yaw in degrees for the player when respawning here. */
  yaw: number;
}

export type AtmospherePreset = 'moonlit' | 'nave' | 'dusk' | 'crypt' | 'storm' | 'abovecloud' | 'test';

export interface LightDef {
  pos: Vec3;
  color: number;
  intensity: number;
  range: number;
}

export interface CourseData {
  id: string;
  name: string;
  flavor: string;
  atmosphere: AtmospherePreset;
  start: { pos: Vec3; yaw: number };
  finish: { pos: Vec3 };
  checkpoints: Checkpoint[];
  pieces: Piece[];
  /** Falling below this height respawns at the last checkpoint. */
  killY: number;
  /** Medal thresholds in seconds. */
  medals: { bronze: number; silver: number; gold: number };
  jumpLinks: JumpLink[];
  /** Extra point lights (the builder caps total lights at 8). */
  lights?: LightDef[];
  /** Procedural backdrop of distant spires/towers. */
  backdrop?: { seed: number; count: number; radius: number; height: number };
  /** Drone root note (Hz) for the ambient audio. */
  droneHz?: number;
}
