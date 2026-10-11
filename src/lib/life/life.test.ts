import { describe, expect, it } from "vitest";
import { eggSprite } from "../pixel/fake";
import { createPixels, getPx, setPx } from "../pixel/image";
import { findEyes, makeAnimations, squash, spriteSheet } from "./animate";
import { makeLevel, spawn, step, TILE } from "./game";
import { toSprite } from "./prepare";
import { toVoxels } from "./voxel";

const egg = () => toSprite(eggSprite());

describe("prepare", () => {
  it("removes an opaque background and crops tight", () => {
    const sp = egg();
    expect(getPx(sp, 0, 0)[3]).toBe(0);
    expect(sp.w).toBeLessThanOrEqual(16 + 2);
    expect(sp.h).toBeLessThanOrEqual(16 + 2);
  });
});

describe("prepare — multi-shade background", () => {
  it("fully removes a slightly off-color background with no floating specks", () => {
    const p = createPixels(12, 12);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) setPx(p, x, y, [238 + ((x * 7 + y * 3) % 5), 233 - ((x + y) % 3), 219, 255]);
    for (let y = 3; y < 9; y++) for (let x = 3; x < 9; x++) setPx(p, x, y, [200, 40, 40, 255]);
    const sp = toSprite(p);
    expect([sp.w, sp.h]).toEqual([8, 8]);
  });
});

describe("animate", () => {
  it("finds both eyes of the egg mascot", () => {
    const eyes = findEyes(egg());
    expect(eyes.length).toBe(2);
  });

  it("squash keeps the canvas height and the bottom baseline", () => {
    const sp = egg();
    const s = squash(sp, 2);
    expect(s.h).toBe(sp.h);
    expect(squash(sp, -2).h).toBe(sp.h + 2);
  });

  it("all poses have same-size frames + the blink pose has a frame that differs from idle", () => {
    const a = makeAnimations(egg());
    const all = [a.idle, a.blink, a.walk, a.jump];
    for (const an of all) for (const f of an.frames) expect([f.w, f.h]).toEqual([a.canvas.w, a.canvas.h]);
    const diff = (i: number, j: number) => a.blink.frames[i].data.some((v, k) => v !== a.blink.frames[j].data[k]);
    expect(diff(0, 4)).toBe(true);
    expect(spriteSheet(all).h).toBe(a.canvas.h * 4);
  });

  it("still works without eyes (single-color sprite)", () => {
    const p = createPixels(8, 8);
    for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) setPx(p, x, y, [200, 50, 50, 255]);
    const a = makeAnimations(toSprite(p));
    expect(a.eyes.length).toBe(0);
    expect(a.walk.frames.length).toBe(4);
  });
});

describe("voxel", () => {
  it("center is thicker than the edges", () => {
    const vox = toVoxels(egg(), 4);
    const zAt = (x: number, y: number) => Math.max(...vox.filter((v) => Math.round(v.x) === x && Math.round(v.y) === y).map((v) => Math.abs(v.z)), -1);
    expect(zAt(0, 0)).toBeGreaterThan(zAt(-6, 0));
    expect(vox.length).toBeGreaterThan(100);
  });
});

describe("game", () => {
  it("walking right moves farther and never falls through the ground (flat start of the level)", () => {
    const lv = makeLevel();
    let p = spawn(lv, 20, 20);
    for (let i = 0; i < 30; i++) p = step(lv, p, { left: false, right: true, jump: false }, 1 / 60).player;
    expect(p.x).toBeGreaterThan(3 * TILE + 70);
    expect(p.y + p.h).toBeLessThanOrEqual((lv.h - 2) * TILE + 1);
  });

  it("jumping rises before landing back on the ground", () => {
    const lv = makeLevel();
    let p = spawn(lv, 20, 20);
    const y0 = p.y;
    p = step(lv, p, { left: false, right: false, jump: true }, 1 / 60).player;
    let minY = p.y;
    for (let i = 0; i < 90; i++) {
      p = step(lv, p, { left: false, right: false, jump: false }, 1 / 60).player;
      minY = Math.min(minY, p.y);
    }
    expect(minY).toBeLessThan(y0 - 50);
    expect(Math.round(p.y)).toBe(Math.round(y0));
    expect(p.onGround).toBe(true);
  });

  it("standing still stays grounded every frame (no flicker) even with variable dt", () => {
    const lv = makeLevel();
    let p = spawn(lv, 20, 20);
    for (let i = 0; i < 60; i++) {
      p = step(lv, p, { left: false, right: false, jump: false }, i % 3 ? 1 / 60 : 1 / 144).player;
      expect(p.onGround).toBe(true);
    }
  });

  it("walking over a coin collects it", () => {
    const lv = makeLevel();
    let p = spawn(lv, 20, 20);
    let coins = 0;
    for (let i = 0; i < 40; i++) {
      const r = step(lv, p, { left: false, right: true, jump: false }, 1 / 60);
      p = r.player;
      coins += r.coins;
    }
    expect(coins).toBeGreaterThan(0);
  });
});
