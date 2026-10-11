import { useState } from "react";
import { useI18n } from "@/i18n";
import { fetchLospec, PRESETS } from "@/lib/pixel/palette";
import type { PixelTruth } from "./usePixelTruth";

const SIZE_PRESETS = [32, 48, 64, 96, 128];

const CLEANUP = [
  ["orphans", "orphans", "orphansTip"],
  ["pixelPerfect", "pixelPerfect", "pixelPerfectTip"],
  ["removeBg", "removeBg", "removeBgTip"],
  ["outline", "outline", "outlineTip"],
] as const;

/** Left sidebar: resolution, palette and cleanup settings + result stats. */
export function SettingsPanel({ pt, onError }: { pt: PixelTruth; onError: (message: string) => void }) {
  const { t } = useI18n();
  const [lospecInput, setLospecInput] = useState("endesga-32");
  const { opt, setOpt, palChoice, setPalChoice, result, source } = pt;
  if (!source) return null;

  return (
    <aside className="panel controls" aria-label="settings">
      <h2>{t("resolution")}</h2>
      <div className="seg">
        <button className={opt.grid.mode === "auto" ? "on" : ""} data-tip={t("autoTip")} onClick={() => setOpt({ ...opt, grid: { mode: "auto" } })}>
          {t("auto")}
        </button>
        <button className={opt.grid.mode === "manual" ? "on" : ""} data-tip={t("manualTip")} onClick={() => setOpt({ ...opt, grid: { mode: "manual", width: result?.pixels.w ?? 64 } })}>
          {t("manual")}
        </button>
      </div>
      <div className="presets" role="group" aria-label={t("manual")}>
        {SIZE_PRESETS.map((n) => {
          const on = opt.grid.mode === "manual" && opt.grid.width === n;
          return (
            <button key={n} className={on ? "on" : ""} data-tip={t("sizePresetTip", { n })} aria-pressed={on} onClick={() => setOpt({ ...opt, grid: { mode: "manual", width: n } })}>
              {n}
            </button>
          );
        })}
      </div>
      {result?.grid.kind === "freeform" && opt.grid.mode === "auto" && <p className="hint">{t("sizeHint")}</p>}
      {opt.grid.mode === "manual" && (
        <label className="field">
          {t("widthPx", { n: opt.grid.width })}
          <input
            type="range"
            min={8}
            max={Math.min(256, source.img.w)}
            value={opt.grid.width}
            onChange={(e) => setOpt({ ...opt, grid: { mode: "manual", width: +e.target.value } })}
          />
        </label>
      )}

      <h2>{t("palette")}</h2>
      <select
        aria-label={t("palette")}
        value={palChoice.kind === "preset" ? `preset:${palChoice.name}` : palChoice.kind}
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith("preset:")) setPalChoice({ kind: "preset", name: v.slice(7) });
          else if (v === "auto" || v === "none") setPalChoice({ kind: v });
        }}
      >
        <option value="auto">{t("palAuto")}</option>
        {Object.keys(PRESETS).map((n) => (
          <option key={n} value={`preset:${n}`}>
            {n}
          </option>
        ))}
        {palChoice.kind === "lospec" && <option value="lospec">Lospec: {palChoice.slug}</option>}
        <option value="none">{t("palNone")}</option>
      </select>
      {palChoice.kind === "auto" && (
        <label className="field">
          {t("nColors", { n: pt.autoColors })}
          <input type="range" min={2} max={64} value={pt.autoColors} onChange={(e) => pt.setAutoColors(+e.target.value)} />
        </label>
      )}
      <form
        className="lospec"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setPalChoice({ kind: "lospec", slug: lospecInput, colors: await fetchLospec(lospecInput) });
          } catch {
            onError(t("errLospec", { slug: lospecInput }));
          }
        }}
      >
        <input aria-label={t("lospecLabel")} value={lospecInput} onChange={(e) => setLospecInput(e.target.value)} placeholder="lospec slug" />
        <button className="btn small" data-tip={t("loadTip")}>
          {t("load")}
        </button>
      </form>
      <label className="check" data-tip={t("ditherTip")}>
        <input type="checkbox" checked={opt.dither} onChange={(e) => setOpt({ ...opt, dither: e.target.checked })} /> {t("dither")}
      </label>

      <h2>{t("cleanup")}</h2>
      {CLEANUP.map(([k, label, tip]) => (
        <label key={k} className="check" data-tip={t(tip)}>
          <input type="checkbox" checked={opt[k]} onChange={(e) => setOpt({ ...opt, [k]: e.target.checked })} /> {t(label)}
        </label>
      ))}

      {result && (
        <dl className="stats">
          <dt>{t("statsResult")}</dt>
          <dd>
            {result.pixels.w}×{result.pixels.h}
          </dd>
          <dt>{t("statsColors")}</dt>
          <dd>
            {result.stats.inputColors} → {result.stats.outputColors}
          </dd>
          <dt>{t("statsFixed")}</dt>
          <dd>{t("statsFixedVal", { a: result.stats.orphans, b: result.stats.corners })}</dd>
          <dt>{t("statsTime")}</dt>
          <dd>{pt.ms.toFixed(0)} ms</dd>
        </dl>
      )}
    </aside>
  );
}
