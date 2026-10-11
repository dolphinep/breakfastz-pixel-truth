import { ArrowBigUp, ChevronLeft, ChevronRight, RotateCcw, Trophy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import type { Anim, AnimName } from "@/lib/life/animate";
import { isSolid, makeLevel, spawn, step, TILE, type Input, type Level, type Player } from "@/lib/life/game";
import { pixelsToCanvas } from "@/lib/io";

const VIEW_W = 480;
const VIEW_H = 224;
const PLAYER_H = 30; // character height in the game world (game px)

const C = { sky: "#9fdcff", sky2: "#d8f1ff", grass: "#7ee0b5", grassDark: "#3fae7a", dirt: "#e8a050", dirtDark: "#b8692f", ink: "#2a0f08", coin: "#ffc800", coinHi: "#ffe36b", flag: "#e0675e", cloud: "#ffffff" };

/** Platformer game: the character is the user's sprite (using auto-generated idle/walk/jump poses) */
export function PlayView({ anims }: { anims: Record<AnimName, Anim> }) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<Input>({ left: false, right: false, jump: false });
  const [coins, setCoins] = useState(0);
  const [won, setWon] = useState(false);
  const [round, setRound] = useState(0);

  const restart = useCallback(() => {
    setCoins(0);
    setWon(false);
    setRound((r) => r + 1);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent, v: boolean) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") input.current.left = v;
      else if (k === "arrowright" || k === "d") input.current.right = v;
      else if (k === " " || k === "arrowup" || k === "w") input.current.jump = v;
      else return;
      if (document.activeElement === canvas.current || canvas.current?.matches(":hover")) e.preventDefault();
    };
    const kd = (e: KeyboardEvent) => down(e, true);
    const ku = (e: KeyboardEvent) => down(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.width = VIEW_W;
    c.height = VIEW_H;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const toC = (a: Anim) => a.frames.map((f) => pixelsToCanvas(f));
    const idle = toC(anims.idle);
    const walk = toC(anims.walk);
    const jumpF = pixelsToCanvas(anims.jump.frames[2]);
    const fw = anims.idle.frames[0].w;
    const fh = anims.idle.frames[0].h;
    const k = PLAYER_H / fh;
    const dw = fw * k;
    const lv: Level = makeLevel(7 + round);
    let p: Player = spawn(lv, Math.round(dw * 0.7), Math.round(PLAYER_H * 0.92));
    let total = 0;
    let finished = false;
    let last = performance.now();
    let raf = 0;
    let camX = 0;

    const drawTile = (tx: number, ty: number, sx: number) => {
      const x = Math.round(tx * TILE - sx);
      const y = ty * TILE;
      const top = !isSolid(lv, tx, ty - 1);
      ctx.fillStyle = C.dirt;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = C.dirtDark;
      ctx.fillRect(x + ((tx * 7 + ty * 3) % 12), y + 6 + ((tx + ty) % 6), 2, 2);
      if (top) {
        ctx.fillStyle = C.grass;
        ctx.fillRect(x, y, TILE, 5);
        ctx.fillStyle = C.grassDark;
        ctx.fillRect(x, y + 5, TILE, 1);
        ctx.fillStyle = C.ink;
        ctx.fillRect(x, y - 1, TILE, 1);
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      if (!finished) {
        const r = step(lv, p, input.current, dt);
        p = r.player;
        if (r.coins) {
          total += r.coins;
          setCoins(total);
        }
        if (r.fell) p = spawn(lv, p.w, p.h);
        if (r.won) {
          finished = true;
          setWon(true);
        }
      }
      camX += (Math.max(0, Math.min(lv.w * TILE - VIEW_W, p.x - VIEW_W * 0.4)) - camX) * 0.15;
      // background
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      g.addColorStop(0, C.sky);
      g.addColorStop(1, C.sky2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = C.cloud;
      for (let i = 0; i < 8; i++) {
        const cx = ((i * 173 - camX * 0.3) % (VIEW_W + 120)) - 60;
        const cy = 24 + ((i * 37) % 60);
        ctx.fillRect(cx, cy, 34, 8);
        ctx.fillRect(cx + 8, cy - 6, 18, 6);
      }
      // level
      const t0 = Math.floor(camX / TILE);
      for (let tx = t0; tx < t0 + VIEW_W / TILE + 2; tx++) for (let ty = 0; ty < lv.h; ty++) if (lv.solid[ty * lv.w + tx]) drawTile(tx, ty, camX);
      // spinning coins
      for (const coin of lv.coins) {
        if (coin.taken) continue;
        const x = coin.x - camX;
        if (x < -10 || x > VIEW_W + 10) continue;
        const wv = Math.abs(Math.sin(now / 200 + coin.x)) * 5 + 1;
        ctx.fillStyle = C.ink;
        ctx.fillRect(Math.round(x - wv - 1), coin.y - 7, Math.round(wv * 2 + 2), 14);
        ctx.fillStyle = C.coin;
        ctx.fillRect(Math.round(x - wv), coin.y - 6, Math.round(wv * 2), 12);
        ctx.fillStyle = C.coinHi;
        ctx.fillRect(Math.round(x - wv), coin.y - 6, Math.max(1, Math.round(wv * 0.6)), 4);
      }
      // finish line
      const gx = lv.goalX - camX;
      ctx.fillStyle = C.ink;
      ctx.fillRect(gx, (lv.h - 2) * TILE - 64, 3, 64);
      ctx.fillStyle = C.flag;
      ctx.fillRect(gx + 3, (lv.h - 2) * TILE - 64, 22, 14);
      // character
      const moving = Math.abs(p.vx) > 1;
      const img = !p.onGround ? jumpF : moving ? walk[Math.floor(now / 110) % walk.length] : idle[Math.floor(now / 160) % idle.length];
      const px = Math.round(p.x + p.w / 2 - camX);
      const py = Math.round(p.y + p.h);
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(p.facing, 1);
      ctx.drawImage(img, -dw / 2, -PLAYER_H, dw, PLAYER_H);
      ctx.restore();
      c.dataset.x = String(Math.round(p.x));
      c.dataset.ground = p.onGround ? "1" : "0";
      c.dataset.y = String(Math.round(p.y));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [anims, round]);

  const hold = (key: keyof Input) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      input.current[key] = true;
    },
    onPointerUp: () => (input.current[key] = false),
    onPointerCancel: () => (input.current[key] = false),
    onLostPointerCapture: () => (input.current[key] = false),
  });

  return (
    <div className="life-play">
      <div className="life-stage play">
        <canvas ref={canvas} tabIndex={0} role="img" aria-label={t("tabPlay")} data-coins={coins} />
        <div className="hud">
          <span>
            {t("coins")} <b>{coins}</b>
          </span>
          <button className="icon-btn" aria-label={t("restart")} data-tip={t("restartTip")} onClick={restart}>
            <RotateCcw size={18} aria-hidden />
          </button>
        </div>
        {won && (
          <div className="win" role="status">
            <Trophy size={40} aria-hidden />
            <b>{t("win")}</b>
            <span>
              {t("coins")} {coins}
            </span>
            <button className="btn primary" onClick={restart}>
              {t("restart")}
            </button>
          </div>
        )}
      </div>
      <div className="touch">
        <button aria-label={t("left")} {...hold("left")}>
          <ChevronLeft size={30} aria-hidden />
        </button>
        <button aria-label={t("right")} {...hold("right")}>
          <ChevronRight size={30} aria-hidden />
        </button>
        <span className="muted">{t("playHelp")}</span>
        <button className="jump" aria-label={t("jump")} {...hold("jump")}>
          <ArrowBigUp size={30} aria-hidden />
        </button>
      </div>
    </div>
  );
}
