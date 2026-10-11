import { addOutline, countColors, darkestColor, pixelPerfect, removeBackground, removeOrphans } from "./cleanup";
import { detectGrid, detectIntegerScale, estimateBlockSize, uniformGrid, type Grid } from "./grid";
import type { Pixels } from "./image";
import { applyPalette, kmeansPalette, type Palette } from "./palette";
import { mixelScores, sampleCells } from "./resample";

export type Options = {
  grid: { mode: "auto"; hint?: number } | { mode: "manual"; width: number };
  palette: { mode: "auto"; colors: number } | { mode: "fixed"; colors: Palette } | { mode: "none" };
  dither: boolean;
  orphans: boolean;
  pixelPerfect: boolean;
  removeBg: boolean;
  outline: boolean;
};

export const DEFAULT_OPTIONS: Options = {
  grid: { mode: "auto" },
  palette: { mode: "auto", colors: 16 },
  dither: false,
  orphans: true,
  pixelPerfect: true,
  removeBg: false,
  outline: false,
};

export type Result = {
  grid: Grid;
  pixels: Pixels;
  palette: Palette;
  mixels: Float32Array; // per-cell mixel score (for the heatmap)
  stats: { inputColors: number; outputColors: number; orphans: number; corners: number; mixelRatio: number };
};

export function run(img: Pixels, opt: Options): Result {
  const grid = chooseGrid(img, opt);
  const mixels = mixelScores(img, grid);
  // exact: each cell is already one color, snapped: trim the blurry edges, freeform/manual: use the whole cell + keep detail
  let px =
    grid.kind === "exact"
      ? sampleCells(img, grid, 0.3)
      : grid.kind === "snapped"
        ? sampleCells(img, grid, 0.22)
        : sampleCells(img, grid, 0, true);
  const inputColors = countColors(px);

  let palette: Palette = [];
  // already-clean pixel art (native size or clean integer upscale, no noise) → skip cleanup that could destroy intentional work
  const clean = grid.kind === "exact" && grid.confidence === 99;
  if (opt.palette.mode === "auto" && !(clean && inputColors <= opt.palette.colors)) palette = kmeansPalette(px, opt.palette.colors);
  if (opt.palette.mode === "fixed") palette = opt.palette.colors;
  if (palette.length) px = applyPalette(px, palette, opt.dither);

  let orphans = 0;
  let corners = 0;
  if (opt.removeBg) px = removeBackground(px);
  if (opt.orphans && !clean) {
    const r = removeOrphans(px);
    px = r.out;
    orphans = r.changed;
  }
  if (opt.pixelPerfect && !clean) {
    const r = pixelPerfect(px);
    px = r.out;
    corners = r.changed;
  }
  if (opt.outline) px = addOutline(px, palette.length ? darkestOf(palette) : darkestColor(px));

  let mixelCells = 0;
  for (const m of mixels) if (m > 0.35) mixelCells++;
  return {
    grid,
    pixels: px,
    palette,
    mixels,
    stats: { inputColors, outputColors: countColors(px), orphans, corners, mixelRatio: mixelCells / mixels.length },
  };
}

const darkestOf = (pal: Palette) => [...pal].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))[0];

export function chooseGrid(img: Pixels, opt: Options): Grid {
  if (opt.grid.mode === "manual") return uniformGrid(img.w, img.h, opt.grid.width);
  const exact = detectIntegerScale(img) ?? detectIntegerScale(img, true);
  if (exact) return exact;
  const snapped = detectGrid(img, opt.grid.hint);
  if (snapped.detected) return snapped;
  // no regular grid = pure mixels → pick resolution from the estimated block size
  const block = estimateBlockSize(img);
  return { ...uniformGrid(img.w, img.h, Math.max(8, Math.round(img.w / block))), kind: "freeform", confidence: snapped.confidence };
}
