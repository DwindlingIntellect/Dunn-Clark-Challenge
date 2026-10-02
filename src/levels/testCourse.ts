import type { CourseData } from './types';

/**
 * Gray proving ground with one example of every move. Not part of the
 * campaign; reachable from the debug menu's course select.
 * Route runs toward -Z.
 */
export const testCourse: CourseData = {
  id: 'test',
  name: 'Proving Ground',
  flavor: 'Grey stone, no ghosts. Learn the body before the cathedral.',
  atmosphere: 'test',
  start: { pos: [0, 0, 0], yaw: 0 },
  finish: { pos: [0, 1.2, -140] },
  checkpoints: [
    { pos: [0, 0, -28], yaw: 0 },
    { pos: [4, -6, -70], yaw: 0 },
    { pos: [0, -7, -104], yaw: 0 },
  ],
  killY: -30,
  medals: { bronze: 40, silver: 30, gold: 22 },
  pieces: [
    // 1. Run + jump a 4 m gap.
    { id: 'start', type: 'block', pos: [0, -1, -10], size: [12, 1, 24] },
    { id: 'p2', type: 'block', pos: [0, -1, -36], size: [12, 1, 20] },
    // 2. Slide under a low ceiling (1.2 m clearance).
    { id: 'tunnel', type: 'block', pos: [0, 1.2, -38], size: [12, 3, 6] },
    // 3. Slide down a ramp for speed.
    { id: 'ramp', type: 'ramp', pos: [0, -6, -56], size: [12, 6, 20], rot: 180 },
    { id: 'p3', type: 'block', pos: [0, -7, -76], size: [12, 1, 20] },
    // 4. Wall run across a 12 m pit along the left wall.
    { id: 'runwall', type: 'block', pos: [-6.5, -30, -93], size: [1, 34, 26], tags: ['wallrun'] },
    { id: 'p4', type: 'block', pos: [0, -8, -108], size: [12, 1, 16] },
    // 5. Cling and climb a 4.5 m wall.
    { id: 'climb', type: 'block', pos: [0, -7, -119], size: [12, 4.5, 6], tags: ['mantle'] },
    // 6. Mantle a 2.2 m ledge from standing.
    { id: 'ledge', type: 'block', pos: [0, -2.5, -127], size: [12, 2.2, 10], tags: ['mantle'] },
    // 7. Stairs up to the bell.
    { id: 'stairs', type: 'stairs', pos: [0, -0.3, -134], size: [4, 1.5, 4] },
    { id: 'belfry', type: 'block', pos: [0, 0.2, -139], size: [6, 1, 6] },
  ],
  jumpLinks: [
    { from: 'start', to: 'p2', move: 'run-jump' },
    { from: 'p3', to: 'p4', move: 'wallrun', via: 'runwall' },
    { from: 'p4', to: 'climb', move: 'climb' },
    { from: 'climb', to: 'ledge', move: 'mantle' },
  ],
  lights: [],
};
