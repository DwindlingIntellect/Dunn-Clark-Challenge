import * as THREE from 'three';
import type { Atmosphere } from './atmosphere';

/** Gradient sky dome with a hazy moon and optional stars. Follows the camera. */
const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const fragment = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uStars;
varying vec3 vDir;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uTop, pow(h, 0.55));
  float m = max(dot(d, normalize(uMoonDir)), 0.0);
  c += uMoonColor * (pow(m, 600.0) * 1.4 + pow(m, 24.0) * 0.18);
  if (uStars > 0.0) {
    vec3 cell = floor(d * 160.0);
    float s = hash(cell);
    c += vec3(step(0.996, s) * uStars * smoothstep(0.05, 0.4, d.y));
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonColor: { value: new THREE.Color() },
        uStars: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 16, 12), this.mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  apply(a: Atmosphere): void {
    const u = this.mat.uniforms;
    u.uTop.value.setHex(a.skyTop);
    u.uHorizon.value.setHex(a.skyHorizon);
    u.uMoonDir.value.set(...a.moonDir).normalize();
    u.uMoonColor.value.setHex(a.moonColor);
    u.uStars.value = a.stars;
  }

  /** Horizon colour follows the (possibly debug-edited) fog colour. */
  setHorizon(c: THREE.Color): void {
    this.mat.uniforms.uHorizon.value.copy(c);
  }

  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
  }
}
