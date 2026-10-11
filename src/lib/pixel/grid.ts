import { luminance, type Pixels } from "./image";

// Cell boundary positions (including 0 and the right/bottom edge) — cell i is [xs[i], xs[i+1])
// Spacing isn't forced to be uniform, since AI images often have a slowly drifting grid
export type GridKind = "exact" | "snapped" | "freeform" | "manual";

export type Grid = {
  kind: GridKind; // exact = clean integer upscale, snapped = AI grid snapped to edges, freeform = no grid (pure mixels)
  xs: number[];
  ys: number[];
  cellW: number;
  cellH: number;
  confidence: number; // > GRID_THRESHOLD means a real grid was found
  detected: boolean;
};

/** Edge strength along each axis: profile[i] = sum of |luma(i) - luma(i-1)| */
export function edgeProfile(img: Pixels, axis: "x" | "y"): Float64Array {
  const len = axis === "x" ? img.w : img.h;
  const across = axis === "x" ? img.h : img.w;
  const prof = new Float64Array(len);
  const lum = new Float32Array(img.w * img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) lum[y * img.w + x] = luminance(img, x, y);
  for (let i = 1; i < len; i++) {
    let s = 0;
    for (let j = 0; j < across; j++) {
      const a = axis === "x" ? lum[j * img.w + i] : lum[i * img.w + j];
      const b = axis === "x" ? lum[j * img.w + i - 1] : lum[(i - 1) * img.w + j];
      s += Math.abs(a - b);
    }
    prof[i] = s;
  }
  return prof;
}

const smooth = (p: Float64Array) => {
  const out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i++) out[i] = 0.25 * (p[i - 1] ?? p[i]) + 0.5 * p[i] + 0.25 * (p[i + 1] ?? p[i]);
  return out;
};

const mean = (p: Float64Array) => {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += p[i];
  return s / Math.max(1, p.length - 1) || 1e-9;
};

// Keep only edge peaks — wide blurry edges spanning several px won't make every period look aligned
// and drop small peaks from noise/JPEG (below 25% of the large peaks)
const peaks = (s: Float64Array) => {
  const out = new Float64Array(s.length);
  const vals: number[] = [];
  for (let i = 1; i < s.length - 1; i++)
    if (s[i] >= s[i - 1] && s[i] > s[i + 1]) {
      out[i] = s[i];
      vals.push(s[i]);
    }
  if (!vals.length) return out;
  vals.sort((a, b) => a - b);
  const floor = vals[Math.floor(vals.length * 0.9)] * 0.25;
  for (let i = 0; i < out.length; i++) if (out[i] < floor) out[i] = 0;
  return out;
};

/** How well edges fall on a grid of period p (relative to the mean) */
function scorePeriod(prof: Float64Array, p: number, avg: number) {
  let best = 0;
  let bestPhase = 0;
  for (let ph = 0; ph < p; ph += 0.25) {
    let s = 0;
    let n = 0;
    for (let pos = ph; pos < prof.length; pos += p) {
      const i = Math.floor(pos);
      if (i >= 1 && i + 1 < prof.length) {
        s += Math.max(prof[i], prof[i + 1]);
        n++;
      }
    }
    const sc = n ? s / n / avg : 0;
    if (sc > best) {
      best = sc;
      bestPhase = ph;
    }
  }
  return { score: best, phase: bestPhase };
}

/**
 * Score of the "added ticks" when dividing period big into n parts (ignoring ticks that coincide with the original period)
 * If the smaller period is real, new ticks land on real edges → high score; if divided past the real period, they land on flat areas → low
 */
function extraTeeth(prof: Float64Array, big: number, phase: number, n: number, avg: number) {
  const small = big / n;
  let s = 0;
  let cnt = 0;
  for (let k = 0; phase + k * small < prof.length; k++) {
    if (k % n === 0) continue;
    const i = Math.floor(phase + k * small);
    if (i >= 1 && i + 1 < prof.length) {
      s += Math.max(prof[i], prof[i + 1]);
      cnt++;
    }
  }
  return cnt ? s / cnt / avg : 0;
}

export function extraTeethScore(profRaw: Float64Array, big: number, phase: number, n: number) {
  const prof = peaks(smooth(profRaw));
  return extraTeeth(prof, big, phase, n, mean(prof));
}

