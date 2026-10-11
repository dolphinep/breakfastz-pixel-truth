import type { Voxel } from "./voxel";

/**
 * Merge voxels into a single mesh (per-vertex position/normal/color), keeping only faces not touching another voxel
 * Works both for rendering in Three.js and for .glb export (no instancing needed)
 */
export function voxelMesh(vox: Voxel[]) {
  const key = (x: number, y: number, z: number) => `${Math.round(x * 2)},${Math.round(y * 2)},${z}`;
  const filled = new Set(vox.map((v) => key(v.x, v.y, v.z)));
  const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
    { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (const v of vox) {
    for (const f of FACES) {
      if (filled.has(key(v.x + f.n[0], v.y + f.n[1], v.z + f.n[2]))) continue;
      const base = pos.length / 3;
      // slight shading by face direction so it reads as a solid block
      const shade = f.n[1] === 1 ? 1.08 : f.n[1] === -1 ? 0.72 : f.n[0] !== 0 ? 0.88 : 1;
      for (const c of f.c) {
        pos.push(v.x - 0.5 + c[0], v.y - 0.5 + c[1], v.z - 0.5 + c[2]);
        nor.push(...f.n);
        col.push(Math.min(1, (v.r / 255) * shade), Math.min(1, (v.g / 255) * shade), Math.min(1, (v.b / 255) * shade));
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col), indices: new Uint32Array(idx) };
}
