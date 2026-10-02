/** One simulation tick worth of player intent. Fully describes the input so runs are reproducible. */
export interface PlayerInput {
  /** -1 (back) .. 1 (forward) */
  forward: number;
  /** -1 (left) .. 1 (right) */
  right: number;
  /** Jump button held. */
  jump: boolean;
  /** Crouch / slide button held. */
  crouch: boolean;
  /** Look yaw in radians. 0 looks toward -Z; positive turns left (three.js convention). */
  yaw: number;
  /** Look pitch in radians, positive looks up. */
  pitch: number;
}

export function emptyInput(yaw = 0, pitch = 0): PlayerInput {
  return { forward: 0, right: 0, jump: false, crouch: false, yaw, pitch };
}

export type SurfaceKind = 'stone' | 'wood' | 'iron' | 'glass';

export type SimEvent =
  | { type: 'jump'; speed: number }
  | { type: 'land'; fallSpeed: number; surface: SurfaceKind }
  | { type: 'footstep'; surface: SurfaceKind; speed: number }
  | { type: 'slideStart'; speed: number }
  | { type: 'slideEnd' }
  | { type: 'wallrunStart'; side: number }
  | { type: 'wallrunEnd' }
  | { type: 'wallJump' }
  | { type: 'cling' }
  | { type: 'mantle' };