/** Score for a given period (fine-tuned ±3%) — used for cross-axis comparison */
export function scoreAt(profRaw: Float64Array, p0: number) {
  const prof = peaks(smooth(profRaw));
  const avg = mean(prof);
  let best = { p: p0, ...scorePeriod(prof, p0, avg) };
  for (let p = p0 * 0.97; p <= p0 * 1.03; p += 0.01) {
    const s = scorePeriod(prof, p, avg);
    if (s.score > best.score) best = { p, ...s };
  }
  return best;
}

export function estimatePeriod(profRaw: Float64Array, minP = 2, maxP = Math.min(64, profRaw.length / 4)) {
  const prof = peaks(smooth(profRaw));
  const avg = mean(prof);
  const cands: { p: number; score: number; phase: number }[] = [];
  for (let p = minP; p <= maxP; p += p < 16 ? 0.05 : 0.1) cands.push({ p, ...scorePeriod(prof, p, avg) });
  const refine = (p0: number) => {
    let best = { p: p0, ...scorePeriod(prof, p0, avg) };
    for (let p = p0 * 0.97; p <= p0 * 1.03; p += 0.01) {
      const s = scorePeriod(prof, p, avg);
      if (s.score > best.score) best = { p, ...s };
    }
    return best;
  };
  const top = refine(cands.reduce((a, b) => (b.score > a.score ? b : a)).p);
  // multiples of the real period (2p, 3p, …) often score highest because they have fewer points to fit
  // → try dividing by n; if the smaller period still aligns well with edges, that's the real period
  // divide by n: accept when the "added ticks" also land on real edges (measured on test images: correct division ≥ 3 almost always, over-division ≤ ~2)
  // threshold is conservative — an axis still stuck on a multiple gets fixed by cross-axis comparison in detectGrid
  // repeat from the new value (e.g. 4p → p) until it can't be divided further
  let pick = top;
  for (let found = true; found; ) {
    found = false;
    for (let n = 6; n >= 2; n--) {
      // ticks that are too dense (< 3px apart) hit peaks by chance → skip
      if (pick.p / n < Math.max(minP, 3)) continue;
      const small = refine(pick.p / n);
      if (small.score < pick.score * 0.45) continue;
      if (extraTeeth(prof, pick.p, pick.phase, n, avg) >= 2) {
        pick = refine(pick.p / n);
        found = true;
        break;
      }
    }
  }
  // confidence = score of the chosen period relative to the median score of all periods
  // (with no grid, all periods score about the same → close to 1)
  const sorted = cands.map((c) => c.score).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1] || 1e-9;
  return { period: pick.p, phase: pick.phase, score: pick.score, median, confidence: pick.score / median };
}

/**
 * Place boundaries on the main grid (phase + k·period), then snap them to nearby real edges
 * Remember the latest offset and carry it through edgeless stretches — follows slowly drifting grids without accumulating error
 */
export function snapCuts(profRaw: Float64Array, period: number, phase: number): number[] {
  const prof = smooth(profRaw);
  const len = prof.length;
  const avg = mean(prof);
  const cuts = [0];
  let offset = 0;
  for (let k = phase < 1 ? 1 : 0; ; k++) {
    const base = phase + k * period;
    const pos = base + offset;
    if (pos >= len - period * 0.4) break;
    const lo = Math.max(1, Math.floor(pos - period * 0.3));
    const hi = Math.min(len - 1, Math.ceil(pos + period * 0.3));
    let arg = lo;
    for (let i = lo; i <= hi; i++) if (prof[i] > prof[arg]) arg = i;
    let cut = Math.round(pos);
    if (prof[arg] > avg * 1.2) {
      // blurry edge forms a plateau several px wide → use the plateau's center
      let l = arg;
      let r = arg;
      while (l - 1 >= lo && prof[l - 1] >= prof[arg] * 0.9) l--;
      while (r + 1 <= hi && prof[r + 1] >= prof[arg] * 0.9) r++;
      cut = Math.round((l + r) / 2);
      offset = cut - base;
    }
    if (cut - cuts[cuts.length - 1] >= period * 0.5) cuts.push(cut);
  }
  if (len - cuts[cuts.length - 1] < period * 0.5 && cuts.length > 1) cuts.pop();
  cuts.push(len);
  return cuts;
}

export function uniformGrid(w: number, h: number, targetW: number): Grid {
  const cell = w / Math.max(1, targetW);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 0; k <= targetW; k++) xs.push(Math.round(k * cell));
  const rows = Math.max(1, Math.round(h / cell));
  for (let k = 0; k <= rows; k++) ys.push(Math.min(h, Math.round((k * h) / rows)));
  return { kind: "manual", xs, ys, cellW: cell, cellH: h / rows, confidence: 0, detected: false };
}

