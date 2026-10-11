import { createPixels, type Pixels } from "./image";

// mulberry32 — seeded random
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Simulate AI-style "fake pixel art" from a real sprite:
 * non-integer upscale + slowly drifting grid + bilinear (blurry edges) + noise
 * Used in tests and the demo button
 */
export function fakeAI(src: Pixels, scale = 9.37, opts: { drift?: number; noise?: number; seed?: number } = {}): Pixels {
  const drift = opts.drift ?? 0.04;
  const noise = opts.noise ?? 10;
  const r = rng(opts.seed ?? 1);
  const W = Math.round(src.w * scale);
  const H = Math.round(src.h * scale);
  const out = createPixels(W, H);
  // map destination → source coords, with the scale wobbling slightly by position (drifting grid)
  const warp = (t: number, len: number) => t / scale + drift * Math.sin((t / len) * Math.PI * 2) * 2;
  const at = (x: number, y: number, c: number) => {
    const cx = Math.min(src.w - 1, Math.max(0, x));
    const cy = Math.min(src.h - 1, Math.max(0, y));
    return src.data[(cy * src.w + cx) * 4 + c];
  };
  for (let y = 0; y < H; y++) {
    const sy = warp(y, H) - 0.5;
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let x = 0; x < W; x++) {
      const sx = warp(x, W) - 0.5;
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      // sharpen bilinear so edges blur only ~1-2px like AI images (not the whole cell)
      const sharpen = (f: number) => Math.min(1, Math.max(0, (f - 0.5) * scale * 0.35 + 0.5));
      const ax = sharpen(fx);
      const ay = sharpen(fy);
      const i = (y * W + x) * 4;
      for (let c = 0; c < 4; c++) {
        const v =
          at(x0, y0, c) * (1 - ax) * (1 - ay) +
          at(x0 + 1, y0, c) * ax * (1 - ay) +
          at(x0, y0 + 1, c) * (1 - ax) * ay +
          at(x0 + 1, y0 + 1, c) * ax * ay;
        out.data[i + c] = c === 3 ? v : v + (r() - 0.5) * noise;
      }
    }
  }
  return out;
}

/** 16×16 egg mascot sprite, used as the built-in sample image */
const EGG = [
  "................",
  "..........bb....",
  ".........bBBb...",
  ".....kkkkbBbb...",
  "...kkwwwwkbb....",
  "..kwwwwwwwwk....",
  ".kwwwyyyywwwk...",
  ".kwwyYYyyywwk...",
  "kwwwyYyyyywwwk..",
  "kewwyyyyyywwek..",
  "kwwwyyyyyywwsk..",
  ".kwwwyyyywwwsk..",
  ".kwwwwwwwwwssk..",
  "..kwwwwwwwssk...",
  "...kkswsssskk...",
  ".....kkkkkk.....",
];
const COLORS: Record<string, [number, number, number]> = {
  k: [42, 15, 8],
  w: [255, 253, 245],
  s: [232, 228, 218],
  y: [255, 200, 0],
  Y: [255, 227, 107],
  b: [224, 103, 94],
  B: [255, 229, 196],
  e: [42, 15, 8],
};

export function eggSprite(): Pixels {
  const p = createPixels(16, 16);
  EGG.forEach((row, y) =>
    row.split("").forEach((ch, x) => {
      const i = (y * 16 + x) * 4;
      const c = COLORS[ch];
      if (c) {
        p.data[i] = c[0];
        p.data[i + 1] = c[1];
        p.data[i + 2] = c[2];
        p.data[i + 3] = 255;
      } else {
        // cream background (most AI images have no transparency)
        p.data[i] = 239;
        p.data[i + 1] = 234;
        p.data[i + 2] = 219;
        p.data[i + 3] = 255;
      }
    }),
  );
  return p;
}
