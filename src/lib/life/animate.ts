import { rgbToLab } from "../pixel/color";
import { createPixels, getPx, setPx, type Pixels, type RGBA } from "../pixel/image";

// Procedural animation from a single sprite — every frame moves in whole pixels (still true pixel art)
export type AnimName = "idle" | "blink" | "walk" | "jump";
export type Anim = { name: AnimName; frames: Pixels[]; fps: number };

const opaque = (p: Pixels, x: number, y: number) => x >= 0 && y >= 0 && x < p.w && y < p.h && p.data[(y * p.w + x) * 4 + 3] > 127;
const lum = (c: RGBA) => rgbToLab(c[0], c[1], c[2])[0];

/**
 * Find eyes: dark pixels that are "not the outer outline" (don't touch transparency), clustered into small blobs (1–8 px)
 * Surroundings must be mostly bright and in the upper-middle of the body → pick the pair closest in height
 * (small sprites often have eyes touching the outline, so we strip the outline first instead of requiring fully interior eyes)
 */
export function findEyes(sp: Pixels): [number, number][][] {
  let ys = sp.h, ye = 0;
  for (let y = 0; y < sp.h; y++) for (let x = 0; x < sp.w; x++) if (opaque(sp, x, y)) { ys = Math.min(ys, y); ye = Math.max(ye, y); }
  const dark = (x: number, y: number) => opaque(sp, x, y) && lum(getPx(sp, x, y)) < 0.4;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const outer = (x: number, y: number) => N4.some(([dx, dy]) => !opaque(sp, x + dx, y + dy));
  const cand = (x: number, y: number) => dark(x, y) && !outer(x, y);
  const seen = new Uint8Array(sp.w * sp.h);
  const groups: { px: [number, number][]; cx: number; cy: number }[] = [];
  for (let y = 0; y < sp.h; y++)
    for (let x = 0; x < sp.w; x++) {
      if (seen[y * sp.w + x] || !cand(x, y)) continue;
      const px: [number, number][] = [];
      const stack: [number, number][] = [[x, y]];
      seen[y * sp.w + x] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        px.push([cx, cy]);
        for (const [dx, dy] of N4) {
          const nx = cx + dx, ny = cy + dy;
          if (cand(nx, ny) && !seen[ny * sp.w + nx]) {
            seen[ny * sp.w + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      if (px.length > 8) continue;
      const set = new Set(px.map(([a, b]) => `${a},${b}`));
      let light = 0, ring = 0;
      for (const [cx, cy] of px)
        for (const [dx, dy] of N4) {
          const nx = cx + dx, ny = cy + dy;
          if (set.has(`${nx},${ny}`) || !opaque(sp, nx, ny)) continue;
          ring++;
          if (!dark(nx, ny)) light++;
        }
      if (ring === 0 || light / ring < 0.5) continue;
      const cx = px.reduce((a, p) => a + p[0], 0) / px.length;
      const cy = px.reduce((a, p) => a + p[1], 0) / px.length;
      const rel = (cy - ys) / Math.max(1, ye - ys);
      if (rel < 0.15 || rel > 0.8) continue;
      groups.push({ px, cx, cy });
    }
  if (groups.length <= 1) return groups.map((g) => g.px);
  let best: [number, number] = [0, 1];
  let bd = Infinity;
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++) {
      const dy = Math.abs(groups[i].cy - groups[j].cy);
      const dx = Math.abs(groups[i].cx - groups[j].cx);
      if (dx < 2) continue;
      const score = dy * 3 + Math.abs(dx - sp.w * 0.35);
      if (score < bd) {
        bd = score;
        best = [i, j];
      }
    }
  return bd === Infinity ? [groups[0].px] : [groups[best[0]].px, groups[best[1]].px];
}

/** Place the sprite on a larger canvas (room for bouncing/feet) */
function place(sp: Pixels, cw: number, ch: number, ox: number, oy: number, out = createPixels(cw, ch)) {
  for (let y = 0; y < sp.h; y++)
    for (let x = 0; x < sp.w; x++) {
      const c = getPx(sp, x, y);
      if (c[3] > 127) {
        const tx = x + ox, ty = y + oy;
        if (tx >= 0 && ty >= 0 && tx < cw && ty < ch) setPx(out, tx, ty, c);
      }
    }
  return out;
}

/** Pixel-perfect vertical squash/stretch: remove or duplicate n rows (spread around the middle), keeping the bottom fixed */
export function squash(sp: Pixels, n: number): Pixels {
  if (n === 0) return sp;
  const rows: number[] = [];
  for (let y = 0; y < sp.h; y++) rows.push(y);
  const pick = (k: number) => Math.floor(sp.h * 0.25 + ((k + 0.5) / Math.abs(n)) * sp.h * 0.5);
  if (n > 0) {
    const drop = new Set(new Array(n).fill(0).map((_, k) => pick(k)));
    const kept = rows.filter((y) => !drop.has(y));
    const out = createPixels(sp.w, sp.h);
    kept.forEach((sy, i) => {
      const ty = sp.h - kept.length + i;
      out.data.set(sp.data.subarray(sy * sp.w * 4, (sy + 1) * sp.w * 4), ty * sp.w * 4);
    });
    return out;
  }
  const dup = new Set(new Array(-n).fill(0).map((_, k) => pick(k)));
  const seq: number[] = [];
  rows.forEach((y) => {
    seq.push(y);
    if (dup.has(y)) seq.push(y);
  });
  const out = createPixels(sp.w, seq.length);
  seq.forEach((sy, i) => out.data.set(sp.data.subarray(sy * sp.w * 4, (sy + 1) * sp.w * 4), i * sp.w * 4));
  return out;
}

/** Close eyes: paint over them with the surrounding color, then draw a 1-row closed-eye line on the eye's bottom row */
function closeEyes(sp: Pixels, eyes: [number, number][][]): Pixels {
  const out = { w: sp.w, h: sp.h, data: new Uint8ClampedArray(sp.data) };
  for (const eye of eyes) {
    const set = new Set(eye.map(([x, y]) => `${x},${y}`));
    const around: RGBA[] = [];
    for (const [x, y] of eye)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!set.has(`${x + dx},${y + dy}`) && opaque(sp, x + dx, y + dy)) around.push(getPx(sp, x + dx, y + dy));
    const skin = around.sort((a, b) => lum(b) - lum(a))[Math.floor(around.length / 3)] ?? [255, 255, 255, 255];
    const ink = getPx(sp, eye[0][0], eye[0][1]);
    const yMax = Math.max(...eye.map((p) => p[1]));
    const xs = eye.map((p) => p[0]);
    for (const [x, y] of eye) setPx(out, x, y, skin);
    // closed-eye line is 1 px wider than the eye on each side (so a 1-pixel eye still reads as closed) — never over transparency
    for (let x = Math.min(...xs) - 1; x <= Math.max(...xs) + 1; x++) if (opaque(sp, x, yMax)) setPx(out, x, yMax, ink);
  }
  return out;
}

/** Outline color (darkest) used to draw the feet */
function inkColor(sp: Pixels): RGBA {
  let best: RGBA = [30, 15, 10, 255];
  let bl = Infinity;
  for (let y = 0; y < sp.h; y++)
    for (let x = 0; x < sp.w; x++)
      if (opaque(sp, x, y)) {
        const c = getPx(sp, x, y);
        const l = lum(c);
        if (l < bl) {
          bl = l;
          best = c;
        }
      }
  return best;
}

export function makeAnimations(sp: Pixels): Record<AnimName, Anim> & { eyes: [number, number][][]; canvas: { w: number; h: number } } {
  const lift = Math.max(2, Math.round(sp.h * 0.12)); // bounce/jump height
  const feetH = Math.max(1, Math.round(sp.h * 0.08));
  const cw = sp.w + 2;
  const ch = sp.h + lift + feetH + 2;
  const base = ch - feetH - sp.h - 1; // body y when standing on the ground
  const eyes = findEyes(sp);
  const closed = eyes.length ? closeEyes(sp, eyes) : sp;
  const ink = inkColor(sp);
  const s1 = Math.max(1, Math.round(sp.h * 0.06));

  const at = (img: Pixels, dy = 0) => place(img, cw, ch, 1, base + (sp.h - img.h) + dy);
  // tiny feet under the body (alternating lifts) → reads as walking
  const withFeet = (frame: Pixels, phase: number) => {
    let yb = -1;
    for (let y = frame.h - 1; y >= 0 && yb < 0; y--) for (let x = 0; x < frame.w; x++) if (opaque(frame, x, y)) { yb = y; break; }
    if (yb < 0) return frame;
    // width of the lower body (looking at the bottom few rows)
    let xl = frame.w, xr = -1;
    for (let y = Math.max(0, yb - 2); y <= yb; y++) for (let x = 0; x < frame.w; x++) if (opaque(frame, x, y)) { xl = Math.min(xl, x); xr = Math.max(xr, x); }
    const span = xr - xl + 1;
    const fw = Math.max(2, Math.round(span * 0.22));
    for (const [cxRel, up] of [[0.28, phase === 1], [0.72, phase === 3]] as const) {
      const fx = Math.round(xl + span * cxRel - fw / 2);
      const len = feetH + 1 - (up ? 1 : 0);
      for (let y = 0; y < len; y++) for (let x = 0; x < fw; x++) if (!opaque(frame, fx + x, yb + 1 + y - 1) || y > 0) setPx(frame, fx + x, yb + y, ink);
    }
    return frame;
  };

  const idle: Anim = { name: "idle", fps: 6, frames: [at(sp), at(squash(sp, s1)), at(sp), at(squash(sp, -s1), 0)] };
  const blink: Anim = { name: "blink", fps: 8, frames: [at(sp), at(sp), at(sp), at(sp), at(closed), at(sp)] };
  const walk: Anim = {
    name: "walk",
    fps: 8,
    frames: [0, 1, 2, 3].map((p) => withFeet(at(sp, p % 2 ? -1 : 0), p)),
  };
  const jump: Anim = {
    name: "jump",
    fps: 10,
    frames: [at(squash(sp, s1 * 2)), at(squash(sp, -s1), -Math.round(lift * 0.6)), at(sp, -lift), at(sp, -lift), at(squash(sp, -s1), -Math.round(lift * 0.5)), at(squash(sp, s1 * 2))],
  };
  return { idle, blink, walk, jump, eyes, canvas: { w: cw, h: ch } };
}

/** Combine all frames into a sprite sheet, one pose per row (for games/game engines) */
export function spriteSheet(anims: Anim[]): Pixels {
  const fw = anims[0].frames[0].w;
  const fh = anims[0].frames[0].h;
  const cols = Math.max(...anims.map((a) => a.frames.length));
  const out = createPixels(fw * cols, fh * anims.length);
  anims.forEach((a, r) => a.frames.forEach((f, c) => place(f, out.w, out.h, c * fw, r * fh, out)));
  return out;
}
