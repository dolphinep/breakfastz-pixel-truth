// Small platformer — physics and level are pure code (testable); rendering lives in ui/PlayScene.tsx
export const TILE = 16;

export type Level = { w: number; h: number; solid: Uint8Array; coins: { x: number; y: number; taken: boolean }[]; goalX: number };
export type Player = { x: number; y: number; vx: number; vy: number; w: number; h: number; onGround: boolean; facing: 1 | -1 };
export type Input = { left: boolean; right: boolean; jump: boolean };

const rng = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

/** Build a level: ground with periodic pits + floating platforms + coins (same seed = same level) */
export function makeLevel(seed = 7, w = 120, h = 14): Level {
  const r = rng(seed);
  const solid = new Uint8Array(w * h);
  const set = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h && (solid[y * w + x] = 1);
  const coins: Level["coins"] = [];
  let x = 0;
  while (x < w) {
    const run = x < 12 ? 12 : 5 + Math.floor(r() * 8);
    const groundY = h - 2 - (x < 12 ? 0 : Math.floor(r() * 3));
    for (let i = 0; i < run && x + i < w; i++) for (let y = groundY; y < h; y++) set(x + i, y);
    // floating platform + coins
    if (x > 10 && r() > 0.35) {
      const px = x + 1 + Math.floor(r() * Math.max(1, run - 4));
      const py = groundY - 3 - Math.floor(r() * 2);
      for (let i = 0; i < 3; i++) set(px + i, py);
      coins.push({ x: (px + 1) * TILE + TILE / 2, y: (py - 1) * TILE + TILE / 2, taken: false });
    }
    for (let i = 1; i < run - 1; i += 3) coins.push({ x: (x + i) * TILE + TILE / 2, y: (groundY - 1) * TILE + TILE / 2, taken: false });
    x += run;
    if (x < w - 14) x += 2 + Math.floor(r() * 2); // pit
  }
  // flat ending stretch + finish line
  for (let i = w - 12; i < w; i++) for (let y = h - 2; y < h; y++) set(i, y);
  return { w, h, solid, coins, goalX: (w - 4) * TILE };
}

export const isSolid = (lv: Level, tx: number, ty: number) => tx < 0 || tx >= lv.w || (ty >= 0 && ty < lv.h && lv.solid[ty * lv.w + tx] === 1);

export function spawn(lv: Level, w: number, h: number): Player {
  return { x: 3 * TILE, y: (lv.h - 2) * TILE - h, vx: 0, vy: 0, w, h, onGround: true, facing: 1 };
}

const GRAVITY = 1800;
const SPEED = 170;
const JUMP = 560;

/** Step the game by dt seconds — AABB wall/ground collision, resolving x then y */
export function step(lv: Level, p: Player, input: Input, dt: number): { player: Player; coins: number; fell: boolean; won: boolean } {
  const n: Player = { ...p };
  n.vx = (input.right ? 1 : 0) * SPEED - (input.left ? 1 : 0) * SPEED;
  if (n.vx) n.facing = n.vx > 0 ? 1 : -1;
  if (input.jump && n.onGround) {
    n.vy = -JUMP;
    n.onGround = false;
  }
  n.vy = Math.min(n.vy + GRAVITY * dt, 900);

  const collide = (axis: "x" | "y", d: number) => {
    if (axis === "x") n.x += d;
    else n.y += d;
    const x0 = Math.floor(n.x / TILE), x1 = Math.floor((n.x + n.w - 1) / TILE);
    const y0 = Math.floor(n.y / TILE), y1 = Math.floor((n.y + n.h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (!isSolid(lv, tx, ty)) continue;
        if (axis === "x") {
          n.x = d > 0 ? tx * TILE - n.w : (tx + 1) * TILE;
          n.vx = 0;
        } else {
          if (d > 0) {
            n.y = ty * TILE - n.h;
            n.onGround = true;
          } else n.y = (ty + 1) * TILE;
          n.vy = 0;
        }
        return;
      }
  };
  collide("x", n.vx * dt);
  n.onGround = false;
  collide("y", n.vy * dt);
  // resting exactly on a tile top but moved down less than 1px this frame → still grounded (otherwise state flickers and jumps get dropped)
  if (!n.onGround && n.vy >= 0) {
    const feet = Math.floor((n.y + n.h + 0.5) / TILE);
    const x0 = Math.floor(n.x / TILE), x1 = Math.floor((n.x + n.w - 1) / TILE);
    for (let tx = x0; tx <= x1; tx++)
      if (isSolid(lv, tx, feet) && n.y + n.h >= feet * TILE - 0.5) {
        n.y = feet * TILE - n.h;
        n.vy = 0;
        n.onGround = true;
        break;
      }
  }

  let coins = 0;
  for (const c of lv.coins) {
    if (c.taken) continue;
    if (c.x > n.x - 6 && c.x < n.x + n.w + 6 && c.y > n.y - 6 && c.y < n.y + n.h + 6) {
      c.taken = true;
      coins++;
    }
  }
  return { player: n, coins, fell: n.y > lv.h * TILE + 40, won: n.x >= lv.goalX };
}
