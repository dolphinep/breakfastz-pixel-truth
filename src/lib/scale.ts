import type { Pixels } from "./pixel/image";

/** Export scale presets. "fit" picks the largest whole-number scale that fits FIT px. */
export const SCALES = [1, 2, 4, 8, 16, 32] as const;
export const FIT = 1024;
export type ScaleChoice = (typeof SCALES)[number] | "fit";

export const scaleFor = (s: ScaleChoice, p: Pixels) => (s === "fit" ? Math.max(1, Math.round(FIT / Math.max(p.w, p.h))) : s);
