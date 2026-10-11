import { Maximize, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { Pixels } from "@/lib/pixel/image";
import { useI18n } from "@/i18n";
import { dragFrame, type Handle, type Rect } from "@/lib/editor/tools";
import { pixelsToCanvas } from "@/lib/io";

type Props = {
  pixels: Pixels;
  /** Overlay drawn after the image — origin at the image's top-left, s = on-screen size of one image pixel */
  overlay?: (ctx: CanvasRenderingContext2D, s: number) => void;
  /** Image pixel coordinates — on move these may fall outside the image (dragged past the edge); the caller must bounds-check */
  onPixel?: (x: number, y: number, phase: "down" | "move" | "up") => void;
  cursor?: string;
  label: string;
  /** Label above the image frame, e.g. the output size at the current scale */
  frameLabel?: string;
  /** Brush size (pixels) — used to draw the preview box under the cursor */
  brush?: number;
  /** true = dragging pans instead of drawing (hand tool) */
  panMode?: boolean;
  /** Changing this zooms to that size (e.g. the scale chosen for export) */
  zoomTo?: number;
  /** Frame mode: the new canvas frame (image pixel coords); drag edges/corners to resize, drag inside to move */
  frame?: Rect;
  onFrame?: (r: Rect) => void;
  /** w/h ratio locked while dragging the frame (null = free) */
  frameRatio?: number | null;
  /** Thin pixel grid when zoomed in far enough (helps when drawing by hand) */
  pixelGrid?: boolean;
};

const HANDLE_CURSOR: Record<Handle, string> = {
  move: "move",
  l: "ew-resize",
  r: "ew-resize",
  t: "ns-resize",
  b: "ns-resize",
  tl: "nwse-resize",
  br: "nwse-resize",
  tr: "nesw-resize",
  bl: "nesw-resize",
};

/** z = on-screen size of one image pixel (CSS px), x/y = image's top-left on screen */
type View = { z: number; x: number; y: number };

const STEPS = [0.125, 0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
const MAX_Z = 64;
const KEEP = 48; // keep at least this much of the image on screen (px) while panning
const FIT_MARGIN = 0.72; // image fills 72% of the area — leaves a margin so the frame is clearly visible

const fitZoom = (bw: number, bh: number, p: Pixels) => {
  const f = Math.min((bw * FIT_MARGIN) / p.w, (bh * FIT_MARGIN) / p.h);
  return f >= 1 ? Math.floor(f) : f; // integer upscale = all pixels the same size
};

const centered = (z: number, bw: number, bh: number, p: Pixels): View => ({ z, x: Math.round((bw - p.w * z) / 2), y: Math.round((bh - p.h * z) / 2) });

/** The frame's 8 handles (corners + edge midpoints) in screen coords */
const handlePoints = (r: Rect): [number, number][] => {
  const xs = [r.x - 2, r.x + r.w / 2, r.x + r.w + 2];
  const ys = [r.y - 2, r.y + r.h / 2, r.y + r.h + 2];
  return xs.flatMap((x, i) => ys.filter((_, j) => i !== 1 || j !== 1).map((y) => [x, y] as [number, number]));
};

/** Shows a pixel image on a workspace larger than the image, with zoom/pan and pointer drawing */
export function PixelCanvas({ pixels, overlay, onPixel, cursor, label, frameLabel, brush = 1, panMode = false, zoomTo, frame, onFrame, frameRatio = null, pixelGrid = false }: Props) {
  const { t } = useI18n();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 400, h: 400 });
  const [userView, setUserView] = useState<View | null>(null); // null = fit to view
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  const [hoverHandle, setHoverHandle] = useState<Handle | null>(null);
  const bitmap = useMemo(() => pixelsToCanvas(pixels), [pixels]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Image size changed (new image) → reset to fit / only pixels edited → keep the current view
  const [dims, setDims] = useState(`${pixels.w}x${pixels.h}`);
  if (dims !== `${pixels.w}x${pixels.h}`) {
    setDims(`${pixels.w}x${pixels.h}`);
    setUserView(null);
  }

  const view = userView ?? centered(fitZoom(box.w, box.h, pixels), box.w, box.h, pixels);
  // Latest values for handlers bound once (wheel) and for ongoing drags
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  });

  const apply = (v: View) => {
    viewRef.current = v; // update immediately so the next event before render doesn't see a stale value
    setUserView(v);
  };

  const clampView = useCallback(
    (v: View): View => ({
      z: v.z,
      x: Math.min(box.w - KEEP, Math.max(KEEP - pixels.w * v.z, v.x)),
      y: Math.min(box.h - KEEP, Math.max(KEEP - pixels.h * v.z, v.y)),
    }),
    [box, pixels.w, pixels.h],
  );

  /** Zoom while keeping screen point (cx, cy) fixed */
  const zoomAt = useCallback(
    (z: number, cx = box.w / 2, cy = box.h / 2) => {
      const v = viewRef.current;
      const min = Math.min(fitZoom(box.w, box.h, pixels), 1) / 4;
      const nz = Math.min(MAX_Z, Math.max(min, z));
      const ix = (cx - v.x) / v.z;
      const iy = (cy - v.y) / v.z;
      apply(clampView({ z: nz, x: Math.round(cx - ix * nz), y: Math.round(cy - iy * nz) }));
    },
    [box, pixels, clampView],
  );
  const step = (dir: 1 | -1) => {
    const z = viewRef.current.z;
    const next = dir > 0 ? STEPS.find((s) => s > z + 1e-6) : [...STEPS].reverse().find((s) => s < z - 1e-6);
    zoomAt(next ?? z);
  };

  // Selected scale changed → zoom to show the actual output size
  const [lastZoomTo, setLastZoomTo] = useState(zoomTo);
  if (zoomTo !== lastZoomTo) {
    setLastZoomTo(zoomTo);
    if (zoomTo) setUserView(clampView(centered(Math.min(MAX_Z, zoomTo), box.w, box.h, pixels)));
  }

  // Frame resized via buttons (ratio/trim/typed size) and overflows → zoom to fit both image and frame (left alone while dragging)
  const fw = frame?.w;
  const fh = frame?.h;
  useEffect(() => {
    if (!frame || gesture.current?.kind === "frame") return;
    const v = viewRef.current;
    const l = Math.min(0, frame.x);
    const tp = Math.min(0, frame.y);
    const r = Math.max(pixels.w, frame.x + frame.w);
    const b = Math.max(pixels.h, frame.y + frame.h);
    const fits = v.x + l * v.z >= 8 && v.y + tp * v.z >= 8 && v.x + r * v.z <= box.w - 8 && v.y + b * v.z <= box.h - 50;
    if (fits) return;
    const z = fitZoom(box.w, box.h, { w: r - l, h: b - tp, data: pixels.data });
    apply({ z, x: Math.round((box.w - (r - l) * z) / 2 - l * z), y: Math.round((box.h - (b - tp) * z) / 2 - tp * z) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fw, fh]);

  // Mouse wheel: Ctrl/⌘ (or trackpad pinch) = zoom, plain scroll = pan when the image overflows
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(viewRef.current.z * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
        return;
      }
      const v = viewRef.current;
      const overflows = v.x < 0 || v.y < 0 || v.x + pixels.w * v.z > r.width || v.y + pixels.h * v.z > r.height;
      if (!overflows) return; // image fits entirely → let the page scroll normally
      e.preventDefault();
      apply(clampView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, clampView, pixels.w, pixels.h]);

  // Hold Space = drag to pan (like most drawing apps)
  useEffect(() => {
    if (!onPixel) return;
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onPixel]);

  // ---------- draw
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(box.w * dpr);
    c.height = Math.round(box.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, box.w, box.h);
    const { z, x, y } = view;
    const w = pixels.w * z;
    const h = pixels.h * z;
    // Brand hard shadow + checkerboard (= transparency) only inside the image frame
    // Frame mode: checkerboard covers both the image and the new frame (expanded area becomes transparent)
    const fr = frame && { x: x + frame.x * z, y: y + frame.y * z, w: frame.w * z, h: frame.h * z };
    const bg = fr
      ? { x: Math.min(x, fr.x), y: Math.min(y, fr.y), w: Math.max(x + w, fr.x + fr.w) - Math.min(x, fr.x), h: Math.max(y + h, fr.y + fr.h) - Math.min(y, fr.y) }
      : { x, y, w, h };
    ctx.fillStyle = "#2a0f08";
    if (!fr) ctx.fillRect(x + 5, y + 5, w, h);
    ctx.fillStyle = "#f6f3ea";
    ctx.fillRect(bg.x, bg.y, bg.w, bg.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(bg.x, bg.y, bg.w, bg.h);
    ctx.clip();
    ctx.fillStyle = "#e8e4da";
    // Draw mode: one checker cell per image pixel (matches the grid) / otherwise: 8 screen px per cell
    const cell = pixelGrid && z >= 6 ? z : 8;
    for (let yy = 0; yy < bg.h; yy += cell)
      for (let xx = Math.round(yy / cell) % 2 ? cell : 0; xx < bg.w; xx += cell * 2) ctx.fillRect(bg.x + xx, bg.y + yy, cell, cell);
    ctx.drawImage(bitmap, x, y, w, h);
    if (pixelGrid && z >= 6) {
      ctx.strokeStyle = "rgba(42, 15, 8, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < pixels.w; i++) {
        ctx.moveTo(Math.round(x + i * z) + 0.5, y);
        ctx.lineTo(Math.round(x + i * z) + 0.5, y + h);
      }
      for (let i = 1; i < pixels.h; i++) {
        ctx.moveTo(x, Math.round(y + i * z) + 0.5);
        ctx.lineTo(x + w, Math.round(y + i * z) + 0.5);
      }
      ctx.stroke();
    }
    ctx.translate(x, y);
    overlay?.(ctx, z);
    ctx.restore();
    if (fr) {
      // Outside the new frame = area to be cropped → darken it
      ctx.fillStyle = "rgba(42, 15, 8, 0.55)";
      ctx.beginPath();
      ctx.rect(0, 0, box.w, box.h);
      ctx.rect(fr.x, fr.y, fr.w, fr.h);
      ctx.fill("evenodd");
      // Original image bounds as a thin dashed line
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255, 253, 245, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.setLineDash([]);
      ctx.strokeStyle = "#2a0f08";
      ctx.lineWidth = 4;
      ctx.strokeRect(fr.x - 2, fr.y - 2, fr.w + 4, fr.h + 4);
      ctx.strokeStyle = "#ffc800";
      ctx.lineWidth = 2;
      ctx.strokeRect(fr.x - 2, fr.y - 2, fr.w + 4, fr.h + 4);
      for (const [hx, hy] of handlePoints(fr)) {
        ctx.fillStyle = "#fffdf5";
        ctx.fillRect(hx - 5, hy - 5, 10, 10);
        ctx.strokeStyle = "#2a0f08";
        ctx.lineWidth = 2;
        ctx.strokeRect(hx - 5, hy - 5, 10, 10);
      }
    } else {
      // Image frame = drawable bounds
      ctx.strokeStyle = "#2a0f08";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
    // Brush preview box under the cursor
    if (hover && onPixel && !panMode && !space && !fr) {
      const o = Math.floor((brush - 1) / 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1;
      const hx = x + (hover[0] - o) * z;
      const hy = y + (hover[1] - o) * z;
      ctx.strokeRect(Math.round(hx) + 0.5, Math.round(hy) + 0.5, Math.max(1, brush * z) - 1, Math.max(1, brush * z) - 1);
      ctx.strokeStyle = "rgba(42, 15, 8, 0.9)";
      ctx.strokeRect(Math.round(hx) - 0.5, Math.round(hy) - 0.5, Math.max(1, brush * z) + 1, Math.max(1, brush * z) + 1);
    }
  }, [bitmap, box, view, overlay, hover, brush, onPixel, panMode, space, pixels.w, pixels.h, frame, pixelGrid]);

  // ---------- pointer: draw / pan / two-finger pinch
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ kind: "draw" | "pan" | "pinch" | "frame"; dist?: number; cx?: number; cy?: number; handle?: Handle; start?: Rect; sx?: number; sy?: number } | null>(null);

  const local = (e: PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toPixel = (p: { x: number; y: number }) => [Math.floor((p.x - view.x) / view.z), Math.floor((p.y - view.y) / view.z)] as const;
  const inside = ([px, py]: readonly [number, number]) => px >= 0 && py >= 0 && px < pixels.w && py < pixels.h;

  /** Which part of the frame a screen point hits (corner/edge/inside) */
  const hitFrame = (p: { x: number; y: number }): Handle | null => {
    if (!frame || !onFrame) return null;
    const fr = { x: view.x + frame.x * view.z, y: view.y + frame.y * view.z, w: frame.w * view.z, h: frame.h * view.z };
    const R = 10;
    const nearL = Math.abs(p.x - fr.x) <= R;
    const nearR = Math.abs(p.x - fr.x - fr.w) <= R;
    const nearT = Math.abs(p.y - fr.y) <= R;
    const nearB = Math.abs(p.y - fr.y - fr.h) <= R;
    const inX = p.x > fr.x - R && p.x < fr.x + fr.w + R;
    const inY = p.y > fr.y - R && p.y < fr.y + fr.h + R;
    if (nearT && nearL) return "tl";
    if (nearT && nearR) return "tr";
    if (nearB && nearL) return "bl";
    if (nearB && nearR) return "br";
    if (nearL && inY) return "l";
    if (nearR && inY) return "r";
    if (nearT && inX) return "t";
    if (nearB && inX) return "b";
    if (p.x > fr.x && p.x < fr.x + fr.w && p.y > fr.y && p.y < fr.y + fr.h) return "move";
    return null;
  };

  const pinchState = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      // Second finger down → cancel drawing and switch to pinch
      if (gesture.current?.kind === "draw") onPixel?.(...toPixel(p), "up");
      gesture.current = { kind: "pinch", ...pinchState() };
      return;
    }
    if (pointers.current.size > 2) return;
    const handle = !space && e.button === 0 ? hitFrame(p) : null;
    if (handle && frame) {
      gesture.current = { kind: "frame", handle, start: frame, sx: p.x, sy: p.y };
      return;
    }
    const pan = !onPixel || panMode || space || e.button === 1 || !!frame;
    if (pan) {
      gesture.current = { kind: "pan" };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;
    const px = toPixel(p);
    if (!inside(px)) return; // started outside the image = don't draw
    gesture.current = { kind: "draw" };
    onPixel(...px, "down");
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = local(e);
    const prev = pointers.current.get(e.pointerId);
    const g = gesture.current;
    if (onPixel) {
      const px = toPixel(p);
      setHover(inside(px) ? [px[0], px[1]] : null);
    }
    if (frame && !g) setHoverHandle(hitFrame(p));
    if (!prev) return;
    pointers.current.set(e.pointerId, p);
    if (g?.kind === "pinch" && pointers.current.size === 2) {
      const s = pinchState();
      const v = viewRef.current;
      const nz = Math.min(MAX_Z, Math.max(0.05, v.z * (s.dist / g.dist!)));
      const ix = (g.cx! - v.x) / v.z;
      const iy = (g.cy! - v.y) / v.z;
      apply(clampView({ z: nz, x: s.cx - ix * nz, y: s.cy - iy * nz }));
      gesture.current = { kind: "pinch", ...s };
    } else if (g?.kind === "pan") {
      const v = viewRef.current;
      apply(clampView({ ...v, x: v.x + p.x - prev.x, y: v.y + p.y - prev.y }));
    } else if (g?.kind === "frame") {
      const z = viewRef.current.z;
      onFrame?.(dragFrame(g.start!, g.handle!, Math.round((p.x - g.sx!) / z), Math.round((p.y - g.sy!) / z), frameRatio));
    } else if (g?.kind === "draw") onPixel?.(...toPixel(p), "move");
  };

  const onUp = (e: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === "draw") onPixel?.(...toPixel(local(e)), "up");
    if (pointers.current.size === 0) {
      gesture.current = null;
      setPanning(false);
    } else if (g?.kind === "pinch") gesture.current = { kind: "pan" }; // one finger lifted → keep panning with the remaining one
  };

  const grab = !onPixel || panMode || space || (!!frame && !hoverHandle);
  const handleCursor = frame && hoverHandle && !space ? HANDLE_CURSOR[hoverHandle] : null;
  const shownZoom = view.z >= 1 ? `${Math.round(view.z * 10) / 10}×` : `${Math.round(view.z * 100)}%`;

  return (
    <div ref={wrap} className="canvas-wrap">
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        data-view={`${view.x},${view.y},${view.z}`}
        className={onPixel ? "drawable" : "pannable"}
        style={{ cursor: handleCursor ?? (grab ? (panning ? "grabbing" : "grab") : cursor) }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => setHover(null)}
        onAuxClick={(e) => e.preventDefault()}
      />
      {frameLabel && (
        <span
          className="frame-label"
          style={{
            left: Math.max(8, Math.min(box.w - 8, view.x + (frame?.x ?? 0) * view.z)),
            top: Math.max(8, view.y + (frame?.y ?? 0) * view.z - (frame ? 34 : 30)),
          }}
        >
          {frameLabel}
        </span>
      )}
      <div className="zoom" role="group" aria-label={t("zoom")}>
        <button aria-label={t("zoomOut")} data-tip={t("zoomOut")} onClick={() => step(-1)}>
          <Minus size={16} aria-hidden />
        </button>
        <span className="zoom-level">{shownZoom}</span>
        <button aria-label={t("zoomIn")} data-tip={t("zoomIn")} onClick={() => step(1)}>
          <Plus size={16} aria-hidden />
        </button>
        <button aria-label={t("zoomFit")} data-tip={t("zoomFit")} onClick={() => setUserView(null)}>
          <Maximize size={15} aria-hidden />
        </button>
      </div>
    </div>
  );
}
