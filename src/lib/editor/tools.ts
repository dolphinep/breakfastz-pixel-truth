import { labDist2, rgbToLab } from "../pixel/color";
import { clonePixels, getPx, keyOf, setPx, type Pixels, type RGBA } from "../pixel/image";

export type Tool = "pencil" | "eraser" | "magic" | "picker" | "fill" | "hand" | "frame";

/** Fill the contiguous same-color area (4-way) */
export function floodFill(img: Pixels, x: number, y: number, color: RGBA): Pixels {
  const out = clonePixels(img);
  const target = keyOf(getPx(img, x, y));
  if (target === keyOf(color)) return out;
  const stack = [y * img.w + x];
  const seen = new Uint8Array(img.w * img.h);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    const px = i % img.w;
    const py = (i / img.w) | 0;
    if (keyOf(getPx(img, px, py)) !== target) continue;
    setPx(out, px, py, color);
    if (px > 0) stack.push(i - 1);
    if (px < img.w - 1) stack.push(i + 1);
    if (py > 0) stack.push(i - img.w);
    if (py < img.h - 1) stack.push(i + img.w);
  }
  return out;
}

/** Straight line between two points (Bresenham) — fast mouse drags don't leave gaps */
export function line(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return pts;
}

/**
 * Magic eraser: remove pixels close in color to the clicked point (within tolerance in OKLab)
 * contiguous = remove only the connected blob, otherwise that color across the whole image — good for backgrounds rendered slightly off
 */
export function magicErase(img: Pixels, x: number, y: number, tolerance: number, contiguous = true): { out: Pixels; erased: number } {
  const out = clonePixels(img);
  const seed = getPx(img, x, y);
  if (seed[3] < 128) return { out, erased: 0 };
  const ref = rgbToLab(seed[0], seed[1], seed[2]);
  const tol2 = tolerance * tolerance;
  const near = (px: number, py: number) => {
    const c = getPx(img, px, py);
    return c[3] >= 128 && labDist2(rgbToLab(c[0], c[1], c[2]), ref) <= tol2;
  };
  let erased = 0;
  if (!contiguous) {
    for (let py = 0; py < img.h; py++)
      for (let px = 0; px < img.w; px++)
        if (near(px, py)) {
          setPx(out, px, py, [0, 0, 0, 0]);
          erased++;
        }
    return { out, erased };
  }
  const seen = new Uint8Array(img.w * img.h);
  const stack = [y * img.w + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    const px = i % img.w;
    const py = (i / img.w) | 0;
    if (!near(px, py)) continue;
    setPx(out, px, py, [0, 0, 0, 0]);
    erased++;
    if (px > 0) stack.push(i - 1);
    if (px < img.w - 1) stack.push(i + 1);
    if (py > 0) stack.push(i - img.w);
    if (py < img.h - 1) stack.push(i + img.w);
  }
  return { out, erased };
}

/** All points touched by a square brush of the given size placed at (x, y) */
export function brushPoints(x: number, y: number, size: number, w: number, h: number): [number, number][] {
  const pts: [number, number][] = [];
  const o = Math.floor((size - 1) / 2);
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) {
      const px = x - o + dx;
      const py = y - o + dy;
      if (px >= 0 && py >= 0 && px < w && py < h) pts.push([px, py]);
    }
  return pts;
}

// ---------- frame (canvas size / aspect ratio / image position within the frame)

/** Rectangle in image pixel coords — x/y may be negative or exceed the image (expands the canvas) */
export type Rect = { x: number; y: number; w: number; h: number };

/** Drag handle: l/r/t/b or a corner like "tl", "br" — "move" = drag the whole frame */
export type Handle = "move" | "l" | "r" | "t" | "b" | "tl" | "tr" | "bl" | "br";

export const MAX_FRAME = 512;

/** Crop or expand the canvas to the frame — expanded areas are transparent */
export function reframe(img: Pixels, r: Rect): Pixels {
  const out = { w: r.w, h: r.h, data: new Uint8ClampedArray(r.w * r.h * 4) };
  for (let y = 0; y < r.h; y++) {
    const sy = y + r.y;
    if (sy < 0 || sy >= img.h) continue;
    const x0 = Math.max(0, -r.x);
    const x1 = Math.min(r.w, img.w - r.x);
    if (x1 <= x0) continue;
    out.data.set(img.data.subarray((sy * img.w + x0 + r.x) * 4, (sy * img.w + x1 + r.x) * 4), (y * r.w + x0) * 4);
  }
  return out;
}

/** Frame that tightly fits the opaque area (null = fully transparent image) */
export function contentBounds(img: Pixels): Rect | null {
  let x0 = img.w;
  let y0 = img.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (img.data[(y * img.w + x) * 4 + 3] >= 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Shift the frame so the image (opaque area) is centered in it */
export function centerOn(frame: Rect, content: Rect): Rect {
  return { ...frame, x: Math.round(content.x + content.w / 2 - frame.w / 2), y: Math.round(content.y + content.h / 2 - frame.h / 2) };
}

/** Change the frame's aspect ratio (rw:rh) so it fully contains the image, then center the image */
export function withRatio(frame: Rect, rw: number, rh: number, content: Rect | null): Rect {
  const c = content ?? frame;
  // required side = the larger of the original frame and the image (never crops the image)
  const base = Math.max(Math.ceil(c.w / rw), Math.ceil(c.h / rh), Math.round(Math.min(frame.w / rw, frame.h / rh)), 1);
  const k = Math.min(base, Math.floor(MAX_FRAME / Math.max(rw, rh)) || 1);
  return centerOn({ x: 0, y: 0, w: rw * k, h: rh * k }, c);
}

/** Drag the frame: dx/dy in image pixels, ratio = locked w/h (null = free) */
export function dragFrame(start: Rect, handle: Handle, dx: number, dy: number, ratio: number | null): Rect {
  if (handle === "move") return { ...start, x: start.x + dx, y: start.y + dy };
  const clampSize = (n: number) => Math.min(MAX_FRAME, Math.max(1, Math.round(n)));
  let l = start.x;
  let t = start.y;
  let r = start.x + start.w;
  let b = start.y + start.h;
  if (handle.includes("l")) l = Math.min(r - 1, l + dx);
  if (handle.includes("r")) r = Math.max(l + 1, r + dx);
  if (handle.includes("t")) t = Math.min(b - 1, t + dy);
  if (handle.includes("b")) b = Math.max(t + 1, b + dy);
  let w = clampSize(r - l);
  let h = clampSize(b - t);
  if (ratio) {
    const horiz = handle === "l" || handle === "r";
    const vert = handle === "t" || handle === "b";
    // corner: the axis that moved more takes precedence
    const byWidth = horiz || (!vert && Math.abs(dx) >= Math.abs(dy));
    if (byWidth) h = clampSize(w / ratio);
    else w = clampSize(h * ratio);
  }
  // anchor the opposite edge/corner — a single edge with locked ratio grows from the center on the other axis
  const x = handle.includes("l") ? start.x + start.w - w : handle === "t" || handle === "b" ? Math.round(start.x + (start.w - w) / 2) : start.x;
  const y = handle.includes("t") ? start.y + start.h - h : handle === "l" || handle === "r" ? Math.round(start.y + (start.h - h) / 2) : start.y;
  return { x, y, w, h };
}
