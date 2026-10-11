import { describe, expect, it } from "vitest";
import { createPixels, getPx, setPx } from "../pixel/image";
import { brushPoints, centerOn, contentBounds, dragFrame, magicErase, reframe, withRatio } from "./tools";

describe("magic eraser", () => {
  // slightly off-color cream background + dark sprite in the center
  const img = createPixels(6, 6);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) setPx(img, x, y, [239 + ((x + y) % 3), 234 - (x % 2) * 3, 219, 255]);
  for (let y = 2; y < 4; y++) for (let x = 2; x < 4; x++) setPx(img, x, y, [42, 15, 8, 255]);

  it("removes a slightly off-color background as one blob without touching the sprite", () => {
    const { out, erased } = magicErase(img, 0, 0, 0.05);
    expect(erased).toBe(32);
    expect(getPx(out, 2, 2)[3]).toBe(255);
    expect(getPx(out, 5, 5)[3]).toBe(0);
  });

  it("tolerance 0 removes only the exact color", () => {
    expect(magicErase(img, 0, 0, 0).erased).toBeLessThan(32);
  });
});

describe("brush", () => {
  it("brush size 3 = 9 points and stays within bounds", () => {
    expect(brushPoints(5, 5, 3, 10, 10)).toHaveLength(9);
    expect(brushPoints(0, 0, 3, 10, 10)).toHaveLength(4);
  });
});

describe("frame", () => {
  // 8×6 image with a 2×2 opaque blob in the top-right corner (not centered)
  const img = createPixels(8, 6);
  for (let y = 0; y < 2; y++) for (let x = 5; x < 7; x++) setPx(img, x, y, [200, 0, 0, 255]);

  it("finds the bounds of the opaque area", () => {
    expect(contentBounds(img)).toEqual({ x: 5, y: 0, w: 2, h: 2 });
    expect(contentBounds(createPixels(3, 3))).toBeNull();
  });

  it("expand canvas: the extra area is transparent and the original image shifts with the frame", () => {
    const out = reframe(img, { x: -2, y: -1, w: 12, h: 8 });
    expect([out.w, out.h]).toEqual([12, 8]);
    expect(getPx(out, 7, 1)).toEqual([200, 0, 0, 255]); // was (5,0)
    expect(getPx(out, 0, 0)[3]).toBe(0);
  });

  it("crop canvas + center the image", () => {
    const frame = centerOn({ x: 0, y: 0, w: 6, h: 6 }, contentBounds(img)!);
    const out = reframe(img, frame);
    expect(contentBounds(out)).toEqual({ x: 2, y: 2, w: 2, h: 2 });
  });

  it("switch to 1:1 without cropping the image", () => {
    const r = withRatio({ x: 0, y: 0, w: 8, h: 6 }, 1, 1, contentBounds(img));
    expect(r.w).toBe(r.h);
    expect(r.w).toBeGreaterThanOrEqual(2);
  });

  it("dragging the bottom-right corner with locked ratio → ratio preserved, top-left stays put", () => {
    const r = dragFrame({ x: 0, y: 0, w: 16, h: 9 }, "br", 16, 3, 16 / 9);
    expect(r).toEqual({ x: 0, y: 0, w: 32, h: 18 });
  });

  it("dragging the left edge freely → right edge stays put and size never drops below 1", () => {
    expect(dragFrame({ x: 0, y: 0, w: 10, h: 10 }, "l", 4, 0, null)).toEqual({ x: 4, y: 0, w: 6, h: 10 });
    expect(dragFrame({ x: 0, y: 0, w: 10, h: 10 }, "l", 50, 0, null).w).toBe(1);
  });
});
