import { labDist2, rgbToLab } from "../pixel/color";
import { createPixels, type Pixels } from "../pixel/image";

/**
 * Prepare a sprite for animation: background must be transparent + crop tight (keeping pad pixels of margin)
 * If most of the border is still opaque, there is a background → remove it with a flood fill from the edges
 */
export function toSprite(px: Pixels, pad = 1): Pixels {
  let src = px;
  let opaqueBorder = 0;
  let border = 0;
  const alpha = (x: number, y: number) => src.data[(y * src.w + x) * 4 + 3];
  for (let x = 0; x < px.w; x++) {
    border += 2;
    opaqueBorder += (alpha(x, 0) > 127 ? 1 : 0) + (alpha(x, px.h - 1) > 127 ? 1 : 0);
  }
  for (let y = 0; y < px.h; y++) {
    border += 2;
    opaqueBorder += (alpha(0, y) > 127 ? 1 : 0) + (alpha(px.w - 1, y) > 127 ? 1 : 0);
  }
  if (opaqueBorder > border * 0.5) src = removeBackgroundTolerant(px);
  src = dropIslands(src);

  let x0 = src.w, y0 = src.h, x1 = -1, y1 = -1;
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++)
      if (src.data[(y * src.w + x) * 4 + 3] > 127) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return createPixels(1, 1);
  const w = x1 - x0 + 1 + pad * 2;
  const h = y1 - y0 + 1 + pad * 2;
  const out = createPixels(w, h);
  for (let y = y0; y <= y1; y++) {
    const s = (y * src.w + x0) * 4;
    out.data.set(src.data.subarray(s, s + (x1 - x0 + 1) * 4), ((y - y0 + pad) * w + pad) * 4);
  }
  return out;
}

/**
 * Tolerant background removal: flood from the image edges, removing every connected pixel close to the dominant edge color
 * (after quantization the background often has several shades — exact-color removal leaves floating specks)
 */
function removeBackgroundTolerant(px: Pixels, tol = 0.07): Pixels {
  const out = { w: px.w, h: px.h, data: new Uint8ClampedArray(px.data) };
  const lab = (i: number) => rgbToLab(px.data[i * 4], px.data[i * 4 + 1], px.data[i * 4 + 2]);
  const borderIdx: number[] = [];
  for (let x = 0; x < px.w; x++) borderIdx.push(x, (px.h - 1) * px.w + x);
  for (let y = 0; y < px.h; y++) borderIdx.push(y * px.w, y * px.w + px.w - 1);
  const ls = borderIdx.map(lab);
  const med = (k: number) => ls.map((l) => l[k]).sort((a, b) => a - b)[ls.length >> 1];
  const bg = [med(0), med(1), med(2)] as [number, number, number];
  const seen = new Uint8Array(px.w * px.h);
  const stack = borderIdx.slice();
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    if (px.data[i * 4 + 3] > 127 && labDist2(lab(i), bg) > tol * tol) continue;
    out.data[i * 4 + 3] = 0;
    const x = i % px.w;
    const y = (i / px.w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < px.w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - px.w);
    if (y < px.h - 1) stack.push(i + px.w);
  }
  return out;
}

/** Drop small pixel islands not attached to the main body (smaller than 5% of the largest blob) */
function dropIslands(px: Pixels): Pixels {
  const label = new Int32Array(px.w * px.h).fill(-1);
  const sizes: number[] = [];
  for (let s = 0; s < px.w * px.h; s++) {
    if (label[s] >= 0 || px.data[s * 4 + 3] <= 127) continue;
    const id = sizes.length;
    let n = 0;
    const stack = [s];
    label[s] = id;
    while (stack.length) {
      const i = stack.pop()!;
      n++;
      const x = i % px.w;
      const y = (i / px.w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= px.w || ny >= px.h) continue;
          const j = ny * px.w + nx;
          if (label[j] < 0 && px.data[j * 4 + 3] > 127) {
            label[j] = id;
            stack.push(j);
          }
        }
    }
    sizes.push(n);
  }
  if (sizes.length <= 1) return px;
  const keep = Math.max(4, Math.max(...sizes) * 0.05);
  const out = { w: px.w, h: px.h, data: new Uint8ClampedArray(px.data) };
  for (let i = 0; i < px.w * px.h; i++) if (label[i] >= 0 && sizes[label[i]] < keep) out.data[i * 4 + 3] = 0;
  return out;
}
