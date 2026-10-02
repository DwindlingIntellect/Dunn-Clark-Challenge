import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { COURSES } from '../src/levels/index';
import { decodeInputs, encodeInputs, type EncodedInputs } from '../src/sim/inputRecording';
import { ROUTES } from './routes';
import { runCourse } from './runCourse';

/**
 * Scripted-input smoke test: course 1 is played headlessly from start to
 * finish by replaying a recorded input sequence (tests/fixtures).
 * Re-record after changing course 1 or movement.ts: `npm run record`.
 */
const FIXTURE = new URL('./fixtures/narthex-safe.inputs.json', import.meta.url);

describe('smoke: course 1 from a recorded input sequence', () => {
  it('records (when RECORD=1)', async () => {
    if (!process.env.RECORD && existsSync(FIXTURE)) return;
    const course = COURSES[0];
    const r = await runCourse(course, ROUTES[course.id].safe);
    expect(r.finished).toBe(true);
    // Remove the inputs after the finish line and quantise exactly as encoded.
    writeFileSync(FIXTURE, JSON.stringify({ course: course.id, ticks: r.inputs.length, time: r.time, inputs: encodeInputs(r.inputs) }));
  });

  it('replays the recording and reaches the bell', async () => {
    const data = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { course: string; time: number; inputs: EncodedInputs };
    const course = COURSES.find((c) => c.id === data.course)!;
    expect(course).toBeDefined();
    const inputs = decodeInputs(data.inputs);
    const r = await runCourse(course, inputs, inputs.length / 120 + 1);
    expect(r.finished, r.trace).toBe(true);
    expect(r.respawns).toBe(0);
    expect(r.time).toBeCloseTo(data.time, 1);
  });
});
