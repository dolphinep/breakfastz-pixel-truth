import { useEffect, useRef } from "react";
import type { Pixels } from "@/lib/pixel/image";
import type { Box } from "@/lib/pixel/split";
import { pixelsToCanvas } from "@/lib/io";

// Convert the full image to a canvas once and reuse it for every thumbnail
const cache = new WeakMap<Pixels, HTMLCanvasElement>();
const canvasOf = (img: Pixels) => {
  let c = cache.get(img);
  if (!c) cache.set(img, (c = pixelsToCanvas(img)));
  return c;
};

/** Thumbnail of one region of the image (used in the sliced-tiles strip) */
export function Thumb({ img, box, size }: { img: Pixels; box: Box; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext("2d")!;
    const k = Math.min(size / box.w, size / box.h) * dpr;
    const w = box.w * k;
    const h = box.h * k;
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(canvasOf(img), box.x, box.y, box.w, box.h, (c.width - w) / 2, (c.height - h) / 2, w, h);
  }, [img, box, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}
