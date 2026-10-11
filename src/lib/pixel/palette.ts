import { hexToRgba, labDist2, labToRgb, rgbToLab, type Lab } from "./color";
import { clonePixels, type Pixels, type RGBA } from "./image";

export type Palette = RGBA[];

const hexes = (s: string) => s.split(" ").map(hexToRgba);

// preset palettes (colors from Lospec)
export const PRESETS: Record<string, Palette> = {
  "PICO-8": hexes("000000 1d2b53 7e2553 008751 ab5236 5f574f c2c3c7 fff1e8 ff004d ffa300 ffec27 00e436 29adff 83769c ff77a8 ffccaa"),
  "Sweetie 16": hexes("1a1c2c 5d275d b13e53 ef7d57 ffcd75 a7f070 38b764 257179 29366f 3b5dc9 41a6f6 73eff7 f4f4f4 94b0c2 566c86 333c57"),
  "Game Boy": hexes("0f380f 306230 8bac0f 9bbc0f"),
  breakfast: hexes("2a0f08 933d3c e0675e ffe5c4 ffc800 ffe36b fffdf5 efeadb d9d6c5 6ec8ff ff8fb8 7ee0b5"),
};

/** Load a palette from Lospec by slug, e.g. "endesga-32" */
export async function fetchLospec(slug: string): Promise<Palette> {
  const res = await fetch(`https://lospec.com/palette-list/${encodeURIComponent(slug.trim())}.json`);
  if (!res.ok) throw new Error("palette-not-found");
  const json = (await res.json()) as { colors: string[] };
  return json.colors.map(hexToRgba);
}

// seeded random, same output every time
const mulberry = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Generate a palette automatically with k-means++ in OKLab */
export function kmeansPalette(img: Pixels, k: number, iters = 14): Palette {
  const pts: Lab[] = [];
  const seen = new Map<number, number>();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 128) continue;
    const key = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const weights: number[] = [];
  for (const [key, n] of seen) {
    pts.push(rgbToLab((key >> 16) & 255, (key >> 8) & 255, key & 255));
    weights.push(n);
  }
  if (pts.length <= k) return pts.map(labToRgb);
  const rnd = mulberry(42);
  // k-means++ init
  const cents: Lab[] = [pts[weights.indexOf(Math.max(...weights))]];
  const d2 = pts.map((p) => labDist2(p, cents[0]));
  while (cents.length < k) {
    let sum = 0;
    for (let i = 0; i < pts.length; i++) sum += d2[i] * weights[i];
    let r = rnd() * sum;
    let idx = 0;
    for (; idx < pts.length - 1; idx++) {
      r -= d2[idx] * weights[idx];
      if (r <= 0) break;
    }
    cents.push(pts[idx]);
    for (let i = 0; i < pts.length; i++) d2[i] = Math.min(d2[i], labDist2(pts[i], pts[idx]));
  }
  const assign = new Int32Array(pts.length);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < pts.length; i++) assign[i] = nearestIndex(pts[i], cents);
    const acc = cents.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) {
      const a = acc[assign[i]];
      const w = weights[i];
      a[0] += pts[i][0] * w;
      a[1] += pts[i][1] * w;
      a[2] += pts[i][2] * w;
      a[3] += w;
    }
    acc.forEach((a, j) => {
      if (a[3] > 0) cents[j] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
    });
  }
  return cents.map(labToRgb).sort((a, b) => rgbToLab(a[0], a[1], a[2])[0] - rgbToLab(b[0], b[1], b[2])[0]);
}

const nearestIndex = (p: Lab, cents: Lab[]) => {
  let best = 0;
  let bd = Infinity;
  for (let j = 0; j < cents.length; j++) {
    const d = labDist2(p, cents[j]);
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
};

/** Replace every pixel with its nearest palette color (optional Floyd–Steinberg dithering) */
export function applyPalette(img: Pixels, pal: Palette, dither = false): Pixels {
  const out = clonePixels(img);
  const labs = pal.map((c) => rgbToLab(c[0], c[1], c[2]));
  const err = dither ? new Float32Array(img.w * img.h * 3) : null;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4;
      if (out.data[i + 3] < 128) {
        out.data[i + 3] = 0;
        continue;
      }
      const lab = rgbToLab(out.data[i], out.data[i + 1], out.data[i + 2]);
      if (err) {
        const e = (y * img.w + x) * 3;
        lab[0] += err[e];
        lab[1] += err[e + 1];
        lab[2] += err[e + 2];
      }
      const j = nearestIndex(lab, labs);
      const c = pal[j];
      out.data[i] = c[0];
      out.data[i + 1] = c[1];
      out.data[i + 2] = c[2];
      out.data[i + 3] = 255;
      if (err) {
        const d = [lab[0] - labs[j][0], lab[1] - labs[j][1], lab[2] - labs[j][2]];
        const spread = (dx: number, dy: number, f: number) => {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= img.w || ny >= img.h) return;
          const e = (ny * img.w + nx) * 3;
          err[e] += d[0] * f;
          err[e + 1] += d[1] * f;
          err[e + 2] += d[2] * f;
        };
        spread(1, 0, 7 / 16);
        spread(-1, 1, 3 / 16);
        spread(0, 1, 5 / 16);
        spread(1, 1, 1 / 16);
      }
    }
  }
  return out;
}
