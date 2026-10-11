// Run the pipeline on the real-world images in tests/fixtures/samples and write results to tests/fixtures/samples/out
// npm run samples
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { describe, expect, it } from "vitest";
import type { Pixels } from "../src/lib/pixel/image";
import { DEFAULT_OPTIONS, run } from "../src/lib/pixel/pipeline";

const DIR = path.resolve(__dirname, "../tests/fixtures/samples");
const OUT = path.join(DIR, "out");

const load = (file: string): Pixels => {
  const buf = fs.readFileSync(path.join(DIR, file));
  if (file.endsWith(".png")) {
    const png = PNG.sync.read(buf);
    return { w: png.width, h: png.height, data: new Uint8ClampedArray(png.data) };
  }
  const j = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  return { w: j.width, h: j.height, data: new Uint8ClampedArray(j.data) };
};

const save = (p: Pixels, file: string, scale = 1) => {
  const png = new PNG({ width: p.w * scale, height: p.h * scale });
  for (let y = 0; y < p.h * scale; y++)
    for (let x = 0; x < p.w * scale; x++) {
      const s = ((Math.floor(y / scale) * p.w + Math.floor(x / scale)) * 4);
      const d = (y * p.w * scale + x) * 4;
      for (let c = 0; c < 4; c++) png.data[d + c] = p.data[s + c];
    }
  fs.writeFileSync(path.join(OUT, file), PNG.sync.write(png));
};

const has = (f: string) => fs.existsSync(path.join(DIR, f));

describe.skipIf(!fs.existsSync(DIR))("real sample images", () => {
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /\.(png|jpe?g)$/.test(f)) : [];

  it.each(files)("%s", (file) => {
    const img = load(file);
    const t0 = performance.now();
    const r = run(img, DEFAULT_OPTIONS);
    const ms = performance.now() - t0;
    const g = r.grid;
    console.log(
      `${file.padEnd(24)} ${img.w}x${img.h} → ${r.pixels.w}x${r.pixels.h}  cell=${g.cellW.toFixed(2)}x${g.cellH.toFixed(2)} conf=${g.confidence.toFixed(2)} grid=${g.detected} mixel=${(r.stats.mixelRatio * 100).toFixed(0)}% colors ${r.stats.inputColors}→${r.stats.outputColors} orphans=${r.stats.orphans} corners=${r.stats.corners} ${ms.toFixed(0)}ms`,
    );
    const base = file.replace(/\.\w+$/, "");
    save(r.pixels, `${base}.1x.png`);
    save(r.pixels, `${base}.8x.png`, Math.max(1, Math.round(512 / Math.max(r.pixels.w, r.pixels.h))));
    expect(r.pixels.w).toBeGreaterThan(0);
  });

  it.runIf(has("rpg-preview.png") && has("rpg-assets-1x.png"))("an integer-scaled sprite recovers its native size", () => {
    const r = run(load("rpg-preview.png"), { ...DEFAULT_OPTIONS, palette: { mode: "none" }, orphans: false, pixelPerfect: false });
    expect(r.grid.detected).toBe(true);
  });
});
