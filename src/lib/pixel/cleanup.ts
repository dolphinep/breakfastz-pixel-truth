import { rgbToLab } from "./color";
import { clonePixels, fromKey, getPx, keyOf, setPx, type Pixels, type RGBA } from "./image";

const N8 = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const;

const keyAt = (p: Pixels, x: number, y: number) =>
  x < 0 || y < 0 || x >= p.w || y >= p.h ? -2 : keyOf(getPx(p, x, y));

const majority = (keys: number[]): number | undefined => {
  const count = new Map<number, number>();
  let best: number | undefined = undefined;
  let bn = 0;
  for (const k of keys) {
    if (k === -2) continue;
    const n = (count.get(k) ?? 0) + 1;
    count.set(k, n);
    if (n > bn) {
      bn = n;
      best = k;
    }
  }
  return best;
};

/** Remove isolated (orphan) pixels with no same-color neighbor in any of the 8 directions */
export function removeOrphans(img: Pixels): { out: Pixels; changed: number } {
  const out = clonePixels(img);
  let changed = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const k = keyAt(img, x, y);
      if (k < 0) continue;
      const ns = N8.map(([dx, dy]) => keyAt(img, x + dx, y + dy));
      const valid = ns.filter((n) => n !== -2);
      if (valid.length < 3 || valid.includes(k)) continue;
      // keep intentional 1-pixel highlights (clearly brighter/darker than neighbors) — only remove ones that blend in
      const m = majority(valid);
      if (m === undefined || m < 0) continue;
      const a = rgbToLab(...(fromKey(k).slice(0, 3) as [number, number, number]));
      const b = rgbToLab(...(fromKey(m).slice(0, 3) as [number, number, number]));
      if (Math.abs(a[0] - b[0]) > 0.25) continue;
      setPx(out, x, y, fromKey(m));
      changed++;
    }
  }
  return { out, changed };
}

/**
 * Pixel-perfect lines: cut L-shaped corners that make diagonals too thick
 * X X .       X . .
 * . X X   →   . X .     (only when one arm is 1 pixel long = a stair step;
 * . . X       . . X      box corners with two long arms are left alone)
 */
export function pixelPerfect(img: Pixels): { out: Pixels; changed: number } {
  const out = clonePixels(img);
  let changed = 0;
  const arms: [number, number, number, number][] = [
    [0, -1, 1, 0], // N + E
    [1, 0, 0, 1], // E + S
    [0, 1, -1, 0], // S + W
    [-1, 0, 0, -1], // W + N
  ];
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const k = keyAt(out, x, y);
      if (k < 0) continue;
      const same = (dx: number, dy: number) => keyAt(out, x + dx, y + dy) === k;
      const n4 = [same(0, -1), same(1, 0), same(0, 1), same(-1, 0)].filter(Boolean).length;
      if (n4 !== 2) continue;
      for (const [ax, ay, bx, by] of arms) {
        if (!same(ax, ay) || !same(bx, by) || same(ax + bx, ay + by)) continue;
        const shortA = !same(ax * 2, ay * 2);
        const shortB = !same(bx * 2, by * 2);
        if (!shortA && !shortB) continue;
        const fill = majority(N8.map(([dx, dy]) => keyAt(out, x + dx, y + dy)).filter((n) => n !== k && n !== -2));
        setPx(out, x, y, fromKey(fill ?? -1));
        changed++;
        break;
      }
    }
  }
  return { out, changed };
}

/** Remove background: flood fill from the image edges using the most common edge color */
export function removeBackground(img: Pixels): Pixels {
  const out = clonePixels(img);
  const border: number[] = [];
  for (let x = 0; x < img.w; x++) border.push(keyAt(img, x, 0), keyAt(img, x, img.h - 1));
  for (let y = 0; y < img.h; y++) border.push(keyAt(img, 0, y), keyAt(img, img.w - 1, y));
  const bg = majority(border);
  if (bg === undefined || bg < 0) return out;
  const seen = new Uint8Array(img.w * img.h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
    const i = y * img.w + x;
    if (seen[i] || keyAt(img, x, y) !== bg) return;
    seen[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < img.w; x++) {
    push(x, 0);
    push(x, img.h - 1);
  }
  for (let y = 0; y < img.h; y++) {
    push(0, y);
    push(img.w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % img.w;
    const y = (i / img.w) | 0;
    setPx(out, x, y, [0, 0, 0, 0]);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return out;
}

/** Add a 1px outline around opaque areas (for sprites on transparent backgrounds) */
export function addOutline(img: Pixels, color: RGBA): Pixels {
  const out = clonePixels(img);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (keyAt(img, x, y) !== -1) continue;
      const touch = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => keyAt(img, x + dx, y + dy) >= 0);
      if (touch) setPx(out, x, y, color);
    }
  }
  return out;
}

/** Darkest color in the image — used as the outline color */
export function darkestColor(img: Pixels): RGBA {
  let best: RGBA = [0, 0, 0, 255];
  let bl = Infinity;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < 128) continue;
    const l = rgbToLab(img.data[i], img.data[i + 1], img.data[i + 2])[0];
    if (l < bl) {
      bl = l;
      best = [img.data[i], img.data[i + 1], img.data[i + 2], 255];
    }
  }
  return best;
}

export const countColors = (img: Pixels) => {
  const s = new Set<number>();
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) s.add(keyOf(getPx(img, x, y)));
  s.delete(-1);
  return s.size;
};
