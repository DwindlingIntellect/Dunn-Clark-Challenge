import * as THREE from 'three';
import { psx } from '../config/render';
import { psxUniforms } from './materials';

/**
 * Renders the scene into a low-resolution target, then upscales it with
 * nearest filtering through a post shader that reduces colour depth with
 * 4×4 Bayer dithering and adds a vignette. Output is letterboxed to 4:3
 * (or fills the window when psx.aspect === 'fill').
 */
const postVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const postFragment = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uLevels;
uniform float uDither;
uniform float uDitherStrength;
uniform float uQuantize;
uniform float uVignette;
uniform float uFlash;
uniform vec3 uFlashColor;
varying vec2 vUv;

float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void main() {
  vec2 px = floor(vUv * uRes);
  vec3 c = texture2D(tScene, (px + 0.5) / uRes).rgb;
  vec2 q = vUv - 0.5;
  c *= clamp(1.0 - uVignette * dot(q, q) * 2.2, 0.0, 1.0);
  c = mix(c, uFlashColor, uFlash);
  if (uQuantize > 0.5) {
    float levels = uLevels - 1.0;
    if (uDither > 0.5) c += (bayer4(px) - 0.46875) * uDitherStrength / levels;
    c = floor(clamp(c, 0.0, 1.0) * levels + 0.5) / levels;
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

export class PsxPipeline {
  private rt: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private postMat: THREE.ShaderMaterial;
  private viewport = new THREE.Vector4();
  private lowW = 320;
  private lowH = 240;
  /** Full-screen colour flash (checkpoint feedback); decays in game code. */
  flash = 0;
  flashColor = new THREE.Color(0xffd890);

  constructor(private renderer: THREE.WebGLRenderer) {
    this.rt = this.makeTarget(320, 240);
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: postVertex,
      fragmentShader: postFragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.rt.texture },
        uRes: { value: new THREE.Vector2(320, 240) },
        uLevels: { value: 32 },
        uDither: { value: 1 },
        uDitherStrength: { value: 1 },
        uQuantize: { value: 1 },
        uVignette: { value: 0.4 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color() },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    quad.frustumCulled = false;
    this.postScene.add(quad);
  }

  private makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      generateMipmaps: false,
    });
    rt.texture.colorSpace = THREE.NoColorSpace;
    return rt;
  }

  /** Aspect ratio of the presented image. */
  aspect(): number {
    if (psx.aspect === '4:3') return 4 / 3;
    const size = this.renderer.getSize(new THREE.Vector2());
    return size.x / Math.max(1, size.y);
  }

  /** The on-screen rectangle (CSS pixels) the game image occupies. */
  screenRect(): { x: number; y: number; w: number; h: number } {
    const size = this.renderer.getSize(new THREE.Vector2());
    const a = this.aspect();
    let w = size.x;
    let h = w / a;
    if (h > size.y) {
      h = size.y;
      w = h * a;
    }
    return { x: Math.floor((size.x - w) / 2), y: Math.floor((size.y - h) / 2), w: Math.floor(w), h: Math.floor(h) };
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const r = this.renderer;
    const rect = this.screenRect();
    const size = r.getSize(new THREE.Vector2());
    camera.aspect = this.aspect();
    camera.updateProjectionMatrix();

    // Letterbox bars.
    r.setRenderTarget(null);
    r.setViewport(0, 0, size.x, size.y);
    r.setScissorTest(false);
    r.setClearColor(0x000000, 1);
    r.clear();

    const u = this.postMat.uniforms;
    if (psx.enabled) {
      const h = Math.max(60, Math.round(psx.height));
      const w = Math.max(80, Math.round(h * this.aspect()));
      if (w !== this.lowW || h !== this.lowH) {
        this.lowW = w;
        this.lowH = h;
        this.rt.setSize(w, h);
      }
      psxUniforms.uSnapRes.value.set(w, h);
      psxUniforms.uSnap.value = psx.vertexSnap;
      psxUniforms.uAffine.value = psx.affine ? 1 : 0;
      r.setRenderTarget(this.rt);
      r.setClearColor(psxUniforms.uFogColor.value, 1);
      r.clear();
      r.render(scene, camera);
      r.setRenderTarget(null);
      u.uRes.value.set(w, h);
      u.uQuantize.value = 1;
      u.uLevels.value = Math.pow(2, Math.round(psx.colorBits));
      u.uDither.value = psx.dither ? 1 : 0;
      u.uDitherStrength.value = psx.ditherStrength;
    } else {
      // Effect disabled: full-resolution render, no snap/affine/quantize.
      psxUniforms.uSnap.value = 0;
      psxUniforms.uAffine.value = 0;
      const pr = r.getPixelRatio();
      const w = Math.round(rect.w * pr);
      const h = Math.round(rect.h * pr);
      if (w !== this.lowW || h !== this.lowH) {
        this.lowW = w;
        this.lowH = h;
        this.rt.setSize(w, h);
      }
      r.setRenderTarget(this.rt);
      r.setClearColor(psxUniforms.uFogColor.value, 1);
      r.clear();
      r.render(scene, camera);
      r.setRenderTarget(null);
      u.uRes.value.set(w, h);
      u.uQuantize.value = 0;
    }
    u.uVignette.value = psx.vignette;
    u.uFlash.value = this.flash;
    u.uFlashColor.value.copy(this.flashColor);
    this.viewport.set(rect.x, size.y - rect.y - rect.h, rect.w, rect.h);
    r.setViewport(this.viewport);
    r.render(this.postScene, this.postCam);
    r.setViewport(0, 0, size.x, size.y);
  }

  /** Current internal resolution (for readouts). */
  resolution(): string {
    return `${this.lowW}×${this.lowH}`;
  }
}
