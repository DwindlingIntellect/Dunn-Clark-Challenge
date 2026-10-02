import type { CourseData } from './types';
import { testCourse } from './testCourse';
import { course1 } from './course1';
import { course2 } from './course2';
import { course3 } from './course3';
import { course4 } from './course4';
import { course5 } from './course5';
import { course6 } from './course6';

/**
 * Course registry. Campaign courses unlock in this order.
 *
 * In dev mode, editing a course file hot-reloads it: Vite re-imports the
 * module, we swap it into the registry and notify listeners (the game
 * rebuilds the level in place without a page refresh).
 */
export const COURSES: CourseData[] = [course1, course2, course3, course4, course5, course6];

export function allCourses(): CourseData[] {
  return [...COURSES, testCourse];
}

export function courseById(id: string): CourseData | undefined {
  return allCourses().find((c) => c.id === id);
}

type Listener = (course: CourseData) => void;
const listeners = new Set<Listener>();

/** Subscribe to hot-reloaded course data (dev only). */
export function onCourseHotUpdate(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function swapIn(updated: CourseData): void {
  const i = COURSES.findIndex((c) => c.id === updated.id);
  if (i >= 0) COURSES[i] = updated;
  else if (updated.id === testCourse.id) Object.assign(testCourse, updated);
  for (const fn of listeners) fn(updated);
}

if (import.meta.hot) {
  import.meta.hot.accept(['./course1', './course2', './course3', './course4', './course5', './course6', './testCourse'], (mods) => {
    for (const m of mods) {
      if (!m) continue;
      for (const value of Object.values(m)) {
        if (value && typeof value === 'object' && 'pieces' in value) swapIn(value as CourseData);
      }
    }
  });
}
