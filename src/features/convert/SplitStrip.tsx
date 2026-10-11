import { Download, LayoutGrid, Scissors } from "lucide-react";
import { Thumb } from "@/components/Thumb";
import { useI18n } from "@/i18n";
import type { Sheet } from "./usePixelTruth";

type Props = {
  sheet: Sheet;
  piece: number | null;
  onSelect: (i: number | null) => void;
  onProcessAll: () => void;
};

/** Strip of images found inside one picture — pick one to fix it alone, or download all. */
export function SplitStrip({ sheet, piece, onSelect, onProcessAll }: Props) {
  const { t } = useI18n();
  const title = t("splitFound", { n: sheet.boxes.length });
  return (
    <section className="panel split" aria-label={title}>
      <div className="split-head">
        <Scissors size={20} aria-hidden />
        <b>{title}</b>
        <span className="muted">{t("splitHint")}</span>
        <button className="btn small" data-tip={t("splitAllTip")} onClick={onProcessAll}>
          <Download size={16} aria-hidden />
          {t("splitAll")}
        </button>
      </div>
      <div className="split-strip" role="listbox" aria-label={title}>
        <button role="option" aria-selected={piece === null} className={`split-item ${piece === null ? "on" : ""}`} data-tip={t("splitWholeTip")} onClick={() => onSelect(null)}>
          <LayoutGrid size={28} aria-hidden />
          <span>{t("splitWhole")}</span>
        </button>
        {sheet.boxes.map((b, i) => (
          <button
            key={i}
            role="option"
            aria-selected={piece === i}
            className={`split-item ${piece === i ? "on" : ""}`}
            data-tip={t("splitPieceTip")}
            aria-label={t("splitPiece", { n: i + 1 })}
            onClick={() => onSelect(i)}
          >
            <Thumb img={sheet.img} box={b} size={56} />
            <span>{i + 1}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
