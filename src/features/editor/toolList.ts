import { Crop, Eraser, Hand, PaintBucket, Pencil, Pipette, WandSparkles, type LucideIcon } from "lucide-react";
import type { Key } from "@/i18n";
import type { Tool } from "@/lib/editor/tools";

/** Toolbar entries: icon, tooltip key and keyboard shortcut. */
export const TOOLS: { tool: Tool; tip: Key; Icon: LucideIcon; key: string }[] = [
  { tool: "pencil", tip: "pencil", Icon: Pencil, key: "b" },
  { tool: "eraser", tip: "eraser", Icon: Eraser, key: "e" },
  { tool: "magic", tip: "magic", Icon: WandSparkles, key: "m" },
  { tool: "picker", tip: "picker", Icon: Pipette, key: "i" },
  { tool: "fill", tip: "fill", Icon: PaintBucket, key: "g" },
  { tool: "hand", tip: "hand", Icon: Hand, key: "h" },
  { tool: "frame", tip: "frameTool", Icon: Crop, key: "c" },
];

/** Frame ratio presets as [w, h]; null = free. */
export const RATIOS: { label: string; r: [number, number] | null }[] = [
  { label: "free", r: null },
  { label: "1:1", r: [1, 1] },
  { label: "4:3", r: [4, 3] },
  { label: "3:4", r: [3, 4] },
  { label: "16:9", r: [16, 9] },
  { label: "9:16", r: [9, 16] },
];
