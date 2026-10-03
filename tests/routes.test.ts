import { describe, it, expect } from 'vitest';
import { COURSES } from '../src/levels/index';
import { ROUTES } from './routes';
import { runCourse } from './runCourse';

/**
 * Every campaign course is driven start-to-finish by the autopilot along
 * its safe route and its shortcut route, with zero falls. Gold must need
 * the shortcut: the best safe-route time cannot beat the gold time.
 */
describe.each(COURSES.map((c) => [c.name, c] as const))('%s routes', (_n, course) => {
  const routes = ROUTES[course.id];

  // Courses without hand-written routes (e.g. fresh editor drafts) are skipped.
  for (const kind of ['safe', 'shortcut'] as const) {
    it.skipIf(!routes)(`can be finished on the ${kind} route without falling`, async () => {
      const r = await runCourse(course, routes[kind]);
      if (process.env.ROUTE_LOG) process.stderr.write(`${course.id} ${kind}: ${r.time.toFixed(2)}s finished=${r.finished}\n${r.trace}\n`);
      expect(r.finished, r.trace).toBe(true);
      expect(r.respawns, r.trace).toBe(0);
      if (kind === 'safe') {
        expect(r.time).toBeGreaterThan(course.medals.gold);
        expect(r.time).toBeLessThan(course.medals.silver);
      } else {
        expect(r.time).toBeLessThan(course.medals.gold);
      }
    });
  }
});
