// Shared image format for the whole project — shaped like ImageData but also usable in Node (tests)
export type Pixels = { w: number; h: number; data: Uint8ClampedArray };

export type RGBA = [number, number, number, number];

export const createPixels = (w: number, h: number): Pixels => ({
  w,
  h,
  data: new Uint8ClampedArray(w * h * 4),
});

export const clonePixels = (p: Pixels): Pixels => ({ w: p.w, h: p.h, data: new Uint8ClampedArray(p.data) });

export const getPx = (p: Pixels, x: number, y: number): RGBA => {
  const i = (y * p.w + x) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]];
};

export const setPx = (p: Pixels, x: number, y: number, c: RGBA) => {
  const i = (y * p.w + x) * 4;
  p.data[i] = c[0];
  p.data[i + 1] = c[1];
  p.data[i + 2] = c[2];
  p.data[i + 3] = c[3];
};

// Color packed into a single number for fast compare/count (all transparent pixels count as one color)
export const keyOf = (c: RGBA) => (c[3] < 128 ? -1 : (c[0] << 16) | (c[1] << 8) | c[2]);

export const fromKey = (k: number): RGBA => (k < 0 ? [0, 0, 0, 0] : [(k >> 16) & 255, (k >> 8) & 255, k & 255, 255]);

export const luminance = (p: Pixels, x: number, y: number) => {
  const i = (y * p.w + x) * 4;
  const a = p.data[i + 3] / 255;
  return (0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]) * a + 255 * (1 - a) * 0.5;
};
