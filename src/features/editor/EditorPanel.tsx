import { Copy, Download, Redo2, Undo2 } from "lucide-react";
import { PixelCanvas } from "@/components/PixelCanvas";
import { useI18n } from "@/i18n";
import { copyPng, downloadPng } from "@/lib/io";
import { hexToRgba, rgbaToHex } from "@/lib/pixel/color";
import type { Palette } from "@/lib/pixel/palette";
import { FIT, SCALES, scaleFor, type ScaleChoice } from "@/lib/scale";
import { FrameOptions } from "./FrameOptions";
import { TOOLS } from "./toolList";
import type { Editor } from "./useEditor";

type Props = {
  editor: Editor;
  palette: Palette;
  baseName: string;
  /** Show the pixel grid when zoomed in (draw-from-scratch mode). */
  pixelGrid?: boolean;
  scale: ScaleChoice;
  onScale: (s: ScaleChoice) => void;
  onError: (key: "errCopy") => void;
};

/** Toolbar, tool options, color swatches, the drawing canvas and export controls. */
export function EditorPanel({ editor, palette, baseName, pixelGrid = false, scale, onScale, onError }: Props) {
  const { t } = useI18n();
  const { pixels, tool, color, frame } = editor;
  if (!pixels) return null;
  const outScale = scaleFor(scale, pixels);
  const outW = pixels.w * outScale;
  const outH = pixels.h * outScale;

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="tools">
        {TOOLS.map(({ tool: tl, tip, Icon }) => (
          <button key={tl} className={tool === tl ? "on" : ""} data-tip={t(tip)} aria-label={t(tip)} aria-pressed={tool === tl} onClick={() => editor.chooseTool(tl)}>
            <Icon size={18} aria-hidden />
          </button>
        ))}
        <button data-tip={t("undo")} aria-label={t("undo")} onClick={editor.undo}>
          <Undo2 size={18} aria-hidden />
        </button>
        <button data-tip={t("redo")} aria-label={t("redo")} onClick={editor.redo}>
          <Redo2 size={18} aria-hidden />
        </button>
        <span className="current" style={{ background: rgbaToHex(color) }} data-tip={t("current", { hex: rgbaToHex(color) })} />
      </div>

      <div className="tool-options">
        {(tool === "pencil" || tool === "eraser") && (
          <div className="seg brush" role="group" aria-label={t("brush")} data-tip={t("brushTip")}>
            <span>{t("brush")}</span>
            {[1, 2, 3, 4].map((n) => (
              <button key={n} className={editor.brush === n ? "on" : ""} aria-pressed={editor.brush === n} onClick={() => editor.setBrush(n)}>
                {n}
              </button>
            ))}
          </div>
        )}
        {tool === "frame" && <FrameOptions editor={editor} />}
        {tool === "magic" && (
          <>
            <label className="field inline" data-tip={t("toleranceTip")}>
              {t("tolerance")} {editor.tolerance}
              <input type="range" min={0} max={40} value={editor.tolerance} onChange={(e) => editor.setTolerance(+e.target.value)} />
            </label>
            <label className="check inline" data-tip={t("wholeImageTip")}>
              <input type="checkbox" checked={editor.wholeImage} onChange={(e) => editor.setWholeImage(e.target.checked)} /> {t("wholeImage")}
            </label>
          </>
        )}
      </div>

      <div className="swatches" aria-label={t("palette")}>
        {palette.map((c, i) => (
          <button
            key={i}
            className={rgbaToHex(c) === rgbaToHex(color) ? "on" : ""}
            style={{ background: rgbaToHex(c) }}
            aria-label={t("pickColor", { hex: rgbaToHex(c) })}
            data-tip={rgbaToHex(c)}
            onClick={() => editor.pickColor(c)}
          />
        ))}
        <label className="custom-color" data-tip={t("customTip")}>
          <input type="color" aria-label={t("customColor")} value={rgbaToHex(color)} onChange={(e) => editor.pickColor(hexToRgba(e.target.value), true)} />
          {t("customColor")}
        </label>
      </div>
      {editor.recent.length > 0 && (
        <div className="swatches recent" aria-label={t("recent")}>
          <span className="muted">{t("recent")}</span>
          {editor.recent.map((c) => (
            <button key={rgbaToHex(c)} style={{ background: rgbaToHex(c) }} aria-label={t("pickColor", { hex: rgbaToHex(c) })} data-tip={rgbaToHex(c)} onClick={() => editor.pickColor(c)} />
          ))}
        </div>
      )}

      <PixelCanvas
        pixels={pixels}
        onPixel={editor.onPixel}
        cursor="crosshair"
        label="Pixel Truth result"
        brush={tool === "pencil" || tool === "eraser" ? editor.brush : 1}
        panMode={tool === "hand"}
        zoomTo={outScale}
        frame={frame ?? undefined}
        onFrame={editor.setFrame}
        frameRatio={editor.lockedRatio ? editor.lockedRatio[0] / editor.lockedRatio[1] : null}
        pixelGrid={pixelGrid}
        frameLabel={frame ? t("frameNew", { w: frame.w, h: frame.h }) : t("frameLabel", { w: pixels.w, h: pixels.h, s: outScale, W: outW, H: outH })}
      />

      <div className="export">
        <label className="scale" data-tip={t("scaleTip")}>
          {t("scale")}
          <select aria-label={t("scale")} value={String(scale)} onChange={(e) => onScale(e.target.value === "fit" ? "fit" : (Number(e.target.value) as ScaleChoice))}>
            {SCALES.map((s) => (
              <option key={s} value={s}>
                {s}× · {pixels.w * s}×{pixels.h * s}
              </option>
            ))}
            <option value="fit">{t("scaleFit", { n: FIT })}</option>
          </select>
        </label>
        <button className="btn primary" data-tip={t("downloadTip")} onClick={() => downloadPng(pixels, outScale, `${baseName}-pixel-${outW}x${outH}.png`)}>
          <Download size={18} aria-hidden />
          {t("download", { w: outW, h: outH })}
        </button>
        <button className="btn" data-tip={t("copyTip")} onClick={() => copyPng(pixels, outScale).catch(() => onError("errCopy"))}>
          <Copy size={18} aria-hidden />
          {t("copy")}
        </button>
      </div>
    </>
  );
}
