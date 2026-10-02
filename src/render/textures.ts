import * as THREE from 'three';

/**
 * Procedural 64×64 textures painted on a canvas with a seeded RNG.
 * Nearest filtering and no mipmaps, PS1 style.
 */
export type TextureName =
  | 'stone' | 'flagstone' | 'darkstone' | 'wood' | 'iron' | 'ivory' | 'gold'
  | 'glass' | 'bone' | 'slate' | 'white';

const SIZE = 64;
const cache = new Map<TextureName, THREE.Texture>();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

function rgb(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

/** Per-pixel noise speckle over the whole canvas. */
function speckle(ctx: Ctx, rand: () => number, amount: number, alpha = 1): void {
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
    img.data[i + 3] = 255 * alpha;
  }
  ctx.putImageData(img, 0, 0);
}

/** Running-bond ashlar blocks. */
function blocks(ctx: Ctx, rand: () => number, bw: number, bh: number, base: [number, number, number], vary: number, mortar: string, highlight: number): void {
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let row = 0; row < SIZE / bh; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < SIZE + bw; x += bw) {
      const v = (rand() - 0.5) * vary;
      const [r, g, b] = base;
      const x0 = x + off;
      const y0 = row * bh;
      ctx.fillStyle = rgb(r + v, g + v, b + v * 1.1);
      ctx.fillRect(x0 + 1, y0 + 1, bw - 1, bh - 1);
      // bevel: light top/left, dark bottom/right
      ctx.fillStyle = rgb(r + v + highlight, g + v + highlight, b + v + highlight);
      ctx.fillRect(x0 + 1, y0 + 1, bw - 2, 1);
      ctx.fillStyle = rgb(r + v - highlight, g + v - highlight, b + v - highlight);
      ctx.fillRect(x0 + 1, y0 + bh - 1, bw - 1, 1);
      // a chip or two
      if (rand() < 0.5) {
        ctx.fillStyle = rgb(r + v - 18, g + v - 18, b + v - 16);
        ctx.fillRect(x0 + 2 + Math.floor(rand() * (bw - 5)), y0 + 2 + Math.floor(rand() * (bh - 4)), 2, 1);
      }
    }
  }
}

