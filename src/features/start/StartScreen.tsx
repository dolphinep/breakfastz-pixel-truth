import { ImagePlus, Pencil, Sparkles } from "lucide-react";
import { useState } from "react";
import { useI18n, type Key } from "@/i18n";
import { MAX_FRAME } from "@/lib/editor/tools";
import { eggSprite, fakeAI } from "@/lib/pixel/fake";
import { getPx, setPx, type Pixels } from "@/lib/pixel/image";

const upscaled = (src: Pixels, k: number): Pixels => {
  const out = { w: src.w * k, h: src.h * k, data: new Uint8ClampedArray(src.w * k * src.h * k * 4) };
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) setPx(out, x, y, getPx(src, Math.floor(x / k), Math.floor(y / k)));
  return out;
};

/** Built-in samples: fake AI pixel art (drifting grid, blurry) and a clean upscale. */
const SAMPLES: { key: Key; make: () => Pixels }[] = [
  { key: "sampleFake", make: () => fakeAI(eggSprite(), 9.37) },
  { key: "sampleBlur", make: () => fakeAI(eggSprite(), 5.5, { noise: 18 }) },
  { key: "sampleReal", make: () => upscaled(eggSprite(), 12) },
];

/** Blank canvas presets for draw-from-scratch mode. */
const BLANK_SIZES = [16, 24, 32, 48, 64];

type Props = {
  onSample: (img: Pixels, name: string) => void;
  onBlank: (w: number, h: number) => void;
  onPrompts: () => void;
};

/** Start screen: drop/paste/open an image, try a sample, start a blank canvas, or get AI prompts. */
export function StartScreen({ onSample, onBlank, onPrompts }: Props) {
  const { t } = useI18n();
  const [blankW, setBlankW] = useState(32);
  const [blankH, setBlankH] = useState(32);

  return (
    <section className="empty">
      <div className="drop">
        <ImagePlus size={44} aria-hidden className="drop-icon" />
        <p className="big">{t("dropTitle")}</p>
        <p>{t("dropSub")}</p>
        <div className="samples">
          <span>{t("trySample")}</span>
          {SAMPLES.map((s) => (
            <button key={s.key} className="btn" data-tip={t("sampleTip")} onClick={() => onSample(s.make(), "sample.png")}>
              {t(s.key)}
            </button>
          ))}
        </div>
        <div className="blank-cta">
          <span>
            <Pencil size={16} aria-hidden /> {t("drawFromScratch")}
          </span>
          <div className="blank-sizes" role="group" aria-label={t("drawFromScratch")}>
            {BLANK_SIZES.map((n) => (
              <button key={n} className="btn small" data-tip={t("drawSizeTip", { n })} onClick={() => onBlank(n, n)}>
                {n}×{n}
              </button>
            ))}
          </div>
          <form
            className="blank-custom"
            onSubmit={(e) => {
              e.preventDefault();
              onBlank(blankW, blankH);
            }}
          >
            <input type="number" aria-label={t("drawWidth")} min={1} max={MAX_FRAME} value={blankW} onChange={(e) => setBlankW(+e.target.value)} />
            ×
            <input type="number" aria-label={t("drawHeight")} min={1} max={MAX_FRAME} value={blankH} onChange={(e) => setBlankH(+e.target.value)} />
            <button className="btn small primary">{t("drawStart")}</button>
          </form>
        </div>
        <div className="ai-cta">
          <span>{t("noImage")}</span>
          <button className="btn primary" data-tip={t("promptsTip")} onClick={onPrompts}>
            <Sparkles size={18} aria-hidden />
            {t("prompts")}
          </button>
        </div>
      </div>
    </section>
  );
}
