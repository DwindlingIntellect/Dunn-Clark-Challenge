import type { SurfaceKind } from './types';

/** Plain-data collider description produced by the level builder. */
export interface ColliderDesc {
  kind: 'box' | 'ramp';
  /** Center of the bounding box in world space. */
  center: [number, number, number];
  /** Half extents of the bounding box (local axes). */
  half: [number, number, number];
  /** Rotation about +Y in radians. */
  yaw: number;
  tags: string[];
  surface: SurfaceKind;
  /** Id of the level piece that produced this collider (for jump-link validation). */
  pieceId?: string;
}

export interface ColliderMeta {
  index: number;
  tags: Set<string>;
  surface: SurfaceKind;
  wallrun: boolean;
  pieceId?: string;
}