const painters: Record<TextureName, (ctx: Ctx, rand: () => number) => void> = {
  white(ctx) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIZE, SIZE);
  },
  stone(ctx, rand) {
    blocks(ctx, rand, 16, 8, [112, 116, 124], 26, '#34363c', 14);
    speckle(ctx, rand, 18);
  },
  darkstone(ctx, rand) {
    blocks(ctx, rand, 16, 16, [66, 68, 72], 20, '#1c1c20', 10);
    // grime streaks
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(30,40,24,${0.25 + rand() * 0.3})`;
      ctx.fillRect(Math.floor(rand() * SIZE), Math.floor(rand() * SIZE), 1, 4 + Math.floor(rand() * 10));
    }
    speckle(ctx, rand, 16);
  },
  flagstone(ctx, rand) {
    ctx.fillStyle = '#2a2826';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const slabs: [number, number, number, number][] = [
      [0, 0, 28, 22], [28, 0, 36, 18], [0, 22, 20, 24], [20, 18, 26, 28], [46, 18, 18, 22],
      [0, 46, 30, 18], [30, 46, 16, 18], [46, 40, 18, 24],
    ];
    for (const [x, y, w, h] of slabs) {
      const v = (rand() - 0.5) * 22;
      ctx.fillStyle = rgb(96 + v, 92 + v, 86 + v);
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = rgb(110 + v, 106 + v, 98 + v);
      ctx.fillRect(x + 2, y + 2, w - 5, h - 5);
      // worn center
      ctx.fillStyle = rgb(118 + v, 113 + v, 104 + v);
      ctx.fillRect(x + w / 3, y + h / 3, w / 3, h / 3);
    }
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = 'rgba(30,28,26,0.7)';
      let x = Math.floor(rand() * SIZE);
      let y = Math.floor(rand() * SIZE);
      for (let k = 0; k < 6; k++) {
        ctx.fillRect(x, y, 1, 1);
        x += Math.floor(rand() * 3) - 1;
        y += 1;
      }
    }
    speckle(ctx, rand, 14);
  },
  wood(ctx, rand) {
    ctx.fillStyle = '#1e140c';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let p = 0; p < 4; p++) {
      const v = (rand() - 0.5) * 16;
      const x0 = p * 16;
      for (let x = x0 + 1; x < x0 + 15; x++) {
        for (let y = 0; y < SIZE; y++) {
          const grain = Math.sin((x - x0) * 0.9 + Math.sin(y * 0.15 + p) * 2.5) * 10;
          ctx.fillStyle = rgb(78 + v + grain, 50 + v + grain * 0.6, 30 + v * 0.5 + grain * 0.3);
          ctx.fillRect(x, y, 1, 1);
        }
      }
      ctx.fillStyle = '#0c0805';
      ctx.fillRect(x0 + 3, 4, 1, 1);
      ctx.fillRect(x0 + 12, 4, 1, 1);
      ctx.fillRect(x0 + 3, 59, 1, 1);
      ctx.fillRect(x0 + 12, 59, 1, 1);
    }
    speckle(ctx, rand, 10);
  },
  iron(ctx, rand) {
    ctx.fillStyle = '#3a3c40';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 32) {
      ctx.fillStyle = '#2a2c30';
      ctx.fillRect(0, y, SIZE, 2);
      ctx.fillStyle = '#4c4e54';
      ctx.fillRect(0, y + 2, SIZE, 1);
      for (let x = 4; x < SIZE; x += 10) {
        ctx.fillStyle = '#5a5c62';
        ctx.fillRect(x, y + 5, 2, 2);
        ctx.fillStyle = '#1a1a1c';
        ctx.fillRect(x + 1, y + 6, 1, 1);
      }
    }
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(110,52,24,${0.3 + rand() * 0.3})`;
      ctx.fillRect(Math.floor(rand() * SIZE), Math.floor(rand() * SIZE), 1, 3 + Math.floor(rand() * 12));
    }
    speckle(ctx, rand, 20);
  },
  ivory(ctx, rand) {
    blocks(ctx, rand, 32, 16, [214, 204, 180], 12, '#9c9078', 10);
    // faint veins
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(160,150,128,0.5)';
      let x = Math.floor(rand() * SIZE);
      let y = Math.floor(rand() * SIZE);
      for (let k = 0; k < 10; k++) {
        ctx.fillRect(x, y, 1, 1);
        x += 1;
        y += Math.floor(rand() * 3) - 1;
      }
    }
    speckle(ctx, rand, 8);
  },
  gold(ctx, rand) {
    ctx.fillStyle = '#8a6a1c';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let x = 0; x < SIZE; x += 8) {
      ctx.fillStyle = '#e8c860';
      ctx.beginPath();
      ctx.moveTo(x + 4, 1);
      ctx.lineTo(x + 8, 8);
      ctx.lineTo(x + 4, 15);
      ctx.lineTo(x, 8);
      ctx.fill();
      ctx.fillStyle = '#fff2b0';
      ctx.fillRect(x + 3, 6, 2, 2);
    }
    for (let y = 16; y < SIZE; y += 16) {
      ctx.fillStyle = '#c8a040';
      ctx.fillRect(0, y, SIZE, 2);
    }
    speckle(ctx, rand, 12);
  },
  glass(ctx, rand) {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const palette: [number, number, number][] = [
      [170, 30, 40], [40, 60, 170], [30, 120, 70], [200, 150, 40], [110, 40, 140], [40, 120, 160],
    ];
    for (let y = 0; y < SIZE; y += 8) {
      for (let x = 0; x < SIZE; x += 8) {
        const [r, g, b] = palette[Math.floor(rand() * palette.length)];
        const v = (rand() - 0.5) * 40;
        ctx.fillStyle = rgb(r + v, g + v, b + v);
        ctx.fillRect(x + 1, y + 1, 7, 7);
        ctx.fillStyle = rgb(r + 50, g + 50, b + 50);
        ctx.fillRect(x + 2, y + 2, 2, 1);
      }
    }
    // central lead lines (a quatrefoil-ish cross)
    ctx.fillStyle = '#050505';
    ctx.fillRect(31, 0, 2, SIZE);
    ctx.fillRect(0, 31, SIZE, 2);
  },
  bone(ctx, rand) {
    ctx.fillStyle = '#1c1812';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * 16 + (row % 2 ? 8 : 0);
        const y = row * 16;
        const v = (rand() - 0.5) * 30;
        // skull
        ctx.fillStyle = rgb(190 + v, 178 + v, 150 + v);
        ctx.beginPath();
        ctx.ellipse(x + 8, y + 7, 6, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x + 5, y + 10, 6, 4);
        ctx.fillStyle = '#100c08';
        ctx.fillRect(x + 4, y + 6, 3, 3);
        ctx.fillRect(x + 9, y + 6, 3, 3);
        ctx.fillRect(x + 7, y + 10, 2, 2);
        ctx.fillRect(x + 6, y + 13, 1, 1);
        ctx.fillRect(x + 9, y + 13, 1, 1);
      }
    }
    speckle(ctx, rand, 14);
  },
  slate(ctx, rand) {
    ctx.fillStyle = '#1a1e26';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let row = 0; row < 8; row++) {
      for (let col = -1; col < 9; col++) {
        const x = col * 8 + (row % 2 ? 4 : 0);
        const y = row * 8;
        const v = (rand() - 0.5) * 18;
        ctx.fillStyle = rgb(62 + v, 68 + v, 82 + v);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 7, y);
        ctx.lineTo(x + 7, y + 5);
        ctx.quadraticCurveTo(x + 3.5, y + 9, x, y + 5);
        ctx.fill();
      }
    }
    speckle(ctx, rand, 12);
  },
};

export function getTexture(name: TextureName): THREE.Texture {
  let t = cache.get(name);
  if (t) return t;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx;
  const seed = [...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  painters[name](ctx, rng(seed));
  t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  cache.set(name, t);
  return t;
}
