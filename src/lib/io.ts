import type { Pixels } from "./pixel/image";

export async function blobToPixels(blob: Blob): Promise<Pixels> {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { w: d.width, h: d.height, data: d.data };
}

export function pixelsToCanvas(p: Pixels, scale = 1): HTMLCanvasElement {
  const src = document.createElement("canvas");
  src.width = p.w;
  src.height = p.h;
  src.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
  if (scale === 1) return src;
  const out = document.createElement("canvas");
  out.width = p.w * scale;
  out.height = p.h * scale;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

export async function downloadPng(p: Pixels, scale: number, name: string) {
  const blob = await new Promise<Blob | null>((res) => pixelsToCanvas(p, scale).toBlob(res, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyPng(p: Pixels, scale: number) {
  const blob = await new Promise<Blob | null>((res) => pixelsToCanvas(p, scale).toBlob(res, "image/png"));
  if (blob) await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
