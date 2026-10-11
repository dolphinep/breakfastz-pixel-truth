import { describe, expect, it } from "vitest";
import { pixelPerfect, removeOrphans } from "./cleanup";
import { eggSprite, fakeAI } from "./fake";
import { detectGrid } from "./grid";
import { createPixels, getPx, keyOf, setPx, type Pixels } from "./image";
import { kmeansPalette } from "./palette";
import { DEFAULT_OPTIONS, run } from "./pipeline";
import { sampleCells } from "./resample";

const upscale = (src: Pixels, k: number) => {
  const out = createPixels(src.w * k, src.h * k);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) setPx(out, x, y, getPx(src, Math.floor(x / k), Math.floor(y / k)));
  return out;
};

// fraction of pixels matching the original (small color differences from noise allowed)
const matchRatio = (a: Pixels, b: Pixels) => {
  if (a.w !== b.w || a.h !== b.h) return 0;
  let ok = 0;
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++) {
      const p = getPx(a, x, y);
      const q = getPx(b, x, y);
      if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) < 30) ok++;
    }
  return ok / (a.w * a.h);
};

describe("grid detection", () => {
  it("recovers a cleanly upscaled (×8) sprite 100%", () => {
    const egg = eggSprite();
    const g = detectGrid(upscale(egg, 8));
    expect(g.detected).toBe(true);
    expect(g.cellW).toBeCloseTo(8, 1);
    const back = sampleCells(upscale(egg, 8), g);
    expect(matchRatio(back, egg)).toBe(1);
  });

  it.each([5.5, 7.3, 9.37, 12.8])("recovers a fake AI image at scale %s (drifting grid + blurry edges + noise)", (scale) => {
    const egg = eggSprite();
    const fake = fakeAI(egg, scale);
    const g = detectGrid(fake);
    expect(g.detected).toBe(true);
    expect(g.cellW).toBeGreaterThan(scale * 0.93);
    expect(g.cellW).toBeLessThan(scale * 1.07);
    expect(g.xs.length - 1).toBe(16);
    expect(g.ys.length - 1).toBe(16);
    const back = sampleCells(fake, g);
    expect(matchRatio(back, egg)).toBeGreaterThan(0.95);
  });

  it("an image with no grid (pure noise) is not detected as having a grid", () => {
    const img = createPixels(200, 200);
    let s = 7;
    for (let i = 0; i < img.data.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      img.data[i] = i % 4 === 3 ? 255 : s & 255;
    }
    expect(detectGrid(img).detected).toBe(false);
  });
});

describe("palette", () => {
  it("k-means returns no more colors than requested", () => {
    const pal = kmeansPalette(eggSprite(), 4);
    expect(pal.length).toBe(4);
  });
});

describe("cleanup", () => {
  it("removes an isolated pixel that blends into its neighbors", () => {
    const p = createPixels(5, 5);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) setPx(p, x, y, [100, 100, 100, 255]);
    setPx(p, 2, 2, [110, 104, 100, 255]);
    const { out, changed } = removeOrphans(p);
    expect(changed).toBe(1);
    expect(getPx(out, 2, 2)).toEqual([100, 100, 100, 255]);
  });

  it("keeps an intentional 1-pixel highlight (clearly brighter)", () => {
    const p = createPixels(5, 5);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) setPx(p, x, y, [40, 40, 40, 255]);
    setPx(p, 2, 2, [255, 255, 255, 255]);
    expect(removeOrphans(p).changed).toBe(0);
  });

  it("pixel-perfect cuts L corners on diagonal lines", () => {
    const p = createPixels(4, 4);
    const ink: [number, number, number, number] = [0, 0, 0, 255];
    // stair line: (0,0) (1,0) (1,1) (2,1) (2,2) (3,2)
    for (const [x, y] of [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]]) setPx(p, x, y, ink);
    const { out, changed } = pixelPerfect(p);
    expect(changed).toBeGreaterThan(0);
    let ink8 = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (keyOf(getPx(out, x, y)) === 0) ink8++;
    expect(ink8).toBeLessThan(6);
  });
});

describe("cleanup — box corners", () => {
  it("pixel-perfect leaves rectangle corners alone", () => {
    const p = createPixels(6, 6);
    const ink: [number, number, number, number] = [0, 0, 0, 255];
    for (let i = 0; i < 6; i++) {
      setPx(p, i, 0, ink);
      setPx(p, i, 5, ink);
      setPx(p, 0, i, ink);
      setPx(p, 5, i, ink);
    }
    expect(pixelPerfect(p).changed).toBe(0);
  });
});

describe("pipeline", () => {
  it("fake AI image → 16×16 sprite within the palette", () => {
    const r = run(fakeAI(eggSprite(), 9.37), { ...DEFAULT_OPTIONS, palette: { mode: "auto", colors: 8 } });
    expect(r.pixels.w).toBe(16);
    expect(r.pixels.h).toBe(16);
    expect(r.stats.outputColors).toBeLessThanOrEqual(8);
    expect(r.stats.mixelRatio).toBeGreaterThan(0);
  });
});

describe("regular drawings (not pixel art)", () => {
  // draw an orange circle + thick 3px black outline, anti-aliased (4× supersample), 400×400 — cartoon-style
  const cartoon = () => {
    const S = 400;
    const img = createPixels(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        let r = 0, g = 0, b = 0;
        for (let sy = 0; sy < 4; sy++)
          for (let sx = 0; sx < 4; sx++) {
            const d = Math.hypot(x + (sx + 0.5) / 4 - 200, y + (sy + 0.5) / 4 - 200);
            const c = d < 150 ? [240, 140, 40] : d < 153 ? [25, 20, 25] : [255, 253, 245];
            r += c[0]; g += c[1]; b += c[2];
          }
        setPx(img, x, y, [Math.round(r / 16), Math.round(g / 16), Math.round(b / 16), 255]);
      }
    return img;
  };

  it("is not detected as native-size pixel art (lots of in-between colors from anti-aliasing)", () => {
    const r = run(cartoon(), DEFAULT_OPTIONS);
    expect(r.grid.kind).not.toBe("exact");
    expect(r.pixels.w).toBeLessThan(200);
  });

  it("downscaled to 40 pixels, the thin outline stays intact all the way around", () => {
    const r = run(cartoon(), { ...DEFAULT_OPTIONS, grid: { mode: "manual", width: 40 } });
    // march along 32 radial directions; every one must hit a dark pixel
    let found = 0;
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      for (let t = 12; t < 20; t += 0.25) {
        const c = getPx(r.pixels, Math.round(20 + Math.cos(a) * t - 0.5), Math.round(20 + Math.sin(a) * t - 0.5));
        if (c[0] + c[1] + c[2] < 200) {
          found++;
          break;
        }
      }
    }
    expect(found).toBeGreaterThanOrEqual(30);
  });
});
