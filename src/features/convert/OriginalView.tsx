import { Check, PenLine, TriangleAlert, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { PixelCanvas } from "@/components/PixelCanvas";
import { useI18n } from "@/i18n";
import type { Result } from "@/lib/pixel/pipeline";
import type { Source } from "./usePixelTruth";

/** The input image with the detected grid / mixel heatmap overlays and the verdict badge. */
export function OriginalView({ source, result }: { source: Source; result: Result | null }) {
  const { t } = useI18n();
  const [showGrid, setShowGrid] = useState(true);
  const [showMixels, setShowMixels] = useState(false);

  const overlay = useCallback(
    (ctx: CanvasRenderingContext2D, s: number) => {
      if (!result) return;
      const { xs, ys } = result.grid;
      if (showMixels) {
        const cw = xs.length - 1;
        for (let cy = 0; cy < ys.length - 1; cy++)
          for (let cx = 0; cx < cw; cx++) {
            const m = result.mixels[cy * cw + cx];
            if (m < 0.2) continue;
            ctx.fillStyle = `rgba(255, 42, 109, ${Math.min(0.75, m * 0.8)})`;
            ctx.fillRect(xs[cx] * s, ys[cy] * s, (xs[cx + 1] - xs[cx]) * s, (ys[cy + 1] - ys[cy]) * s);
          }
      }
      // Only draw grid lines when cells are big enough on screen to tell apart.
      if (showGrid && (xs[1] - xs[0]) * s >= 6) {
        ctx.strokeStyle = "rgba(5, 217, 232, 0.7)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const x of xs) {
          ctx.moveTo(Math.round(x * s) + 0.5, 0);
          ctx.lineTo(Math.round(x * s) + 0.5, source.img.h * s);
        }
        for (const y of ys) {
          ctx.moveTo(0, Math.round(y * s) + 0.5);
          ctx.lineTo(source.img.w * s, Math.round(y * s) + 0.5);
        }
        ctx.stroke();
      }
    },
    [result, showGrid, showMixels, source],
  );

  const verdict = useMemo(() => {
    if (!result) return null;
    const px = result.grid.cellW.toFixed(2);
    switch (result.grid.kind) {
      case "exact":
        return { cls: "ok", Icon: Check, text: result.grid.cellW === 1 ? t("verdictExact1") : t("verdictExact", { k: result.grid.cellW }) };
      case "snapped":
        return { cls: "warn", Icon: TriangleAlert, text: t("verdictSnapped", { px }) };
      case "freeform":
        return { cls: "bad", Icon: X, text: t("verdictFreeform", { w: result.pixels.w, h: result.pixels.h }) };
      default:
        return { cls: "warn", Icon: PenLine, text: t("verdictManual", { px }) };
    }
  }, [result, t]);

  return (
    <section className="panel view">
      <div className="view-head">
        <h2>{t("original")}</h2>
        <span className="muted">
          {source.img.w}×{source.img.h}
        </span>
        <label className="check inline" data-tip={t("gridTip")}>
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> {t("grid")}
        </label>
        <label className="check inline" data-tip={t("mixelsTip")}>
          <input type="checkbox" checked={showMixels} onChange={(e) => setShowMixels(e.target.checked)} /> {t("mixels")}
        </label>
      </div>
      {verdict && result && (
        <div className={`verdict ${verdict.cls}`} role="status">
          <b>
            <verdict.Icon size={15} strokeWidth={3} aria-hidden />
          </b>
          {verdict.text}
          {result.grid.kind !== "exact" && <span> · {t("mixelPct", { n: (result.stats.mixelRatio * 100).toFixed(0) })}</span>}
        </div>
      )}
      <PixelCanvas pixels={source.img} overlay={overlay} label={t("original")} />
    </section>
  );
}
