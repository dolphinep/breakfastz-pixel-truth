import { GIFEncoder, applyPalette, quantize } from "gifenc";
import type { Pixels } from "@/lib/pixel/image";

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Animated GIF: nearest-neighbor upscale for crisp pixels, brand cream background (GIF has no partial transparency) */
export function exportGif(frames: Pixels[], fps: number, name: string, target = 320, bg: [number, number, number] = [239, 234, 219]) {
  const k = Math.max(1, Math.round(target / Math.max(frames[0].w, frames[0].h)));
  const W = frames[0].w * k;
  const H = frames[0].h * k;
  const scaled = frames.map((f) => {
    const out = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const s = (Math.floor(y / k) * f.w + Math.floor(x / k)) * 4;
        const d = (y * W + x) * 4;
        const a = f.data[s + 3] > 127;
        out[d] = a ? f.data[s] : bg[0];
        out[d + 1] = a ? f.data[s + 1] : bg[1];
        out[d + 2] = a ? f.data[s + 2] : bg[2];
        out[d + 3] = 255;
      }
    return out;
  });
  // One palette for all frames (pixel art has few colors anyway) → no color flicker between frames
  const all = new Uint8Array(scaled.reduce((n, f) => n + f.length, 0));
  scaled.reduce((off, f) => (all.set(f, off), off + f.length), 0);
  const palette = quantize(all, 256);
  const gif = GIFEncoder();
  for (const f of scaled) gif.writeFrame(applyPalette(f, palette), W, H, { palette, delay: Math.round(1000 / fps) });
  gif.finish();
  download(new Blob([gif.bytes() as BlobPart], { type: "image/gif" }), name);
}

export { download };
