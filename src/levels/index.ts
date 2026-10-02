import type { CourseData } from './types';
import { testCourse } from './testCourse';

/** Campaign courses in unlock order. */
export const COURSES: CourseData[] = [];

/** Every selectable course (campaign + test course) for the debug menu. */
export function allCourses(): CourseData[] {
  return [...COURSES, testCourse];
}

export function courseById(id: string): CourseData | undefined {
  return allCourses().find((c) => c.id === id);
}