/** Cell-center roughness: 90th percentile of std (RGB) in each cell's central area (25% margin trimmed) */
function interiorNoise(img: Pixels, xs: number[], ys: number[]): number {
  const cw = xs.length - 1;
  const ch = ys.length - 1;
  const sx = Math.max(1, Math.floor(cw / 32));
  const sy = Math.max(1, Math.floor(ch / 32));
  const stds: number[] = [];
  for (let cy = 0; cy < ch; cy += sy)
    for (let cx = 0; cx < cw; cx += sx) {
      const padX = Math.floor((xs[cx + 1] - xs[cx]) * 0.25);
      const padY = Math.floor((ys[cy + 1] - ys[cy]) * 0.25);
      const x0 = xs[cx] + padX, x1 = Math.max(x0 + 1, xs[cx + 1] - padX);
      const y0 = ys[cy] + padY, y1 = Math.max(y0 + 1, ys[cy + 1] - padY);
      let n = 0;
      const m = [0, 0, 0];
      const m2 = [0, 0, 0];
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * img.w + x) * 4;
          for (let k = 0; k < 3; k++) {
            m[k] += img.data[i + k];
            m2[k] += img.data[i + k] ** 2;
          }
          n++;
        }
      let v = 0;
      for (let k = 0; k < 3; k++) v += m2[k] / n - (m[k] / n) ** 2;
      stds.push(Math.sqrt(Math.max(0, v)));
    }
  stds.sort((a, b) => a - b);
  return stds[Math.floor(stds.length * 0.9)] ?? 0;
}

const measured = (cuts: number[], fallback: number) =>
  cuts.length >= 5 ? (cuts[cuts.length - 2] - cuts[1]) / (cuts.length - 3) : fallback;

/** hint = known pixel size (e.g. pieces cut from the same sheet use the parent sheet's scale) — skips period guessing */
export function detectGrid(img: Pixels, hint?: number): Grid {
  const px = edgeProfile(img, "x");
  const py = edgeProfile(img, "y");
  const ex = estimatePeriod(px);
  const ey = estimatePeriod(py);
  let cw = ex.period;
  let ch = ey.period;
  let phx = ex.phase;
  let phy = ey.phase;
  // pick the final cell size from candidates: each axis's period + its multiples/fractions
  // rule: "cell centers must be one color": correct or too-small cells have flat centers, too-large cells have edges inside
  // → pick the largest cell whose center is about as flat as the best one (most pixel art is square, so one size for both axes)
  const limit = Math.min(img.w, img.h) / 3;
  const cands: number[] = hint ? [hint] : [];
  if (!hint) for (const base of [cw, ch])
    for (const m of [1, 2, 3, 1 / 2, 1 / 3]) {
      const c = base * m;
      if (c >= 3 && c <= limit && !cands.some((o) => Math.abs(o - c) / c < 0.05)) cands.push(c);
  if (!cands.length) cands.push(cw);
    }
  const evals = cands.map((c) => {
    const sx = scoreAt(px, c);
    const sy = scoreAt(py, c);
    const noise = interiorNoise(img, snapCuts(px, sx.p, sx.phase), snapCuts(py, sy.p, sy.phase));
    return { c, sx, sy, noise };
  });
  if (evals.length) {
    const best = Math.min(...evals.map((e) => e.noise));
    const pick = evals.filter((e) => e.noise <= best * 1.35 + 2).sort((a, b) => b.c - a.c)[0];
    cw = pick.sx.p;
    ch = pick.sy.p;
    phx = pick.sx.phase;
    phy = pick.sy.phase;
  }
  // confidence of the final period relative to each axis's median score — both axes must pass
  const confidence = Math.min(scoreAt(px, cw).score / ex.median, scoreAt(py, ch).score / ey.median);
  const xs = snapCuts(px, cw, phx);
  const ys = snapCuts(py, ch, phy);
  return {
    kind: "snapped",
    xs,
    ys,
    cellW: measured(xs, cw),
    cellH: measured(ys, ch),
    confidence,
    detected: hint ? true : confidence > GRID_THRESHOLD,
  };
}

export const GRID_THRESHOLD = 1.4;

