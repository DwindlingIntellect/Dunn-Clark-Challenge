import type { CourseData } from './types';

/**
 * Course 1 — The Narthex. Teaches sprinting, jumping and sliding.
 * Route runs toward -Z: a long processional forecourt, the great west
 * portal, then the ruined narthex whose floor has fallen into the crypt.
 * Safe route: around the right-hand side aisle. Shortcut: across the
 * fallen roof timbers over the chasm.
 */
export const course1: CourseData = {
  id: 'narthex',
  name: 'The Narthex',
  flavor: 'The doors were never locked. Nobody was ever meant to leave.',
  atmosphere: 'moonlit',
  start: { pos: [0, 0, 56], yaw: 0 },
  finish: { pos: [0, 0, -167] },
  checkpoints: [
    { pos: [0, 1.5, -70], yaw: 0 },
    { pos: [3, 0.5, -123], yaw: 0 },
    { pos: [17.5, 0, -170], yaw: 0 },
  ],
  killY: -18,
  medals: { bronze: 48, silver: 36, gold: 26 },
  droneHz: 55,
  backdrop: { seed: 11, count: 14, radius: 150, height: 70 },
  pieces: [
    // ---- Processional forecourt ------------------------------------------------
    { id: 'fc0', type: 'block', pos: [0, -1, 40], size: [16, 1, 40] },
    { id: 'fc1', type: 'block', pos: [0, -1, -6], size: [16, 1, 46] },
    { id: 'lowwall', type: 'block', pos: [0, 0, 2], size: [16, 0.9, 0.7], mat: 'darkstone' },
    { id: 'fc2', type: 'block', pos: [0, -1, -46], size: [16, 1, 28] },
    // A fallen column to slide under (1.2 m clearance).
    { id: 'fallen', type: 'block', pos: [0, 1.2, -45], size: [16, 1.0, 1.0], mat: 'darkstone' },
    // Broken colonnade lining the forecourt, rising out of the fog.
    { type: 'pillar', pos: [-9.6, -14, 52], size: [1.6, 24, 1.6], repeat: { count: 11, step: [0, 0, -11] }, tags: ['deco'] },
    { type: 'pillar', pos: [9.6, -14, 52], size: [1.6, 24, 1.6], repeat: { count: 11, step: [0, 0, -11] }, tags: ['deco'] },
    { type: 'lantern', pos: [-7, 0, 30], size: [0.5, 0.8, 0.5] },
    { type: 'candles', pos: [6.8, 0, 10], size: [0.8, 0.3, 0.8] },
    { type: 'candles', pos: [-6.8, 0, -20], size: [0.8, 0.3, 0.8] },

    // ---- Steps, porch and the west facade ---------------------------------------
    { id: 'steps', type: 'stairs', pos: [0, 0, -63], size: [10, 1.5, 6] },
    { id: 'porch', type: 'block', pos: [0, 0, -72], size: [18, 1.5, 12] },
    { type: 'windowwall', pos: [-15.5, -20, -77], size: [23, 47.5, 2] },
    { type: 'windowwall', pos: [15.5, -20, -77], size: [23, 47.5, 2] },
    { id: 'portal', type: 'arch', pos: [0, 1.5, -77], size: [8, 13, 2.6] },
    { type: 'block', pos: [0, 14.5, -77], size: [8, 13, 2] },
    { type: 'rosewindow', pos: [0, 16, -75.6], size: [7, 7, 0.6] },
    { type: 'block', pos: [-31, -20, -77], size: [8, 62, 8] },
    { type: 'spire', pos: [-31, 42, -77], size: [8, 30, 8] },
    { type: 'block', pos: [31, -20, -77], size: [8, 62, 8] },
    { type: 'spire', pos: [31, 42, -77], size: [8, 30, 8] },
    { type: 'buttress', pos: [-22, -20, -68], size: [1.5, 40, 12] },
    { type: 'buttress', pos: [22, -20, -68], size: [1.5, 40, 12] },

    // ---- The ruined narthex -------------------------------------------------------
    { id: 'nx1', type: 'block', pos: [0, 0.5, -85], size: [18, 1, 14] },
    { id: 'nx2', type: 'block', pos: [0, 0.5, -105], size: [18, 1, 18] },
    { id: 'beam', type: 'block', pos: [0, 2.7, -104], size: [18, 1.2, 1.2], mat: 'wood' },
    { id: 'nx3', type: 'block', pos: [0, -0.5, -127], size: [18, 1, 16] },
    // Hall walls and the giant arcade pillars.
    { type: 'windowwall', pos: [-12.5, -20, -138], size: [120, 52, 1.5], rot: 90 },
    { type: 'windowwall', pos: [23.5, -20, -138], size: [120, 52, 1.5], rot: 90 },
    { type: 'pillar', pos: [-10.6, -20, -84], size: [2, 52, 2], repeat: { count: 7, step: [0, 0, -14] } },
    { type: 'pillar', pos: [11.6, -20, -84], size: [2, 52, 2], repeat: { count: 3, step: [0, 0, -14] } },
    { type: 'candles', pos: [-7.5, 1.5, -88], size: [0.8, 0.3, 0.8] },
    { type: 'candles', pos: [7.5, 0.5, -132], size: [0.8, 0.3, 0.8] },

    // ---- Shortcut: fallen roof timbers over the chasm ------------------------------------
    { id: 'timberA', type: 'block', pos: [-2, -1, -142], size: [1.4, 1, 8], mat: 'wood' },
    { id: 'timberB', type: 'block', pos: [-1, -1.5, -154], size: [1.4, 1, 8], mat: 'wood' },

    // ---- Safe route: the right-hand side aisle --------------------------------------------
    { id: 'bridge', type: 'walkway', pos: [12, -0.5, -127], size: [4, 1, 6], rot: 90 },
    { id: 'aisle1', type: 'block', pos: [17.5, -1, -133], size: [7, 1, 30] },
    { id: 'aisleArch', type: 'block', pos: [17.5, 1.2, -140], size: [7, 1.2, 1.5], mat: 'darkstone' },
    { id: 'aisle2', type: 'block', pos: [17.5, -1, -174], size: [7, 1, 44] },
    // The aisle is walled off from the landing: go round by the cross passage.
    { type: 'block', pos: [13, -20, -175], size: [1.5, 40, 28], mat: 'darkstone' },
    { id: 'cross', type: 'block', pos: [6, -1, -193], size: [30, 1, 6] },
    { type: 'candles', pos: [19, 0, -194], size: [0.8, 0.3, 0.8] },

    // ---- The bell, ringing over the chasm --------------------------------------------
    { id: 'landing', type: 'block', pos: [1.5, -1, -176], size: [21, 1, 28] },
    { type: 'windowwall', pos: [-8, -20, -198], size: [16, 52, 1.5] },
    { type: 'windowwall', pos: [17, -20, -198], size: [14, 52, 1.5] },
    { type: 'arch', pos: [4, 0, -198], size: [10, 14, 2], tags: ['deco'] },
    { type: 'block', pos: [4, 14, -198], size: [10, 18, 1.5] },
    { type: 'rosewindow', pos: [4, 16, -196.8], size: [8, 8, 0.6] },
  ],
  jumpLinks: [
    { from: 'fc0', to: 'fc1', move: 'run-jump' },
    { from: 'fc1', to: 'fc2', move: 'run-jump' },
    { from: 'nx1', to: 'nx2', move: 'run-jump' },
    { from: 'nx2', to: 'nx3', move: 'run-jump' },
    { from: 'aisle1', to: 'aisle2', move: 'run-jump' },
    { from: 'nx3', to: 'timberA', move: 'run-jump', route: 'shortcut' },
    { from: 'timberA', to: 'timberB', move: 'run-jump', route: 'shortcut' },
    { from: 'timberB', to: 'landing', move: 'run-jump', route: 'shortcut' },
  ],
  lights: [
    { pos: [-7, 1.5, 30], color: 0xffa050, intensity: 1.2, range: 9 },
    { pos: [-7.5, 2.5, -88], color: 0xffa050, intensity: 1.0, range: 8 },
    { pos: [0, 5, -77], color: 0xffb060, intensity: 1.2, range: 12 },
  ],
};
