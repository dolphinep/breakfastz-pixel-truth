import { Check, Crosshair, Minimize2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { MAX_FRAME } from "@/lib/editor/tools";
import { RATIOS } from "./toolList";
import type { Editor } from "./useEditor";

/** Options bar for the frame tool: ratio presets, size inputs, trim/center, apply/cancel. */
export function FrameOptions({ editor }: { editor: Editor }) {
  const { t } = useI18n();
  const { frame, ratio, lockedRatio } = editor;
  if (!frame) return null;
  // With a locked ratio, typing one side updates the other.
  const fromW = (w: number) => editor.setFrameSize(w, lockedRatio ? (w * lockedRatio[1]) / lockedRatio[0] : frame.h);
  const fromH = (h: number) => editor.setFrameSize(lockedRatio ? (h * lockedRatio[0]) / lockedRatio[1] : frame.w, h);

  return (
    <div className="frame-options">
      <div className="seg ratio" role="group" aria-label={t("ratio")} data-tip={t("ratioTip")}>
        {RATIOS.map(({ label }) => (
          <button key={label} className={ratio === label ? "on" : ""} aria-pressed={ratio === label} onClick={() => editor.pickRatio(label)}>
            {label === "free" ? t("ratioFree") : label}
          </button>
        ))}
      </div>
      <div className="frame-size">
        <label>
          W
          <input type="number" min={1} max={MAX_FRAME} value={frame.w} onChange={(e) => fromW(+e.target.value)} />
        </label>
        <label>
          H
          <input type="number" min={1} max={MAX_FRAME} value={frame.h} onChange={(e) => fromH(+e.target.value)} />
        </label>
        <button className="btn small" data-tip={t("trimTip")} onClick={editor.trimFrame}>
          <Minimize2 size={15} aria-hidden />
          {t("trim")}
        </button>
        <button className="btn small" data-tip={t("centerTip")} onClick={editor.centerFrame}>
          <Crosshair size={15} aria-hidden />
          {t("centerContent")}
        </button>
      </div>
      <div className="frame-actions">
        <button className="btn small primary" data-tip={t("applyFrameTip")} onClick={editor.applyFrame}>
          <Check size={15} aria-hidden />
          {t("applyFrame")}
        </button>
        <button className="btn small ghost" onClick={() => editor.chooseTool("pencil")}>
          {t("cancelFrame")}
        </button>
      </div>
    </div>
  );
}
