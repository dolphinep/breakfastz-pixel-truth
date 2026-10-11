import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blobToPixels, downloadPng } from "@/lib/io";
import type { Pixels } from "@/lib/pixel/image";
import { PRESETS, type Palette } from "@/lib/pixel/palette";
import { DEFAULT_OPTIONS, run, type Options, type Result } from "@/lib/pixel/pipeline";
import { crop, findSprites, type Box } from "@/lib/pixel/split";
import type { WorkerRequest, WorkerResponse } from "@/workers/pipeline.worker";

export type PaletteChoice = { kind: "auto" } | { kind: "preset"; name: string } | { kind: "lospec"; slug: string; colors: Palette } | { kind: "none" };

/** A picture that contains several images: the full picture, a box per image, and the pixel size detected on the whole. */
export type Sheet = { img: Pixels; name: string; boxes: Box[]; cell?: number };

export type Source = { img: Pixels; name: string };

type Callbacks = {
  /** A new conversion result is ready (the editor should start from it). */
  onResult: (r: Result) => void;
  onError: (key: "errProcess" | "errOpen") => void;
};

/** Image → real pixel art: input handling, settings and the background worker that runs the pipeline. */
export function usePixelTruth({ onResult, onError }: Callbacks) {
  const [source, setSource] = useState<Source | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [piece, setPiece] = useState<number | null>(null); // null = whole picture
  const [opt, setOpt] = useState<Options>(DEFAULT_OPTIONS);
  const [palChoice, setPalChoice] = useState<PaletteChoice>({ kind: "auto" });
  const [autoColors, setAutoColors] = useState(16);
  const [result, setResult] = useState<Result | null>(null);
  const [ms, setMs] = useState(0);
  const [busy, setBusy] = useState(false);

  // Latest callbacks for the worker handler, which is attached once.
  const callbacks = useRef({ onResult, onError });
  useEffect(() => {
    callbacks.current = { onResult, onError };
  });

  // UI choices → pipeline options (derived, not stored twice).
  const runOpt = useMemo<Options>(() => {
    const palette: Options["palette"] =
      palChoice.kind === "auto"
        ? { mode: "auto", colors: autoColors }
        : palChoice.kind === "preset"
          ? { mode: "fixed", colors: PRESETS[palChoice.name] }
          : palChoice.kind === "lospec"
            ? { mode: "fixed", colors: palChoice.colors }
            : { mode: "none" };
    // A piece cut from a sheet uses the sheet's pixel size as a hint (more reliable than guessing from a small crop).
    const grid: Options["grid"] = opt.grid.mode === "auto" && piece !== null && sheet?.cell ? { mode: "auto", hint: sheet.cell } : opt.grid;
    return { ...opt, grid, palette };
  }, [opt, palChoice, autoColors, piece, sheet]);

  // ---------- worker
  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const sentImg = useRef<Pixels | null>(null);
  const sheetRef = useRef<Sheet | null>(null);

  useEffect(() => {
    const w = new Worker(new URL("../../workers/pipeline.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id !== reqId.current) return; // superseded by a newer request
      setBusy(false);
      const r = e.data.result;
      if (e.data.error || !r) {
        callbacks.current.onError("errProcess");
        return;
      }
      setResult(r);
      setMs(e.data.ms);
      callbacks.current.onResult(r);
      // Result for a whole sheet → remember its pixel size for the individual pieces.
      const sh = sheetRef.current;
      if (sh && sh.cell === undefined && sentImg.current === sh.img && (r.grid.kind === "snapped" || r.grid.kind === "exact")) {
        const next = { ...sh, cell: r.grid.cellW };
        sheetRef.current = next;
        setSheet(next);
      }
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  useEffect(() => {
    if (!source || !worker.current) return;
    const id = ++reqId.current;
    const msg: WorkerRequest = { id, opt: runOpt };
    if (sentImg.current !== source.img) {
      msg.img = source.img; // the worker caches the image between setting changes
      sentImg.current = source.img;
    }
    setBusy(true);
    worker.current.postMessage(msg);
  }, [source, runOpt]);

  const open = (img: Pixels, name: string, sh: Sheet | null) => {
    sheetRef.current = sh;
    setSheet(sh);
    setPiece(null);
    setOpt((o) => ({ ...o, grid: { mode: "auto" } }));
    setSource({ img, name });
  };

  // ---------- input
  const load = useCallback(async (blob: Blob, name: string) => {
    try {
      const img = await blobToPixels(blob);
      const boxes = findSprites(img);
      open(img, name, boxes.length >= 2 ? { img, name, boxes } : null);
    } catch {
      callbacks.current.onError("errOpen");
    }
  }, []);

  const loadUrl = useCallback(
    async (url: string, name: string) => {
      try {
        const res = await fetch(url);
        await load(await res.blob(), name);
      } catch {
        callbacks.current.onError("errOpen");
      }
    },
    [load],
  );

  const loadPixels = (img: Pixels, name: string) => open(img, name, null);

  const selectPiece = (i: number | null) => {
    if (!sheet) return;
    setPiece(i);
    setOpt((o) => ({ ...o, grid: { mode: "auto" } }));
    const base = sheet.name.replace(/\.\w+$/, "");
    setSource(i === null ? { img: sheet.img, name: sheet.name } : { img: crop(sheet.img, sheet.boxes[i]), name: `${base}-${i + 1}.png` });
  };

  /** Convert every piece of the sheet with the current settings and download them one by one. */
  const processAll = async (scaleOf: (p: Pixels) => number) => {
    if (!sheet) return;
    const base = sheet.name.replace(/\.\w+$/, "");
    for (const [i, b] of sheet.boxes.entries()) {
      const r = run(crop(sheet.img, b), { ...runOpt, grid: sheet.cell ? { mode: "auto", hint: sheet.cell } : { mode: "auto" } });
      await downloadPng(r.pixels, scaleOf(r.pixels), `${base}-${i + 1}-pixel.png`);
      await new Promise((res) => setTimeout(res, 250)); // give the browser time to accept multiple downloads
    }
  };

  /** Close the current image (back to the start screen or into draw mode). */
  const close = () => {
    reqId.current++; // drop any result still in flight
    sheetRef.current = null;
    setSheet(null);
    setSource(null);
    setResult(null);
    setBusy(false);
  };

  return {
    source,
    sheet,
    piece,
    opt,
    setOpt,
    palChoice,
    setPalChoice,
    autoColors,
    setAutoColors,
    result,
    ms,
    busy,
    load,
    loadUrl,
    loadPixels,
    selectPiece,
    processAll,
    close,
  };
}

export type PixelTruth = ReturnType<typeof usePixelTruth>;
