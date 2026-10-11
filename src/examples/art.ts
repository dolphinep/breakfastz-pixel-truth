// Example image for each prompt — drawn in code as native-size pixel art,
// then turned into "what an AI would deliver" (non-integer upscale + blurry edges) by fakeAI at export
import { hexToRgba } from "@/lib/pixel/color";
import { createPixels, getPx, setPx, type Pixels, type RGBA } from "@/lib/pixel/image";

const C = {
  bg: "#f3ebdc",
  ink: "#3b1f1a",
  crust: "#c06a2b",
  bread: "#f5d99a",
  butter: "#f2c230",
  butterHi: "#fff3a0",
  white: "#fdf8ee",
  grey: "#c9c3b8",
  red: "#d94a3d",
  pink: "#f07aa8",
  pinkHi: "#f4a6b0",
  orange: "#f08a24",
  lightBlue: "#9fd6e8",
  brown: "#8a4b2a",
  dough: "#e8a050",
  doughDark: "#b8692f",
  skin: "#f2c29b",
  hair: "#5a3420",
  green: "#4c9a54",
  greenDark: "#2f6b3a",
  greenLight: "#8acb5f",
  blue: "#3a7bd5",
  blueLight: "#7fc4f0",
  sand: "#e8cf8f",
  sandDark: "#c9a860",
  stone: "#9a9a9a",
  stoneDark: "#6e6e6e",
  purple: "#6c4ab0",
  purpleDark: "#4a3080",
  teal: "#2f8f8a",
} as const;

type Col = keyof typeof C;
const rgba = (c: Col): RGBA => hexToRgba(C[c]);

/** Small pixel canvas with basic drawing tools */
class Art {
  p: Pixels;
  bg: RGBA;
  constructor(w: number, h: number, bg: Col | null = "bg") {
    this.p = createPixels(w, h);
    this.bg = bg ? rgba(bg) : [0, 0, 0, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPx(this.p, x, y, this.bg);
  }
  px(x: number, y: number, c: Col) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.p.w && y < this.p.h) setPx(this.p, x, y, rgba(c));
  }
  rect(x: number, y: number, w: number, h: number, c: Col) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Col) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.px(x, y, c);
  }
  circle(cx: number, cy: number, r: number, c: Col) {
    this.ellipse(cx, cy, r, r, c);
  }
  isBg(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.p.w || y >= this.p.h) return true;
    const c = getPx(this.p, x, y);
    return c[0] === this.bg[0] && c[1] === this.bg[1] && c[2] === this.bg[2] && c[3] === this.bg[3];
  }
  /** Add an outline around everything that is not background */
  outline(c: Col = "ink") {
    const marks: [number, number][] = [];
    for (let y = 0; y < this.p.h; y++)
      for (let x = 0; x < this.p.w; x++)
        if (this.isBg(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !this.isBg(x + dx, y + dy))) marks.push([x, y]);
    for (const [x, y] of marks) this.px(x, y, c);
  }
  /** Paste a smaller image into this one */
  blit(src: Pixels, ox: number, oy: number) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = getPx(src, x, y);
        if (c[3] > 0) setPx(this.p, ox + x, oy + y, c);
      }
  }
}

const rng = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

/* ---------------- 9 breakfast icons 16×16 ---------------- */
const icon = (draw: (a: Art) => void, outline = true, after?: (a: Art) => void) => {
  const a = new Art(16, 16);
  draw(a);
  if (outline) a.outline();
  after?.(a);
  return a.p;
};

