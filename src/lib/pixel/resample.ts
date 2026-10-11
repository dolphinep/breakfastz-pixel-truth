import { rgbToLab } from "./color";
import type { Grid } from "./grid";
import { createPixels, setPx, type Pixels, type RGBA } from "./image";

const innerRange = (a: number, b: number, inset: number) => {
  const pad = Math.floor((b - a) * inset);
  const lo = a + pad;
  const hi = Math.max(lo + 1, b - pad);
  return [lo, hi] as const;
};

/**
 * Downscale by grid: 1 cell → 1 pixel
 * Uses the "most common color" in the cell center, not the average — so blurry AI edges don't muddy colors
 */
export function sampleCells(img: Pixels, grid: Grid, inset = 0.22, keepDetail = false): Pixels {
  const cw = grid.xs.length - 1;
  const ch = grid.ys.length - 1;
  const out = createPixels(cw, ch);
  const bucket = new Map<number, { n: number; r: number; g: number; b: number }>();
  const inkCov = new Float32Array(cw * ch); // ink-line coverage per cell (for bridging broken lines)
  const inkCol: (RGBA | undefined)[] = new Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) {
    const [y0, y1] = innerRange(grid.ys[cy], grid.ys[cy + 1], inset);
    for (let cx = 0; cx < cw; cx++) {
      const [x0, x1] = innerRange(grid.xs[cx], grid.xs[cx + 1], inset);
      bucket.clear();
      let opaque = 0;
      let total = 0;
      let inkN = 0;
      let inkR = 0;
      let inkG = 0;
      let inkB = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * img.w + x) * 4;
          total++;
          if (img.data[i + 3] < 128) continue;
          opaque++;
          // ink line = very dark (low luminance) — quick approximation, no OKLab conversion per pixel
          if (keepDetail && img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114 < 60) {
            inkN++;
            inkR += img.data[i];
            inkG += img.data[i + 1];
            inkB += img.data[i + 2];
          }
          // bucket colors coarsely (5 bits per channel), then average only within the largest bucket
          const k = ((img.data[i] >> 3) << 10) | ((img.data[i + 1] >> 3) << 5) | (img.data[i + 2] >> 3);
          const e = bucket.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
          e.n++;
          e.r += img.data[i];
          e.g += img.data[i + 1];
          e.b += img.data[i + 2];
          bucket.set(k, e);
        }
      }
      if (opaque * 2 < total) {
        setPx(out, cx, cy, [0, 0, 0, 0]);
        continue;
      }
      let best = { n: 0, r: 0, g: 0, b: 0 };
      let second = best;
      for (const e of bucket.values()) {
        if (e.n > best.n) {
          second = best;
          best = e;
        } else if (e.n > second.n) second = e;
      }
      // detail-preserving mode (drawings/images without a grid):
      // 1) ink lines: if dark (outline) pixels cover ≥ 12% of the cell, use the line color — thin cartoon lines won't vanish
      if (keepDetail && inkN > 0) {
        const ink: RGBA = [Math.round(inkR / inkN), Math.round(inkG / inkN), Math.round(inkB / inkN), 255];
        inkCov[cy * cw + cx] = inkN / opaque;
        inkCol[cy * cw + cx] = ink;
        if (inkN >= opaque * 0.2) {
          setPx(out, cx, cy, ink);
          continue;
        }
      }
      // 2) if the second color is clearly darker and covers enough area, pick it → small details don't get swallowed by the base color
      if (keepDetail && second.n >= opaque * 0.3) {
        const lb = rgbToLab(best.r / best.n, best.g / best.n, best.b / best.n)[0];
        const ls = rgbToLab(second.r / second.n, second.g / second.n, second.b / second.n)[0];
        if (Math.abs(lb - ls) > 0.12 && (ls < lb || second.n >= opaque * 0.4)) best = second;
      }
      const c: RGBA = [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n), 255];
      setPx(out, cx, cy, c);
    }
  }
  if (keepDetail) bridgeInk(out, inkCov, inkCol);
  return out;
}

/**
 * Bridge broken ink lines: a line crossing a cell corner diagonally gets split across cells so none reaches the threshold
 * Cells with some line coverage (≥ 8%) sitting between two opposite line cells → fill as line
 */
function bridgeInk(out: Pixels, cov: Float32Array, col: (RGBA | undefined)[]) {
  const w = out.w;
  const isInk = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < out.h && cov[y * w + x] >= 0.2;
  const fill: [number, number, RGBA][] = [];
  for (let y = 0; y < out.h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cov[i] < 0.08 || cov[i] >= 0.2 || !col[i]) continue;
      const pairs = [[1, 0], [0, 1], [1, 1], [1, -1]];
      if (pairs.some(([dx, dy]) => isInk(x + dx, y + dy) && isInk(x - dx, y - dy))) fill.push([x, y, col[i]!]);
    }
  for (const [x, y, c] of fill) setPx(out, x, y, c);
}

/**
 * Per-cell "mixel" score (0..1): how much colors within a single cell differ
 * Real pixel art = one color per cell → near 0; AI images with smeared edges → high
 */
export function mixelScores(img: Pixels, grid: Grid): Float32Array {
  const cw = grid.xs.length - 1;
  const ch = grid.ys.length - 1;
  const out = new Float32Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      let n = 0;
      const s = [0, 0, 0];
      const s2 = [0, 0, 0];
      for (let y = grid.ys[cy]; y < grid.ys[cy + 1]; y++) {
        for (let x = grid.xs[cx]; x < grid.xs[cx + 1]; x++) {
          const i = (y * img.w + x) * 4;
          const lab = rgbToLab(img.data[i], img.data[i + 1], img.data[i + 2]);
          for (let k = 0; k < 3; k++) {
            s[k] += lab[k];
            s2[k] += lab[k] * lab[k];
          }
          n++;
        }
      }
      let v = 0;
      for (let k = 0; k < 3; k++) v += s2[k] / n - (s[k] / n) ** 2;
      out[cy * cw + cx] = Math.min(1, Math.sqrt(Math.max(0, v)) / 0.12);
    }
  }
  return out;
}
