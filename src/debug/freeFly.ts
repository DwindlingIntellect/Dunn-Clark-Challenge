import { Vector3 } from 'three';
import type { Input } from '../core/input';

/** Debug free-fly camera: WASD to move, Space/C for up/down, Shift for speed. */
export class FreeFly {
  readonly pos = new Vector3();
  speed = 15;

  update(input: Input, dt: number): void {
    const yaw = input.yaw;
    const pitch = input.pitch;
    const fwd = new Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const v = new Vector3();
    if (input.isDown('KeyW')) v.add(fwd);
    if (input.isDown('KeyS')) v.sub(fwd);
    if (input.isDown('KeyD')) v.add(right);
    if (input.isDown('KeyA')) v.sub(right);
    if (input.isDown('Space')) v.y += 1;
    if (input.isDown('KeyC')) v.y -= 1;
    const fast = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    if (v.lengthSq() > 0) v.normalize().multiplyScalar(this.speed * (fast ? 4 : 1) * dt);
    this.pos.add(v);
  }
}