/**
 * Clean integer upscales (nearest-neighbor ×k) or native-size pixel art (k = 1):
 * every run of consecutive same-color pixels has a length divisible by k — more accurate than period detection
 */
export function detectIntegerScale(img: Pixels, noisy = false): Grid | null {
  // noisy: reduce color depth to 3 bits/channel to ignore noise/JPEG, and allow more mismatches
  const shift = noisy ? 5 : 0;
  const minRatio = noisy ? 0.85 : 0.97;
  const key = (x: number, y: number) => {
    const i = (y * img.w + x) * 4;
    if (img.data[i + 3] < 128) return -1;
    return ((img.data[i] >> shift) << 16) | ((img.data[i + 1] >> shift) << 8) | (img.data[i + 2] >> shift);
  };
  const colors = new Set<number>();
  for (let y = 0; y < img.h && colors.size <= 4096; y++) for (let x = 0; x < img.w; x++) colors.add(key(x, y));
  if (!noisy && colors.size > 4096) return null; // noise / JPEG → not a clean upscale

  const runs: number[] = [];
  const startsX: number[] = [];
  const startsY: number[] = [];
  for (let y = 0; y < img.h; y++) {
    let start = 0;
    for (let x = 1; x <= img.w; x++) {
      if (x === img.w || key(x, y) !== key(x - 1, y)) {
        if (start > 0 && x < img.w) {
          runs.push(x - start);
          startsX.push(start);
        }
        start = x;
      }
    }
  }
  for (let x = 0; x < img.w; x++) {
    let start = 0;
    for (let y = 1; y <= img.h; y++) {
      if (y === img.h || key(x, y) !== key(x, y - 1)) {
        if (start > 0 && y < img.h) {
          runs.push(y - start);
          startsY.push(start);
        }
        start = y;
      }
    }
  }
  if (runs.length < 20) return null;
  for (let k = 32; k >= (noisy ? 2 : 1); k--) {
    const ok = runs.filter((r) => r % k === 0).length / runs.length;
    if (ok < minRatio) continue;
    if (k === 1) {
      // already native size: must have real 1px detail and few colors
      const ones = runs.filter((r) => r === 1).length / runs.length;
      // regular anti-aliased drawings/cartoons also have many 1px runs, but hundreds of in-between colors along edges
      // native pixel art uses a limited palette (measured on samples: 16-color sprite vs 162-color cartoon)
      // and has long flat color areas (mean run ≤ 4px: sprite 1.2–2.8 vs cartoon 4.7+)
      const meanRun = runs.reduce((a, b) => a + b, 0) / runs.length;
      if (ones < 0.1 || colors.size > 64 || meanRun > 4) return null;
    }
    const phase = (starts: number[]) => {
      const h = new Array(k).fill(0);
      starts.forEach((s) => h[s % k]++);
      return h.indexOf(Math.max(...h));
    };
    const px = phase(startsX);
    const py = phase(startsY);
    const cuts = (len: number, ph: number) => {
      const c = [0];
      for (let v = ph || k; v < len; v += k) c.push(v);
      if (len - c[c.length - 1] < k / 2 && c.length > 1) c.pop();
      c.push(len);
      return c;
    };
    // confidence 99 = clean with no noise, 90 = clean integer upscale but with some noise
    return { kind: "exact", xs: cuts(img.w, px), ys: cuts(img.h, py), cellW: k, cellH: k, confidence: noisy ? 90 : 99, detected: true };
  }
  return null;
}

/** Images with no regular grid: estimate block size from the spacing of strong edges */
export function estimateBlockSize(img: Pixels): number {
  const sizes: number[] = [];
  for (const axis of ["x", "y"] as const) {
    const s = smooth(edgeProfile(img, axis));
    const m = mean(s);
    let last = -1;
    for (let i = 1; i < s.length - 1; i++) {
      if (s[i] >= s[i - 1] && s[i] > s[i + 1] && s[i] > m * 1.5) {
        if (last >= 0 && i - last >= 3) sizes.push(i - last);
        last = i;
      }
    }
  }
  if (!sizes.length) return Math.max(1, Math.min(img.w, img.h) / 64);
  sizes.sort((a, b) => a - b);
  // small images (sprites) often have 1–2 block details → use the lower quartile instead of the median
  const small = Math.min(img.w, img.h) <= 160;
  const q = sizes[Math.floor(sizes.length * (small ? 0.25 : 0.5))];
  return Math.max(small ? 2 : 3, Math.min(64, q));
}