export const ICONS: Record<string, () => Pixels> = {
  toast: () =>
    icon((a) => {
      a.rect(2, 5, 12, 9, "crust");
      a.circle(4.5, 4.5, 2.5, "crust");
      a.circle(11.5, 4.5, 2.5, "crust");
      a.rect(4, 2, 8, 4, "crust");
      a.rect(3, 5, 10, 8, "bread");
      a.rect(4, 3, 8, 3, "bread");
      a.rect(6, 7, 4, 3, "butter");
      a.px(6, 7, "butterHi");
    }),
  coffee: () =>
    icon(
      (a) => {
        a.rect(3, 6, 8, 6, "white");
        a.rect(3, 8, 8, 1, "red");
        a.rect(11, 7, 2, 1, "white");
        a.rect(12, 8, 1, 2, "white");
        a.rect(11, 10, 2, 1, "white");
        a.rect(1, 12, 13, 2, "white");
        a.rect(9, 6, 2, 6, "grey");
      },
      true,
      (a) => {
        for (const [x, y] of [[5, 1], [6, 2], [5, 3], [8, 1], [9, 2], [8, 3]]) a.px(x, y, "grey");
      },
    ),
  pancakes: () =>
    icon((a) => {
      for (let i = 0; i < 4; i++) {
        a.rect(2, 6 + i * 2, 12, 2, "dough");
        a.rect(2, 7 + i * 2, 12, 1, "doughDark");
      }
      a.rect(3, 5, 10, 2, "brown");
      a.px(5, 7, "brown");
      a.px(10, 8, "brown");
      a.rect(6, 3, 4, 2, "butter");
      a.px(6, 3, "butterHi");
    }),
  croissant: () =>
    icon((a) => {
      a.ellipse(8, 8, 7, 5, "dough");
      a.ellipse(8, 12.5, 6, 4, "bg");
      for (const x of [4, 8, 12]) for (let y = 3; y < 10; y++) if (!a.isBg(x, y)) a.px(x, y, "doughDark");
      a.rect(7, 4, 2, 1, "butter");
    }),
  juice: () =>
    icon((a) => {
      a.rect(4, 5, 8, 9, "orange");
      a.rect(4, 5, 8, 1, "lightBlue");
      a.rect(4, 13, 8, 1, "lightBlue");
      a.rect(4, 6, 1, 7, "butter");
      for (let y = 1; y < 8; y++) a.px(9 + (y < 3 ? 0 : 0), y, y % 2 ? "red" : "white");
    }),
  waffle: () =>
    icon((a) => {
      a.rect(2, 2, 12, 12, "dough");
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) a.rect(3 + x * 3, 3 + y * 3, 2, 2, "doughDark");
      a.rect(7, 6, 3, 2, "butter");
      a.px(7, 6, "butterHi");
    }),
  bacon: () =>
    icon((a) => {
      for (const oy of [3, 9]) {
        for (let x = 1; x < 15; x++) {
          const w = Math.round(Math.sin(x / 2) * 0.8);
          a.px(x, oy + w, "red");
          a.px(x, oy + 1 + w, "pinkHi");
          a.px(x, oy + 2 + w, "red");
          a.px(x, oy + 3 + w, "pinkHi");
        }
      }
    }),
  egg: () =>
    icon((a) => {
      a.ellipse(8, 8, 6.5, 6, "white");
      a.circle(13, 6, 1.4, "white");
      a.circle(7.5, 7.5, 2.5, "butter");
      a.px(6, 6, "butterHi");
      a.px(12, 11, "grey");
      a.px(11, 12, "grey");
    }),
  donut: () =>
    icon(
      (a) => {
        a.circle(8, 8, 6.5, "dough");
        a.ellipse(8, 7.4, 6, 5.4, "pink");
        a.circle(8, 8, 2, "bg");
      },
      true,
      (a) => {
        const r = rng(3);
        const sprinkles: Col[] = ["white", "lightBlue", "butter", "red"];
        for (let i = 0; i < 9; i++) {
          const x = 3 + Math.floor(r() * 10);
          const y = 3 + Math.floor(r() * 8);
          const c = getPx(a.p, x, y);
          if (c[0] === 0xf0) a.px(x, y, sprinkles[i % 4]);
        }
      },
    ),
};

/** 3×3 icon sheet (spaced out — how AI likes to deliver several images in one) */
export function iconSheet(gap = 6): Pixels {
  const names = ["toast", "coffee", "pancakes", "croissant", "juice", "waffle", "bacon", "egg", "donut"];
  const size = 16 * 3 + gap * 4;
  const a = new Art(size, size);
  names.forEach((n, i) => a.blit(ICONS[n](), gap + (i % 3) * (16 + gap), gap + Math.floor(i / 3) * (16 + gap)));
  return a.p;
}

