import type { Pixels } from "../pixel/image";

export type Voxel = { x: number; y: number; z: number; r: number; g: number; b: number };

/**
 * Turn a sprite into voxels like a "soft toy": thicker the farther from the edge (distance transform)
 * Depth is symmetric front/back; x/y are pixel coords (y flipped so up is up); z is centered on 0
 */
export function toVoxels(sp: Pixels, maxDepth = 4): Voxel[] {
  const { w, h } = sp;
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = sp.data[i * 4 + 3] > 127 ? INF : 0;
  // chamfer distance, 2 passes (forward → backward)
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4);
    }
  const out: Voxel[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      // grow thickness softly (sqrt), capped at maxDepth per side
      const depth = Math.max(1, Math.min(maxDepth, Math.round(Math.sqrt(d[i]) * 1.2)));
      const [r, g, b] = [sp.data[i * 4], sp.data[i * 4 + 1], sp.data[i * 4 + 2]];
      for (let z = -depth + 1; z <= depth - 1; z++) {
        // keep only visible layers (the surface) to cut the voxel count
        const surface = Math.abs(z) === depth - 1 || at(x - 1, y) < d[i] || at(x + 1, y) < d[i] || at(x, y - 1) < d[i] || at(x, y + 1) < d[i];
        if (surface) out.push({ x: x - w / 2, y: h / 2 - y, z, r, g, b });
      }
    }
  return out;
}
