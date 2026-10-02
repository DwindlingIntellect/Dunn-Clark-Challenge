import * as THREE from 'three';
import type { Atmosphere } from './atmosphere';
import { MAX_LIGHTS, psxUniforms } from './materials';
import type { LightDef } from '../levels/types';

/** Push an atmosphere preset into the shared PSX uniforms. */
export function applyAtmosphere(a: Atmosphere): void {
  const u = psxUniforms;
  u.uFogColor.value.setHex(a.fogColor);
  u.uFogNear.value = a.fogNear;
  u.uFogFar.value = a.fogFar;
  u.uHeightFogTop.value = a.heightFogTop;
  u.uHeightFogRange.value = a.heightFogRange;
  u.uAmbient.value.setHex(a.ambient);
  u.uSkyLight.value.setHex(a.skyLight);
  u.uGroundLight.value.setHex(a.groundLight);
  u.uMoonColor.value.setHex(a.moonColor);
  u.uMoonDir.value.set(...a.moonDir).normalize();
}

/** The real point lights of a course (max 8), with a gentle candle flicker. */
export class PointLights {
  private lights: (LightDef & { phase: number })[] = [];

  set(list: LightDef[]): void {
    this.lights = list.slice(0, MAX_LIGHTS).map((l, i) => ({ ...l, phase: i * 1.7 }));
    const u = psxUniforms;
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = this.lights[i];
      if (l) {
        u.uLightPos.value[i].set(...l.pos);
        u.uLightRange.value[i] = l.range;
      } else {
        u.uLightColor.value[i].setRGB(0, 0, 0);
        u.uLightRange.value[i] = 1;
        u.uLightPos.value[i].set(0, -9999, 0);
      }
    }
    this.update(0);
  }

  update(time: number): void {
    const c = new THREE.Color();
    this.lights.forEach((l, i) => {
      const flicker = 0.88 + 0.08 * Math.sin(time * 7.3 + l.phase) + 0.04 * Math.sin(time * 17.1 + l.phase * 2.3);
      c.setHex(l.color).multiplyScalar(l.intensity * flicker);
      psxUniforms.uLightColor.value[i].copy(c);
    });
  }
}