/* ---------------- egg mascot 32×32 ---------------- */
export function eggMascot(): Pixels {
  const a = new Art(32, 32);
  // egg white + bottom-right shadow (draw the shadow first, then the offset egg white over it)
  a.ellipse(16, 17, 12, 11, "grey");
  a.circle(24, 12, 3.5, "grey");
  a.ellipse(15.3, 16.3, 11.3, 10.3, "white");
  a.circle(23.5, 11.5, 3, "white");
  // yolk
  a.circle(15, 15, 5, "butter");
  a.rect(12, 12, 3, 2, "butterHi");
  // eyes
  a.rect(8, 18, 1, 2, "ink");
  a.rect(22, 18, 1, 2, "ink");
  // bacon across the top-right of the egg
  for (let x = 18; x < 30; x++) {
    const y = 2 + Math.round(Math.sin(x / 1.6) * 0.8) + Math.floor((x - 18) / 4);
    a.px(x, y, "red");
    a.px(x, y + 1, "pinkHi");
    a.px(x, y + 2, "red");
  }
  a.outline();
  return a.p;
}

/* ---------------- adventurer walk cycle, 4 frames (16×16 per frame) ---------------- */
function walker(frame: number): Pixels {
  const a = new Art(16, 16);
  const swing = [1, 0, -1, 0][frame];
  const bob = frame % 2 ? 0 : 1;
  // legs
  a.rect(6 + swing, 11, 2, 4 - bob, "brown");
  a.rect(8 - swing, 11, 2, 4 - bob, "brown");
  // body
  a.rect(5, 7 - bob + 1, 6, 4, "green");
  a.rect(5, 10 - bob + 1, 6, 1, "brown");
  // arms
  a.rect(4 - swing, 8, 1, 3, "skin");
  a.rect(11 + swing, 8, 1, 3, "skin");
  // head
  a.rect(5, 2 + 1 - bob, 6, 5, "skin");
  a.rect(5, 2 + 1 - bob, 6, 2, "hair");
  a.rect(4, 3 + 1 - bob, 1, 3, "hair");
  a.px(9, 5 + 1 - bob, "ink");
  a.outline();
  return a.p;
}

export function walkSheet(): Pixels {
  const a = new Art(16 * 4, 16);
  for (let f = 0; f < 4; f++) a.blit(walker(f), f * 16, 0);
  return a.p;
}

/* ---------------- tileset, 6 tiles 16×16 ---------------- */
function tile(kind: string, seed: number): Pixels {
  const a = new Art(16, 16, null);
  const r = rng(seed);
  const base: Record<string, [Col, Col, Col]> = {
    grass: ["green", "greenDark", "greenLight"],
    flowers: ["green", "greenDark", "butter"],
    dirt: ["dough", "doughDark", "brown"],
    water: ["blue", "blueLight", "white"],
    sand: ["sand", "sandDark", "white"],
    stone: ["stone", "stoneDark", "grey"],
  };
  const [b, d, l] = base[kind];
  a.rect(0, 0, 16, 16, b);
  if (kind === "stone") {
    for (let y = 0; y < 16; y += 4) {
      a.rect(0, y + 3, 16, 1, d);
      for (let x = (y / 4) % 2 ? 4 : 0; x < 16; x += 8) a.rect(x, y, 1, 3, d);
    }
  } else if (kind === "water") {
    for (let y = 2; y < 16; y += 5) for (let x = 0; x < 16; x++) if ((x + y) % 6 < 3) a.px(x, y + (x % 6 < 2 ? 0 : 1), d);
    a.px(4, 4, l);
    a.px(11, 10, l);
  } else {
    for (let i = 0; i < 18; i++) a.px(Math.floor(r() * 16), Math.floor(r() * 16), i % 3 ? d : l);
    if (kind === "flowers") for (const [x, y] of [[3, 4], [11, 3], [7, 10], [13, 12]]) {
      a.px(x, y, "white");
      a.px(x + 1, y, "pink");
    }
  }
  return a.p;
}

export function tileSheet(gap = 4): Pixels {
  const kinds = ["grass", "flowers", "dirt", "water", "sand", "stone"];
  const a = new Art(16 * 3 + gap * 4, 16 * 2 + gap * 3);
  kinds.forEach((k, i) => a.blit(tile(k, i + 1), gap + (i % 3) * (16 + gap), gap + Math.floor(i / 3) * (16 + gap)));
  return a.p;
}

