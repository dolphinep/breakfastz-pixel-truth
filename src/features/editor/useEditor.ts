import { useCallback, useEffect, useRef, useState } from "react";
import { rgbaToHex } from "@/lib/pixel/color";
import { clonePixels, getPx, setPx, type Pixels, type RGBA } from "@/lib/pixel/image";
import { brushPoints, centerOn, contentBounds, floodFill, line, magicErase, MAX_FRAME, reframe, withRatio, type Rect, type Tool } from "@/lib/editor/tools";
import { RATIOS, TOOLS } from "./toolList";

const HISTORY_LIMIT = 100;

const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;

/** Pixel editor state: the edited image, tools, colors, undo/redo and the frame (canvas size) tool. */
export function useEditor() {
  const [pixels, setPixels] = useState<Pixels | null>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState<RGBA>([42, 15, 8, 255]);
  const [recent, setRecent] = useState<RGBA[]>([]);
  const [brush, setBrush] = useState(1);
  const [tolerance, setTolerance] = useState(12); // OKLab distance × 100
  const [wholeImage, setWholeImage] = useState(false);
  const [frame, setFrame] = useState<Rect | null>(null);
  const [ratio, setRatio] = useState("free");
  // Whole images (not just pixel data) because the frame tool can change the size.
  const undoStack = useRef<Pixels[]>([]);
  const redoStack = useRef<Pixels[]>([]);
  const last = useRef<[number, number] | null>(null);

  /** Replace the image and clear history (new conversion result or blank canvas). */
  const reset = useCallback((next: Pixels | null) => {
    undoStack.current = [];
    redoStack.current = [];
    setPixels(next);
    setFrame(null);
    setTool((t) => (t === "frame" ? "pencil" : t));
  }, []);

  const commit = (prev: Pixels, next: Pixels) => {
    undoStack.current.push(clonePixels(prev));
    if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
    redoStack.current = [];
    setPixels(next);
  };

  const undo = useCallback(() => {
    if (!pixels || !undoStack.current.length) return;
    redoStack.current.push(clonePixels(pixels));
    setPixels(undoStack.current.pop()!);
  }, [pixels]);

  const redo = useCallback(() => {
    if (!pixels || !redoStack.current.length) return;
    undoStack.current.push(clonePixels(pixels));
    setPixels(redoStack.current.pop()!);
  }, [pixels]);

  const pickColor = (c: RGBA, remember = false) => {
    setColor(c);
    if (tool !== "pencil" && tool !== "fill") setTool("pencil");
    if (remember) setRecent((r) => [c, ...r.filter((x) => rgbaToHex(x) !== rgbaToHex(c))].slice(0, 8));
  };

  /** Pointer input from the canvas, in image pixel coordinates (may be outside while dragging). */
  const onPixel = (x: number, y: number, phase: "down" | "move" | "up") => {
    if (!pixels) return;
    if (phase === "up") {
      last.current = null;
      return;
    }
    // Strokes may leave the image; every other tool needs a pixel inside it.
    const outside = x < 0 || y < 0 || x >= pixels.w || y >= pixels.h;
    if (outside && tool !== "pencil" && tool !== "eraser") return;
    if (tool === "picker") {
      const c = getPx(pixels, x, y);
      if (c[3] > 0) setColor(c);
      return;
    }
    if (tool === "fill" || tool === "magic") {
      if (phase === "down") commit(pixels, tool === "fill" ? floodFill(pixels, x, y, color) : magicErase(pixels, x, y, tolerance / 100, !wholeImage).out);
      return;
    }
    const paint: RGBA = tool === "eraser" ? [0, 0, 0, 0] : color;
    const from = phase === "move" && last.current ? last.current : ([x, y] as [number, number]);
    const next = phase === "down" ? clonePixels(pixels) : pixels;
    for (const [lx, ly] of line(from[0], from[1], x, y))
      for (const [px, py] of brushPoints(lx, ly, brush, next.w, next.h)) setPx(next, px, py, paint);
    last.current = [x, y];
    if (phase === "down") commit(pixels, next);
    else setPixels({ ...next }); // same stroke: mutate in place, one undo step per stroke
  };

  // ---------- frame tool: canvas size, ratio and position of the drawing inside it
  const chooseTool = useCallback(
    (t: Tool) => {
      setTool(t);
      setFrame(t === "frame" && pixels ? { x: 0, y: 0, w: pixels.w, h: pixels.h } : null);
      setRatio("free");
    },
    [pixels],
  );

  const lockedRatio = RATIOS.find((x) => x.label === ratio)?.r ?? null;

  const pickRatio = (label: string) => {
    setRatio(label);
    const r = RATIOS.find((x) => x.label === label)?.r;
    if (r && frame && pixels) setFrame(withRatio(frame, r[0], r[1], contentBounds(pixels)));
  };

  const setFrameSize = (w: number, h: number) => {
    if (!frame) return;
    const clamp = (n: number) => Math.min(MAX_FRAME, Math.max(1, Math.round(n) || 1));
    setFrame({ ...frame, w: clamp(w), h: clamp(h) });
  };

  const trimFrame = () => {
    const c = pixels && contentBounds(pixels);
    if (c) setFrame(c);
    setRatio("free");
  };

  const centerFrame = () => {
    const c = pixels && contentBounds(pixels);
    if (c && frame) setFrame(centerOn(frame, c));
  };

  const applyFrame = useCallback(() => {
    if (!frame || !pixels) return;
    if (frame.x !== 0 || frame.y !== 0 || frame.w !== pixels.w || frame.h !== pixels.h) {
      undoStack.current.push(clonePixels(pixels));
      redoStack.current = [];
      setPixels(reframe(pixels, frame));
    }
    setFrame(null);
    setTool("pencil");
  }, [frame, pixels]);

  // ---------- keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      // Frame mode: arrows move the drawing (Shift = 4px), Enter applies, Esc cancels.
      if (frame) {
        const k = e.shiftKey ? 4 : 1;
        const d = { ArrowLeft: [k, 0], ArrowRight: [-k, 0], ArrowUp: [0, k], ArrowDown: [0, -k] }[e.key];
        if (d) {
          e.preventDefault();
          setFrame({ ...frame, x: frame.x + d[0], y: frame.y + d[1] });
          return;
        }
        if (e.key === "Enter") return applyFrame();
        if (e.key === "Escape") return chooseTool("pencil");
      }
      const hit = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (!mod && hit) chooseTool(hit.tool);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, frame, applyFrame, chooseTool]);

  return {
    pixels,
    reset,
    tool,
    chooseTool,
    color,
    setColor,
    pickColor,
    recent,
    brush,
    setBrush,
    tolerance,
    setTolerance,
    wholeImage,
    setWholeImage,
    onPixel,
    undo,
    redo,
    frame,
    setFrame,
    ratio,
    lockedRatio,
    pickRatio,
    setFrameSize,
    trimFrame,
    centerFrame,
    applyFrame,
  };
}

export type Editor = ReturnType<typeof useEditor>;
