import { Vector3 } from 'three';
import { initPhysics, CollisionWorld } from '../src/sim/collision';
import { PlayerController } from '../src/sim/controller';
import { courseColliders } from '../src/levels/colliders';
import { RunState } from '../src/game/runState';
import { Autopilot, type Waypoint } from '../src/sim/autopilot';
import { SIM_DT } from '../src/core/loop';
import type { CourseData } from '../src/levels/types';
import type { PlayerInput } from '../src/sim/types';
import { MOVEMENT_DEFAULTS } from '../src/config/movement';

export interface RunResult {
  finished: boolean;
  time: number;
  respawns: number;
  inputs: PlayerInput[];
  trace: string;
}

/** Drive a course headlessly with an autopilot route or a recorded input list. */
export async function runCourse(course: CourseData, drive: Waypoint[] | PlayerInput[], maxSeconds = 150): Promise<RunResult> {
  await initPhysics();
  const world = new CollisionWorld(courseColliders(course));
  const pc = new PlayerController(world, structuredClone(MOVEMENT_DEFAULTS));
  const run = new RunState(course, pc);
  run.reset();
  const isRoute = drive.length > 0 && 'at' in (drive[0] as object);
  const pilot = isRoute ? new Autopilot(drive as Waypoint[], [course.start.pos[0], course.start.pos[2]]) : null;
  const inputs: PlayerInput[] = [];
  let lastPos = new Vector3();
  const trace: string[] = [];
  const maxTicks = Math.round(maxSeconds / SIM_DT);
  for (let t = 0; t < maxTicks && !run.finished; t++) {
    let inp: PlayerInput;
    if (pilot) {
      inp = pilot.next(pc);
      inp.yaw = Math.round(inp.yaw * 1e4) / 1e4;
    } else {
      inp = (drive as PlayerInput[])[t] ?? { forward: 0, right: 0, jump: false, crouch: false, yaw: 0, pitch: 0 };
    }
    inputs.push(inp);
    run.step(inp, SIM_DT);
    if (run.events.some((e) => e.type === 'respawn')) {
      trace.push(`respawn at t=${run.time.toFixed(2)} from ${lastPos.toArray().map((v) => v.toFixed(1)).join(',')} wp=${pilot?.index}`);
    }
    if (t % 60 === 0) lastPos = pc.pos.clone();
    if (pilot?.done && t > 0 && !run.finished && trace.length < 20 && t % 240 === 0) trace.push(`route done but not finished at ${pc.pos.toArray().map((v) => v.toFixed(1)).join(',')}`);
  }
  world.dispose();
  return {
    finished: run.finished,
    time: run.time,
    respawns: run.respawns,
    inputs,
    trace: trace.join('\n') + `\nend pos ${pc.pos.toArray().map((v) => v.toFixed(2)).join(',')} mode ${pc.mode} wp ${pilot?.index}`,
  };
}
