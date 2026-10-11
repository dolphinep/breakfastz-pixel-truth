import { describe, expect, it } from "vitest";
import { fakeAI } from "@/lib/pixel/fake";
import { DEFAULT_OPTIONS, run } from "@/lib/pixel/pipeline";
import { crop, findSprites } from "@/lib/pixel/split";
import { EXAMPLES } from "./art";

// Example images have known answers (native size + simulated scale) → measure whether Pixel Truth recovers them correctly
describe.each(EXAMPLES.map((e, i) => [e.id, e, i] as const))("example %s", (_, ex, i) => {
  const ai = fakeAI(ex.make(), ex.scale, { seed: i + 1, noise: 12 });

  it("detects a pixel size close to the true scale and recovers the original size", () => {
    const r = run(ai, DEFAULT_OPTIONS);
    expect(r.grid.cellW / ex.scale).toBeGreaterThan(0.95);
    expect(r.grid.cellW / ex.scale).toBeLessThan(1.05);
    expect(Math.abs(r.pixels.w - ex.native.w)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.pixels.h - ex.native.h)).toBeLessThanOrEqual(1);
  });

  it(ex.pieces ? `splits into ${ex.pieces} images` : "is not split (single image)", () => {
    const boxes = findSprites(ai);
    expect(boxes.length).toBe(ex.pieces ?? 0);
    // pieces cut from the same sheet use the parent sheet's pixel size as a hint
    const parent = run(ai, DEFAULT_OPTIONS).grid.cellW;
    for (const b of boxes) {
      const r = run(crop(ai, b), { ...DEFAULT_OPTIONS, grid: { mode: "auto", hint: parent } });
      expect(r.grid.cellW / ex.scale).toBeGreaterThan(0.93);
      expect(r.grid.cellW / ex.scale).toBeLessThan(1.07);
    }
  });
});
