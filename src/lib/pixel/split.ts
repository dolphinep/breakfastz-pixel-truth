import { labDist2, rgbToLab, type Lab } from "./color";
import { createPixels, type Pixels } from "./image";

export type Box = { x: number; y: number; w: number; h: number };

/**
 * Detect "multiple images in one" (AI likes to return 2×2, 3×3 sheets) and return each image's bounding box
 * 1) find the background color from the edges  2) mask non-background areas (on a downscaled image)
 * 3) dilate the mask so small pieces of the same image join (e.g. steam above a cup)  4) split connected blobs
 * Returns [] if fewer than 2 images are found
 */
export function findSprites(img: Pixels, opts: { tolerance?: number; maxSide?: number } = {}): Box[] {
  const tol = opts.tolerance ?? 0.07;
  const maxSide = opts.maxSide ?? 320;
  const f = Math.max(1, Math.max(img.w, img.h) / maxSide);
  const W = Math.max(1, Math.round(img.w / f));
  const H = Math.max(1, Math.round(img.h / f));

  const labAt = (x: number, y: number): Lab | null => {
    const i = (Math.min(img.h - 1, Math.floor((y + 0.5) * f)) * img.w + Math.min(img.w - 1, Math.floor((x + 0.5) * f))) * 4;
    return img.data[i + 3] < 128 ? null : rgbToLab(img.data[i], img.data[i + 1], img.data[i + 2]);
  };

  // background color = median of the edge colors (or "transparent" if most of the edge is clear)
  const border: (Lab | null)[] = [];
  for (let x = 0; x < W; x++) border.push(labAt(x, 0), labAt(x, H - 1));
  for (let y = 0; y < H; y++) border.push(labAt(0, y), labAt(W - 1, y));
  const clear = border.filter((b) => b === null).length > border.length / 2;
  const solid = border.filter((b): b is Lab => b !== null);
  if (!clear && !solid.length) return [];
  const med = (k: number) => solid.map((b) => b[k]).sort((a, b) => a - b)[solid.length >> 1];
  const bg: Lab = clear ? [0, 0, 0] : [med(0), med(1), med(2)];

  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const l = labAt(x, y);
      mask[y * W + x] = clear ? (l ? 1 : 0) : l && labDist2(l, bg) > tol * tol ? 1 : 0;
    }

  // dilate: radius ~1.5% of the short side
  const r = Math.max(1, Math.round(Math.min(W, H) * 0.015));
  const grown = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) grown[ny * W + nx] = 1;
        }
    }

  // connected components (8-way)
  const label = new Int32Array(W * H).fill(-1);
  const boxes: (Box & { n: number })[] = [];
  for (let start = 0; start < W * H; start++) {
    if (!grown[start] || label[start] >= 0) continue;
    const id = boxes.length;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      const y = (i / W) | 0;
      // count only real pixels (not the dilated area) for a tight box
      if (mask[i]) {
        n++;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (grown[j] && label[j] < 0) {
            label[j] = id;
            stack.push(j);
          }
        }
    }
    boxes.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n });
  }

  // drop small noise blobs (relative to the largest blob)
  const biggest = Math.max(0, ...boxes.map((b) => b.w * b.h));
  const kept = boxes.filter((b) => b.n > 0 && b.w * b.h >= biggest * 0.08 && b.w * b.h >= W * H * 0.002);
  if (kept.length < 2) return [];
  // if one blob covers almost the whole image, it's not a multi-image sheet
  if (kept.some((b) => b.w * b.h > W * H * 0.7)) return [];

  // map back to full-image coords + small margin, sorted top-to-bottom, left-to-right
  const pad = Math.max(2, Math.round(Math.min(img.w, img.h) * 0.01));
  const out = kept.map((b) => {
    const x = Math.max(0, Math.floor(b.x * f) - pad);
    const y = Math.max(0, Math.floor(b.y * f) - pad);
    const x2 = Math.min(img.w, Math.ceil((b.x + b.w) * f) + pad);
    const y2 = Math.min(img.h, Math.ceil((b.y + b.h) * f) + pad);
    return { x, y, w: x2 - x, h: y2 - y };
  });
  const rowH = Math.min(...out.map((b) => b.h)) / 2;
  return out.sort((a, b) => (Math.abs(a.y - b.y) < rowH ? a.x - b.x : a.y - b.y));
}

export function crop(img: Pixels, b: Box): Pixels {
  const out = createPixels(b.w, b.h);
  for (let y = 0; y < b.h; y++) {
    const s = ((b.y + y) * img.w + b.x) * 4;
    out.data.set(img.data.subarray(s, s + b.w * 4), y * b.w * 4);
  }
  return out;
}
