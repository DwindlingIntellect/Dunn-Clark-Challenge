import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import type { ColliderDesc, ColliderMeta } from './colliderTypes';

/**
 * Thin wrapper around a Rapier world used purely for collision *queries*
 * (shape casts, ray casts, overlap tests). No rigid bodies are simulated.
 */

let initPromise: Promise<void> | null = null;

/** Initialise the Rapier WASM module once (works in browsers and Node). */
export function initPhysics(): Promise<void> {
  if (!initPromise) {
    // Silence the one-off deprecation warning some Rapier builds print on init.
    const warn = console.warn;
    console.warn = () => {};
    initPromise = RAPIER.init().finally(() => {
      console.warn = warn;
    });
  }
  return initPromise;
}

export interface CastHit {
  /** Distance travelled before contact (already reduced by the skin). */
  toi: number;
  /** World-space surface normal of the obstacle, pointing toward the caster. */
  normal: Vector3;
  /** Contact point on the obstacle. */
  point: Vector3;
  meta: ColliderMeta;
}

export interface RayHit {
  toi: number;
  normal: Vector3;
  point: Vector3;
  meta: ColliderMeta;
}

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

function quatFromYaw(yaw: number) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

export class CollisionWorld {
  readonly world: RAPIER.World;
  private meta = new Map<number, ColliderMeta>();
  private capsules = new Map<string, RAPIER.Capsule>();
  readonly descs: ColliderDesc[];

  /** `initPhysics()` must have resolved before constructing. */
  constructor(descs: ColliderDesc[]) {
    this.descs = descs;
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    descs.forEach((d, i) => this.add(d, i));
    // A step builds the broad-phase acceleration structure used by queries.
    this.world.step();
  }

  private add(d: ColliderDesc, index: number): void {
    const [hx, hy, hz] = d.half;
    let desc: RAPIER.ColliderDesc | null;
    if (d.kind === 'ramp') {
      // Wedge filling the box, rising toward local -Z.
      const pts = new Float32Array([
        -hx, -hy, -hz, hx, -hy, -hz, -hx, -hy, hz, hx, -hy, hz,
        -hx, hy, -hz, hx, hy, -hz,
      ]);
      desc = RAPIER.ColliderDesc.convexHull(pts);
    } else {
      desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    }
    if (!desc) return;
    desc.setTranslation(d.center[0], d.center[1], d.center[2]);
    desc.setRotation(quatFromYaw(d.yaw));
    const col = this.world.createCollider(desc);
    this.meta.set(col.handle, {
      index,
      tags: new Set(d.tags),
      surface: d.surface,
      wallrun: d.tags.includes('wallrun'),
      pieceId: d.pieceId,
    });
  }

  private capsule(height: number, radius: number): RAPIER.Capsule {
    const key = `${height.toFixed(4)}:${radius.toFixed(4)}`;
    let c = this.capsules.get(key);
    if (!c) {
      c = new RAPIER.Capsule(Math.max(0.001, height / 2 - radius), radius);
      this.capsules.set(key, c);
    }
    return c;
  }

  /**
   * Sweep a vertical capsule whose *feet* are at `feet` along unit `dir` for
   * up to `dist`. Stops `skin` away from obstacles.
   */
  castCapsule(feet: Vector3, height: number, radius: number, dir: Vector3, dist: number, skin = 0.015): CastHit | null {
    const shape = this.capsule(height, radius);
    const hit = this.world.castShape(
      { x: feet.x, y: feet.y + height / 2, z: feet.z }, IDENTITY,
      { x: dir.x, y: dir.y, z: dir.z }, shape, skin, dist, false,
    );
    if (!hit) return null;
    const meta = this.meta.get(hit.collider.handle);
    if (!meta) return null;
    const normal = new Vector3(hit.normal1.x, hit.normal1.y, hit.normal1.z);
    if (normal.lengthSq() < 1e-8) normal.copy(dir).negate();
    normal.normalize();
    return {
      toi: hit.time_of_impact,
      normal,
      point: new Vector3(hit.witness1.x, hit.witness1.y, hit.witness1.z),
      meta,
    };
  }

  /** True if a capsule with feet at `feet` intersects any collider. */
  overlapCapsule(feet: Vector3, height: number, radius: number): boolean {
    const shape = this.capsule(height, radius);
    const c = this.world.intersectionWithShape({ x: feet.x, y: feet.y + height / 2, z: feet.z }, IDENTITY, shape);
    return c !== null;
  }

  /**
   * Push a capsule out of any colliders it penetrates (or sits closer than
   * `minGap` to). Returns the corrected feet position.
   */
  depenetrate(feet: Vector3, height: number, radius: number, minGap = 0.005): Vector3 {
    const shape = this.capsule(height, radius);
    const probe = this.capsule(height + 2 * minGap, radius + minGap);
    const out = feet.clone();
    for (let iter = 0; iter < 4; iter++) {
      const center = { x: out.x, y: out.y + height / 2, z: out.z };
      let moved = false;
      this.world.intersectionsWithShape(center, IDENTITY, probe, (col) => {
        const c = col.contactShape(shape, center, IDENTITY, minGap * 2);
        if (c && c.distance < minGap) {
          const push = minGap - c.distance;
          out.x += c.normal1.x * push;
          out.y += c.normal1.y * push;
          out.z += c.normal1.z * push;
          moved = true;
          return false;
        }
        return true;
      });
      if (!moved) break;
    }
    return out;
  }

  /** Cast a ray. `solid` rays starting inside a collider report toi 0. */
  raycast(origin: Vector3, dir: Vector3, maxDist: number): RayHit | null {
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true);
    if (!hit) return null;
    const meta = this.meta.get(hit.collider.handle);
    if (!meta) return null;
    const toi = hit.timeOfImpact;
    return {
      toi,
      normal: new Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      point: origin.clone().addScaledVector(dir, toi),
      meta,
    };
  }

  dispose(): void {
    this.world.free();
  }
}
