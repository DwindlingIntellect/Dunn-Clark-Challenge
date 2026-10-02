import type { MovementConfig } from '../config/movement';
import type { PlayerController } from '../sim/controller';
import type { SimEvent } from '../sim/types';

/**
 * Render-side camera feel: FOV kick, head bob, landing dip and wall-run
 * tilt. Purely cosmetic (never feeds back into the simulation). All
 * effects are configured in the `camera` section of movement.ts.
 */
export class CameraFeel {
  /** Extra horizontal FOV in degrees. */
  fovKick = 0;
  /** Vertical camera offset in meters (bob + dip). */
  offsetY = 0;
  /** Camera roll in radians. */
  roll = 0;
  private dip = 0;
  private dipVel = 0;
  private bobWeight = 0;

  constructor(private cfg: MovementConfig) {}

  onEvent(e: SimEvent): void {
    const c = this.cfg.camera;
    if (e.type === 'land' && c.landingDip && e.fallSpeed > 3) {
      this.dipVel -= Math.min(c.landingDipMax, e.fallSpeed * c.landingDipScale) * 14;
    }
  }

  reset(): void {
    this.fovKick = 0;
    this.offsetY = 0;
    this.roll = 0;
    this.dip = 0;
    this.dipVel = 0;
  }

  update(p: PlayerController, dt: number): void {
    const c = this.cfg.camera;
    const k = (rate: number) => 1 - Math.exp(-rate * dt);

    // FOV kick with speed.
    let fovTarget = 0;
    if (c.fovKick) {
      const t = (p.speed - c.fovSpeedMin) / Math.max(0.01, c.fovSpeedMax - c.fovSpeedMin);
      fovTarget = c.fovKickDegrees * Math.min(1, Math.max(0, t));
    }
    this.fovKick += (fovTarget - this.fovKick) * k(6);

    // Head bob follows the stride distance so it syncs with footsteps.
    const bobOn = c.headBob && p.mode === 'ground' && p.grounded ? Math.min(1, p.horizontalSpeed / 8) : 0;
    this.bobWeight += (bobOn - this.bobWeight) * k(10);
    const phase = (p.stride / Math.max(0.1, c.strideLength)) * Math.PI * 2;
    const bob = -Math.abs(Math.sin(phase)) * c.headBobAmount * this.bobWeight;

    // Landing dip: critically damped spring back to zero.
    const stiffness = 160;
    const damping = 2 * Math.sqrt(stiffness);
    this.dipVel += (-stiffness * this.dip - damping * this.dipVel) * dt;
    this.dip += this.dipVel * dt;
    if (!c.landingDip) this.dip = 0;
    this.offsetY = bob + this.dip;

    // Wall-run tilt away from the wall.
    let rollTarget = 0;
    if (c.wallRunTilt && p.mode === 'wallrun') {
      const rx = Math.cos(p.yaw);
      const rz = -Math.sin(p.yaw);
      const side = p.wallNormal.x * rx + p.wallNormal.z * rz;
      rollTarget = (side < 0 ? 1 : -1) * ((c.wallRunTiltDegrees * Math.PI) / 180);
    }
    this.roll += (rollTarget - this.roll) * k(8);
  }
}