/* ---------------- sunrise landscape 160×90 (ordered dithering) ---------------- */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function landscape(): Pixels {
  const W = 160;
  const H = 90;
  const a = new Art(W, H);
  const sky: Col[] = ["purpleDark", "purple", "pink", "orange", "butter"];
  for (let y = 0; y < 60; y++) {
    const t = (y / 60) * (sky.length - 1);
    const i = Math.min(sky.length - 2, Math.floor(t));
    for (let x = 0; x < W; x++) a.px(x, y, (t - i) * 16 > BAYER[y % 4][x % 4] ? sky[i + 1] : sky[i]);
  }
  a.circle(110, 36, 11, "butterHi");
  a.circle(110, 36, 9, "butter");
  for (let x = 0; x < W; x++) {
    const far = Math.round(42 + 6 * Math.sin(x / 13) + 3 * Math.sin(x / 5.3));
    for (let y = far; y < H; y++) a.px(x, y, "purple");
    const near = Math.round(52 + 5 * Math.sin(x / 9 + 2) + 2 * Math.sin(x / 3.1));
    for (let y = near; y < H; y++) a.px(x, y, "purpleDark");
  }
  const r = rng(11);
  for (let x = 2; x < W - 6; ) {
    const bw = 5 + Math.floor(r() * 7);
    const bh = 8 + Math.floor(r() * 18);
    a.rect(x, 78 - bh, bw, bh, "ink");
    for (let wy = 80 - bh; wy < 76; wy += 3) for (let wx = x + 1; wx < x + bw - 1; wx += 2) if (r() > 0.55) a.px(wx, wy, "butter");
    x += bw + 1;
  }
  a.rect(0, 78, W, 12, "ink");
  return a.p;
}

/* ---------------- programmer avatar 64×64 ---------------- */
export function avatar(): Pixels {
  const a = new Art(64, 64, "teal");
  a.ellipse(32, 64, 26, 18, "purple"); // hoodie
  a.ellipse(32, 50, 12, 6, "purpleDark"); // hoodie collar
  a.rect(28, 40, 8, 6, "skin"); // neck
  a.ellipse(32, 28, 12, 14, "skin"); // face
  a.ellipse(32, 18, 13, 8, "hair"); // hair
  a.rect(20, 18, 4, 10, "hair");
  a.rect(40, 18, 4, 8, "hair");
  // glasses
  for (const gx of [25, 35]) {
    a.rect(gx, 27, 6, 1, "ink");
    a.rect(gx, 32, 6, 1, "ink");
    a.rect(gx, 27, 1, 6, "ink");
    a.rect(gx + 5, 27, 1, 6, "ink");
  }
  a.rect(31, 29, 4, 1, "ink");
  a.px(27, 30, "ink");
  a.px(37, 30, "ink");
  a.rect(29, 37, 6, 1, "doughDark"); // mouth
  // headphones
  for (let t = 0; t <= 40; t++) {
    const ang = Math.PI + (t / 40) * Math.PI;
    a.px(32 + Math.cos(ang) * 16, 26 + Math.sin(ang) * 16, "ink");
    a.px(32 + Math.cos(ang) * 15, 26 + Math.sin(ang) * 15, "stoneDark");
  }
  a.rect(14, 24, 5, 10, "red");
  a.rect(45, 24, 5, 10, "red");
  return a.p;
}

export type Example = { id: string; make: () => Pixels; scale: number; native: { w: number; h: number }; pieces?: number };

/** Examples in PromptDialog prompt order — scale = the non-integer scale simulating AI output */
export const EXAMPLES: Example[] = [
  { id: "egg-mascot", make: eggMascot, scale: 23.4, native: { w: 32, h: 32 } },
  { id: "icon-set", make: () => iconSheet(), scale: 11.6, native: { w: 72, h: 72 }, pieces: 9 },
  { id: "walk-cycle", make: walkSheet, scale: 12.3, native: { w: 64, h: 16 }, pieces: 4 },
  { id: "tileset", make: () => tileSheet(), scale: 12.7, native: { w: 64, h: 44 }, pieces: 6 },
  { id: "landscape", make: landscape, scale: 6.3, native: { w: 160, h: 90 } },
  { id: "avatar", make: avatar, scale: 13.1, native: { w: 64, h: 64 } },
];
