import { Film, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Pixels } from "@/lib/pixel/image";
import { useI18n, type Key } from "@/i18n";
import { spriteSheet, type Anim, type AnimName } from "@/lib/life/animate";
import { downloadPng, pixelsToCanvas } from "@/lib/io";
import { exportGif } from "./exporters";

const NAMES: { name: AnimName; key: Key }[] = [
  { name: "idle", key: "animIdle" },
  { name: "blink", key: "animBlink" },
  { name: "walk", key: "animWalk" },
  { name: "jump", key: "animJump" },
];

export function AnimateView({ anims, eyes, baseName }: { anims: Record<AnimName, Anim>; eyes: number; baseName: string }) {
  const { t } = useI18n();
  const [name, setName] = useState<AnimName>("walk");
  const canvas = useRef<HTMLCanvasElement>(null);
  const anim = anims[name];

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const frames = anim.frames.map((f) => pixelsToCanvas(f));
    const fw = anim.frames[0].w;
    const fh = anim.frames[0].h;
    const k = Math.max(1, Math.floor(Math.min(300 / fw, 300 / fh)));
    c.width = fw * k;
    c.height = fh * k;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    let raf = 0;
    const t0 = performance.now();
    const draw = (now: number) => {
      // The first rAF frame may report a time slightly before t0 → keep the index from going negative
      const i = Math.floor((Math.max(0, now - t0) / 1000) * anim.fps) % frames.length;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(frames[i], 0, 0, c.width, c.height);
      c.dataset.frame = String(i);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [anim]);

  const all = NAMES.map((n) => anims[n.name]);
  return (
    <div className="life-animate">
      <div className="life-stage">
        <canvas ref={canvas} role="img" aria-label={t(NAMES.find((n) => n.name === name)!.key)} />
      </div>
      <div className="life-side">
        <div className="seg" role="group" aria-label={t("tabAnimate")}>
          {NAMES.map((n) => (
            <button key={n.name} className={name === n.name ? "on" : ""} aria-pressed={name === n.name} data-tip={t("animTip")} onClick={() => setName(n.name)}>
              {t(n.key)}
            </button>
          ))}
        </div>
        <p className="muted">{eyes ? t("eyesFound", { n: eyes }) : t("eyesNone")}</p>
        <div className="export">
          <button className="btn primary" data-tip={t("exportGifTip")} onClick={() => exportGif(anim.frames, anim.fps, `${baseName}-${name}.gif`)}>
            <Film size={18} aria-hidden />
            {t("exportGif")}
          </button>
          <button className="btn" data-tip={t("exportSheetTip")} onClick={() => downloadSheet(all, baseName)}>
            <LayoutGrid size={18} aria-hidden />
            {t("exportSheet")}
          </button>
        </div>
      </div>
    </div>
  );
}

const downloadSheet = (all: Anim[], baseName: string) => {
  const sheet: Pixels = spriteSheet(all);
  downloadPng(sheet, Math.max(1, Math.round(512 / Math.max(sheet.w, sheet.h))), `${baseName}-spritesheet.png`);
};

