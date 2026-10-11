// Run the pipeline off the main thread so dragging sliders doesn't freeze the page
import type { Pixels } from "@/lib/pixel/image";
import { run, type Options, type Result } from "@/lib/pixel/pipeline";

export type WorkerRequest = { id: number; img?: Pixels; opt: Options };
export type WorkerResponse = { id: number; result?: Result; ms: number; error?: string };

let current: Pixels | null = null;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, img, opt } = e.data;
  if (img) current = img;
  if (!current) return;
  const t0 = performance.now();
  try {
    const result = run(current, opt);
    const msg: WorkerResponse = { id, result, ms: performance.now() - t0 };
    (self as unknown as Worker).postMessage(msg, [result.pixels.data.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ms: 0, error: String(err) } satisfies WorkerResponse);
  }
};
