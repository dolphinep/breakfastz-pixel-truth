// Generate prompt example images → public/examples/<id>.jpg (as an AI would deliver them) + scratch/<id>.native.png for inspection
// npm run examples
import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { it } from "vitest";
import { fakeAI } from "../src/lib/pixel/fake";
import type { Pixels } from "../src/lib/pixel/image";
import { EXAMPLES } from "../src/examples/art";

const OUT = path.resolve(__dirname, "../public/examples");
const PREVIEW = path.resolve(__dirname, "../scratch");

const save = (p: Pixels, file: string, scale = 1) => {
  const png = new PNG({ width: p.w * scale, height: p.h * scale });
  for (let y = 0; y < p.h * scale; y++)
    for (let x = 0; x < p.w * scale; x++) {
      const s = (Math.floor(y / scale) * p.w + Math.floor(x / scale)) * 4;
      const d = (y * p.w * scale + x) * 4;
      for (let c = 0; c < 4; c++) png.data[d + c] = p.data[s + c];
    }
  fs.writeFileSync(file, PNG.sync.write(png));
};

it("export examples", () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(PREVIEW, { recursive: true });
  for (const [i, ex] of EXAMPLES.entries()) {
    const native = ex.make();
    save(native, path.join(PREVIEW, `${ex.id}.native.png`), 8);
    // AI images mostly arrive as JPEG anyway (and are much smaller than PNG when noisy)
    const ai = fakeAI(native, ex.scale, { seed: i + 1, noise: 12 });
    fs.writeFileSync(path.join(OUT, `${ex.id}.jpg`), jpeg.encode({ width: ai.w, height: ai.h, data: Buffer.from(ai.data) }, 90).data);
    console.log("✓", ex.id, native.w + "x" + native.h);
  }
});
