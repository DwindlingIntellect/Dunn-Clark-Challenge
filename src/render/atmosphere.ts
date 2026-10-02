import type { AtmospherePreset } from '../levels/types';

/** Fog, ambient and sky colours for a course. Colours are 0xRRGGBB. */
export interface Atmosphere {
  fogColor: number;
  fogNear: number;
  fogFar: number;
  /** Below this height everything fades into fog (death pits). */
  heightFogTop: number;
  /** Height over which the height fog thickens to full. */
  heightFogRange: number;
  ambient: number;
  skyLight: number;
  groundLight: number;
  moonColor: number;
  /** Direction *toward* the moon. */
  moonDir: [number, number, number];
  skyTop: number;
  skyHorizon: number;
  stars: number;
  /** Optional sea of clouds at this height (above-the-clouds finale). */
  cloudY?: number;
}

export const ATMOSPHERES: Record<AtmospherePreset, Atmosphere> = {
  moonlit: {
    fogColor: 0x2a3140, fogNear: 12, fogFar: 140, heightFogTop: -6, heightFogRange: 14,
    ambient: 0x1c2230, skyLight: 0x4a5670, groundLight: 0x15161c, moonColor: 0x8090b8,
    moonDir: [0.35, 0.7, -0.6], skyTop: 0x0c1020, skyHorizon: 0x2a3140, stars: 0.3,
  },
  nave: {
    fogColor: 0x1e222c, fogNear: 10, fogFar: 120, heightFogTop: -4, heightFogRange: 10,
    ambient: 0x1a1c24, skyLight: 0x3a4258, groundLight: 0x16130f, moonColor: 0x6a7aa8,
    moonDir: [-0.4, 0.6, -0.5], skyTop: 0x080a12, skyHorizon: 0x1e222c, stars: 0.1,
  },
  dusk: {
    fogColor: 0x3a3048, fogNear: 14, fogFar: 160, heightFogTop: -8, heightFogRange: 14,
    ambient: 0x221c2a, skyLight: 0x5a4a6a, groundLight: 0x1a1418, moonColor: 0x9a8ab0,
    moonDir: [0.6, 0.45, 0.4], skyTop: 0x141020, skyHorizon: 0x4a3a50, stars: 0.4,
  },
  crypt: {
    fogColor: 0x0c0e0c, fogNear: 4, fogFar: 46, heightFogTop: -6, heightFogRange: 6,
    ambient: 0x101410, skyLight: 0x1e2620, groundLight: 0x0a0a08, moonColor: 0x303a30,
    moonDir: [0, 1, 0], skyTop: 0x030403, skyHorizon: 0x0c0e0c, stars: 0,
  },
  storm: {
    fogColor: 0x30363e, fogNear: 10, fogFar: 130, heightFogTop: -10, heightFogRange: 16,
    ambient: 0x1e2228, skyLight: 0x505a68, groundLight: 0x16171a, moonColor: 0x7a8494,
    moonDir: [-0.5, 0.6, 0.3], skyTop: 0x101418, skyHorizon: 0x30363e, stars: 0,
  },
  abovecloud: {
    fogColor: 0x3a4660, fogNear: 30, fogFar: 260, heightFogTop: 40, heightFogRange: 30,
    ambient: 0x1c2234, skyLight: 0x5a6a90, groundLight: 0x2a3040, moonColor: 0xb0c0e8,
    moonDir: [0.3, 0.45, -0.85], skyTop: 0x050812, skyHorizon: 0x3a4660, stars: 1, cloudY: 52,
  },
  test: {
    fogColor: 0x505860, fogNear: 30, fogFar: 220, heightFogTop: -20, heightFogRange: 10,
    ambient: 0x404448, skyLight: 0x9098a8, groundLight: 0x303030, moonColor: 0x9090a0,
    moonDir: [0.4, 0.8, 0.3], skyTop: 0x303844, skyHorizon: 0x505860, stars: 0,
  },
};
