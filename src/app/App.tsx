import { Palette as PaletteIcon, X } from "lucide-react";
import { useCallback, useEffect, useState, type DragEvent } from "react";
import { AboutDialog } from "@/components/AboutDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PromptDialog } from "@/components/PromptDialog";
import { OriginalView } from "@/features/convert/OriginalView";
import { SettingsPanel } from "@/features/convert/SettingsPanel";
import { SplitStrip } from "@/features/convert/SplitStrip";
import { usePixelTruth } from "@/features/convert/usePixelTruth";
import { EditorPanel } from "@/features/editor/EditorPanel";
import { useEditor } from "@/features/editor/useEditor";
import { LifePanel } from "@/features/life/LifePanel";
import { StartScreen } from "@/features/start/StartScreen";
import { useI18n, type Key } from "@/i18n";
import { MAX_FRAME } from "@/lib/editor/tools";
import { createPixels } from "@/lib/pixel/image";
import { PRESETS } from "@/lib/pixel/palette";
import type { Result } from "@/lib/pixel/pipeline";
import { scaleFor, type ScaleChoice } from "@/lib/scale";
import { Footer } from "./Footer";
import { Header } from "./Header";

type Mode = "start" | "convert" | "draw";

export default function App() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("start");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dialog, setDialog] = useState<"prompts" | "about" | "leave" | null>(null);
  const [scale, setScale] = useState<ScaleChoice>(1);
  const [drawPal, setDrawPal] = useState("Sweetie 16");

  const editor = useEditor();
  const { reset: resetEditor, setColor } = editor;

  const onResult = useCallback(
    (r: Result) => {
      setError(null);
      resetEditor(r.pixels);
    },
    [resetEditor],
  );
  const pt = usePixelTruth({
    onResult,
    onError: (key) => {
      setError(key);
      // Nothing could be opened and nothing was open before → back to the start screen.
      if (key === "errOpen") setMode((m) => (m === "convert" && !pt.source ? "start" : m));
    },
  });

  // Any image that gets opened switches to convert mode.
  const openFile = (file: Blob, name: string) => {
    setMode("convert");
    pt.load(file, name);
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"))?.getAsFile();
      if (file) {
        setMode("convert");
        pt.load(file, "pasted.png");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pt.load]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
    if (file) openFile(file, file.name);
  };

  /** Start drawing on a transparent w×h canvas. */
  const startBlank = (w: number, h: number) => {
    const clamp = (n: number) => Math.min(MAX_FRAME, Math.max(1, Math.round(n) || 16));
    pt.close();
    setError(null);
    resetEditor(createPixels(clamp(w), clamp(h)));
    editor.chooseTool("pencil");
    setColor(PRESETS[drawPal][0]);
    setMode("draw");
  };

  const goHome = () => {
    pt.close();
    resetEditor(null);
    setError(null);
    setMode("start");
  };
  const askHome = () => (mode === "start" ? goHome() : setDialog("leave"));

  const baseName = (pt.source?.name ?? (mode === "draw" ? "drawing" : "pixel")).replace(/\.\w+$/, "");
  const palette = mode === "draw" ? PRESETS[drawPal] : (pt.result?.palette ?? []);
  const editorPanel = (
    <EditorPanel editor={editor} palette={palette} baseName={baseName} pixelGrid={mode === "draw"} scale={scale} onScale={setScale} onError={setError} />
  );

  return (
    <div
      className={`app ${dragOver ? "drag-over" : ""}`}
      data-drop-label={t("dropHere")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <Header onHome={askHome} onPrompts={() => setDialog("prompts")} onOpenFile={(f) => openFile(f, f.name)} />

      {mode === "start" && (
        <StartScreen
          onSample={(img, name) => {
            setMode("convert");
            pt.loadPixels(img, name);
          }}
          onBlank={startBlank}
          onPrompts={() => setDialog("prompts")}
        />
      )}

      {mode === "draw" && (
        <main className="layout draw">
          <section className="panel view">
            <div className="view-head">
              <h2>{t("drawHeading")}</h2>
              <label className="scale" data-tip={t("drawPaletteTip")}>
                <PaletteIcon size={16} aria-hidden />
                <select aria-label={t("palette")} value={drawPal} onChange={(e) => setDrawPal(e.target.value)}>
                  {Object.keys(PRESETS).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {editorPanel}
          </section>
        </main>
      )}

      {mode === "convert" && pt.sheet && (
        <SplitStrip sheet={pt.sheet} piece={pt.piece} onSelect={pt.selectPiece} onProcessAll={() => pt.processAll((p) => scaleFor(scale, p))} />
      )}
      {mode === "convert" && pt.source && (
        <main className="layout">
          <SettingsPanel pt={pt} onError={setError} />
          <OriginalView source={pt.source} result={pt.result} />
          <section className="panel view">
            <div className="view-head">
              <h2>Pixel Truth</h2>
              {pt.busy && <span className="muted">{t("working")}</span>}
            </div>
            {editorPanel}
          </section>
        </main>
      )}

      {mode !== "start" && editor.pixels && <LifePanel pixels={editor.pixels} baseName={baseName} />}

      {error && (
        <div className="toast" role="alert">
          {error.startsWith("err") ? t(error as Key) : error}
          <button aria-label={t("close")} onClick={() => setError(null)}>
            <X size={18} aria-hidden />
          </button>
        </div>
      )}

      <PromptDialog
        open={dialog === "prompts"}
        onClose={() => setDialog(null)}
        onTry={(url, name) => {
          setDialog(null);
          setMode("convert");
          pt.loadUrl(url, name);
        }}
      />
      <ConfirmDialog
        open={dialog === "leave"}
        title={t("leaveTitle")}
        body={t("leaveBody")}
        confirmLabel={t("leaveOk")}
        cancelLabel={t("cancel")}
        onConfirm={goHome}
        onClose={() => setDialog(null)}
      />
      <AboutDialog open={dialog === "about"} onClose={() => setDialog(null)} />
      <Footer onAbout={() => setDialog("about")} />
    </div>
  );
}
