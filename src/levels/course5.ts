import type { CourseData } from './types';

/**
 * Course 5 — The Bell Tower. A vertical climb combining every skill: two
 * turns of a square spiral around an open shaft — stairs, wall runs,
 * clings, mantles and slides — to the bell hanging over the void.
 * Shortcut: leap from the east landing onto the central masonry and climb
 * it face by face straight to the bell.
 *
 * Tower interior spans x, z in [-14, 14]; landings are 5 m deep.
 */
export const course5: CourseData = {
  id: 'belltower',
  name: 'The Bell Tower',
  flavor: 'It has not rung in four hundred years. It is waiting for you.',
  atmosphere: 'storm',
  start: { pos: [-11.5, 0, 12], yaw: 0 },
  finish: { pos: [0, 20.5, 0] },
  checkpoints: [
    { pos: [-11.5, 6, -11.5], yaw: -90 },
    { pos: [11.5, 10.5, 11.5], yaw: 90 },
    { pos: [-11.5, 16, -11.5], yaw: -90 },
    { pos: [11.5, 16, 11.5], yaw: 90 },
  ],
  killY: -10,
  medals: { bronze: 38, silver: 28, gold: 11 },
  droneHz: 36.7,
  backdrop: { seed: 51, count: 12, radius: 110, height: 45 },
  pieces: [
    // ---- First turn ---------------------------------------------------------------------
    { id: 'sw0', type: 'block', pos: [-11.5, -1, 11.5], size: [5, 1, 5] },
    { id: 'w1', type: 'stairs', pos: [-11.5, 0, 0], size: [5, 6, 18] },
    { id: 'nw1', type: 'block', pos: [-11.5, 5, -11.5], size: [5, 1, 5] },
    { id: 'n1a', type: 'block', pos: [-7, 5, -11.5], size: [4, 1, 5] },
    { id: 'n1wall', type: 'block', pos: [0, -10, -14.5], size: [12, 22, 1], tags: ['wallrun'] },
    { id: 'n1b', type: 'block', pos: [7, 5, -11.5], size: [4, 1, 5] },
    { id: 'ne1', type: 'block', pos: [11.5, 5, -11.5], size: [5, 1, 5] },
    { id: 'e1', type: 'block', pos: [11.5, 5, 0], size: [5, 5.5, 18], tags: ['mantle'] },
    { id: 'e1beam', type: 'block', pos: [11.5, 11.7, 0], size: [5, 1.2, 1], mat: 'wood' },
    { id: 'se1', type: 'block', pos: [11.5, 9.5, 11.5], size: [5, 1, 5] },
    { id: 's1a', type: 'block', pos: [6.5, 9.5, 11.5], size: [5, 1, 5] },
    { id: 's1b', type: 'block', pos: [-4.5, 10, 11.5], size: [9, 1, 5] },
    { id: 'sw1', type: 'block', pos: [-11.5, 10, 11.5], size: [5, 1, 5] },

    // ---- Second turn --------------------------------------------------------------------
    { id: 'w2a', type: 'block', pos: [-11.5, 10, 6], size: [5, 1, 6] },
    { id: 'w2b', type: 'block', pos: [-11.5, 10, 0], size: [5, 3.5, 6], tags: ['mantle'] },
    { id: 'w2c', type: 'block', pos: [-11.5, 10, -6], size: [5, 6, 6], tags: ['mantle'] },
    { id: 'nw2', type: 'block', pos: [-11.5, 15, -11.5], size: [5, 1, 5] },
    { id: 'n2a', type: 'block', pos: [-5.5, 15, -11.5], size: [7, 1, 5] },
    { id: 'n2b', type: 'block', pos: [5.5, 15, -11.5], size: [7, 1, 5] },
    { id: 'n2beam', type: 'block', pos: [5.5, 17.2, -11.5], size: [1, 1.2, 5], mat: 'wood' },
    { id: 'ne2', type: 'block', pos: [11.5, 15, -11.5], size: [5, 1, 5] },
    { id: 'e2wall', type: 'block', pos: [14.5, 8, -3], size: [1, 16, 14], tags: ['wallrun'] },
    { id: 'e2b', type: 'block', pos: [11.5, 15, 5.5], size: [5, 1, 7] },
    { id: 'se2', type: 'block', pos: [11.5, 15, 11.5], size: [5, 1, 5] },
    { id: 's2a', type: 'block', pos: [5.5, 15, 11.5], size: [7, 1, 5] },
    { id: 's2b', type: 'block', pos: [-5.5, 15, 11.5], size: [7, 1, 5] },
    { id: 'sw3', type: 'block', pos: [-11.5, 15, 11.5], size: [5, 5.5, 5], tags: ['mantle'] },

    // ---- The bell, hung over the shaft ------------------------------------------------------
    { id: 'bridgeA', type: 'block', pos: [-5.25, 20, 11.5], size: [7.5, 0.5, 3], mat: 'wood' },
    { id: 'bridgeB', type: 'block', pos: [0, 20, 8], size: [3, 0.5, 10], mat: 'wood' },
    { id: 'belfry', type: 'block', pos: [0, -20, 0], size: [6, 40.5, 6] },

    // ---- Shortcut: the central masonry, climbed face by face ----------------------------------
    { id: 'b1', type: 'block', pos: [1, -20, 5], size: [8, 27, 4], tags: ['mantle'] },
    { id: 'b2', type: 'block', pos: [5, -20, -1], size: [4, 31.5, 8], tags: ['mantle'] },
    { id: 'b3', type: 'block', pos: [-1, -20, -5], size: [8, 36, 4], tags: ['mantle'] },

    // ---- Tower walls --------------------------------------------------------------------------
    { type: 'windowwall', pos: [-10, -20, -14.5], size: [8, 64, 1] },
    { type: 'windowwall', pos: [10, -20, -14.5], size: [8, 64, 1] },
    { type: 'block', pos: [0, 12, -14.5], size: [12, 32, 1] },
    { type: 'block', pos: [14.5, -20, -3], size: [1, 28, 14] },
    { type: 'block', pos: [14.5, 24, -3], size: [1, 20, 14] },
    { type: 'windowwall', pos: [14.5, -20, 9.5], size: [11, 64, 1], rot: 90 },
    { type: 'block', pos: [14.5, -20, -12.25], size: [1, 64, 4.5] },
    { type: 'windowwall', pos: [0, -20, 14.5], size: [30, 64, 1] },
    { type: 'windowwall', pos: [-14.5, -20, 0], size: [30, 64, 1], rot: 90 },
    { type: 'pillar', pos: [-14, 44, -14], size: [3, 10, 3], tags: ['deco'] },
    { type: 'pillar', pos: [14, 44, -14], size: [3, 10, 3], tags: ['deco'] },
    { type: 'pillar', pos: [-14, 44, 14], size: [3, 10, 3], tags: ['deco'] },
    { type: 'pillar', pos: [14, 44, 14], size: [3, 10, 3], tags: ['deco'] },
    { type: 'spire', pos: [-14, 54, -14], size: [3, 14, 3] },
    { type: 'spire', pos: [14, 54, -14], size: [3, 14, 3] },
    { type: 'spire', pos: [-14, 54, 14], size: [3, 14, 3] },
    { type: 'spire', pos: [14, 54, 14], size: [3, 14, 3] },
    { type: 'candles', pos: [-12.5, 0, 12.5], size: [0.8, 0.3, 0.8] },
    { type: 'candles', pos: [12.5, 16, -12.5], size: [0.8, 0.3, 0.8] },
  ],
  jumpLinks: [
    { from: 'n1a', to: 'n1b', move: 'wallrun', via: 'n1wall' },
    { from: 'ne1', to: 'e1', move: 'climb' },
    { from: 's1a', to: 's1b', move: 'run-jump' },
    { from: 'w2a', to: 'w2b', move: 'mantle' },
    { from: 'w2b', to: 'w2c', move: 'mantle' },
    { from: 'n2a', to: 'n2b', move: 'run-jump' },
    { from: 'ne2', to: 'e2b', move: 'wallrun', via: 'e2wall' },
    { from: 's2a', to: 's2b', move: 'run-jump' },
    { from: 's2b', to: 'sw3', move: 'climb' },
    { from: 'e1', to: 'b2', move: 'run-jump', route: 'shortcut' },
    { from: 'b2', to: 'b3', move: 'climb', route: 'shortcut' },
    { from: 'b3', to: 'belfry', move: 'climb', route: 'shortcut' },
  ],
  lights: [
    { pos: [-11, 3, 0], color: 0xffa050, intensity: 1.2, range: 10 },
    { pos: [0, 9, -11], color: 0xffa050, intensity: 1.2, range: 10 },
    { pos: [11, 13.5, 0], color: 0xffa050, intensity: 1.2, range: 10 },
  ],
};
