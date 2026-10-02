/**
 * PSX presentation settings. Edited live from the debug menu (PSX folder).
 * Fog values live in the per-course atmosphere and can also be overridden
 * from the debug menu.
 */
export const psx = {
  /** Master switch for the whole PSX effect (low-res, snap, affine, dither). */
  enabled: true,
  /** Internal render height in pixels; width follows the aspect ratio. */
  height: 240,
  /** '4:3' letterboxes like a CRT; 'fill' uses the window's aspect. */
  aspect: '4:3' as '4:3' | 'fill',
  /** Vertex snapping: 0 = off, 1 = snap to the low-res pixel grid, >1 coarser. */
  vertexSnap: 1,
  /** Affine (non perspective-correct) texture mapping. */
  affine: true,
  /** 4×4 ordered (Bayer) dithering before colour reduction. */
  dither: true,
  /** Dither amplitude in colour steps. */
  ditherStrength: 1,
  /** Bits per colour channel (5 = 15-bit colour). */
  colorBits: 5,
  /** Darkening toward the screen corners (0 = none). */
  vignette: 0.45,
};

export type PsxSettings = typeof psx;
