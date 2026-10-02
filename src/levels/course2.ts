import type { CourseData } from './types';

/**
 * Course 2 — The Nave. Introduces wall running.
 * The nave floor has fallen into the crypt; ivory screens between the
 * colonnade pillars carry you across. Safe route: around the enclosed
 * south aisle. Shortcut: chain two wall runs across the great chasm.
 */
export const course2: CourseData = {
  id: 'nave',
  name: 'The Nave',
  flavor: 'Pale stone remembers the feet of saints. Run where they walked: on the walls.',
  atmosphere: 'nave',
  start: { pos: [0, 0, -3], yaw: 0 },
  finish: { pos: [0, 0, -192] },
  checkpoints: [
    { pos: [-2, 0, -44], yaw: 0 },
    { pos: [-2, 0, -76], yaw: 0 },
    { pos: [-2, 0, -122], yaw: 0 },
  ],
  killY: -16,
  medals: { bronze: 42, silver: 32, gold: 23 },
  droneHz: 49,
  backdrop: { seed: 23, count: 10, radius: 140, height: 60 },
  pieces: [
    // ---- Nave floor sections ----------------------------------------------------------
    { id: 'nave1', type: 'block', pos: [0, -1, -15], size: [14, 1, 30] },
    { id: 'nave2', type: 'block', pos: [0, -1, -49], size: [14, 1, 22] },
    { id: 'nave3', type: 'block', pos: [0, -1, -75], size: [14, 1, 10] },
    { id: 'nave4', type: 'block', pos: [0, -1, -119], size: [14, 1, 22] },
    { id: 'crossing', type: 'block', pos: [0, -1, -155], size: [20, 1, 28] },
    { id: 'choir', type: 'block', pos: [0, -1, -190], size: [14, 1, 24] },

    // ---- Wall-run screens (ivory with gold trim) --------------------------------------
    // B: first wall run, on the left, over an 8 m gap.
    { id: 'wallB', type: 'block', pos: [-7.5, -12, -34], size: [1, 17, 18], tags: ['wallrun'] },
    // C: on the right, over a 10 m gap.
    { id: 'wallC', type: 'block', pos: [7.5, -12, -63], size: [1, 17, 16], tags: ['wallrun'] },
    // D: shortcut straight over the chasm — two left screens with a broken floor island between.
    { id: 'wallD1', type: 'block', pos: [-7.5, -12, -87], size: [1, 17, 18], tags: ['wallrun'] },
    { id: 'island', type: 'block', pos: [-4, -1, -94], size: [6, 1, 8] },
    { id: 'wallD2', type: 'block', pos: [-7.5, -12, -105], size: [1, 17, 18], tags: ['wallrun'] },
    // E: wall run to the crossing, 11 m.
    { id: 'wallE', type: 'block', pos: [-7.5, -12, -135.5], size: [1, 17, 20], tags: ['wallrun'] },
    // F: into the choir, 9 m, on the right.
    { id: 'wallF', type: 'block', pos: [7.5, -12, -173.5], size: [1, 17, 19], tags: ['wallrun'] },

    // ---- Safe route: out through the side chapel and down the south aisle ---------------
    { id: 'entry', type: 'block', pos: [13.5, -1, -75.5], size: [13, 1, 9] },
    { type: 'block', pos: [8, -12, -97], size: [2, 22, 34], mat: 'darkstone' },
    { id: 'aisleA', type: 'block', pos: [23, -1, -90], size: [6, 1, 38] },
    { id: 'rubble', type: 'block', pos: [23, 0, -88], size: [6, 2.2, 1.2], tags: ['mantle'], mat: 'darkstone' },
    { id: 'aisleBeam', type: 'block', pos: [23, 1.2, -100], size: [6, 1.2, 1], mat: 'wood' },
    { id: 'aisleB', type: 'block', pos: [23, -1, -117.5], size: [6, 1, 9] },
    { id: 'exit', type: 'block', pos: [13.5, -1, -118], size: [13, 1, 8] },
    { type: 'block', pos: [19.5, -12, -96.5], size: [1, 24, 33], mat: 'darkstone' },
    { type: 'windowwall', pos: [26.75, -16, -97], size: [56, 40, 1.5], rot: 90 },
    { type: 'block', pos: [23, 10, -96], size: [8, 1, 52], mat: 'darkstone' },
    { type: 'pillar', pos: [20.5, -12, -72], size: [1.2, 22, 1.2], tags: ['deco'] },

    // ---- Architecture: colonnades, arches, outer walls ---------------------------------
    { type: 'pillar', pos: [-9.5, -16, 0], size: [2.2, 46, 2.2], repeat: { count: 19, step: [0, 0, -8] }, tags: ['deco'] },
    { type: 'pillar', pos: [9.5, -16, 0], size: [2.2, 46, 2.2], repeat: { count: 9, step: [0, 0, -8] }, tags: ['deco'] },
    { type: 'pillar', pos: [9.5, -16, -128], size: [2.2, 46, 2.2], repeat: { count: 3, step: [0, 0, -8] }, tags: ['deco'] },
    { type: 'arch', pos: [-9.5, 14, -4], size: [8, 10, 1.2], rot: 90, repeat: { count: 18, step: [0, 0, -8] }, tags: ['deco'] },
    { type: 'windowwall', pos: [-17, -16, -76], size: [160, 56, 1.5], rot: 90 },
    { type: 'windowwall', pos: [17, -16, -30], size: [64, 56, 1.5], rot: 90 },
    { type: 'windowwall', pos: [0, -16, 3], size: [34, 56, 1.5] },
    { type: 'rosewindow', pos: [0, 18, 1.8], size: [10, 10, 0.6] },
    // Crossing tower.
    { type: 'block', pos: [0, 30, -155], size: [24, 16, 24], mat: 'darkstone' },
    { type: 'spire', pos: [0, 46, -155], size: [20, 50, 20] },
    { type: 'windowwall', pos: [-13, -16, -170], size: [10, 56, 1.5] },
    { type: 'windowwall', pos: [13, -16, -170], size: [10, 56, 1.5] },
    { type: 'block', pos: [0, 16, -170], size: [16, 24, 1.5] },
    { type: 'rosewindow', pos: [0, 20, -168.8], size: [12, 12, 0.6] },
    // Choir and apse.
    { type: 'windowwall', pos: [-8.5, -16, -190], size: [40, 50, 1.5], rot: 90 },
    { type: 'windowwall', pos: [8.5, -16, -194], size: [24, 50, 1.5], rot: 90 },
    { type: 'windowwall', pos: [0, -16, -203], size: [18, 50, 1.5] },
    { type: 'rosewindow', pos: [0, 10, -201.8], size: [9, 9, 0.6] },
    { type: 'candles', pos: [-5, 0, -196], size: [0.8, 0.3, 0.8] },
    { type: 'candles', pos: [5, 0, -196], size: [0.8, 0.3, 0.8] },
    { type: 'candles', pos: [5, 0, -150], size: [0.8, 0.3, 0.8] },
    { type: 'candles', pos: [-5, 0, -160], size: [0.8, 0.3, 0.8] },
    { type: 'candles', pos: [5, 0, -20], size: [0.8, 0.3, 0.8] },
  ],
  jumpLinks: [
    { from: 'nave1', to: 'nave2', move: 'wallrun', via: 'wallB' },
    { from: 'nave2', to: 'nave3', move: 'wallrun', via: 'wallC' },
    { from: 'aisleA', to: 'rubble', move: 'mantle' },
    { from: 'nave3', to: 'island', move: 'wallrun', via: 'wallD1', route: 'shortcut' },
    { from: 'island', to: 'nave4', move: 'wallrun', via: 'wallD2', route: 'shortcut' },
    { from: 'nave4', to: 'crossing', move: 'wallrun', via: 'wallE' },
    { from: 'crossing', to: 'choir', move: 'wallrun', via: 'wallF' },
  ],
  lights: [
    { pos: [5, 1, -20], color: 0xffa050, intensity: 1.0, range: 8 },
    { pos: [23, 3, -90], color: 0xffa050, intensity: 1.3, range: 12 },
    { pos: [0, 4, -150], color: 0xffb060, intensity: 1.2, range: 14 },
    { pos: [0, 2, -197], color: 0xffa050, intensity: 1.2, range: 10 },
  ],
};
