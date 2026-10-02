import './colorMode';
import * as THREE from 'three';
import { getTexture, type TextureName } from './textures';

/**
 * PSX-style materials: per-fragment lighting from a hemisphere ambient, one
 * moon light and up to MAX_LIGHTS point lights, vertex snapping, affine
 * texture mapping and distance + height fog. All materials share one
 * uniforms object so global changes (fog, lights, snap) apply everywhere.
 */
export const MAX_LIGHTS = 8;

export const psxUniforms = {
  uSnapRes: { value: new THREE.Vector2(320, 240) },
  uSnap: { value: 1 },
  uAffine: { value: 1 },
  uFogColor: { value: new THREE.Color(0x2a3140) },
  uFogNear: { value: 12 },
  uFogFar: { value: 140 },
  uHeightFogTop: { value: -6 },
  uHeightFogRange: { value: 12 },
  uAmbient: { value: new THREE.Color(0x1c2230) },
  uSkyLight: { value: new THREE.Color(0x4a5670) },
  uGroundLight: { value: new THREE.Color(0x15161c) },
  uMoonDir: { value: new THREE.Vector3(0.35, 0.7, -0.6).normalize() },
  uMoonColor: { value: new THREE.Color(0x8090b8) },
  uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
  uLightColor: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
  uLightRange: { value: new Array(MAX_LIGHTS).fill(1) as number[] },
  uTime: { value: 0 },
};

const vertexShader = /* glsl */ `
uniform vec2 uSnapRes;
uniform float uSnap;
uniform float uAffine;
uniform vec2 uUvScale;
varying vec2 vUv;
varying float vW;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 clip = projectionMatrix * viewMatrix * world;
  if (uSnap > 0.0 && clip.w > 0.0) {
    vec2 grid = uSnapRes * 0.5 / uSnap;
    clip.xy = floor(clip.xy / clip.w * grid + 0.5) / grid * clip.w;
  }
  gl_Position = clip;
  // Affine mapping: pre-multiply by w so the hardware's perspective
  // correction cancels out when we divide again per fragment.
  float w = mix(1.0, max(clip.w, 0.0001), uAffine);
  vUv = uv * uUvScale * w;
  vW = w;
#ifdef USE_COLOR
  vColor = color;
#else
  vColor = vec3(1.0);
#endif
}
`;

const fragmentShader = /* glsl */ `
#define MAX_LIGHTS ${MAX_LIGHTS}
uniform sampler2D map;
uniform vec3 uTint;
uniform vec3 uEmissive;
uniform float uUnlit;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uHeightFogTop;
uniform float uHeightFogRange;
uniform vec3 uAmbient;
uniform vec3 uSkyLight;
uniform vec3 uGroundLight;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uLightPos[MAX_LIGHTS];
uniform vec3 uLightColor[MAX_LIGHTS];
uniform float uLightRange[MAX_LIGHTS];
varying vec2 vUv;
varying float vW;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;

void main() {
  vec2 uv = vUv / vW;
  vec4 tex = texture2D(map, uv);
  if (tex.a < 0.5) discard;
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 light = uAmbient + mix(uGroundLight, uSkyLight, n.y * 0.5 + 0.5);
  light += uMoonColor * max(dot(n, uMoonDir), 0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    vec3 L = uLightPos[i] - vWorld;
    float d = length(L);
    float att = clamp(1.0 - d / uLightRange[i], 0.0, 1.0);
    att *= att;
    float ndl = max(dot(n, L / max(d, 0.001)), 0.0) * 0.75 + 0.25;
    light += uLightColor[i] * att * ndl;
  }
  light = mix(light, vec3(1.0), uUnlit);
  vec3 col = tex.rgb * uTint * vColor * light + tex.rgb * uEmissive;
  float dist = length(vWorld - cameraPosition);
  float f = clamp((dist - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
  float hf = clamp((uHeightFogTop - vWorld.y) / max(uHeightFogRange, 0.001), 0.0, 1.0);
  f = max(f, hf);
  gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
}
`;

export interface PsxMaterialOptions {
  map?: TextureName;
  tint?: number;
  emissive?: number;
  unlit?: boolean;
  /** Texture repeats per world-space UV unit. */
  uvScale?: number;
  side?: THREE.Side;
}

export function createPsxMaterial(o: PsxMaterialOptions): THREE.ShaderMaterial {
  const s = o.uvScale ?? 1;
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    vertexColors: true,
    side: o.side ?? THREE.FrontSide,
    uniforms: {
      ...psxUniforms,
      map: { value: getTexture(o.map ?? 'white') },
      uTint: { value: new THREE.Color(o.tint ?? 0xffffff) },
      uEmissive: { value: new THREE.Color(o.emissive ?? 0x000000) },
      uUnlit: { value: o.unlit ? 1 : 0 },
      uUvScale: { value: new THREE.Vector2(s, s) },
    },
  });
}

/** Named materials used by the gothic kit. */
export type MatKey =
  | 'stone' | 'flagstone' | 'darkstone' | 'wood' | 'iron' | 'ivory' | 'gold' | 'glass'
  | 'bone' | 'slate' | 'flame' | 'wax' | 'lanternGlow' | 'bronze' | 'gray' | 'grayDark' | 'cloud';

const MAT_DEFS: Record<MatKey, PsxMaterialOptions> = {
  stone: { map: 'stone', uvScale: 0.5 },
  flagstone: { map: 'flagstone', uvScale: 0.33 },
  darkstone: { map: 'darkstone', uvScale: 0.5 },
  wood: { map: 'wood', uvScale: 0.5 },
  iron: { map: 'iron', uvScale: 0.5 },
  ivory: { map: 'ivory', uvScale: 0.33, emissive: 0x1a1812 },
  gold: { map: 'gold', uvScale: 1, emissive: 0x302408 },
  glass: { map: 'glass', uvScale: 0.25, emissive: 0x8a8070, side: THREE.DoubleSide },
  bone: { map: 'bone', uvScale: 0.75 },
  slate: { map: 'slate', uvScale: 0.5 },
  flame: { map: 'white', unlit: true, tint: 0xffc060 },
  wax: { map: 'white', tint: 0xe8dcc0, emissive: 0x2a2010 },
  lanternGlow: { map: 'white', unlit: true, tint: 0xffb050 },
  bronze: { map: 'iron', tint: 0xd09040, uvScale: 1, emissive: 0x201004 },
  gray: { map: 'stone', tint: 0xa0a4a8, uvScale: 0.5 },
  grayDark: { map: 'stone', tint: 0x707478, uvScale: 0.5 },
  cloud: { map: 'white', tint: 0x6a7690, unlit: true, side: THREE.DoubleSide },
};

const matCache = new Map<MatKey, THREE.ShaderMaterial>();

export function getMaterial(key: MatKey): THREE.ShaderMaterial {
  let m = matCache.get(key);
  if (!m) {
    m = createPsxMaterial(MAT_DEFS[key]);
    matCache.set(key, m);
  }
  return m;
}
